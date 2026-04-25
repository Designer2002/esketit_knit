import { useRef, useState, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import { Decal } from "@react-three/drei";
import c from "croppie";

// ===== 🧶 Генерация canvas из pattern_data =====
function buildCanvasFromPattern(patternData, cellSize = 8) {
  const rows = (patternData || "").split("\n").filter((r) => r.trim());

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));

  const canvas = document.createElement("canvas");
  canvas.width = width * cellSize;
  canvas.height = height * cellSize;

  const ctx = canvas.getContext("2d");

  // фон прозрачный
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000"; // цвет узора

  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === "1") {
        // 👈 рисуем только если "1"
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    });
  });

  return canvas;
}

// ===== 📐 2D → 3D =====
function mapTo3D(stamp, bounds2D, mesh) {
  const { position_x: px, position_y: py, part_code } = stamp;

  const bounds = bounds2D[part_code];
  if (!bounds) return null;

  const { minX, maxX, minY, maxY } = bounds;

  const nx = (px - minX) / (maxX - minX);
  const ny = (py - minY) / (maxY - minY);

  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const min = box.min;

  let x = min.x + nx * size.x;
  let y = min.y + ny * size.y;
  let z = 3;
  let rotation = [0, 0, 0];

  const depthOffset = 2;

  switch (part_code) {
    case "front":
      z = min.z + size.z / 2 + depthOffset;
      break;

    case "back":
      z = min.z - size.z / 2 - depthOffset;
      rotation = [0, Math.PI, 0];
      break;

    case "sleeve_left":
      x = min.x - size.x / 2 - depthOffset;
      rotation = [0, Math.PI / 2, 0];
      break;

    case "sleeve_right":
      x = min.x + size.x / 2 + depthOffset;
      rotation = [0, -Math.PI / 2, 0];
      break;

    default:
      return null;
  }

  return { position: [x, y, z], rotation };
}

