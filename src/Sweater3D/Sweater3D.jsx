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

// ===== Детали свитера (в форме выкройки) =====
function defaultSweaterParts() {
  // Y направлен вверх: горловина > 0, подол < 0
  
  // Спинка
  const backShape = [
    { x: -0.7, y: -0.8 },   // подол лево
    { x: -0.7, y: 0.1 },    // бок лево
    { x: -0.5, y: 0.25 },   // подмышка лево
    { x: -0.25, y: 0.35 },  // плечо лево
    { x: -0.08, y: 0.42 },  // горловина лево
    { x: 0, y: 0.38 },      // горловина центр (спинка чуть выше)
    { x: 0.08, y: 0.42 },   // горловина право
    { x: 0.25, y: 0.35 },   // плечо право
    { x: 0.5, y: 0.25 },    // подмышка право
    { x: 0.7, y: 0.1 },     // бок право
    { x: 0.7, y: -0.8 },    // подол право
  ];

  // Перед (с V-горловиной)
  const frontShape = [
    { x: -0.7, y: -0.8 },
    { x: -0.7, y: 0.1 },
    { x: -0.5, y: 0.25 },
    { x: -0.25, y: 0.35 },
    { x: -0.08, y: 0.38 },
    { x: 0, y: 0.12 },      // V-горловина (глубже чем спинка)
    { x: 0.08, y: 0.38 },
    { x: 0.25, y: 0.35 },
    { x: 0.5, y: 0.25 },
    { x: 0.7, y: 0.1 },
    { x: 0.7, y: -0.8 },
  ];

  // Рукав (свёрнутый по пройме)
  const sleeveShape = [
    { x: -0.18, y: -0.7 },   // манжета лево
    { x: -0.22, y: -0.2 },   // предплечье лево
    { x: -0.28, y: 0.15 },   // пройма лево (начало сгиба)
    { x: -0.2, y: 0.3 },     // окат лево
    { x: 0, y: 0.35 },       // окат центр (верхушка)
    { x: 0.2, y: 0.3 },      // окат право
    { x: 0.28, y: 0.15 },    // пройма право (начало сгиба)
    { x: 0.22, y: -0.2 },    // предплечье право
    { x: 0.18, y: -0.7 },    // манжета право
  ];

  return { backShape, frontShape, sleeveShape };
}

// ===== Компонент СШИТОГО свитера =====
function SewnSweater() {
  const groupRef = useRef();

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2;
    }
  });

  const { backGeom, frontGeom, sleeveGeom } = useMemo(() => {
    const { backShape, frontShape, sleeveShape } = defaultSweaterParts();

    const backGeom = createExtrudedShape(backShape, 0.15);
    const frontGeom = createExtrudedShape(frontShape, 0.15);
    const sleeveGeom = createExtrudedShape(sleeveShape, 0.1);

    return { backGeom, frontGeom, sleeveGeom };
  }, []);

  return (
    <group ref={groupRef} scale={1.5}>
      {/* Спинка (сзади, z < 0) */}
      {backGeom && (
        <mesh geometry={backGeom} position={[0, 0, -0.2]}>
          <meshStandardMaterial
            color="#3498db"
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Перед (спереди, z > 0) */}
      {frontGeom && (
        <mesh geometry={frontGeom} position={[0, 0, 0.2]}>
          <meshStandardMaterial
            color="#2ecc71"
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Левый рукав (свёрнут по пройме) */}
      {sleeveGeom && (
        <mesh
          geometry={sleeveGeom}
          position={[-0.8, 0.05, 0]}
          rotation={[0, 0, 0.3]}
        >
          <meshStandardMaterial
            color="#f39c12"
            roughness={0.75}
            metalness={0.05}
          />
        </mesh>
      )}

      {/* Правый рукав (свёрнут по пройме) */}
      {sleeveGeom && (
        <mesh
          geometry={sleeveGeom.clone()}
          position={[0.8, 0.05, 0]}
          rotation={[0, 0, -0.3]}
        >
          <meshStandardMaterial
            color="#f39c12"
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
              -0.7 * 1.5, -0.8 * 1.5, -0.15,
              -0.7 * 1.5, 0.35 * 1.5, 0.15,
              0.7 * 1.5, -0.8 * 1.5, -0.15,
              0.7 * 1.5, 0.35 * 1.5, 0.15,
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
              -0.5 * 1.5, 0.25 * 1.5, 0,
              -0.8 * 1.5, 0.3 * 1.5, 0.1,
              0.5 * 1.5, 0.25 * 1.5, 0,
              0.8 * 1.5, 0.3 * 1.5, 0.1,
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
export function Sweater3DPreview({ height = 300 }) {
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

        <SewnSweater />

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
