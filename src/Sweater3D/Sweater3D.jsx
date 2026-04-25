import { useRef, useState, useEffect, useMemo, useLayoutEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  useGLTF,
  Decal,
} from "@react-three/drei";
import * as THREE from "three";

// ===== 🧶 Генерация текстуры из pattern_data =====
function buildCanvasFromPattern(patternData, yarnColor) {
  const rows = (patternData || "").split("\n").filter((r) => r.trim());
  if (rows.length === 0) return null;

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length || 0), 1);

  const canvas = document.createElement("canvas");
  const CELL = 4; // размер одной "клетки" в пикселях
  canvas.width = width * CELL;
  canvas.height = height * CELL;

  const ctx = canvas.getContext("2d");
  
  // 🔹 Прозрачный фон (ничего не рисуем)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 🔹 Рисуем ТОЛЬКО "1" цветом пряжи
  ctx.fillStyle = yarnColor;
  console.log(ctx.fillStyle)
   rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === "1") {
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
      // если "0" или пробел — не рисуем ничего (прозрачно)
    });
  });

  return canvas;
}

// ===== 🎨 Компонент декали =====
function SafeDecal({ stamp, bounds2D, bounds3D, yarnColor }) {
  const decalKey = `${stamp?.id}-${stamp?.pattern_data}-${stamp?.position_x}-${stamp?.position_y}`;

  const texture = useMemo(() => {
    if (!stamp?.pattern_data) return null;
    // ✅ ИСПРАВЛЕНИЕ: Передаем ПРАВИЛЬНЫЙ цвет (приоритет у custom_color, иначе yarnColor)
    const color = stamp.custom_color || yarnColor || "#000000";
    const canvas = buildCanvasFromPattern(stamp.pattern_data, color);
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [stamp?.pattern_data, stamp?.width, stamp?.height, stamp.custom_color, yarnColor]);

  const { pos, rot, scale } = useMemo(() => {
    if (!bounds3D || !stamp?.pattern_data) return { pos: null, rot: null, scale: null };
    
    const bounds = bounds2D?.[stamp.part_code];
    if (!bounds || !isFinite(bounds.minX) || !isFinite(bounds.maxX)) {
      return { pos: null, rot: null, scale: null };
    }

    const rangeX = bounds.maxX - bounds.minX || 1;
    const rangeY = bounds.maxY - bounds.minY || 1;
    
    // 1. Нормализуем 2D позицию (получаем проценты от 0 до 1)
    const nx = (stamp.position_x - bounds.minX) / rangeX;
    const ny = (stamp.position_y - bounds.minY) / rangeY;
    
    if (!isFinite(nx) || !isFinite(ny)) return { pos: null, rot: null, scale: null };

    // 2. Используем ЛОКАЛЬНЫЙ 3D размер (теперь это числа вроде -0.5 ... 0.5)
    const size = bounds3D.getSize(new THREE.Vector3());
    const min = bounds3D.min.clone();

    // 3. Мапим проценты на локальный размер
    const p = new THREE.Vector3(min.x + nx * size.x, min.y + ny * size.y, 0);

    // 4. Математически вычисляем отступ (чтобы декаль не "влазила" внутрь meshes)
    const offset = size.z * 0.01; // микро-отступ 

    switch (stamp.part_code) {
      case "front": p.z = min.z + size.z / 2 + offset; break;
      case "back": p.z = min.z - size.z / 2 - offset; break;
      case "sleeve_left": p.x = min.x - size.x / 2 - offset; break;
      case "sleeve_right": p.x = min.x + size.x / 2 + offset; break;
      default: return { pos: null, rot: null, scale: null };
    }

    const r = new THREE.Euler(0, 0, 0);
    if (stamp.part_code === "back") r.y = Math.PI;
    if (stamp.part_code === "sleeve_left") r.y = Math.PI / 2;
    if (stamp.part_code === "sleeve_right") r.y = -Math.PI / 2;

    // 5. Математический масштаб: 
    // (Ширина узора в пикселях / Ширина всей выкройки) * Ширина 3D модели
    const s = [
      Math.max(0.01, (stamp.width / rangeX) * size.x), 
      Math.max(0.01, (stamp.height / rangeY) * size.y), 
      1
    ];

    return { pos: p, rot: r, scale: s };
  }, [bounds3D, bounds2D, stamp]);

  if (!pos || !rot || !scale || !texture) return null;
  
  return (
    <Decal
      debug={true} 
      key={decalKey}
      position={pos.toArray()}
      rotation={rot.toArray()}
      scale={scale}
      map={texture}
      transparent
      polygonOffset
      polygonOffsetFactor={-1}
      toneMapped={false}
    />
  );
}

// ===== 👕 Модель одежды =====
function GarmentModel({
  measurements,
  textureUrl,
  accentColor,
  offsetY = 0,
  scaleFactor = 1,
  stamps = [],
  bounds2D = {},
  yarnColor,
}) {
  const { scene } = useGLTF("/models/garment_t.glb");
  const [meshData, setMeshData] = useState(null);
  const [originalTransform, setOriginalTransform] = useState({ position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] });
  const [centeringTransform, setCenteringTransform] = useState({ position: [0,0,0], scale: [1,1,1] });
  
  const meshBoxRef = useRef(null);
  const morphData = useRef({ dict: null, influences: null });

  // 🔍 Извлекаем данные и восстанавливаем оригинальную трансформацию
  useEffect(() => {
    if (!scene) return;
    let found = null;
    scene.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences?.length) {
        found = child;
      }
    });
    if (found) {
      // 1. Принудительно обновляем мировую матрицу сцены
      scene.updateMatrixWorld(true);

      // 2. Извлекаем мировую позицию, поворот и масштаб оригинального меша
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      found.matrixWorld.decompose(pos, quat, scl);

      setOriginalTransform({
        position: pos.toArray(),
        rotation: new THREE.Euler().setFromQuaternion(quat).toArray(),
        scale: scl.toArray(),
      });

      // 3. Считаем реальный размер ТОЛЬКО этого меша
      const box = new THREE.Box3().setFromObject(found);
      meshBoxRef.current = box; // Сохраняем для передачи в SafeDecal

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      // 4. Вычисляем масштаб чтобы модель стала высотой 130 единиц
      const sc = (130 / size.y) * scaleFactor;
      setCenteringTransform({
        position: [-center.x, -box.min.y - 40 + offsetY, -center.z],
        scale: [sc, sc, sc]
      });

      morphData.current = {
        dict: found.morphTargetDictionary,
        influences: found.morphTargetInfluences,
      };

      setMeshData({
        geometry: found.geometry,
        material: found.material,
      });
    }
  }, [scene, offsetY, scaleFactor]);

  // 🔄 Применение морф-таргетов
  useEffect(() => {
    const { dict, influences } = morphData.current;
    if (!meshData || !dict || !influences) return;

    for (let i = 0; i < influences.length; i++) influences[i] = 0;

    const mapping = {
      chest: "chest_circumference_increase", waist: "waist_increase",
      hips: "hip_circumference_increase", neck: "neck_circumference_decrease",
      neckDepth: "neck_depth_increase", shoulderHeight: "shoulder_height_increase",
      shoulderLength: "shoulder_length_increase", armWidth: "arm_circumference_decrease",
      wrist: "wrist_circumference_decrease", sleeveLength: "sleeve_length_decrease",
      bodyLength: "garment_length_increase",
    };

    Object.entries(measurements).forEach(([key, value]) => {
      const morphKey = mapping[key];
      if (morphKey && dict[morphKey] !== undefined) {
        influences[dict[morphKey]] = THREE.MathUtils.clamp(value, 0, 1);
      }
    });

    meshData.geometry.attributes.position.needsUpdate = true;
    meshData.geometry.computeVertexNormals();
  }, [measurements, meshData]);

  // 🎨 Текстура и материал
  useEffect(() => {
    if (!meshData?.material || !textureUrl) return;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(textureUrl);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    if (meshBoxRef.current) {
      const size = meshBoxRef.current.getSize(new THREE.Vector3());
      tex.repeat.set(120, 120);
    }

    meshData.material.map = tex;
    meshData.material.color = new THREE.Color(accentColor);
    meshData.material.needsUpdate = true;
  }, [meshData, textureUrl, accentColor]);

  if (!meshData) return null;

  return (
    <group position={centeringTransform.position} scale={centeringTransform.scale}>
      {/* 🔹 Восстанавливаем оригинальный меш с его "встроенным" масштабом из Blender */}
      <mesh
        geometry={meshData.geometry}
        material={meshData.material}
        position={originalTransform.position}
        rotation={originalTransform.rotation}
        scale={originalTransform.scale}
        morphTargetDictionary={morphData.current.dict}
        morphTargetInfluences={morphData.current.influences}
        castShadow
        receiveShadow
      >
        {stamps?.map((stamp) => (
          <SafeDecal
            key={stamp.id}
            stamp={stamp}
            bounds2D={bounds2D}
            bounds3D={meshBoxRef.current}
            yarnColor={stamp.custom_color} // <--- ДОБАВИТЬ ЭТО
          />
        ))}
      </mesh>
    </group>
  );
}

