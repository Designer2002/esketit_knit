import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import "./Sweater3D.css";

// ===== БАЗОВЫЕ МЕРКИ =====
const SIZE_M_DEFAULTS = {
  og: 94,
  dr: 60,
  oz: 16,
  or_val: 32,
  di: 62,
  glg: 8,
  oh: 58,
  ease: 6,
  gauge_stitches_per_cm: 2.5,
  gauge_rows_per_cm: 3.5,
};

// ===== Текстура (кэшируем снаружи) =====
const knitTexture = new THREE.TextureLoader().load(
  "/textures/knit_specular.png",
);
knitTexture.wrapS = THREE.RepeatWrapping;
knitTexture.wrapT = THREE.RepeatWrapping;
knitTexture.repeat.set(3, 4);

// ===== Вспомогательные функции =====
const sortByNum = (arr, prefix) =>
  arr
    .filter((n) => n.node_name?.trim().startsWith(prefix))
    .sort((a, b) => {
      const na = parseFloat(a.node_name.trim().replace(prefix, "")) || 0;
      const nb = parseFloat(b.node_name.trim().replace(prefix, "")) || 0;
      return na - nb;
    });

const getNode = (group, name) =>
  group?.find((n) => n.node_name?.trim() === name);

// ===== ПОСТРОЕНИЕ ПЛОСКОЙ ВЫКРОЙКИ (единый контур) =====
// Схема: [Рукав Л] — [Спинка] — [Перед] — [Рукав П]
function buildFlatPattern(nodes) {
  const grouped = {};
  nodes.forEach((node) => {
    const part = node.part_code?.trim();
    if (!grouped[part]) grouped[part] = [];
    grouped[part].push(node);
  });

  const back = grouped["back"] || [];
  const front = grouped["front"] || [];
  const sleeveL = grouped["sleeve_left"] || [];
  const sleeveR = grouped["sleeve_right"] || [];

  // Ключевые точки
  const b = {
    hem_l: getNode(back, "back_left_hem"),
    cut_l: getNode(back, "back_left_cut"),
    underarm_l: getNode(back, "back_left_underarm"),
    shoulders_l: sortByNum(back, "back_left_shoulder_").reverse(),
    neck_left: getNode(back, "back_neck_left"),
    neck_right: getNode(back, "back_neck_right"),
    shoulders_r: sortByNum(back, "back_right_shoulder_"),
    underarm_r: getNode(back, "back_right_underarm"),
    cut_r: getNode(back, "back_right_cut"),
    hem_r: getNode(back, "back_right_hem"),
  };

  const f = {
    hem_l: getNode(front, "front_left_hem"),
    cut_l: getNode(front, "front_left_cut"),
    underarm_l: getNode(front, "front_left_underarm"),
    shoulders_l: sortByNum(front, "front_left_shoulder_").reverse(),
    neck_l: getNode(front, "front_neck_left"),
    neck_left: sortByNum(front, "front_left_neck_"),
    neck_center: getNode(front, "front_neck_center"),
    neck_right: sortByNum(front, "front_right_neck_").reverse(),
    neck_r: getNode(front, "front_neck_right"),
    shoulders_r: sortByNum(front, "front_right_shoulder_"),
    underarm_r: getNode(front, "front_right_underarm"),
    cut_r: getNode(front, "front_right_cut"),
    hem_r: getNode(front, "front_right_hem"),
  };

  const sL = {
    cuff_l: getNode(sleeveL, "sleeve_cuff_left"),
    cut_l: getNode(sleeveL, "sleeve_cut_left"),
    underarm_l: getNode(sleeveL, "sleeve_underarm_left"),
    top_l: getNode(sleeveL, "sleeve_top_left"),
    top_r: getNode(sleeveL, "sleeve_top_right"),
    underarm_r: getNode(sleeveL, "sleeve_underarm_right"),
    cut_r: getNode(sleeveL, "sleeve_cut_right"),
    cuff_r: getNode(sleeveL, "sleeve_cuff_right"),
  };

  const sR = {
    cuff_l: getNode(sleeveR, "sleeve_cuff_left"),
    cut_l: getNode(sleeveR, "sleeve_cut_left"),
    underarm_l: getNode(sleeveR, "sleeve_underarm_left"),
    top_l: getNode(sleeveR, "sleeve_top_right"),
    top_r: getNode(sleeveR, "sleeve_top_left"),
    underarm_r: getNode(sleeveR, "sleeve_underarm_right"),
    cut_r: getNode(sleeveR, "sleeve_cut_right"),
    cuff_r: getNode(sleeveR, "sleeve_cuff_right"),
  };

  // Смещения для соединения по линии реглана
  const shoulderL_back = b.shoulders_l[0]; // верхняя точка левого плеча спинки

  // Строим единый контур
  const path = new THREE.ShapePath();
  let started = false;
  const add = (x, y) => {
    if (!started) {
      path.moveTo(x, y);
      started = true;
    } else path.lineTo(x, y);
  };

  if (b.hem_l) add(b.hem_l.x, b.hem_l.y);
  if (b.cut_l) add(b.cut_l.x, b.cut_l.y);
  if (b.underarm_l) add(b.underarm_l.x, b.underarm_l.y);
  b.shoulders_l.forEach((p) => add(p.x, p.y));
  if (b.neck_l) add(b.neck_l.x, b.neck_l.y);
  if (b.neck_r) add(b.neck_r.x, b.neck_r.y);
  b.shoulders_r.forEach((p) => add(p.x, p.y));
  if (b.underarm_r) add(b.underarm_r.x, b.underarm_r.y);
  if (b.cut_r) add(b.cut_r.x, b.cut_r.y);
  if (b.hem_r) add(b.hem_r.x, b.hem_r.y);

  const f_offset = 73;
  if (f.hem_l) add(f.hem_l.x + f_offset, f.hem_l.y);
  if (f.cut_l) add(f.cut_l.x + f_offset, f.cut_l.y);
  if (f.underarm_l) add(f.underarm_l.x + f_offset, f.underarm_l.y);
  f.shoulders_l.forEach((p) => add(p.x + f_offset, p.y));
  if (f.neck_l) add(f.neck_l.x + f_offset, f.neck_l.y);
  f.neck_left.forEach((p) => add(p.x + f_offset, p.y));
  f.neck_right.forEach((p) => add(p.x + f_offset, p.y));
  if (f.neck_r) add(f.neck_r.x + f_offset, f.neck_r.y);
  f.shoulders_r.forEach((p) => add(p.x + f_offset, p.y));
  if (f.underarm_r) add(f.underarm_r.x + f_offset, f.underarm_r.y);
  if (f.cut_r) add(f.cut_r.x + f_offset, f.cut_r.y);
  if (f.hem_r) add(f.hem_r.x + f_offset, f.hem_r.y);

  path.currentPath?.closePath();

  // Линия сгиба (по центру, через плечевые точки)
  const foldY = shoulderL_back?.y || 100;
  const bounds = {
    minX: Math.min(...nodes.map((n) => n.x)),
    maxX: Math.max(...nodes.map((n) => n.x)),
    minY: Math.min(...nodes.map((n) => n.y)),
    maxY: Math.max(...nodes.map((n) => n.y)),
  };

  return { path, foldY, bounds };
}

