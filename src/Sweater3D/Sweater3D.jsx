import { useRef, useState, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  useGLTF,
  Decal, // <--- ДОБАВЛЕНО
} from "@react-three/drei";
import * as THREE from "three";
async function buildSinglePatternCanvas(
  patternData,
  yarnColor,
  textureUrl,
  flipVertical = true,
) {
  const rows = (patternData || "").split("\n").filter((r) => r.trim());
  if (rows.length === 0) return null;

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length || 0), 1);
  let CELL = 12;
  if (width < 40 || height < 40) {
    CELL = 8; // уменьшаем размер клетки для больших узоров, чтобы итоговая текстура не была слишком большой
  } else if (width < 60 || height < 60) {
    CELL = 6; // ещё меньше для очень больших узоров
  } else if (width >= 120 || height >= 120) {
    CELL = 3; // для огромных узоров
  }
  
  const canvas = document.createElement("canvas");
  canvas.width = width * CELL;
  canvas.height = height * CELL;
  const ctx = canvas.getContext("2d");

  // Прозрачный фон
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = yarnColor;

  // Загружаем текстуру вязания
  if (textureUrl) {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = textureUrl;
    });

    // 🔥 ИСПРАВЛЕНИЕ: создаём паттерн для бесшовного повторения
    const pattern = ctx.createPattern(img, "repeat");

    // Рисуем узор
    rows.forEach((row, y) => {
      const visualY = flipVertical ? height - 1 - y : y;

      [...row].forEach((char, x) => {
        if (char === "1") {
          const px = x * CELL;
          const py = visualY * CELL;

          // 1️⃣ Сначала рисуем текстуру (без швов!)
          ctx.fillStyle = pattern;
          ctx.fillRect(px, py, CELL, CELL);

          // 2️⃣ Накладываем цвет пряжи с прозрачностью 50%
          // "80" в hex = 128 в decimal = 50% от 255
          const enhancedColor = darkenAndSaturateHex(yarnColor, {
            darken: 65, // сделать на 25% темнее
            saturate: 80, // сделать на 40% насыщеннее
            alpha: 140, // 50% прозрачности (128 из 255)
          });
          ctx.fillStyle = enhancedColor;
          ctx.fillRect(px, py, CELL, CELL);
        }
      });
    });
  } else {
    // Без текстуры — просто цвет с прозрачностью
    rows.forEach((row, y) => {
      const visualY = flipVertical ? height - 1 - y : y;
      [...row].forEach((char, x) => {
        if (char === "1") {
          ctx.fillStyle = yarnColor + "80"; // 50% прозрачности
          ctx.fillRect(x * CELL, visualY * CELL, CELL, CELL);
        }
      });
    });
  }

  return canvas;
}
function GarmentModel({
  measurements,
  textureUrl,
  accentColor,
  offsetY = 0,
  scaleFactor = 1,
  stamps = [],
  yarnColor,
  bounds2D = {},
}) {
  const { scene } = useGLTF("/models/garment_t.glb");
  const [meshParts, setMeshParts] = useState([]);
  const [centeringTransform, setCenteringTransform] = useState({
    position: [0, 0, 0],
    scale: [1, 1, 1],
  });
  const morphData = useRef({});
  const meshBounds = useRef({});

  // 🔍 Подготовка всех мешей
  useEffect(() => {
    if (!scene) return;
    const parts = [];
    let overallBox = new THREE.Box3();

    scene.traverse((child) => {
      if (child.isMesh) {
        const mat = child.material.clone();
        child.material = mat;

        morphData.current[child.name] = {
          dict: child.morphTargetDictionary || {},
          influences: child.morphTargetInfluences || [],
        };

        const box = new THREE.Box3().setFromObject(child);
        overallBox.union(box);
        meshBounds.current[child.name] = box;
        parts.push({ mesh: child, name: child.name });
      }
    });

    const center = overallBox.getCenter(new THREE.Vector3());
    const size = overallBox.getSize(new THREE.Vector3());
    const sc = size.y > 0.01 ? (130 / size.y) * scaleFactor : 1;

    setCenteringTransform({
      position: [-center.x, -center.y + offsetY - 60, -center.z],
      scale: [sc, sc, sc],
    });
    setMeshParts(parts);
  }, [scene, offsetY, scaleFactor]);

  // 🔄 Морф-таргеты (без изменений)
  useEffect(() => {
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

    meshParts.forEach(({ mesh, name }) => {
      const { dict, influences } = morphData.current[name] || {};
      if (!dict || !influences) return;
      for (let i = 0; i < influences.length; i++) influences[i] = 0;
      Object.entries(measurements).forEach(([key, value]) => {
        const morphKey = mapping[key];
        if (morphKey && dict[morphKey] !== undefined) {
          influences[dict[morphKey]] = THREE.MathUtils.clamp(value, 0, 1);
        }
      });
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
  }, [measurements, meshParts]);

  // 🎨 Базовая текстура (без изменений)
  useEffect(() => {
    if (!meshParts.length || !textureUrl) return;
    const loader = new THREE.TextureLoader();
    const baseTex = loader.load(textureUrl);
    baseTex.wrapS = baseTex.wrapT = THREE.RepeatWrapping;
    baseTex.colorSpace = THREE.SRGBColorSpace;
    baseTex.repeat.set(8, 8);

    meshParts.forEach(({ mesh }) => {
      mesh.material.map = baseTex;
      mesh.material.color = new THREE.Color(accentColor || "#c77d9e");
      mesh.material.needsUpdate = true;
    });
  }, [meshParts, textureUrl, accentColor]);

  // ⚡ Текстуры для Decal — создаём только когда нужно
  // В компоненте GarmentModel:
  const [decalTextures, setDecalTextures] = useState({});
  const [texturesLoading, setTexturesLoading] = useState(false);

  useEffect(() => {
    if (!stamps?.length) {
      setDecalTextures({});
      return;
    }

    let cancelled = false;
    setTexturesLoading(true);

    const loadTextures = async () => {
      const textures = {};

      for (const stamp of stamps) {
        if (!stamp?.pattern_data) continue;

        try {
          const canvas = await buildSinglePatternCanvas(
            stamp.pattern_data,
            stamp.custom_color || yarnColor,
            textureUrl, // 👈 передаём текстуру вязания!
            true, // flipVertical
          );

          if (canvas && !cancelled) {
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;
            textures[stamp.id] = tex;
          }
        } catch (e) {
          console.warn(`Failed to build decal for stamp ${stamp.id}:`, e);
        }
      }

      if (!cancelled) {
        setDecalTextures(textures);
        setTexturesLoading(false);
      }
    };

    loadTextures();

    return () => {
      cancelled = true;
      // Cleanup: освобождаем текстуры при размонтировании
      if (decalTextures !== null)
        Object.values(decalTextures).forEach((tex) => tex?.dispose?.());
    };
  }, [stamps, yarnColor, textureUrl]);

  // 🗂️ Группируем штампы
  const stampsByPart = useMemo(() => {
    if (!stamps || !Array.isArray(stamps)) return {};
    return stamps.reduce((acc, stamp) => {
      if (!acc[stamp.part_code]) acc[stamp.part_code] = [];
      acc[stamp.part_code].push(stamp);
      return acc;
    }, {});
  }, [stamps]);

  if (!meshParts.length) return null;

  return (
    <group
      position={centeringTransform.position}
      scale={centeringTransform.scale}
    >
      {/* 🔥 МАГИЯ ЗДЕСЬ: Заменяем <primitive> на обычный <mesh> */}
      {meshParts.map(({ mesh, name }) => (
        <mesh
          key={name}
          // Передаем сырые Three.js объекты напрямую в R3D компонент
          geometry={mesh.geometry}
          material={mesh.material}
          // Обязательно передаем морфы, чтобы они продолжили работать!
          morphTargetDictionary={mesh.morphTargetDictionary}
          morphTargetInfluences={mesh.morphTargetInfluences}
          castShadow
          receiveShadow
        >
          {(stampsByPart[name] || []).map((stamp) => {
            const texture = decalTextures[stamp.id];
            if (!texture) return null;

            const box3D = meshBounds.current[name];
            const bounds2DPart = bounds2D[name];
            if (!box3D || !bounds2DPart) return null;

            const size2D = {
              x: Math.max(bounds2DPart.maxX - bounds2DPart.minX, 0.1),
              y: Math.max(bounds2DPart.maxY - bounds2DPart.minY, 0.1),
            };
            const size3D = new THREE.Vector3();
            box3D.getSize(size3D);

          

            const w3d = Math.max(
              0.1,
              (parseFloat(stamp.width) / size2D.x) * size3D.x,
            );
            const h3d = Math.max(
              0.1,
              (parseFloat(stamp.height) / size2D.y) * size3D.y,
            );

            const minY = box3D.min.y;
            const maxY = box3D.max.y;

            // центр 2D bounds
const center2D_X = (bounds2DPart.maxX + bounds2DPart.minX) / 2;
const center2D_Y = (bounds2DPart.maxY + bounds2DPart.minY) / 2;

// размеры 2D bounds
const size2D_X = bounds2DPart.maxX - bounds2DPart.minX;
const size2D_Y = bounds2DPart.maxY - bounds2DPart.minY;

// нормализованные координаты 0..1
const u = (stamp.position_x - bounds2DPart.minX) / size2D_X;
const v = (stamp.position_y - bounds2DPart.minY) / size2D_Y;



const x3d = -((u - 0.3) * size3D.x);  // 0.5 = центр
const y3d = -((v-1.15) * size3D.y);
let z3d = box3D.max.z + 0.01;       // верхняя поверхность

// подруливаем для рукавов/спинки как раньше
if (name === "back") { z3d = box3D.min.z - 0.01;  }
if (name.includes("sleeve")) {
  const isRight = name.includes("right");
  z3d = isRight ? box3D.max.z + 0.01 : box3D.min.z - 0.01;
}
            if (
              isNaN(x3d) ||
              isNaN(y3d) ||
              isNaN(z3d) ||
              isNaN(w3d) ||
              isNaN(h3d)
            )
              return null;

            return (
              <Decal
                key={stamp.id}
                debug={false} // Оставь true, чтобы увидеть белые линии лучей! Если луч пересекает рукав - всё работает.
                // ИСПРАВЛЕНО ГЛАВНОЕ: Вернули z3d на место!
                position={[x3d, y3d, z3d]}
                // Добавили rotationZ для рукавов!
                rotation={[name.includes("back") ? Math.PI : 0, 0, name.includes("back") ? Math.PI : 0]}
                scale={[w3d / 1.2, h3d / 3.5, 1]}
                map={texture}
                polygonOffset
                polygonOffsetFactor={-2}
                depthTest
                depthWrite={false}
              />
            );
          })}
        </mesh>
      ))}
    </group>
  );
}
useGLTF.preload("/models/garment_t.glb");

// ===== Утилиты =====
function getCSSVar(name, fallback = "#1a1a2e") {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

// ===== 🎨 Утилита: сделать цвет темнее и насыщеннее + прозрачность =====
function darkenAndSaturateHex(
  hex,
  { darken = 20, saturate = 30, alpha = 128 } = {},
) {
  // Убираем # если есть
  hex = hex.replace("#", "");

  // Парсим RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Конвертируем RGB → HSL
  const rNorm = r / 255,
    gNorm = g / 255,
    bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm),
    min = Math.min(rNorm, gNorm, bNorm);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // ахроматический (серый)
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6;
        break;
    }
  }

  // Применяем изменения: темнее (↓ lightness) и насыщеннее (↑ saturation)
  l = Math.max(0, Math.min(1, l - darken / 100)); // darken: 0-100
  s = Math.max(0, Math.min(1, s + saturate / 100)); // saturate: 0-100

  // HSL → RGB
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let newR, newG, newB;
  if (s === 0) {
    newR = newG = newB = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    newR = hue2rgb(p, q, h + 1 / 3);
    newG = hue2rgb(p, q, h);
    newB = hue2rgb(p, q, h - 1 / 3);
  }

  // Конвертируем в hex + добавляем alpha
  const toHex = (v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  const alphaHex = alpha.toString(16).padStart(2, "0");

  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}${alphaHex}`;
}

function useMeasurements(initialValues = {}) {
  const [values, setValues] = useState({
    chest: 0,
    waist: 0,
    hips: 0,
    neck: 0,
    shoulderHeight: 0,
    shoulderLength: 0,
    armWidth: 0,
    wrist: 0,
    sleeveLength: 0,
    bodyLength: 0,
    neckDepth: 0,
    ...initialValues,
  });
  const update = (name, value) =>
    setValues((prev) => ({
      ...prev,
      [name]: THREE.MathUtils.clamp(value, 0, 1),
    }));
  const reset = () =>
    setValues((prev) =>
      Object.keys(prev).reduce((acc, k) => ({ ...acc, [k]: 0 }), {}),
    );
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
  const fogColor = useMemo(
    () => getCSSVar(fogColorVar, "#1a1a2e"),
    [fogColorVar],
  );
  const accentColor = useMemo(
    () => yarnColor || getCSSVar(accentColorVar, "#c77d9e"),
    [accentColorVar, yarnColor],
  );
  const { values: measurements } = useMeasurements(initialMeasurements);
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