useGLTF.preload("/models/garment_t.glb");

// ===== Утилиты =====
function getCSSVar(name, fallback = "#1a1a2e") {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function useMeasurements(initialValues = {}) {
  const [values, setValues] = useState({
    chest: 0, waist: 0, hips: 0, neck: 0, shoulderHeight: 0, shoulderLength: 0,
    armWidth: 0, wrist: 0, sleeveLength: 0, bodyLength: 0, neckDepth: 0,
    ...initialValues,
  });
  const update = (name, value) =>
    setValues((prev) => ({ ...prev, [name]: THREE.MathUtils.clamp(value, 0, 1) }));
  const reset = () =>
    setValues((prev) => Object.keys(prev).reduce((acc, k) => ({ ...acc, [k]: 0 }), {}));
  return { values, update, reset };
}

// ===== Экспортируемый компонент =====
export function Sweater3DPreview({
  height = 600,
  autoRotate = true,
  textureUrl,
  fogColorVar = "--background",
  offsetY = 0,
  scaleFactor = 1,
  accentColorVar = "--accent-color",
  yarnColor,
  initialMeasurements = {},
  bounds2D = {},
  stamps = [],
}) {
  const fogColor = useMemo(() => getCSSVar(fogColorVar, "#1a1a2e"), [fogColorVar]);
  const accentColor = useMemo(() => yarnColor || getCSSVar(accentColorVar, "#c77d9e"), [accentColorVar, yarnColor]);
  const { values: measurements } = useMeasurements(initialMeasurements);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div style={{ height: `${height}px`, position: "relative", background: fogColor }}>
      {isLoading && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          color: "white", zIndex: 10, background: "rgba(0,0,0,0.6)", padding: "12px 24px", borderRadius: 8,
        }}>
          Загрузка 3D...
        </div>
      )}
      <Canvas
        camera={{ position: [0, 40, 180], fov: 40, near: 1, far: 2000 }}
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true }}
        onCreated={() => setIsLoading(false)}
      >
        <fog attach="fog" args={[fogColor, 250, 800]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[120, 180, 120]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-120, 80, -20]} intensity={0.6} />
        <pointLight position={[0, 100, 150]} intensity={0.9} color={accentColor} />

        <GarmentModel
          measurements={measurements}
          textureUrl={textureUrl}
          accentColor={accentColor}
          scaleFactor={scaleFactor}
          offsetY={offsetY}
          stamps={stamps}
          bounds2D={bounds2D}
          yarnColor={yarnColor}
        />

        <ContactShadows position={[0, -90, 0]} opacity={0.35} scale={300} blur={2.5} color={fogColor} />
        <Environment preset="studio" />
        <OrbitControls
          enablePan={false} minDistance={100} maxDistance={400}
          autoRotate={autoRotate} autoRotateSpeed={0.4}
          enableDamping dampingFactor={0.06}
          target={[0, 30, 0]} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 2.1}
          makeDefault
        />
      </Canvas>
    </div>
  );
}

export default Sweater3DPreview;