// ===== Плоская выкройка с анимацией сгиба =====
function FlatSweater({ color, nodes = [], folded = true, foldAmount = 0.6 }) {
  const meshRef = useRef();
  const { path, foldY, bounds } = useMemo(
    () => buildFlatPattern(nodes),
    [nodes],
  );

  const geometry = useMemo(() => {
    if (!path) return null;
    const shapes = path.toShapes(false);
    if (!shapes.length) return null;
    return new THREE.ExtrudeGeometry(shapes[0], {
      steps: 1,
      depth: 0.25,
      bevelEnabled: false,
    });
  }, [path]);

  // Анимация сгиба
  useFrame((_, delta) => {
    if (meshRef.current && folded) {
      const t = (Math.sin(Date.now() * 0.001) + 1) * 0.5;
      meshRef.current.rotation.x = t * Math.PI * 0.35 * foldAmount;
      meshRef.current.position.y = -foldY * 0.075 * 0.5;
    } else if (meshRef.current) {
      meshRef.current.rotation.x = 0;
      meshRef.current.position.y = 0;
    }
  });

  if (!geometry) return null;

  // Центрирование
  const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const centerY = bounds ? (bounds.minY + bounds.maxY) / 2 : 0;
  const SCALE = 0.075;

  return (
    <group ref={meshRef} position={[-centerX * SCALE, -centerY * SCALE, 0]}>
      <mesh geometry={geometry} scale={[SCALE, -SCALE, 1]}>
        <meshStandardMaterial
          map={knitTexture}
          color={color}
          roughness={0.85}
          metalness={0.02}
          side={THREE.DoubleSide}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Линия сгиба (визуальный маркер) */}
      {folded && (
        <mesh position={[0, (-foldY + centerY) * SCALE, 0.15]}>
          <boxGeometry
            args={[(bounds?.maxX - bounds?.minX) * SCALE * 0.98, 0.3, 0.1]}
          />
          <meshBasicMaterial color="#ff4444" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ===== Main Preview =====
export function Sweater3DPreview({
  height = 400,
  yarnColor = "#4A90D9",
  folded = false, // показать сложенную выкройку
  foldAmount = 0.6, // сила сгиба (0-1)
  autoRotate = false,
  nodes = [],
  stitchData = [],
  rowData = [], 
}) {
  const cameraDistance = 60;
  const convertedNodes = useMemo(() => {
    if (stitchData.length === 0 || rowData.length === 0) return nodes;

    // Создаём мап для быстрого поиска
    const stitchMap = new Map(stitchData.map((d) => [d.node_name, d.value]));
    const rowMap = new Map(rowData.map((d) => [d.node_name, d.value]));

    return nodes.map((node) => {
      const stitches = stitchMap.get(node.node_name) ?? node.x / 2.5; // fallback
      const rows = rowMap.get(node.node_name) ?? (270 - node.y) / 3.5; // fallback

      return {
        ...node,
        // 🔹 Используем "чистые" координаты в петлях/рядах
        stitch_x: stitches,
        row_y: rows,
      };
    });
  }, [nodes, stitchData, rowData]);

  // ===== Дальше используем convertedNodes для построения путей =====
  const paths = useMemo(
    () => buildPathsFromNodes(convertedNodes),
    [convertedNodes],
  );

  return (
    <div className="sweater-3d-container" style={{ height: `${height}px` }}>
      <Canvas
        camera={{ position: [0, 0, cameraDistance], fov: 25 }}
        style={{ background: "#fafafa" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[20, 30, 20]} intensity={1.5} />
        <directionalLight position={[-20, 15, -20]} intensity={0.5} />

        <FlatSweater
          color={yarnColor}
          nodes={nodes}
          folded={folded}
          foldAmount={foldAmount}
        />

        <ContactShadows
          position={[0, -30, 0]}
          opacity={0.25}
          scale={80}
          blur={2}
          far={40}
        />
        <Environment preset="studio" />

        <OrbitControls
          enablePan={true}
          minDistance={30}
          maxDistance={150}
          autoRotate={autoRotate}
          enableZoom={true}
          enableDamping={true}
        />
      </Canvas>
    </div>
  );
}

export default Sweater3DPreview;
