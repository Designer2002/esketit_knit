import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import "./Sweater3D.css";

// ===== УТИЛИТЫ: профиль → форма =====
function buildProfile(stitchData, rowData, partCode) {
  const rows = rowData
    .filter(r => r.part_code === partCode)
    .sort((a, b) => a.value - b.value);

  const stitchesMap = new Map(
    stitchData
      .filter(s => s.part_code === partCode)
      .map(s => [s.node_name, s.value])
  );

  const result = rows.map(r => ({
    row: r.value,
    width: stitchesMap.get(r.node_name) || 0
  }));
  
  console.log(`[${partCode}] rows:`, rows.map(r => r.value));
  
  return result;
}

function buildShapeFromProfile(profile) {
  const shape = new THREE.Shape();
  if (profile.length === 0) return shape;

  // Левая граница: снизу вверх
  profile.forEach((p, i) => {
    const x = -p.width / 2;
    const y = p.row;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  });

  // Правая граница: сверху вниз
  [...profile].reverse().forEach(p => {
    shape.lineTo(p.width / 2, p.row);
  });

  shape.closePath();
  return shape;
}

// ===== ТЕКСТУРА с обработкой загрузки =====
let knitTexture = null;
const textureLoader = new THREE.TextureLoader();

function getKnitTexture() {
  if (knitTexture) return knitTexture;
  
  knitTexture = textureLoader.load(
    "/textures/knit_specular.png",
    () => {
      // onLoaded
      knitTexture.wrapS = knitTexture.wrapT = THREE.RepeatWrapping;
      knitTexture.repeat.set(3, 4);
    },
    undefined,
    (err) => {
      console.warn("⚠️ Не удалось загрузить текстуру, используем фоллбэк", err);
    }
  );
  
  // Настройки по умолчанию (до загрузки)
  knitTexture.wrapS = knitTexture.wrapT = THREE.RepeatWrapping;
  knitTexture.repeat.set(3, 4);
  
  return knitTexture;
}

// ===== КОНФИГУРАЦИЯ =====
const LAYOUT = {
  partGap: 20,        // отступ между деталями
  sleeveOffsetY: -40, // смещение рукавов вниз
  scaleX: 1,
  scaleY: 1,
  depth: 0.3,         // толщина экструзии
};

// ===== КОМПОНЕНТ: одна деталь =====
function SweaterPart({ profile, color, position = [0, 0, 0], label }) {
  const meshRef = useRef();

  const { geometry, material } = useMemo(() => {
    if (!profile?.length) return { geometry: null, material: null };
    
    const shape = buildShapeFromProfile(profile);
    const geom = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: LAYOUT.depth,
      bevelEnabled: false,
    });
    
    // Центрируем геометрию по центру детали
    geom.center();
    
    const mat = new THREE.MeshStandardMaterial({
      map: getKnitTexture(),
      color: color,
      roughness: 0.85,
      metalness: 0.02,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.98,
    });
    
    return { geometry: geom, material: mat };
  }, [profile, color]);

  if (!geometry) return null;

  return (
    <group position={position}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {/* Опционально: контур для отладки */}
      {/* <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color="#000" linewidth={1} />
      </lineSegments> */}
    </group>
  );
}

