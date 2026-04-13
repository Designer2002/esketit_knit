import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import "./Sweater3D.css";

// ===== Создаём текстуру вязки с правильным UV =====
function createKnitTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  
  // Базовый цвет
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  
  // Вертикальные "петли" (ряды вязки)
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  
  // Горизонтальные "столбики"
  for (let x = 0; x < 256; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 6);
  
  return texture;
}

// ===== Параметры для размера M =====
const SIZE_M_PARAMS = {
  bodyRadius: 0.85,      // радиус туловища
  bodyHeight: 1.8,       // высота от подола до горловины
  shoulderWidth: 0.95,   // ширина плеч
  neckRadius: 0.18,      // радиус горловины
  armholeY: 0.35,        // Y позиция проймы
  armholeRadius: 0.28,   // радиус проймы
  sleeveLength: 1.5,     // длина рукава
  sleeveTopRadius: 0.22, // радиуc рукава у плеча
  sleeveCuffRadius: 0.14,// радиус манжеты
};

// ===== Создаём геометрию тела с проймами =====
function createBodyGeometry(isFront, params, sleeveType) {
  const { bodyRadius, bodyHeight, shoulderWidth, neckRadius, armholeY, armholeRadius } = params;
  
  // Используем CylinderGeometry с кастомными вершинами для формы тела
  const segments = 32;
  const height = bodyHeight;
  const radiusTop = shoulderWidth / 2;
  const radiusBottom = bodyRadius;
  
  // Создаём кастомную геометрию
  const geometry = new THREE.CylinderGeometry(
    radiusBottom,
    radiusTop,
    height,
    segments,
    1,
    true // open ended - без крышек
  );
  
  // Модифицируем вершины для создания пройм и горловины
  const positions = geometry.attributes.position.array;
  const uvs = geometry.attributes.uv.array;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Преобразуем Y из диапазона [-height/2, height/2] в [0, height]
    const normalizedY = (y + height / 2) / height;
    
    // Горловина (вырез сверху)
    if (normalizedY > 0.88) {
      const distFromCenter = Math.sqrt(x * x + z * z);
      const neckCutout = neckRadius * (1 + (normalizedY - 0.88) * 2);
      
      if (distFromCenter < neckCutout) {
        // Смещаем вершины к краю горловины
        const angle = Math.atan2(z, x);
        const newX = Math.cos(angle) * neckCutout;
        const newZ = Math.sin(angle) * neckCutout;
        positions[i] = newX;
        positions[i + 2] = newZ;
      }
      
      // Для переда делаем горловину глубже
      if (isFront && x > -neckRadius && x < neckRadius) {
        positions[i + 1] = y - (neckRadius - Math.abs(x)) * 0.6;
      }
    }
    
    // Проймы (вырезы по бокам)
    if (Math.abs(normalizedY - armholeY / height) < 0.15) {
      const sideAngle = Math.atan2(z, x);
      const isLeftSide = x < 0;
      const targetAngle = isLeftSide ? Math.PI : 0;
      
      // Расстояние до центра проймы
      const armholeCenterX = isLeftSide ? -shoulderWidth / 2 * 0.7 : shoulderWidth / 2 * 0.7;
      const armholeCenterY = armholeY - height / 2;
      
      const dx = x - armholeCenterX;
      const dy = y - armholeCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < armholeRadius * 0.9) {
        // Смещаем вершины к краю проймы
        const angle = Math.atan2(dy, dx);
        const newX = armholeCenterX + Math.cos(angle) * armholeRadius;
        const newY = armholeCenterY + Math.sin(angle) * armholeRadius;
        positions[i] = newX;
        positions[i + 1] = newY;
      }
    }
  }
  
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  
  return geometry;
}

