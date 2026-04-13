import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import "./Sweater3D.css";

// ===== Вспомогательная: создать ExtrudeGeometry из 2D полигона =====
function createExtrudedShape(points2D, depth = 0.3) {
  if (!points2D || points2D.length < 3) return null;
  
  const shape = new THREE.Shape();
  shape.moveTo(points2D[0].x, points2D[0].y);
  for (let i = 1; i < points2D.length; i++) {
    shape.lineTo(points2D[i].x, points2D[i].y);
  }
  shape.closePath();

  const extrudeSettings = {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
  };

  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

// ===== Детали свитера для РАЗМЕРА M (Raglan) =====
function getRaglanShapesM() {
  // Размер M: ОГ=94см, плотность 2.5 п/см → ~235 петель ширина спинки
  // total_rows ~ 180 рядов (60см * 3.5 р/см + скосы)
  // raglan_start_row_front ~ 50 рядов от подола
  
  const backShape = [
    { x: -0.9, y: -0.85 },   // подол лево
    { x: -0.9, y: 0.15 },    // бок лево до проймы
    { x: -0.55, y: 0.35 },   // подмышка лево (сужение к реглану)
    { x: -0.35, y: 0.55 },   // скос реглана лево
    { x: -0.12, y: 0.72 },   // горловина лево
    { x: 0, y: 0.68 },       // горловина центр (спинка чуть выше)
    { x: 0.12, y: 0.72 },    // горловина право
    { x: 0.35, y: 0.55 },    // скос реглана право
    { x: 0.55, y: 0.35 },    // подмышка право
    { x: 0.9, y: 0.15 },     // бок право
    { x: 0.9, y: -0.85 },    // подол право
  ];

  const frontShape = [
    { x: -0.9, y: -0.85 },
    { x: -0.9, y: 0.15 },
    { x: -0.55, y: 0.35 },
    { x: -0.35, y: 0.55 },
    { x: -0.12, y: 0.68 },
    { x: 0, y: 0.35 },       // V-горловина переда (глубже)
    { x: 0.12, y: 0.68 },
    { x: 0.35, y: 0.55 },
    { x: 0.55, y: 0.35 },
    { x: 0.9, y: 0.15 },
    { x: 0.9, y: -0.85 },
  ];

  // Рукав реглан
  const sleeveShape = [
    { x: -0.15, y: -0.75 },   // манжета лево
    { x: -0.22, y: -0.25 },   // предплечье лево (расширение)
    { x: -0.32, y: 0.25 },    // начало оката лево
    { x: -0.25, y: 0.45 },    // окат лево
    { x: 0, y: 0.55 },        // вершина оката
    { x: 0.25, y: 0.45 },     // окат право
    { x: 0.32, y: 0.25 },     // начало оката право
    { x: 0.22, y: -0.25 },    // предплечье право
    { x: 0.15, y: -0.75 },    // манжета право
  ];

  return { backShape, frontShape, sleeveShape };
}

// ===== Детали свитера для РАЗМЕРА M (Set-In / Втачной рукав) =====
function getSetInShapesM() {
  // hem_width_stitches ~ 235, underarm_width_stitches ~ 215
  // armhole_height_rows ~ 55 (от подреза до плеча)
  // total_garment_rows ~ 210 (70см * 3.5 р/см)
  // neck_width_stitches ~ 50, neck_depth_rows ~ 25
  // sleeve_cuff_stitches ~ 50, sleeve_widest_stitches ~ 110
  // sleeve_body_rows ~ 140, sleeve_cap_height_rows ~ 45
  
  const backShape = [
    { x: -0.9, y: -0.9 },    // подол лево
    { x: -0.9, y: 0.2 },     // бок лево (прямой до проймы)
    { x: -0.82, y: 0.35 },   // пройма лево (убавки)
    { x: -0.65, y: 0.55 },   // пройма лево верх
    { x: -0.45, y: 0.68 },   // плечо лево (скос)
    { x: -0.18, y: 0.78 },   // горловина лево
    { x: 0, y: 0.75 },       // горловина центр спинки
    { x: 0.18, y: 0.78 },    // горловина право
    { x: 0.45, y: 0.68 },    // плечо право (скос)
    { x: 0.65, y: 0.55 },    // пройма право верх
    { x: 0.82, y: 0.35 },    // пройма право
    { x: 0.9, y: 0.2 },      // бок право
    { x: 0.9, y: -0.9 },     // подол право
  ];

  const frontShape = [
    { x: -0.9, y: -0.9 },
    { x: -0.9, y: 0.2 },
    { x: -0.82, y: 0.35 },
    { x: -0.65, y: 0.55 },
    { x: -0.45, y: 0.68 },
    { x: -0.18, y: 0.72 },   // горловина лево переда
    { x: 0, y: 0.45 },       // V-горловина переда (глубже)
    { x: 0.18, y: 0.72 },    // горловина право переда
    { x: 0.45, y: 0.68 },
    { x: 0.65, y: 0.55 },
    { x: 0.82, y: 0.35 },
    { x: 0.9, y: 0.2 },
    { x: 0.9, y: -0.9 },
  ];

  // Втачной рукав с высоким окатом
  const sleeveShape = [
    { x: -0.12, y: -0.75 },   // манжета лево
    { x: -0.18, y: -0.35 },   // предплечье лево
    { x: -0.28, y: 0.05 },    // рукав до оката
    { x: -0.35, y: 0.35 },    // окат лево (крутой)
    { x: -0.22, y: 0.55 },    // окат лево верх
    { x: 0, y: 0.62 },        // вершина оката
    { x: 0.22, y: 0.55 },     // окат право верх
    { x: 0.35, y: 0.35 },     // окат право
    { x: 0.28, y: 0.05 },     // рукав до оката право
    { x: 0.18, y: -0.35 },    // предплечье право
    { x: 0.12, y: -0.75 },    // манжета право
  ];

  return { backShape, frontShape, sleeveShape };
}

// ===== Компонент СШИТОГО свитера =====
function SewnSweater({ calculation, sleeveType }) {
  const groupRef = useRef();

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2;
    }
  });

  const { backGeom, frontGeom, sleeveGeom } = useMemo(() => {
    let shapes;
    if (sleeveType === "set_in" && calculation?.type === "set_in") {
      shapes = getSetInShapesM();
    } else {
      shapes = getRaglanShapesM();
    }
    const { backShape, frontShape, sleeveShape } = shapes;

    const backGeom = createExtrudedShape(backShape, 0.15);
    const frontGeom = createExtrudedShape(frontShape, 0.15);
    const sleeveGeom = createExtrudedShape(sleeveShape, 0.1);

    return { backGeom, frontGeom, sleeveGeom };
  }, [calculation, sleeveType]);

  // Цвет пряжи из мерок (если есть)
  const yarnColor = calculation?.yarn_color || "#4A90D9";

  return (
    <group ref={groupRef} scale={1.5}>
      {/* Спинка (сзади, z < 0) */}
      {backGeom && (
        <mesh geometry={backGeom} position={[0, 0, -0.2]}>
          <meshStandardMaterial
            color={yarnColor}
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Перед (спереди, z > 0) */}
      {frontGeom && (
        <mesh geometry={frontGeom} position={[0, 0, 0.2]}>
          <meshStandardMaterial
            color={yarnColor}
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Левый рукав (свёрнут по пройме) */}
      {sleeveGeom && (
        <mesh
          geometry={sleeveGeom}
          position={[-0.75, 0.1, 0]}
          rotation={[0, 0, 0.35]}
        >
          <meshStandardMaterial
            color={yarnColor}
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Правый рукав (свёрнут по пройме) */}
      {sleeveGeom && (
        <mesh
          geometry={sleeveGeom.clone()}
          position={[0.75, 0.1, 0]}
          rotation={[0, 0, -0.35]}
        >
          <meshStandardMaterial
            color={yarnColor}
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Боковые швы */}
      <lineSegments>
        <bufferGeometry>
          <float32BufferAttribute
            attach="attributes-position"
            count={4}
            array={new Float32Array([
              -0.9 * 1.5, -0.85 * 1.5, -0.15,
              -0.9 * 1.5, 0.55 * 1.5, 0.15,
              0.9 * 1.5, -0.85 * 1.5, -0.15,
              0.9 * 1.5, 0.55 * 1.5, 0.15,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#f1c40f" transparent opacity={0.7} />
      </lineSegments>

      {/* Швы рукавов */}
      <lineSegments>
        <bufferGeometry>
          <float32BufferAttribute
            attach="attributes-position"
            count={4}
            array={new Float32Array([
              -0.55 * 1.5, 0.35 * 1.5, 0,
              -0.75 * 1.5, 0.4 * 1.5, 0.1,
              0.55 * 1.5, 0.35 * 1.5, 0,
              0.75 * 1.5, 0.4 * 1.5, 0.1,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#f1c40f" transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

// ===== Main 3D Preview =====
export function Sweater3DPreview({ calculation, sleeveType = "raglan", height = 300 }) {
  return (
    <div className="sweater-3d-container" style={{ height: `${height}px` }}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 6, 5]} intensity={1.2} />
        <directionalLight position={[-4, 3, -4]} intensity={0.4} />
        <pointLight position={[0, 2, 3]} intensity={0.5} />

        <SewnSweater calculation={calculation} sleeveType={sleeveType} />

        <ContactShadows position={[0, -1.8, 0]} opacity={0.4} scale={10} blur={2.5} far={5} />
        <Environment preset="apartment" />

        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={8}
          autoRotate
          autoRotateSpeed={1.5}
          enableZoom={true}
        />
      </Canvas>
    </div>
  );
}

export default Sweater3DPreview;