// ===== ПЛОСКАЯ ВЫКРОЙКА =====
function FlatPattern({ stitchData, rowData, color }) {
  const profiles = useMemo(() => ({
    back: buildProfile(stitchData, rowData, "back"),
    front: buildProfile(stitchData, rowData, "front"),
    sleeve_left: buildProfile(stitchData, rowData, "sleeve_left"),
    sleeve_right: buildProfile(stitchData, rowData, "sleeve_right"),
  }), [stitchData, rowData]);

  // Находим ключевые точки (ширины на разных уровнях)
  const keyPoints = useMemo(() => {
    const getPoint = (profile, rowLevel) => {
      if (!profile?.length) return 0;
      const p = profile.find(p => Math.abs(p.row - rowLevel) < 2);
      return p ? p.width : profile[0]?.width || 0;
    };

    return {
      back: {
        hem: profiles.back?.[0]?.width || 0,
        underarm: profiles.back?.length ? 
          getPoint(profiles.back, Math.max(...profiles.back.map(p => p.row)) * 0.6) : 0
      },
      front: {
        hem: profiles.front?.[0]?.width || 0,
        underarm: profiles.front?.length ? 
          getPoint(profiles.front, Math.max(...profiles.front.map(p => p.row)) * 0.6) : 0
      },
      sleeve: {
        cuff: profiles.sleeve_left?.[0]?.width || 0,
        underarm: profiles.sleeve_left?.length ? 
          getPoint(profiles.sleeve_left, Math.max(...profiles.sleeve_left.map(p => p.row))) : 0
      }
    };
  }, [profiles]);

  // Позиции деталей - БЕЗ GAP, соединены вплотную
  const parts = useMemo(() => {
    const result = [];
    
    // Спинка (слева)
    if (profiles.back?.length) {
      const backWidth = keyPoints.back.hem;
      result.push({
        key: "back",
        profile: profiles.back,
        position: [backWidth / 2, 0, 0]
      });

      // Перед (справа вплотную к спинке)
      if (profiles.front?.length) {
        const frontWidth = keyPoints.front.hem;
        result.push({
          key: "front",
          profile: profiles.front,
          position: [backWidth + frontWidth / 2, 0, 0]
        });
      }

      // Левый рукав (под левой проймой спинки)
      if (profiles.sleeve_left?.length) {
        const sleeveWidth = keyPoints.sleeve.underarm;
        const underarmX = 0; // левая пройма спинки - это x=0
        result.push({
          key: "sleeve_left",
          profile: profiles.sleeve_left,
          position: [underarmX, -sleeveWidth * 0.8, 0] // вниз от проймы
        });
      }

      // Правый рукав (под правой проймой переда)
      if (profiles.sleeve_right?.length) {
        const frontWidth = keyPoints.front.hem;
        const sleeveWidth = keyPoints.sleeve.underarm;
        const underarmX = backWidth + frontWidth; // правая пройма переда
        // Вторая половина рукава торчит вправо
        result.push({
          key: "sleeve_right",
          profile: profiles.sleeve_right,
          position: [underarmX + sleeveWidth * 0.25, -sleeveWidth * 0.8, 0]
        });
      }
    }

    return result;
  }, [profiles, keyPoints]);

  return (
    <group>
      {parts.map(part => (
        <SweaterPart
          key={part.key}
          profile={part.profile}
          color={color}
          position={part.position}
          label={part.key}
        />
      ))}
    </group>
  );
}
// ===== MAIN COMPONENT =====
export function Sweater3DPreview({
  height = 500,
  yarnColor = "#4A90D9",
  autoRotate = false,
  stitchData = [],
  rowData = [],
}) {
  return (
    <div className="sweater-3d-container" style={{ height: `${height}px` }}>
      <Canvas
        // 🔹 Камера: вид сверху-сбоку, чтобы сразу видеть плоскую выкройку
        camera={{ position: [-200, -120, 100], fov: 35 }}
        style={{ background: "#f8f9fa" }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#f8f9fa"]} />
        
        <ambientLight intensity={0.9} />
        <directionalLight position={[50, 100, 50]} intensity={1.2} />
        <directionalLight position={[-50, 30, -30]} intensity={0.4} />

        <FlatPattern
          stitchData={stitchData}
          rowData={rowData}
          color={yarnColor}
        />

        <ContactShadows
          position={[0, -60, 0]}
          opacity={0.2}
          scale={200}
          blur={2.5}
          far={80}
        />
        
        <Environment preset="studio" />

        <OrbitControls
          enablePan
          minDistance={50}
          maxDistance={400}
          autoRotate={autoRotate}
          enableZoom
          enableDamping
          dampingFactor={0.08}
          // Ограничиваем вращение, чтобы не "потерять" выкройку
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}

export default Sweater3DPreview;