// ===== Создаём геометрию рукава =====
function createSleeveGeometry(params, sleeveType) {
  const { sleeveLength, sleeveTopRadius, sleeveCuffRadius } = params;
  
  // Конусообразный рукав
  const segments = 24;
  const geometry = new THREE.CylinderGeometry(
    sleeveCuffRadius,
    sleeveTopRadius,
    sleeveLength,
    segments,
    1,
    true
  );
  
  // Изгибаем рукав для естественной формы
  const positions = geometry.attributes.position.array;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Нормализуем Y от -1 (манжета) до 1 (плечо)
    const normalizedY = (y + sleeveLength / 2) / sleeveLength;
    
    // Небольшой изгиб в локте
    if (normalizedY > 0.3 && normalizedY < 0.7) {
      const bendAmount = Math.sin((normalizedY - 0.3) * Math.PI / 0.4) * 0.08;
      positions[i] = x + bendAmount * Math.sign(x);
    }
    
    // Окат рукава (верхняя часть)
    if (normalizedY > 0.85) {
      const capShape = Math.sin((normalizedY - 0.85) / 0.15 * Math.PI / 2);
      const expansion = capShape * 0.12;
      const angle = Math.atan2(z, x);
      positions[i] = x + Math.cos(angle) * expansion;
      positions[i + 2] = z + Math.sin(angle) * expansion;
    }
  }
  
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  
  return geometry;
}

// ===== Компонент СШИТОГО свитера =====
function SewnSweater({ calculation, sleeveType }) {
  const groupRef = useRef();
  
  const isSetIn = sleeveType === "set_in" && calculation?.type === "set_in";
  
  // Параметры для разных типов рукавов
  const params = {
    ...SIZE_M_PARAMS,
    armholeRadius: isSetIn ? 0.26 : 0.32, // Втачной имеет меньшую пройму
    sleeveTopRadius: isSetIn ? 0.20 : 0.24,
    sleeveLength: isSetIn ? 1.4 : 1.5,
  };

  const { backGeom, frontGeom, leftSleeveGeom, rightSleeveGeom } = useMemo(() => {
    const backGeom = createBodyGeometry(false, params, sleeveType);
    const frontGeom = createBodyGeometry(true, params, sleeveType);
    const sleeveGeom = createSleeveGeometry(params, sleeveType);
    
    return {
      backGeom,
      frontGeom,
      leftSleeveGeom: sleeveGeom,
      rightSleeveGeom: sleeveGeom.clone(),
    };
  }, [params, sleeveType]);

  // Цвет пряжи из мерок
  const yarnColor = calculation?.yarn_color || "#4A90D9";
  const knitTexture = useMemo(() => createKnitTexture(yarnColor), [yarnColor]);

  const material = useMemo(() => (
    <meshStandardMaterial
      map={knitTexture}
      color={yarnColor}
      roughness={0.8}
      metalness={0.02}
      side={THREE.DoubleSide}
    />
  ), [knitTexture, yarnColor]);

  // Позиции пройм для установки рукавов
  const armholeY = params.armholeY - params.bodyHeight / 2;
  const shoulderX = params.shoulderWidth / 2 * 0.75;

  return (
    <group ref={groupRef} scale={1.0}>
      {/* Спинка */}
      <mesh geometry={backGeom} rotation={[0, Math.PI, 0]}>
        {material}
      </mesh>
      
      {/* Перед */}
      <mesh geometry={frontGeom}>
        {material}
      </mesh>
      
      {/* Левый рукав - вставлен в пройму */}
      <mesh
        geometry={leftSleeveGeom}
        position={[-shoulderX, armholeY + 0.15, 0]}
        rotation={[0, 0, 0.4]}
      >
        {material}
      </mesh>
      
      {/* Правый рукав - вставлен в пройму */}
      <mesh
        geometry={rightSleeveGeom}
        position={[shoulderX, armholeY + 0.15, 0]}
        rotation={[0, 0, -0.4]}
      >
        {material}
      </mesh>
      
      {/* Декоративные швы (опционально) */}
      <lineSegments position={[0, 0, 0.01]}>
        <edgesGeometry args={[frontGeom]} />
        <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
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