// ===== 🎨 Один decal =====
function PatternDecalItem({ stamp, bounds2D, garmentMesh }) {
  const decalRef = useRef();
  const parentMeshRef = useRef(null);

  // Находим родительский меш при монтировании
  useEffect(() => {
    if (decalRef.current) {
      let parent = decalRef.current.parent;
      while (parent) {
        if (parent.isMesh) {
          parentMeshRef.current = parent;
          break;
        }
        parent = parent.parent;
      }
    }
  }, []);
  if (!bounds2D?.[stamp.part_code] || !stamp.pattern_data) {
    console.warn(
      "⚠️ No bounds or pattern data for part_code:",
      stamp.part_code,
    );
    return null;
  }
  const canvas = useMemo(
    () => buildCanvasFromPattern(stamp.pattern_data),
    [stamp.pattern_data],
  );

  const texture = useMemo(() => {
    if (!canvas) {
      console.log("NO CANVAS");
      return null;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;

    return tex;
  }, [canvas]);

  const mapped = useMemo(
    () => mapTo3D(stamp, bounds2D, garmentMesh),
    [stamp, bounds2D, garmentMesh],
  );

  if (!texture || !mapped) {
    console.log("NO TEXTURE OR MAPPED");
    return null;
  }
  console.log("📌 DecalItem:", { stamp, mapped });
  const SCALE = 0.5;
  return (
    <Decal
      ref={decalRef}
      position={mapped.position}
      rotation={mapped.rotation}
      scale={[stamp.width * SCALE, stamp.height * SCALE, 10]}
    >
      <meshStandardMaterial
        map={texture}
        transparent
        polygonOffset
        polygonOffsetFactor={-1}
        depthWrite={false}
      />
    </Decal>
  );
}

// ===== Хук для управления мерками =====
function useMeasurements(initialValues = {}) {
  const [values, setValues] = useState({
    chest: 0, // обхват груди (0 = база, 1 = макс. увеличение)
    waist: 0, // обхват талии
    hips: 0, // обхват бедер
    neck: 0, // обхват шеи
    shoulderHeight: 0,
    shoulderLength: 0,
    armWidth: 0,
    wrist: 0,
    sleeveLength: 0,
    bodyLength: 0,
    neckDepth: 0, // глубина выреза
    ...initialValues,
  });

  const update = (name, value) => {
    setValues((prev) => ({
      ...prev,
      [name]: THREE.MathUtils.clamp(value, 0, 1),
    }));
  };

  const reset = () => {
    setValues((prev) => {
      const cleared = { ...prev };
      Object.keys(cleared).forEach((k) => (cleared[k] = 0));
      return cleared;
    });
  };

  return { values, update, reset };
}

// ===== Компонент одежды с морф-таргетами =====
function GarmentModel({
  measurements,
  textureUrl,
  accentColor,
  offsetY = 0,
  onMeshReady,
  scaleFactor = 1,
}) {
  const { scene } = useGLTF("/models/garment_t.glb");
  const meshRef = useRef();
  const morphRefs = useRef({}); // кэш для morphTargetDictionary

  // 🔍 Инициализация: находим меш с морф-таргетами
  useEffect(() => {
    if (!scene) return;

    let targetMesh = null;

    scene.traverse((child) => {
      //console.log(child)
      if (child.isMesh && child.morphTargetInfluences?.length) {
        targetMesh = child;
      }
    });

    if (!targetMesh) {
      console.warn("⚠️ Не найден меш с морф-таргетами в /models/garment_t.glb");
      return;
    }

    // Сохраняем ссылки на морфы для быстрого доступа
    morphRefs.current = {
      mesh: targetMesh,
      dict: targetMesh.morphTargetDictionary,
      influences: targetMesh.morphTargetInfluences,
    };

    if (onMeshReady) onMeshReady(targetMesh);
  }, [scene, onMeshReady]);

  // 🔄 Применение морф-таргетов при изменении мерок
  useEffect(() => {
    const { mesh, dict, influences } = morphRefs.current;
    if (!mesh || !dict || !influences) return;

    // 🔄 Сбрасываем все влияния перед применением новых
    for (let i = 0; i < influences.length; i++) {
      influences[i] = 0;
    }

    // 🗺️ Маппинг: название мерки → ключ морф-таргета
    const mapping = {
      chest: "chest_circumference_increase",
      waist: "waist_increase",
      hips: "hip_circumference_increase",
      neck: "neck_circumference_decrease",
      neckDepth: "neck_depth_increase",
      shoulderHeight: "shoulder_height_increase",
      shoulderLength: "shoulder_length_increase",
      armWidth: "arm_circumference_decrease",
      wrist: "wrist_circumference_decrease",
      sleeveLength: "sleeve_length_decrease",
      bodyLength: "garment_length_increase",
    };

    // 💡 Логика для пар "increase/decrease":
    // Если у тебя есть и waist_increase, и waist_decrease:
    // - при waist > 0.5 применяем increase с силой (waist - 0.5) * 2
    // - при waist < 0.5 применяем decrease с силой (0.5 - waist) * 2
    // Но если ключи независимые — просто мапь напрямую:

    Object.entries(measurements).forEach(([key, value]) => {
      const morphKey = mapping[key];
      if (morphKey && dict[morphKey] !== undefined) {
        influences[dict[morphKey]] = value; // 0..1
      }
    });

    // 👇 Триггерим обновление геометрии
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }, [measurements]);

  // 🎨 Применение материала и текстуры
  useEffect(() => {
    if (!scene) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    if (textureUrl) {
      const textureLoader = new THREE.TextureLoader();
      const texture = textureLoader.load(textureUrl);

      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

      // Подбираем повтор текстуры
      const scaledWidth = size.x;
      const scaledHeight = size.y;
      const patternSize = 10;
      texture.repeat.set(scaledWidth / patternSize, scaledHeight / patternSize);

      texture.colorSpace = THREE.SRGBColorSpace;

      scene.traverse((child) => {
        if (!child.isMesh) return;

        child.castShadow = true;
        child.receiveShadow = true;

        child.material.map = texture;
        child.material.color = new THREE.Color(accentColor);

        child.material.needsUpdate = true;
        child.geometry.computeVertexNormals();
      });
    }
  }, [scene, textureUrl, accentColor]);

  // 📐 Центрирование и масштабирование (один раз при загрузке)
  useEffect(() => {
    if (!scene) return;

    // Сброс трансформаций
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Центрируем по горизонтали, ставим "на пол" по Y
    scene.position.set(-center.x, -box.min.y - 40 + offsetY, -center.z);

    // Масштабируем под целевую высоту
    const targetHeight = 130;
    const scale = (targetHeight / size.y) * scaleFactor; // scaleFactor для дополнительного увеличения
    scene.scale.setScalar(scale);

    // console.log("📦 Garment:", {
    //   size: size.toArray(),
    //   scale,
    //   position: scene.position.toArray(),
    // });
  }, [scene]);

  return <primitive ref={meshRef} object={scene} />;
}

// 🔁 Предзагрузка
useGLTF.preload("/models/garment_t.glb");

// ===== Утилита для CSS-переменных =====
function getCSSVar(name, fallback = "#000000") {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

// ===== Основной компонент =====
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
  const fogColor = useMemo(
    () => getCSSVar(fogColorVar, "#1a1a2e"),
    [fogColorVar],
  );
  const accentColor = useMemo(
    () => yarnColor || getCSSVar(accentColorVar, "#c77d9e"),
    [accentColorVar, yarnColor],
  );
  console.log(bounds2D);
  const {
    values: measurements,
    update: updateMeasurement,
    reset: resetMeasurements,
  } = useMeasurements(initialMeasurements);

  const [garmentMesh, setGarmentMesh] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div
      style={{
        height: `${height}px`,
        position: "relative",
        background: fogColor,
      }}
    >
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            zIndex: 10,
            background: "rgba(0,0,0,0.6)",
            padding: "12px 24px",
            borderRadius: 8,
          }}
        >
          Загрузка...
        </div>
      )}

      <Canvas
        camera={{ position: [0, 40, 180], fov: 40, near: 1, far: 2000 }}
        style={{ background: "transparent" }}
        key={"fixed"}
        gl={{ antialias: true, alpha: true }}
        onCreated={() => setIsLoading(false)}
      >
        <fog attach="fog" args={[fogColor, 250, 800]} />

        <ambientLight intensity={0.5} />
        <directionalLight
          position={[120, 180, 120]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-120, 80, -20]} intensity={0.6} />
        <pointLight
          position={[0, 100, 150]}
          intensity={0.9}
          color={accentColor}
        />

        <group>
          {/* 🧶 Только одежда — человек убран */}
          <GarmentModel
            measurements={measurements}
            textureUrl={textureUrl}
            accentColor={accentColor}
            onMeshReady={setGarmentMesh}
            scaleFactor={scaleFactor}
            offsetY={offsetY}
          />
          ```
          {garmentMesh &&
            bounds2D &&
            stamps?.length > 0 &&
            stamps
              .filter((stamp) => bounds2D[stamp.part_code])
              .map((stamp) => (
                <PatternDecalItem
                  key={stamp.id}
                  stamp={stamp}
                  bounds2D={bounds2D}
                  garmentMesh={garmentMesh}
                />
              ))}
        </group>

        <ContactShadows
          position={[0, -90, 0]}
          opacity={0.35}
          scale={300}
          blur={2.5}
          color={fogColor}
        />
        <Environment preset="studio" />

        <OrbitControls
          enablePan={false}
          minDistance={100}
          maxDistance={400}
          autoRotate={autoRotate}
          autoRotateSpeed={0.4}
          enableDamping
          dampingFactor={0.06}
          target={[0, 30, 0]}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.1}
          makeDefault
        />
      </Canvas>
    </div>
  );
}

export default Sweater3DPreview;
