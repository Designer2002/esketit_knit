import { useRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import "./Sweater3D.css";

// ===== Создаём текстуру вязки =====
function createKnitTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  
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

// ===== ЭМУЛЯЦИЯ RUST РАСЧЁТОВ ДЛЯ M =====
// Параметры основаны на вашем Rust коде для Size M
const RAGLAN_PARAMS_M = {
  back_width_stitches: 235,
  front_width_stitches: 235,
  neck_width_stitches: 48,
  total_rows: 180,
  decrease_shoulder_cuts: 18,
  neck_depth_rows: 22,
  sleeve_shoulder_cut_rows: 52,
  sleeve_top_stitches: 62,
  sleeve_cuff_stitches: 32,
  sleeve_cap_offset: 8,
  viewbox_width: 650,
  viewbox_height: 240,
};

// ===== Построение путей ИЗ RUST КОДА =====
function buildRaglanPaths(params) {
  const { 
    back_width_stitches, total_rows, neck_width_stitches, neck_depth_rows,
    decrease_shoulder_cuts, viewbox_height, viewbox_width,
    sleeve_shoulder_cut_rows, sleeve_top_stitches, sleeve_cuff_stitches,
    sleeve_cap_offset
  } = params;

  const hemY = viewbox_height - 20;
  const underarmY = total_rows * 0.72; // ~row 130 из Rust
  const rowToY = (row) => hemY - row;

  // === СПИНКА (Back) ===
  const backCenterX = viewbox_width * 0.75;
  const backLeftX = backCenterX - back_width_stitches / 2;
  const backRightX = backCenterX + back_width_stitches / 2;
  const neckLeftX = backCenterX - neck_width_stitches / 2;
  const neckRightX = backCenterX + neck_width_stitches / 2;
  const underarmDx = decrease_shoulder_cuts;

  const backPath = new THREE.Path();
  backPath.moveTo(backLeftX, hemY);
  backPath.lineTo(backLeftX, underarmY);
  backPath.lineTo(backLeftX + underarmDx, underarmY);
  
  // Квадратичная кривая горловины спинки (из Rust: Q cx bnl nr ny)
  const backNeckDepth = neck_depth_rows * 0.25;
  const backNeckY = rowToY(total_rows);
  const backNeckLow = backNeckY + backNeckDepth;
  backPath.quadraticCurveTo(backCenterX, backNeckLow, neckRightX, backNeckY);
  
  backPath.lineTo(backRightX - underarmDx, underarmY);
  backPath.lineTo(backRightX, underarmY);
  backPath.lineTo(backRightX, hemY);
  backPath.closePath();

  // === ПЕРЕД (Front) ===
  const frontCenterX = viewbox_width * 0.25;
  const frontLeftX = frontCenterX - back_width_stitches / 2;
  const frontRightX = frontCenterX + back_width_stitches / 2;
  const frontNeckLeftX = frontCenterX - neck_width_stitches / 2;
  const frontNeckRightX = frontCenterX + neck_width_stitches / 2;

  const frontPath = new THREE.Path();
  frontPath.moveTo(frontLeftX, hemY);
  frontPath.lineTo(frontLeftX, underarmY);
  frontPath.lineTo(frontLeftX + underarmDx, underarmY);
  
  // Вырез переда глубже (из Rust логики)
  const frontNeckY = rowToY(total_rows);
  const frontNeckLow = frontNeckY + neck_depth_rows * 0.65;
  frontPath.quadraticCurveTo(frontCenterX, frontNeckLow, frontNeckRightX, frontNeckY);
  
  frontPath.lineTo(frontRightX - underarmDx, underarmY);
  frontPath.lineTo(frontRightX, underarmY);
  frontPath.lineTo(frontRightX, hemY);
  frontPath.closePath();

  // === РУКАВ (Sleeve) - ИЗ RUST build_sleeve_path ===
  const cx = viewbox_width / 2;
  const cuffY = total_rows + 40;
  const baseTopY = 40;
  const cutY = sleeve_shoulder_cut_rows + 40;
  
  const cuffW = sleeve_cuff_stitches;
  const topW = sleeve_top_stitches;
  const slopeDrop = Math.max(sleeve_cap_offset, 6);

  const leftCuff = cx - cuffW / 2;
  const rightCuff = cx + cuffW / 2;
  const leftCut = cx - topW / 2 + underarmDx;
  const rightCut = cx + topW / 2 - underarmDx;

  const sleevePath = new THREE.Path();
  sleevePath.moveTo(leftCuff, cuffY);
  sleevePath.lineTo(leftCut, cutY);
  sleevePath.lineTo(leftCut + underarmDx, cutY); // Вертикаль подреза
  sleevePath.lineTo(cx - topW / 2, baseTopY);
  sleevePath.lineTo(cx + topW / 2, baseTopY + slopeDrop); // Скос к спинке
  sleevePath.lineTo(rightCut, cutY);
  sleevePath.lineTo(rightCut + underarmDx, cutY);
  sleevePath.lineTo(rightCuff, cuffY);
  sleevePath.closePath();

  return { backPath, frontPath, sleevePath, underarmY, hemY, cutY };
}

// ===== Экструдированная деталь =====
function ExtrudedPart({ path, position, rotation, scale, color, thickness = 1.2 }) {
  const geometry = useMemo(() => {
    const shape = path.toShapes(false)[0];
    return new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.3,
      bevelSize: 0.3,
      bevelSegments: 2,
    });
  }, [path, thickness]);

  const texture = useMemo(() => createKnitTexture(color), [color]);
  
  // Подгоняем UV под размер детали
  const box = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
  const size = box.getSize(new THREE.Vector3());
  texture.repeat.set(size.x * 0.04, size.y * 0.04);

  return (
    <mesh geometry={geometry} position={position} rotation={rotation} scale={scale}>
      <meshStandardMaterial
        map={texture}
        color="#ffffff"
        roughness={0.75}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ===== Реглан свитер из экструдированных путей =====
function RaglanSweater({ calculation, color }) {
  const params = { ...RAGLAN_PARAMS_M, ...calculation };
  const { backPath, frontPath, sleevePath, underarmY, hemY, cutY } = useMemo(
    () => buildRaglanPaths(params),
    [params]
  );

  const SCALE = 0.075;
  const THICKNESS = 1.0;
  const bodyZOffset = 8;

  // Центрируем модель
  const centerY = -hemY * SCALE / 2;

  return (
    <group>
      {/* Спинка */}
      <ExtrudedPart
        path={backPath}
        position={[0, centerY, -bodyZOffset]}
        rotation={[0, 0, 0]}
        scale={[SCALE, -SCALE, 1]}
        color={color}
        thickness={THICKNESS}
      />

      {/* Перед */}
      <ExtrudedPart
        path={frontPath}
        position={[0, centerY, bodyZOffset]}
        rotation={[0, 0, 0]}
        scale={[SCALE, -SCALE, 1]}
        color={color}
        thickness={THICKNESS}
      />

      {/* Левый рукав */}
      <group position={[-params.back_width_stitches * SCALE / 2 + 3, -cutY * SCALE + 8, 0]}>
        <ExtrudedPart
          path={sleevePath}
          position={[0, 0, 0]}
          rotation={[0, 0, Math.PI / 2 + 0.25]}
          scale={[SCALE, -SCALE, 1]}
          color={color}
          thickness={THICKNESS}
        />
      </group>

      {/* Правый рукав */}
      <group position={[params.back_width_stitches * SCALE / 2 - 3, -cutY * SCALE + 8, 0]}>
        <ExtrudedPart
          path={sleevePath}
          position={[0, 0, 0]}
          rotation={[0, 0, -(Math.PI / 2 + 0.25)]}
          scale={[-SCALE, -SCALE, 1]}
          color={color}
          thickness={THICKNESS}
        />
      </group>
    </group>
  );
}

// ===== Main 3D Preview =====
export function Sweater3DPreview({ calculation, sleeveType = "raglan", height = 300 }) {
  const yarnColor = calculation?.yarn_color || "#4A90D9";

  return (
    <div className="sweater-3d-container" style={{ height: `${height}px` }}>
      <Canvas
        camera={{ position: [0, 0, 35], fov: 40 }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 20]} intensity={1.5} />
        <directionalLight position={[-20, 15, -20]} intensity={0.5} />
        <pointLight position={[0, 10, 15]} intensity={0.6} />

        {sleeveType === 'raglan' ? (
          <RaglanSweater calculation={calculation} color={yarnColor} />
        ) : (
          // TODO: Set-in пока использует заглушку
          <RaglanSweater calculation={calculation} color={yarnColor} />
        )}

        <ContactShadows position={[0, -15, 0]} opacity={0.35} scale={50} blur={2} far={25} />
        <Environment preset="apartment" />

        <OrbitControls
          enablePan={false}
          minDistance={15}
          maxDistance={60}
          autoRotate
          autoRotateSpeed={1.2}
          enableZoom={true}
        />
      </Canvas>
    </div>
  );
}

export default Sweater3DPreview;
