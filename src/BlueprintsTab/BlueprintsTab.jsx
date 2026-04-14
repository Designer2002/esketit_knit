import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import useToast from "../Toast/useToast";
import "./BlueprintsTab.css";

// ===== DEFAULT SIZE M MEASUREMENTS — только 9 необходимых + плотность =====
const DEFAULT_MEASUREMENTS = {
  og: 94,       // обхват груди
  dr: 60,       // длина рукава
  oz: 16,       // обхват запястья
  or: 32,       // обхват руки
  di: 62,       // длина изделия
  glg: 8,       // глубина горловины
  oh: 58,       // обхват головы (= шея в формулах)
  ease: 6,      // прибавка на свободу
  gauge_stitches_per_cm: 2.5,
  gauge_rows_per_cm: 3.5,
};

const MEASUREMENT_LABELS = {
  og: {
    label: "Обхват груди (ОГ)",
    unit: "см",
    hint: "По самым выступающим точкам",
  },
  or: {
    label: "Обхват руки (ОР)",
    unit: "см",
    hint: "Самая широкая часть плеча",
  },
  oz: { label: "Обхват запястья", unit: "см", hint: "Самое узкое место" },
  dr: { label: "Длина рукава", unit: "см", hint: "От плеча до запястья" },
  di: { label: "Длина изделия", unit: "см", hint: "От высшей точки плеча" },
  glg: {
    label: "Глубина горловины",
    unit: "см",
    hint: "Желаемая глубина выреза",
  },
  oh: {
    label: "Обхват головы",
    unit: "см",
    hint: "Чтобы голова пролезла в горловину!",
  },
  ease: {
    label: "Прибавка на свободу",
    unit: "см",
    hint: "Свобода облегания (обычно 4-8 см)",
  },
  gauge_stitches_per_cm: {
    label: "Плотность: петель/см",
    unit: "",
    hint: "Горизонтальная плотность",
  },
  gauge_rows_per_cm: {
    label: "Плотность: рядов/см",
    unit: "",
    hint: "Вертикальная плотность",
  },
};

// ===== MEASUREMENT MODAL =====
function MeasurementModal({ isOpen, onClose, onSave, initialMeasurements }) {
  const [measurements, setMeasurements] = useState({ ...DEFAULT_MEASUREMENTS });
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    if (isOpen && initialMeasurements) {
      setMeasurements({ ...DEFAULT_MEASUREMENTS, ...initialMeasurements });
    } else if (isOpen) {
      setMeasurements({ ...DEFAULT_MEASUREMENTS });
    }
  }, [isOpen, initialMeasurements]);

  const handleChange = (key, value) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setMeasurements((prev) => ({ ...prev, [key]: num }));
    }
  };

  const handleSave = async () => {
    try {
      if (
        measurements.og <= 0 ||
        measurements.di <= 0 ||
        measurements.dr <= 0
      ) {
        addToast(
          "Заполните основные мерки (ОГ, длина изделия, длина рукава)",
          "error",
        );
        return;
      }
      await onSave(measurements);
      addToast("Мерки сохранены!", "success");
      onClose();
    } catch (e) {
      addToast("Ошибка сохранения: " + e, "error");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="blueprint-modal-backdrop" onClick={onClose}>
      <div
        className="blueprint-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="blueprint-modal-header">
          <h2>📏 Мерки для выкройки</h2>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="blueprint-modal-body">
          <p className="modal-hint">
            Введите ваши мерки. Значения по умолчанию — размер M международной
            таблицы.
          </p>

          {/* Basic measurements - always shown */}
          <div className="measurements-grid">
            {["og", "or", "oz", "dr", "di", "glg", "oh", "ease", "gauge_stitches_per_cm", "gauge_rows_per_cm"].map(
              (key) => {
                const { label, unit, hint } = MEASUREMENT_LABELS[key];
                return (
                  <div key={key} className="measurement-field" title={hint}>
                    <label>
                      {label}
                      {unit && ` (${unit})`}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={measurements[key] ?? ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  </div>
                );
              }
            )}
          </div>

          {/* Set-in sleeve additional measurements */}
          <div className="measurement-section-divider">
            <h4>🪡 Дополнительные мерки (для втачного рукава)</h4>
          </div>
          <div className="measurements-grid">
            {["shoulder_height", "shoulder_length"].map(
              (key) => {
                const labels = {
                  shoulder_height: { label: "Высота плеча", unit: "см", hint: "Обычно 5-6 см" },
                  shoulder_length: { label: "Длина плеча", unit: "см", hint: "От шеи до конца плеча" },
                };
                const { label, unit, hint } = labels[key] || { label: key, unit: "см", hint: "" };
                return (
                  <div key={key} className="measurement-field" title={hint}>
                    <label>
                      {label}
                      {unit && ` (${unit})`}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={measurements[key] ?? ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  </div>
                );
              }
            )}
          </div>

          {/* Талия/Бёдра */}
          <div className="measurement-section-divider">
            <h4>👗 Талия и бёдра (приталенный силуэт)</h4>
          </div>
          <div className="measurements-grid">
            {["waist_circumference", "hip_circumference", "back_len", "hip_len"].map(
              (key) => {
                const labels = {
                  waist_circumference: { label: "Обхват талии", unit: "см", hint: "По самому узкому месту" },
                  hip_circumference: { label: "Обхват бёдер", unit: "см", hint: "По самым выступающим точкам" },
                  back_len: { label: "Длина до талии по спинке", unit: "см", hint: "От 7-го шейного позвонка до талии" },
                  hip_len: { label: "Длина до линии бёдер", unit: "см", hint: "От талии до линии бёдер (обычно 18-22 см)" },
                };
                const { label, unit, hint } = labels[key] || { label: key, unit: "см", hint: "" };
                return (
                  <div key={key} className="measurement-field" title={hint}>
                    <label>
                      {label}
                      {unit && ` (${unit})`}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={measurements[key] ?? ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  </div>
                );
              }
            )}
          </div>

          {/* Yarn color picker */}
          <div className="measurements-grid">
            <div
              className="measurement-field"
              title="Цвет пряжи для фона выкройки"
            >
              <label>🧶 Цвет пряжи</label>
              <div
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <input
                  type="color"
                  value={measurements.yarn_color || "#F5DEB3"}
                  onChange={(e) =>
                    setMeasurements((prev) => ({
                      ...prev,
                      yarn_color: e.target.value,
                    }))
                  }
                  style={{
                    width: "50px",
                    height: "36px",
                    border: "none",
                    cursor: "pointer",
                  }}
                />
                <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                  {measurements.yarn_color || "#F5DEB3"}
                </span>
              </div>
            </div>
          </div>

          <div className="measurements-actions">
            <button
              className="btn-secondary"
              onClick={() => setMeasurements({ ...DEFAULT_MEASUREMENTS })}
            >
              Сбросить (размер M)
            </button>
            <div className="actions-right">
              <button className="btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button className="btn-primary" onClick={handleSave}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

// ===== NODE CONSTRAINT HINTS (для UI-подсказок) =====
// Сопоставление с NodeConstraint из Rust
const NODE_CONSTRAINT_HINTS = {
  "back::back_right_hem": "Ширина спинки (петли)",
  "front::front_right_hem": "Ширина переда (петли)",
  "sleeve::sleeve_underarm_left": "Ширина рукава вверху (петли)",
  "sleeve::sleeve_underarm_right": "Ширина рукава вверху (петли)",
  "sleeve::sleeve_cuff_left": "Ширина манжеты (петли)",
  "sleeve::sleeve_cuff_right": "Ширина манжеты (петли)",
  "back::back_left_hem": "Высота спинки (ряды)",
  "front::front_left_hem": "Высота переда (ряды)",
  "back::back_left_raglan": "Длина реглана спинки",
  "front::front_left_raglan": "Длина реглана переда",
  "back::back_neck_center": "Глубина горловины спинки",
  "front::front_neck_center": "Глубина горловины переда",
  "back::back_neck_left": "Ширина горловины",
};

// ===== SVG BLUEPRINT RENDERER =====
function BlueprintSVG({
  calculation,
  partCode,
  nodes,
  onNodeMove,
  selectedNode,
  onSelectNode,
  yarnColor,
  necklineType,
  stamps,
  patterns,
  selectedStamp,
  onSelectStamp,
  onDeleteStamp,
  onCloneStamp,
  onMoveStamp,
  gaugeStitchesPerCm,
  gaugeRowsPerCm,
  activePart,
  stampColorPicker,
  setStampColorPicker,
  onStampColorChange,
}) {
  const svgRef = useRef(null);
  const [draggingStamp, setDraggingStamp] = useState(null);
  const [stampDragOffset, setStampDragOffset] = useState({ x: 0, y: 0 });

  const vbW = calculation?.viewbox_width || 100;
  const vbH = calculation?.viewbox_height || 100;

  // SVG-based stamp dragging
  const handleStampMouseDown = (e, stampId) => {
    e.preventDefault();
    e.stopPropagation();
    // Only select, don't toggle - toggle happens on second click on the stamp body
    onSelectStamp(stampId);
    const svg = svgRef.current;
    if (!svg) return;
    const stamp = stamps.find(s => s.id === stampId);
    if (!stamp) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());
    setDraggingStamp(stampId);
    setStampDragOffset({ x: svgP.x - stamp.position_x, y: svgP.y - stamp.position_y });
  };

  useEffect(() => {
    if (!draggingStamp) return;

    const handleMove = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgP = pt.matrixTransform(ctm.inverse());
      onMoveStamp(draggingStamp, svgP.x - stampDragOffset.x, svgP.y - stampDragOffset.y);
    };

    const handleUp = () => {
      setDraggingStamp(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingStamp, stampDragOffset, onMoveStamp]);

  // handleMouseMove — disabled while dragging is off
  const handleMouseMove = useCallback(
    (e) => {
      // node dragging disabled
    },
    [],
  );

  const handleMouseUp = useCallback(() => {
    // node dragging disabled
  }, []);

  useEffect(() => {
    // node dragging disabled
  }, []);

  useEffect(() => {
    // arrow key movement disabled
  }, []);

  if (!calculation)
    return <div className="no-calculation">Введите мерки для расчёта</div>;

  const padding = 10;
  const partNodes = nodes.filter((n) => n.part_code === partCode);
  
  // Фильтруем только КЛЮЧЕВЫЕ узлы (не промежуточные pts)
  // Промежуточные узлы имеют числовой суффикс: armhole_0, shoulder_1, neck_2 и т.д.
  const isKeyNode = (nodeName) => {
    // Если есть числовой суффикс - это промежуточный узел
    if (/_\d+$/.test(nodeName)) {
      return false;
    }
    
    // Ключевые узлы
    const keyPatterns = [
      "_hem", "_underarm", "_raglan", "_neck_center",
      "_cuff_", "_top_", "neck_left", "neck_right",
      "neck_left_", "neck_right_"
    ];
    
    return keyPatterns.some(p => nodeName.includes(p));
  };
  
  const keyNodes = partNodes.filter(n => isKeyNode(n.node_name));

  const getNodePos = (nodeName) => {
    const n = partNodes.find((nd) => nd.node_name === nodeName);
    return n ? { x: n.x, y: n.y } : null;
  };

  const getPath = () => {
    // === Helper: get field with fallback for both raglan and set_in ===
    const getField = (raglanField, setInField, defaultVal) => {
      if (calculation.type === "set_in") {
        return calculation[setInField] ?? defaultVal;
      }
      return calculation[raglanField] ?? defaultVal;
    };

    // === Helper: collect all points for a section ===
    const getSectionPoints = (prefix, section) => {
      // section: 'armhole', 'shoulder', 'neck'
      return partNodes
        .filter(n => n.node_name.includes(`${prefix}_${section}_`))
        .sort((a, b) => a.y - b.y); // sort top to bottom
    };

    if (partCode === "back") {
      console.log(calculation.type)
      // For set_in, collect ALL detailed points
      if (calculation.type === "set_in") {
        const hemL = getNodePos("back_left_hem");
        const hemR = getNodePos("back_right_hem");
        if (!hemL || !hemR) return null;

        const armholeL = getSectionPoints("back_left", "armhole");
        const armholeR = getSectionPoints("back_right", "armhole");
        const shoulderL = getSectionPoints("back_left", "shoulder");
        const shoulderR = getSectionPoints("back_right", "shoulder");
        const neckL = getSectionPoints("back_left", "neck");
        const neckR = getSectionPoints("back_right", "neck");
        const neckC = getNodePos("back_neck_center");

        let path = `M ${hemL.x} ${hemL.y}`;
        
        // Left side up: armhole → shoulder → neck
        armholeL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
        shoulderL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
        neckL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
        
        // Neck center
        if (neckC) path += ` L ${neckC.x} ${neckC.y}`;
        
        // Right side down: neck → shoulder → armhole → hem
        neckR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        shoulderR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        armholeR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        
        path += ` L ${hemR.x} ${hemR.y} L ${hemL.x} ${hemL.y} Z`;
        return path;
      }

      // Raglan back: NO neckline - straight line shoulder to shoulder
      const hemL = getNodePos("back_left_hem");
      const hemR = getNodePos("back_right_hem");
       const cutL = getNodePos("back_left_cut") || { x: 0, y: getField("armhole_height_rows") };
      const cutR = getNodePos("back_right_cut") || { x: getField("back_width_stitches", "hem_width_stitches", 100), y: getField("armhole_height_rows") };

      const underarmY = getField("raglan_start_row_back", "armhole_height_rows", 50);
      const underarmL = getNodePos("back_left_underarm") || { x: (hemW - (hemW - uaW)) / 2, y: underarmY };
      const underarmR = getNodePos("back_right_underarm") || { x: (hemW + (hemW - uaW)) / 2, y: underarmY };
      
      const shoulderL = getNodePos("back_left_shoulder") || underarmL;
      const shoulderR = getNodePos("back_right_shoulder") || underarmR;

      const neckL = getNodePos("back_neck_left");
      const neckR = getNodePos("back_neck_right");

      return `M ${hemL.x} ${hemL.y}
            L ${cutL.x} ${cutL.y}
            L ${underarmL.x} ${underarmL.y}
            L ${shoulderL.x} ${shoulderL.y}
            L ${neckL.x} ${neckL.y}
            L ${neckR.x} ${neckR.y}
            L ${shoulderR.x} ${shoulderR.y}
            L ${underarmR.x} ${underarmR.y}
            L ${cutR.x} ${cutR.y}
            L ${hemR.x} ${hemR.y} Z`;
    }

    if (partCode === "front") {
      // For set_in, collect ALL detailed points
      if (calculation.type === "set_in") {
        const hemL = getNodePos("front_left_hem");
        const hemR = getNodePos("front_right_hem");
        if (!hemL || !hemR) return null;

        const armholeL = getSectionPoints("front_left", "armhole");
        const armholeR = getSectionPoints("front_right", "armhole");
        const shoulderL = getSectionPoints("front_left", "shoulder");
        const shoulderR = getSectionPoints("front_right", "shoulder");
        const neckL = getSectionPoints("front_left", "neck");
        const neckR = getSectionPoints("front_right", "neck");
        const neckC = getNodePos("front_neck_center");

        let path = `M ${hemL.x} ${hemL.y}`;

        // Left side up: armhole → shoulder → neck
        armholeL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
        shoulderL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
        
        // Neckline - V vs U
        if (necklineType === "V" && neckC) {
          // V-neck: straight diagonal to bottom point
          path += ` L ${neckC.x} ${neckC.y}`;
        } else {
          // U-neck: rounded through all points
          neckL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
          if (neckC) path += ` L ${neckC.x} ${neckC.y}`;
        }
        // Right side down: neck → shoulder → armhole → hem
        neckR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        shoulderR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        armholeR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        
        path += ` L ${hemR.x} ${hemR.y} L ${hemL.x} ${hemL.y} Z`;
        return path;
      }

      // Raglan front: use detailed neck points if available
      const hemL = getNodePos("front_left_hem") || { x: 0, y: getField("total_rows", "total_garment_rows", 100) };
      const hemR = getNodePos("front_right_hem") || { x: getField("front_width_stitches", "hem_width_stitches", 100), y: getField("total_rows", "total_garment_rows", 100) };
       const cutL = getNodePos("front_left_cut") || { x: 0, y: getField("armhole_height_rows") };
      const cutR = getNodePos("front_right_cut") || { x: getField("front_width_stitches", "hem_width_stitches", 100), y: getField("armhole_height_rows") };

      const underarmY = getField("raglan_start_row_front", "armhole_height_rows", 50);
      const hemW = getField("front_width_stitches", "hem_width_stitches", 100);
      const uaW = getField("underarm_width_stitches", "underarm_width_stitches", hemW - 20);
      const underarmL = getNodePos("front_left_underarm") || { x: (hemW - (hemW - uaW)) / 2, y: underarmY };
      const underarmR = getNodePos("front_right_underarm") || { x: (hemW + (hemW - uaW)) / 2, y: underarmY };
      
      // Shoulder and neck - try detailed points first
      const shoulderL = getSectionPoints("front_left", "shoulder");
      const shoulderR = getSectionPoints("front_right", "shoulder");
      const neckL = getSectionPoints("front_left", "neck");
      const neckR = getSectionPoints("front_right", "neck");
      const neckC = getNodePos("front_neck_center");
      const neckY = shoulderR[0];
      
      const hasDetailedNeck = neckL.length > 0 && neckR.length > 0;

      if (hasDetailedNeck) {
        const shoulderLDefault = shoulderL.length > 0 ? shoulderL : [getNodePos("front_left_shoulder") || underarmL];
        const shoulderRDefault = shoulderR.length > 0 ? shoulderR : [getNodePos("front_right_shoulder") || underarmR];

        let path = `M ${hemL.x} ${hemL.y}`;
        path += ` L ${cutL.x} ${cutL.y}`;
        path += ` L ${underarmL.x} ${underarmL.y}`;
        shoulderLDefault.forEach(p => { path += ` L ${p.x} ${p.y}`; });
        
        // Neckline - different for V vs U
        if (necklineType === "V" && neckC) {
          // V-neck: straight diagonal lines, skip intermediate decrease points
          // Go from shoulder start straight to bottom of V, then back up
       
          path += ` L ${neckL[0].x} ${neckL[0].y}`;
          path += ` L ${neckC.x} ${neckC.y}`;
          path += ` L ${neckR[0].x} ${neckR[0].y}`;
          
        } else {
          // U-neck: use all neck decrease points for rounded shape
          path += ` L ${neckL[0].x} ${neckY.y}`;
          neckL.forEach(p => { path += ` L ${p.x} ${p.y}`; });
         neckR.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
   
        }
        path += ` L ${neckR[0].x} ${neckY.y}`;
        shoulderRDefault.slice().reverse().forEach(p => { path += ` L ${p.x} ${p.y}`; });
        
        path += ` L ${underarmR.x} ${underarmR.y}`;
        path += ` L ${cutR.x} ${cutR.y}`;
        path += ` L ${hemR.x} ${hemR.y} L ${hemL.x} ${hemL.y} Z`;
        return path;
      }

      // Fallback: simple corner points with V/U neck
      const neckW = getField("neck_width_stitches", "neck_width_stitches", 20);
      const neckLSimple = getNodePos("front_neck_left") || { x: (hemW - neckW) / 2, y: 0 };
      const neckRSimple = getNodePos("front_neck_right") || { x: (hemW + neckW) / 2, y: 0 };
      const neckDepth = getField("neck_depth_rows", "neck_depth_rows", 10);
      const neckCSimple = getNodePos("front_neck_center") || { x: hemW / 2, y: neckDepth };
      const shoulderLSimple = getNodePos("front_left_shoulder") || underarmL;
      const shoulderRSimple = getNodePos("front_right_shoulder") || underarmR;

      let neckPath;
      if (necklineType === "V") {
        neckPath = `L ${neckCSimple.x} ${neckCSimple.y} L ${neckRSimple.x} ${neckRSimple.y}`;
      } else {
        neckPath = `Q ${neckCSimple.x} ${neckCSimple.y} ${neckRSimple.x} ${neckRSimple.y}`;
      }

      return `M ${hemL.x} ${hemL.y}
            L ${cutL.x} ${cutL.y}
            L ${shoulderLSimple.x} ${shoulderLSimple.y}
            L ${neckLSimple.x} ${neckLSimple.y}
            ${neckPath}
            L ${shoulderRSimple.x} ${shoulderRSimple.y}
            L ${cutR.x} ${cutR.y}
            L ${hemR.x} ${hemR.y} Z`;
    }

    // ===== РУКАВА =====
    if (partCode === "sleeve_left" || partCode === "sleeve_right") {
      const isLeft = partCode === "sleeve_left";
console.log(nodes);
      const cuffL = getNodePos("sleeve_cuff_left") || { x: 0, y: 0 };
      const cuffR = getNodePos("sleeve_cuff_right") || { x: 0, y: 0 };
      const cutL = getNodePos("sleeve_cut_left") || { x: 0, y: 0 };
      const cutR = getNodePos("sleeve_cut_right") || { x: 0, y: 0 };
      const underarmL = getNodePos("sleeve_underarm_left") || { x: 0, y: 0 };
      const underarmR = getNodePos("sleeve_underarm_right") || { x: 0, y: 0 };
      const topL = getNodePos("sleeve_top_left") || { x: 0, y: 0 };
      const topR = getNodePos("sleeve_top_right") || { x: 0, y: 0 };

      // Подрез — для raglan, для set_in = 0
      const dx = getField("decrease_shoulder_cuts", null, 0) || 0;

      console.log(cutL, cutR)

      if (isLeft) {
        return `
          M ${cuffL.x} ${cuffL.y}
          L ${cutL.x} ${cutL.y}
          L ${underarmL.x} ${underarmL.y}
          L ${underarmL.x + dx} ${underarmL.y}
          L ${topL.x} ${topL.y}
          L ${topR.x} ${topR.y}
          L ${underarmR.x - dx} ${underarmR.y}
          L ${underarmR.x} ${underarmR.y}
          L ${cutR.x} ${cutR.y}
          L ${cuffR.x} ${cuffR.y}
          Z`;
      } else {
        const cx = (cuffL.x + cuffR.x) / 2;
        const mirrorX = (x) => cx - (x - cx);

        return `
          M ${mirrorX(cuffL.x)} ${cuffL.y}
          L ${mirrorX(cutL.x)} ${cutL.y}
          L ${mirrorX(underarmL.x)} ${underarmL.y}
          L ${mirrorX(underarmL.x + dx)} ${underarmL.y}
          L ${mirrorX(topL.x)} ${topL.y}
          L ${mirrorX(topR.x)} ${topR.y}
          L ${mirrorX(underarmR.x - dx)} ${underarmR.y}
          L ${mirrorX(underarmR.x)} ${underarmR.y}
          L ${mirrorX(cutR.x)} ${cutR.y}
          L ${mirrorX(cuffR.x)} ${cuffR.y}
          Z`;
      }
    }
  }

  // Node dragging temporarily disabled (buggy)
  const handleMouseDown = (e, nodeName) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectNode(nodeName);
    // dragging disabled: setDragging and dragOffset removed
  };

  const extraLeft = Math.floor(vbW * 0.3);
  const constraintHint = NODE_CONSTRAINT_HINTS[`${partCode}::${selectedNode}`];
  
  // Центрируем viewport на активную деталь (масштаб 1.3)
  const scale = 1.5;
  const vw = vbW / scale;
  const vh = vbH / scale + 100;
    let cx = vbW / 2;
  if (partCode === "back") cx = vbW * 0.75;
  else if (partCode === "front") cx = vbW * 0.25;
  // РУКАВА в Rust считаются по центру (vbW / 2), поэтому и камеру ставим в центр
  else if (partCode === "sleeve_left" || partCode === "sleeve_right") cx = vbW / 2; 
  const viewBoxStr = `${cx - vw / 2} ${-vh * 0.15} ${vw} ${vh * 1.2}`;

  // Маркеры подрезов (красные точки на подмышках)
  const underarmNodes = partNodes.filter(n => n.node_name.includes("underarm"));

  return (
    <div className="blueprint-svg-container">
      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        preserveAspectRatio="xMidYMid meet"
        className="blueprint-svg"
        style={{ cursor: draggingStamp ? "grabbing" : "default" }}
      >
        {/* Grid + Knit texture (clipped to path) */}
        <defs>
          <pattern
            id={`grid-${partCode}`}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.5"
            />
          </pattern>
          <pattern
            id={`knit-${partCode}`}
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <image
              href="/textures/knit_specular.png"
              width="250"
              height="250"
              preserveAspectRatio="xMidYMid slice"
            />
          </pattern>
          {/* Clip path: texture only inside blueprint shape */}
          <clipPath id={`clip-${partCode}`}>
            <path d={getPath()} />
          </clipPath>
        </defs>
        <rect
          x={-extraLeft - padding}
          y={-padding}
          width={vbW + extraLeft + padding * 2}
          height={vbH + padding * 2}
          fill={`url(#grid-${partCode})`}
        />

        {/* Origin line */}
        <line
          x1="0"
          y1={-padding}
          x2="0"
          y2={vbH + padding}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />

        {/* Knit texture INSIDE blueprint shape only */}
        <rect
          x={-extraLeft - padding}
          y={-padding}
          width={vbW + extraLeft + padding * 2}
          height={vbH + padding * 2}
          fill={`url(#knit-${partCode})`}
          clipPath={`url(#clip-${partCode})`}
          opacity="0.4"
          style={{ mixBlendMode: "multiply" }}
        />

        {/* Blueprint shape */}
        <path
          d={getPath()}
          fill={yarnColor ? yarnColor + "63" : "rgba(33,150,243,0.2)"}
          stroke="#2196F3"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Center line of the pattern shape (not canvas center!) */}
        {(() => {
          const shapeNodes = partNodes.filter(n => !n.node_name.includes("_raglan_slope_"));
          if (shapeNodes.length === 0) return null;
          const minX = Math.min(...shapeNodes.map(n => n.x));
          const maxX = Math.max(...shapeNodes.map(n => n.x));
          const minY = Math.min(...shapeNodes.map(n => n.y));
          const maxY = Math.max(...shapeNodes.map(n => n.y));
          const centerX = (minX + maxX) / 2;
          return (
            <line
              x1={centerX}
              y1={minY - 5}
              x2={centerX}
              y2={maxY + 5}
              stroke="rgba(255,213,79,0.3)"
              strokeWidth="0.3"
              strokeDasharray="4 3"
            />
          );
        })()}

        {/* Clip path: pattern stamps INSIDE blueprint shape only */}
        <g clipPath={`url(#clip-${partCode})`}>
          {/* Pattern stamps INSIDE SVG */}
          {stamps.map((stamp) => {
            const patData = stamp.pattern_data || "";
            if (!patData) {
              return null;
            }
            const rows = patData.split("\n").filter(r => r.trim());
            const pw = stamp.width || rows[0]?.length || 10;
            const ph = stamp.height || rows.length;
            const allPartNodes = nodes.filter(n => n.part_code === partCode);
            if (allPartNodes.length === 0) return null;

            const posX = stamp.position_x;
            const posY = stamp.position_y;
            // 1 SVG unit = 1 stitch/row (exact pixel match)
            const cellW = 1;
            const cellH = 1;
            // Use yarn color or stamp custom color
            const fillColor = stamp.custom_color || (yarnColor ? yarnColor : "#2196F3");
            const isColorPickerOpen = stampColorPicker === stamp.id;
            const isSelected = selectedStamp === stamp.id;

            // Check if stamp goes outside pattern bounds
            const minX = Math.min(...allPartNodes.map(n => n.x));
            const maxX = Math.max(...allPartNodes.map(n => n.x));
            const minY = Math.min(...allPartNodes.map(n => n.y));
            const maxY = Math.max(...allPartNodes.map(n => n.y));

            const outOfBounds = (
              posX < minX ||
              posX + pw > maxX ||
              posY < minY ||
              posY + ph > maxY
            );

            console.log("[Blueprints] Stamp:", {
              id: stamp.id,
              patData: patData.substring(0, 30) + "...",
              rows: rows.length,
              width: pw,
              posX,
              posY,
              fillColor,
            });

            return (
              <g
                key={`stamp-${stamp.id}`}
                transform={`translate(${posX}, ${posY})`}
                style={{ cursor: draggingStamp === stamp.id ? "grabbing" : "grab" }}
                onMouseDown={(e) => handleStampMouseDown(e, stamp.id)}
                onKeyDown={(e) => {
                  if (e.shiftKey && e.key === "C") {
                    e.preventDefault();
                    setStampColorPicker(isColorPickerOpen ? null : stamp.id);
                  }
                }}
                tabIndex={0}
              >
                {/* Pattern overlay - NO border when unselected, blends into knitting */}
                <rect
                  x="0"
                  y="0"
                  width={pw * cellW}
                  height={rows.length * cellH}
                  fill={isSelected ? "rgba(255,152,0,0.25)" : "transparent"}
                  stroke={isSelected ? "#FF9800" : "none"}
                  strokeWidth={isSelected ? 1 : 0}
                  strokeDasharray={isSelected ? "2 1" : "none"}
                />
                {/* Pattern cells */}
                {rows.map((row, ri) =>
                  row.split("").map((cell, ci) =>
                    cell === "1" ? (
                      <rect
                        key={`cell-${ri}-${ci}`}
                        x={ci * cellW}
                        y={ri * cellH}
                        width={cellW}
                        height={cellH}
                        fill={fillColor}
                        opacity={isSelected ? 0.9 : 0.6}
                      />
                    ) : null
                  )
                )}
                {/* Horizontal row marker lines at top and bottom of stamp */}
                <line
                  x1={-2}
                  y1={0}
                  x2={pw + 2}
                  y2={0}
                  stroke="rgba(255,213,79,0.5)"
                  strokeWidth="0.3"
                  strokeDasharray="1 0.5"
                />
                <line
                  x1={-2}
                  y1={rows.length}
                  x2={pw + 2}
                  y2={rows.length}
                  stroke="rgba(255,213,79,0.5)"
                  strokeWidth="0.3"
                  strokeDasharray="1 0.5"
                />
                <line
                  x1={-2}
                  y1={rows.length}
                  x2={pw + 2}
                  y2={rows.length}
                  stroke="rgba(255,213,79,0.5)"
                  strokeWidth="0.3"
                  strokeDasharray="1 0.5"
                />
                {/* Out of bounds warning */}
                {outOfBounds && (
                  <text
                    x={pw / 2}
                    y={rows.length / 2 + 2}
                    fill="#ff4444"
                    fontSize="8"
                    fontWeight="bold"
                    textAnchor="middle"
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.8)"
                    strokeWidth="0.8"
                  >
                    ⚠ За пределами
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Row labels OUTSIDE clipPath so they're always visible */}
        {stamps.map((stamp) => {
          const patData = stamp.pattern_data || "";
          if (!patData) return null;
          const rows = patData.split("\n").filter(r => r.trim());
          const pw = stamp.width || rows[0]?.length || 10;
          const ph = rows.length;
          const allPartNodes = nodes.filter(n => n.part_code === partCode);
          if (allPartNodes.length === 0) return null;

          const posX = stamp.position_x;
          const posY = stamp.position_y;
          const minY = Math.min(...allPartNodes.map(n => n.y));
          const maxY = Math.max(...allPartNodes.map(n => n.y));
          const topRowNum = Math.round(maxY - Math.min(posY, maxY));
          const bottomRowNum = Math.max(0, Math.round(maxY - Math.min(posY + ph, maxY)));

          return (
            <g key={`rowlabel-${stamp.id}`}>
              {/* Top row label - visible even outside clip */}
              <text
                x={posX + pw + 3}
                y={posY + 4}
                fill="#FFD54F"
                fontSize="7"
                fontWeight="bold"
                textAnchor="start"
                paintOrder="stroke"
                stroke="rgba(0,0,0,0.9)"
                strokeWidth="1.2"
              >
                р.{topRowNum}
              </text>
              {/* Bottom row label */}
              <text
                x={posX + pw + 3}
                y={posY + ph + 4}
                fill="#FFD54F"
                fontSize="7"
                fontWeight="bold"
                textAnchor="start"
                paintOrder="stroke"
                stroke="rgba(0,0,0,0.9)"
                strokeWidth="1.2"
              >
                р.{bottomRowNum}
              </text>
            </g>
          );
        })}

        {/* Action buttons OUTSIDE clipPath so they're not clipped */}
        {stamps.map((stamp) => {
          if (selectedStamp !== stamp.id) return null;
          const patData = stamp.pattern_data || "";
          if (!patData) return null;
          const rows = patData.split("\n").filter(r => r.trim());
          const pw = stamp.width || rows[0]?.length || 10;
          const posX = stamp.position_x;
          const posY = stamp.position_y;
          const isColorPickerOpen = stampColorPicker === stamp.id;
          const fillColor = stamp.custom_color || (yarnColor ? yarnColor : "#2196F3");

          return (
            <g key={`actions-${stamp.id}`}>
              {/* Delete */}
              <g
                transform={`translate(${posX + pw + 3}, ${posY - 8})`}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); onDeleteStamp(stamp.id); }}
              >
                <circle cx="0" cy="0" r="4" fill="#ff4444" stroke="#fff" strokeWidth="0.8"/>
                <text x="0" y="1.5" textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">✕</text>
              </g>
              {/* Clone */}
              <g
                transform={`translate(${posX + pw + 13}, ${posY - 8})`}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); onCloneStamp(stamp.id); }}
              >
                <circle cx="0" cy="0" r="4" fill="#4CAF50" stroke="#fff" strokeWidth="0.8"/>
                <text x="0" y="1.5" textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">+</text>
              </g>
              {/* Color picker toggle */}
              <g
                transform={`translate(${posX + pw + 23}, ${posY - 8})`}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); setStampColorPicker(isColorPickerOpen ? null : stamp.id); }}
              >
                <circle cx="0" cy="0" r="4" fill="#9C27B0" stroke="#fff" strokeWidth="0.8"/>
                <text x="0" y="1.5" textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">🎨</text>
              </g>
              {/* Color picker */}
              {isColorPickerOpen && (
                <g transform={`translate(${posX + pw / 2}, ${posY + rows.length + 12})`}>
                  <rect x="-30" y="-8" width="60" height="28" rx="3" fill="rgba(0,0,0,0.85)" stroke="#fff" strokeWidth="0.5"/>
                  <text x="0" y="2" textAnchor="middle" fill="#aaa" fontSize="4">Shift+C закрыть</text>
                  <foreignObject x="-20" y="6" width="40" height="18">
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{ margin: 0, padding: 0 }}>
                      <input
                        type="color"
                        defaultValue={fillColor}
                        onChange={(e) => onStampColorChange(stamp.id, e.target.value)}
                        style={{ width: "100%", height: "16px", border: "none", cursor: "pointer" }}
                      />
                    </div>
                  </foreignObject>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodes - only KEY nodes, not intermediate pts */}
        {keyNodes
          .filter((node) => !node.node_name.includes("_raglan_slope_"))
          .map((node) => {
            // Для правого рукава зеркалим X координаты нод
            const isRightSleeve = partCode === "sleeve_right";
            const allCuffs = partNodes.filter(n => n.node_name.includes("cuff"));
            const sleeveCx = allCuffs.length >= 2
              ? (allCuffs[0].x + allCuffs[1].x) / 2
              : vbW / 2;
            const mirrorX = (x) => sleeveCx - (x - sleeveCx);

            const displayX = isRightSleeve ? mirrorX(node.x) : node.x;
            const displayY = node.y;

            const isSelected = selectedNode === node.node_name;
            const label = getNodeLabelRu(node.node_name);
            
            return (
              <g key={`${node.part_code}::${node.node_name}`}>
                <circle
                  cx={displayX}
                  cy={displayY}
                  r={isSelected ? 4 : 2.5}
                  fill={isSelected ? "#FF9800" : "#2196F3"}
                  stroke="#fff"
                  strokeWidth="1.5"
                  className={`blueprint-node ${isSelected ? "selected" : ""}`}
                  onMouseDown={(e) => handleMouseDown(e, node.node_name)}
                  style={{ cursor: "pointer" }}
                />
                {/* Label: показываем при клике */}
                {isSelected && (
                  <text
                    x={displayX + 6}
                    y={displayY + 3}
                    fill="#FFD54F"
                    fontSize="9"
                    fontFamily="Arial"
                    fontWeight="bold"
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.9)"
                    strokeWidth="2.5"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}

        {/* Подрезы — точки на подмышках (ступеньки) */}
        {underarmNodes.map((node, i) => {
          const isRightSleeve = partCode === "sleeve_right";
          const allCuffs = partNodes.filter(n => n.node_name.includes("cuff"));
          const sleeveCx = allCuffs.length >= 2
            ? (allCuffs[0].x + allCuffs[1].x) / 2
            : vbW / 2;
          const mirrorX = (x) => sleeveCx - (x - sleeveCx);
          const dx = isRightSleeve ? mirrorX(node.x) : node.x;
          return (
            <circle key={`podrez-${i}`} cx={dx} cy={node.y} r="1" fill="#ff4444" stroke="#fff" strokeWidth="1.5"/>
          );
        })}

        

        {/* Dimensions labels + Rulers */}
        {partCode === "back" && (
          <>
           {/* Left ruler - rows */}
            <text
              x={-10}
              y={320}
              textAnchor="middle"
              fill="rgba(255,255,255,0.6)"
              fontSize="12"
              transform={`rotate(-90, -12, ${calculation.total_rows / 2})`}
            >
              {calculation.total_rows} рядов 
            </text>
            {/* Right side - stitches label */}
             <text
              x={300}
              y={280}
              textAnchor="middle"
              fill="rgba(255,255,255,0.6)"
              fontSize="12"
              
            >
              {calculation.back_width_stitches} петель
            </text>
          
          </>
        )}
        {partCode === "front" && (
          <>
            
            {/* Left ruler - rows */}
            <text
              x={-120}
              y={(calculation.total_rows / 2) + 20}
              textAnchor="middle"
              fill="rgba(255,255,255,0.6)"
              fontSize="12"
              transform={`rotate(-90, -12, ${calculation.total_rows / 2})`}
            >
              {calculation.total_rows} рядов 
            </text>
            {/* Right side - stitches label */}
             <text
              y={280}
              x={(calculation.total_rows / 2) - 20}
              textAnchor="middle"
              fill="rgba(255,255,255,0.6)"
              fontSize="12"
              
            >
              {calculation.back_width_stitches} петель
            </text>
            {/* Control point labels on ruler */}
            
            <text x={-12} y={(calculation.neck_depth_rows / 2) + 35} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="12" transform={`rotate(-90, -12, ${calculation.neck_depth_rows})`}>
              {calculation.neck_depth_rows}рядов (горловина)
            </text>
          </>
        )}
        {(partCode === "sleeve_left" || partCode === "sleeve_right") && (() => {
          const cuffL = getNodePos("sleeve_cuff_left") || { x: 0, y: 0 };
          const cuffR = getNodePos("sleeve_cuff_right") || { x: 0, y: 0 };
          const topL = getNodePos("sleeve_top_left") || { x: 0, y: 0 };
          const topR = getNodePos("sleeve_top_right") || { x: 0, y: 0 };
          const cuffW = Math.abs(cuffR.x - cuffL.x);
          const topW = Math.abs(topR.x - topL.x);
          const widestW = Math.max(cuffW, topW);
          const widestLabel = widestW === cuffW ? "манжета" : "окат";

          return (
            <>
              {/* Widest point label - horizontal at top */}
              <text
                x={widestW + 50}
                y={calculation.sleeve_height_rows + 8}
                textAnchor="middle"
                fill="rgba(255,255,255,0.6)"
                fontSize="12"
              >
                {Math.round(widestW)} петель ({widestLabel})
              </text>
              {/* Cuff width label - horizontal at bottom */}
              <text
                x={widestW + 50}
                y={calculation.sleeve_height_rows / 2}
                textAnchor="middle"
                fill="rgba(255,255,255,0.6)"
                fontSize="12"
                
              >
                {calculation.sleeve_top_stitches} петель (окат)
              </text>
              {/* Left ruler - rows */}
              <text
                x={-12}
                y={calculation.sleeve_height_rows / 2 + 400}
                textAnchor="middle"
                fill="rgba(255,255,255,0.6)"
                fontSize="12"
                transform={`rotate(-90, -12, ${calculation.sleeve_height_rows / 2})`}
              >
                {calculation.sleeve_height_rows} рядов
              </text>
              {/* Right side - stitches label */}
              
            </>
          );
        })()}
      </svg>
    </div>
  );
}

// ===== РУССКИЕ НАЗВАНИЯ УЗЛОВ =====
const NODE_NAMES_RU = {
  back_left_hem: "Подол",
  back_right_hem: "Подол",
  back_left_underarm: "Подмышка",
  back_right_underarm: "Подмышка",
  back_left_shoulder: "Плечо",
  back_right_shoulder: "Плечо",
  back_left_raglan: "Горловина",
  back_right_raglan: "Горловина",
  back_neck_center: "Центр горловины",
  front_left_hem: "Подол",
  front_right_hem: "Подол",
  front_left_underarm: "Подмышка",
  front_right_underarm: "Подмышка",
  front_left_shoulder: "Плечо",
  front_right_shoulder: "Плечо",
  front_neck_left: "Горловина",
  front_neck_right: "Горловина",
  front_neck_center: "Центр горловины",
  sleeve_cuff_left: "Манжета",
  sleeve_cuff_right: "Манжета",
  sleeve_underarm_left: "Подрез",
  sleeve_underarm_right: "Подрез",
  sleeve_top_left: "Верх рукава",
  sleeve_top_right: "Верх рукава",
  // Set-in sleeve nodes
  "back_left_neck_": "Горловина",
  "back_right_neck_": "Горловина",
  "front_left_neck_": "Горловина",
  "front_right_neck_": "Горловина",
  "back_left_shoulder_": "Плечо",
  "back_right_shoulder_": "Плечо",
  "front_left_shoulder_": "Плечо",
  "front_right_shoulder_": "Плечо",
  "back_left_armhole_": "Пройма",
  "back_right_armhole_": "Пройма",
  "front_left_armhole_": "Пройма",
  "front_right_armhole_": "Пройма",
};

function getNodeLabelRu(nodeName) {
  // Exact match first
  if (NODE_NAMES_RU[nodeName]) return NODE_NAMES_RU[nodeName];
  
  // Prefix match for set-in nodes (back_left_neck_0, back_left_neck_1, etc.)
  for (const [prefix, label] of Object.entries(NODE_NAMES_RU)) {
    if (prefix.endsWith("_") && nodeName.includes(prefix)) {
      return label;
    }
  }
  
  return nodeName;
}

// ===== HELPER: format decrease rows with counts =====
function formatDecreaseRows(rows, counts) {
  if (!rows || rows.length === 0) return "—";
  // Sort ascending and pair with counts
  const paired = rows.map((r, i) => ({ row: r, count: counts?.[i] || 1 }));
  paired.sort((a, b) => a.row - b.row);
  return paired.map(p => `${p.row}(${p.count})`).join(", ");
}

// ===== PATTERN STAMP COMPONENT =====
function PatternStamp({
  stamp,
  patterns,
  onSelect,
  onDelete,
  onClone,
  onMove,
  isSelected,
  gaugeStitchesPerCm,
  gaugeRowsPerCm,
}) {
  // Try to find pattern from project patterns first, fall back to stamp data
  const pattern = patterns.find((p) => p.id === stamp.patternId);
  const patternData = pattern?.pattern_data || stamp.patternData || "";
  const patternName = pattern?.name || stamp.patternName || "Узор";
  const patternWidth = pattern?.width || stamp.width;
  const patternHeight = pattern?.height || stamp.height;
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  if (!patternData) return null;

  const handleMouseDown = (e) => {
    e.stopPropagation();
    onSelect(stamp.id);
    setDragging(true);
    setOffset({
      x: e.clientX - stamp.position_x,
      y: e.clientY - stamp.position_y,
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      onMove(stamp.id, e.clientX - offset.x, e.clientY - offset.y);
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, stamp.id, offset, onMove]);

  const rows = patternData.split("\n").filter((r) => r.trim());
  // Scale cell size according to gauge (1 cm = gauge_stitches_per_cm stitches)
  // Default cell = 1 stitch x 1 row, scaled to viewbox units
  const cellSize = 10 / gaugeStitchesPerCm; // SVG units per stitch

  return (
    <div
      className={`pattern-stamp ${isSelected ? "selected" : ""}`}
      style={{
        position: "absolute",
        left: stamp.position_x,
        top: stamp.position_y,
        border: isSelected
          ? "2px solid #FF9800"
          : "1px solid rgba(33,150,243,0.5)",
        cursor: dragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="pattern-stamp-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${patternWidth}, ${cellSize}px)`,
          gridTemplateRows: rows.map(() => `${cellSize * (gaugeStitchesPerCm / gaugeRowsPerCm)}px`).join(' '),
        }}
      >
        {rows.map((row, ri) =>
          row.split("").map((cell, ci) => (
            <div
              key={`${ri}-${ci}`}
              style={{
                width: cellSize,
                height: cellSize * (gaugeStitchesPerCm / gaugeRowsPerCm),
                background: cell === "1" ? "#2196F3" : "transparent",
              }}
            />
          )),
        )}
      </div>
      {isSelected && (
        <div className="pattern-stamp-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClone(stamp.id);
            }}
            title="Клонировать"
          >
            📋
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(stamp.id);
            }}
            title="Удалить"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

// ===== MAIN BLUEPRINTS TAB =====
export default function BlueprintsTab({ projectId }) {
  const { addToast, ToastContainer } = useToast();
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [measurements, setMeasurements] = useState(null);
  const [calculation, setCalculation] = useState(null);
  const [activePart, setActivePart] = useState("front");
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [patternStamps, setPatternStamps] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [selectedStamp, setSelectedStamp] = useState(null);
  const [showPatternBrush, setShowPatternBrush] = useState(false);
  const [selectedPatternForBrush, setSelectedPatternForBrush] = useState(null);
  const [necklineType, setNecklineType] = useState("U"); // "U" or "V"
  const [stampColorPicker, setStampColorPicker] = useState(null); // stampId that has color picker open
  const [isAddingStamp, setIsAddingStamp] = useState(false);
  const [knittingSettings, setKnittingSettings] = useState({
    boundary_mode: "pattern_width",
    empty_row_mode: "skip",
    auto_calculate_nodes: true,
  });
  // === OOP: Sleeve type determined by garment_type (from project) ===
  const [sleeveType, setSleeveType] = useState("raglan"); // auto-detected from garment_type

  useEffect(() => {
    loadSleeveTypeFromProject();
    loadMeasurements();
    loadPatterns();
    loadPatternStamps();
    loadKnittingSettings();
  }, [projectId]);

  // Пересчитываем при изменении measurements ИЛИ sleeveType
  useEffect(() => {
    if (measurements && sleeveType) {
      recalculate();
    }
  }, [measurements, sleeveType]);

  const loadMeasurements = async () => {
    try {
      const result = await invoke("get_raglan_measurements", { projectId });
      const restored = { ...result };
      // Restore yarn_color from localStorage (most reliable cross-tab persistence)
      const savedYarnColor = localStorage.getItem(`yarn_color_${projectId}`);
      if (savedYarnColor) {
        restored.yarn_color = savedYarnColor;
      }
      setMeasurements(restored);
    } catch (e) {
      console.error("Failed to load measurements:", e);
      setShowMeasurementModal(true);
    }
  };

  const loadPatterns = async () => {
    try {
      console.log("[Blueprints] Loading patterns for projectId:", projectId);
      const allPatterns = await invoke("get_patterns_for_project", {
        projectId,
      });
      console.log("[Blueprints] Patterns loaded:", allPatterns?.length || 0, allPatterns);
      setPatterns(allPatterns);
    } catch (e) {
      console.error("[Blueprints] Failed to load patterns:", e);
      setPatterns([]);
    }
  };

  const loadPatternStamps = async () => {
    try {
      const stamps = await invoke("get_blueprint_pattern_stamps", {
        projectId,
      });
      setPatternStamps(stamps);
      console.log(stamps)
    } catch (e) {
      console.error("Failed to load pattern stamps:", e);
    }
    
  };

  const loadKnittingSettings = async () => {
    try {
      const settings = await invoke("get_blueprint_knitting_settings", {
        projectId,
      });
      if (settings) setKnittingSettings(settings);
    } catch (e) {
      console.error("Failed to load knitting settings:", e);
    }
  };

  // === OOP: Load sleeve type from project's garment_type ===
  const loadSleeveTypeFromProject = async () => {
    try {
      // First try to get sleeve_type directly (if column exists)
      const type = await invoke("get_project_sleeve_type", { projectId });
      setSleeveType(type);
    } catch (e) {
      // Fallback: determine from garment_type_id
      // garment_type_id 1=raglan, 2=set_in (adjust based on your DB)
      console.warn("Could not load sleeve_type, using default (raglan)");
      setSleeveType("raglan");
    }
  };

  const saveSleeveType = async (type) => {
    try {
      await invoke("save_project_sleeve_type", { projectId, sleeveType: type });
      setSleeveType(type);
    } catch (e) {
      console.error("Failed to save sleeve type:", e);
      addToast("Ошибка сохранения типа рукава", "error");
    }
  };

  const recalculate = async () => {
    try {
      const calc = await invoke("calculate_blueprint", { projectId, sleeveType });
      setCalculation(calc);
      setNodes(calc.nodes || []);
    } catch (e) {
      console.error("Failed to calculate blueprint:", e);
      addToast("Ошибка расчёта: " + e, "error");
    }
  };

  const handleSaveMeasurements = async (newMeasurements) => {
    try {
      const { yarn_color, ...numericMeasurements } = newMeasurements;
      const savePromises = Object.entries(numericMeasurements).map(
        ([key, value]) =>
          invoke("save_blueprint_measurement", {
            req: {
              project_id: projectId,
              measurement_code: key,
              value: value,
              unit: key.includes("gauge") ? "" : "cm",
            },
          }),
      );
      // Also save yarn_color as a special measurement (store hex in note field)
      if (yarn_color) {
        savePromises.push(
          invoke("save_blueprint_measurement", {
            req: {
              project_id: projectId,
              measurement_code: "yarn_color",
              value: 0,
              unit: "",
              note: yarn_color,
            },
          }),
        );
      }
      await Promise.all(savePromises);
      // Persist yarn_color to localStorage for cross-tab reliability
      if (yarn_color) {
        localStorage.setItem(`yarn_color_${projectId}`, yarn_color);
      }
      setMeasurements(newMeasurements);
      await recalculate();
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  // ===== ИСПРАВЛЕНО: передаём partCode в onNodeMove =====
  const handleNodeMove = async (nodeName, x, y, partCode) => {
    // 1. Мгновенное визуальное обновление
    setNodes((prev) =>
      prev.map((n) =>
        n.node_name === nodeName && n.part_code === partCode
          ? { ...n, x, y, was_manually_moved: true }
          : n,
      ),
    );

    try {
      // 2. Сохраняем позицию узла (бэкенд теперь получает part_code из контекста)
      await invoke("update_blueprint_node", {
        projectId,
        nodeName,
        x,
        y,
      });

      // 3. Обратный расчёт: узлы → пересчёт петель
      const newCalc = await invoke("recalculate_blueprint_from_nodes", {
        projectId,
      });
      setCalculation(newCalc);

      // 4. Мёрдж: сохраняем ручные узлы, обновляем авто-рассчитанные
      setNodes((prev) => {
        const manualNodes = prev.filter((n) => n.was_manually_moved);
        const autoNodes = newCalc.nodes.filter(
          (n) =>
            !manualNodes.some(
              (m) => m.node_name === n.node_name && m.part_code === n.part_code,
            ),
        );
        return [...autoNodes, ...manualNodes];
      });
      addToast("📐 Петли пересчитаны по узлам", "success", 3000);
    } catch (e) {
      console.error("Failed to recalculate from nodes:", e);
    }
  };

  const handleAddPatternStamp = async () => {
    if (isAddingStamp) return; // Prevent duplicate calls
    if (!selectedPatternForBrush || !calculation) return;
    const pattern = patterns.find((p) => p.id === selectedPatternForBrush);
    if (!pattern) return;

    setIsAddingStamp(true);
    try {
    const rows = (pattern.pattern_data || "").split("\n").filter(r => r.trim());
    const stampW = pattern.width;
    const stampH = rows.length;

    // Use exact activePart — nodes are now stored with correct part_code per sleeve
    const partCodeForNodes = activePart;

    const partNodes = nodes.filter(n => n.part_code === partCodeForNodes);
    if (partNodes.length === 0) return;

    const minX = Math.min(...partNodes.map(n => n.x));
    const maxX = Math.max(...partNodes.map(n => n.x));
    const minY = Math.min(...partNodes.map(n => n.y));
    const maxY = Math.max(...partNodes.map(n => n.y));

    // Check if pattern is wider than the widest part of the blueprint
    const blueprintWidth = maxX - minX;
    if (stampW > blueprintWidth) {
      console.error("[Blueprints] Pattern too wide:", stampW, "vs blueprint:", blueprintWidth);
      // Use alert + toast for guaranteed visibility
      addToast(`Узор (${stampW} петель) шире выкройки (${Math.round(blueprintWidth)}петель)! Не помещается.`, "error", 4000);
      return;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Filter stamps for overlap check (only stamps on same part)
    const stampsForOverlap = patternStamps.filter((s) => s.part_code === partCodeForNodes);

    // Find a free position for the stamp using a spiral-like search algorithm
    const overlapCheck = (px, py) => {
      return stampsForOverlap.find((s) => {
        const sx = s.position_x || 0;
        const sy = s.position_y || 0;
        const sw = s.width || 1;
        const sh = s.height || 1;
        const margin = 1;
        return !(
          px + stampW + margin < sx - margin ||
          px - margin > sx + sw + margin ||
          py + stampH + margin < sy - margin ||
          py - margin > sy + sh + margin
        );
      });
    };

    const isOutOfBounds = (px, py) => {
      return (
        px < minX || px + stampW > maxX ||
        py < minY || py + stampH > maxY
      );
    };

    // Try positions: start from center-bottom, then spiral outward
    // Priority: below center -> above center -> left -> right
    const searchPositions = [];
    const stepX = stampW + 2;
    const stepY = stampH + 2;
    const maxSteps = 10;

    // Generate spiral positions: center, then expand outward
    for (let step = 0; step <= maxSteps; step++) {
      const offsets = [];
      if (step === 0) {
        offsets.push([0, 0]); // center
      } else {
        // Bottom
        offsets.push([0, step * stepY]);
        // Top
        offsets.push([0, -step * stepY]);
        // Left
        offsets.push([-step * stepX, 0]);
        // Right
        offsets.push([step * stepX, 0]);
        // Diagonals
        offsets.push([step * stepX, step * stepY]);
        offsets.push([-step * stepX, step * stepY]);
        offsets.push([step * stepX, -step * stepY]);
        offsets.push([-step * stepX, -step * stepY]);
      }
      for (const [dx, dy] of offsets) {
        searchPositions.push([centerX - stampW / 2 + dx, centerY - stampH / 2 + dy]);
      }
    }

    // Find first valid position
    let foundPos = null;
    for (const [px, py] of searchPositions) {
      if (!overlapCheck(px, py) && !isOutOfBounds(px, py)) {
        foundPos = [px, py];
        break;
      }
    }

    if (!foundPos) {
      addToast("Места на узор не осталось!", "error", 4000);
      return;
    }

    const [posX, posY] = foundPos;

    console.log("[Blueprints] Adding stamp at:", { posX, posY });

      // Save stamp — Rust returns full stamp with pattern_data
      const savedStamp = await invoke("save_blueprint_pattern_stamp", {
        req: {
          project_id: projectId,
          part_code: partCodeForNodes,
          pattern_id: null,
          position_x: posX,
          position_y: posY,
          width: stampW,
          height: stampH,
          pattern_data: pattern.pattern_data,
        },
      });

      console.log("[Blueprints] Stamp saved:", savedStamp);

      setPatternStamps((prev) => {
        const newStamp = {
          ...savedStamp,
        };
        return [...prev, newStamp];
      });

      // Check bounds and notify
      const partNodesCheck = nodes.filter(n => n.part_code === activePart);
      if (partNodesCheck.length > 0) {
        const minX = Math.min(...partNodesCheck.map(n => n.x));
        const maxX = Math.max(...partNodesCheck.map(n => n.x));
        const minY = Math.min(...partNodesCheck.map(n => n.y));
        const maxY = Math.max(...partNodesCheck.map(n => n.y));
        const oob = (
          posX < minX || posX + stampW > maxX ||
          posY < minY || posY + stampH > maxY
        );
        if (oob) {
          addToast("Узор выходит за границы выкройки! Перетащите его внутрь.", "warning", 5000);
        }
      }

      //addToast("Узор добавлен на выкройку!", "success");
    } catch (e) {
      console.error("[Blueprints] Failed to add stamp:", e);
      addToast("Ошибка добавления узора: " + e, "error");
    } finally {
      setIsAddingStamp(false);
    }
  };

  const handleDeleteStamp = async (stampId) => {
    try {
      await invoke("delete_blueprint_pattern_stamp", { stampId });
      setPatternStamps((prev) => prev.filter((s) => s.id !== stampId));
      setSelectedStamp(null);
      addToast("Узор удалён", "info");
    } catch (e) {
      addToast("Ошибка удаления: " + e, "error");
    }
  };

  const handleCloneStamp = async (stampId) => {
    try {
      const newStamp = await invoke("clone_blueprint_pattern_stamp", { stampId });
      if (newStamp) {
        setPatternStamps((prev) => [...prev, newStamp]);
        setSelectedStamp(newStamp.id);
      }
      addToast("Узор клонирован", "success");
    } catch (e) {
      addToast("Ошибка клонирования: " + e, "error");
    }
  };

  const handleStampColorChange = async (stampId, color) => {
    setPatternStamps((prev) =>
      prev.map((s) =>
        s.id === stampId ? { ...s, custom_color: color } : s,
      ),
    );
    setStampColorPicker(null);
    // Save color to DB
    try {
      const stamp = patternStamps.find((s) => s.id === stampId);
      if (stamp) {
        await invoke("update_blueprint_pattern_stamp", {
          stampId,
          positionX: stamp.position_x,
          positionY: stamp.position_y,
          customColor: color,
        });
      }
    } catch (e) {
      console.error("Failed to save stamp color:", e);
    }
  };

  const handleMoveStamp = async (stampId, x, y) => {
    setPatternStamps((prev) =>
      prev.map((s) =>
        s.id === stampId ? { ...s, position_x: x, position_y: y } : s,
      ),
    );
    try {
      const stamp = patternStamps.find((s) => s.id === stampId);
      await invoke("update_blueprint_pattern_stamp", {
        stampId,
        positionX: x,
        positionY: y,
        customColor: stamp?.custom_color || null,
      });
    } catch (e) {
      console.error("Failed to move stamp:", e);
    }
  };

  const handleSaveKnittingSettings = async () => {
    try {
      await invoke("save_blueprint_knitting_settings", {
        settings: { projectId, ...knittingSettings },
      });
      addToast("Настройки вязания сохранены", "success");
    } catch (e) {
      addToast("Ошибка сохранения: " + e, "error");
    }
  };

 const partStamps = patternStamps.filter((s) => s.part_code === activePart);

  return (
    <div className="blueprints-tab">
      {/* Header */}
      <div className="blueprints-header">
        <h2>🧵 Выкройка: {calculation?.type === "set_in" ? "Втачной рукав" : calculation?.type === "raglan" ? "Реглан" : sleeveType === "set_in" ? "Втачной рукав" : "Реглан"}</h2>
        <div className="blueprints-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowMeasurementModal(true)}
          >
            📏 Изменить мерки
          </button>
          <button
            className={`btn-secondary ${showPatternBrush ? "active" : ""}`}
            onClick={() => setShowPatternBrush(!showPatternBrush)}
          >
            🖌 Кисть узора
          </button>
        </div>
      </div>

      {/* Measurement summary */}
      {measurements && (
        <div className="measurements-summary">
          <span>ОГ: {measurements.og}см</span>
          <span>ОР: {measurements.or}см</span>
          <span>Голова: {measurements.oh}см</span>
          <span>Рукав: {measurements.dr}см</span>
          <span>Изделие: {measurements.di}см</span>
          <span>Прибавка: {measurements.ease}см</span>
          <span>
            Плотность: {measurements.gauge_stitches_per_cm}×
            {measurements.gauge_rows_per_cm}
          </span>
        </div>
      )}

      {/* Part tabs */}
      <div className="part-tabs">
        {["front", "back", "sleeve_left", "sleeve_right"].map((part) => (
          <button
            key={part}
            className={`part-tab ${activePart === part ? "active" : ""}`}
            onClick={() => setActivePart(part)}
          >
            {
              {
                front: "Перед",
                back: "Спинка",
                sleeve_left: "Рукав левый",
                sleeve_right: "Рукав правый",
              }[part]
            }
          </button>
        ))}
      </div>

      {/* Neckline type selector (for front) */}
      {activePart === "front" && (
        <div className="neckline-selector">
          <label>Тип горловины:</label>
          <div className="neckline-options">
            <button
              className={`neckline-btn ${necklineType === "U" ? "active" : ""}`}
              onClick={() => setNecklineType("U")}
            >
              U-вырез
            </button>
            <button
              className={`neckline-btn ${necklineType === "V" ? "active" : ""}`}
              onClick={() => setNecklineType("V")}
            >
              V-вырез
            </button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="blueprints-content">
        {/* SVG Blueprint */}
        <div className="blueprint-canvas-wrapper">
          <BlueprintSVG
            calculation={calculation}
            partCode={activePart}
            nodes={nodes}
            onNodeMove={handleNodeMove}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            yarnColor={measurements?.yarn_color || "#F5DEB3"}
            necklineType={necklineType}
            stamps={partStamps}
            patterns={patterns}
            selectedStamp={selectedStamp}
            onSelectStamp={setSelectedStamp}
            onDeleteStamp={handleDeleteStamp}
            onCloneStamp={handleCloneStamp}
            onMoveStamp={handleMoveStamp}
            gaugeStitchesPerCm={measurements?.gauge_stitches_per_cm || 2.5}
            gaugeRowsPerCm={measurements?.gauge_rows_per_cm || 3.5}
            activePart={activePart}
            stampColorPicker={stampColorPicker}
            setStampColorPicker={setStampColorPicker}
            onStampColorChange={handleStampColorChange}
          />
        </div>

        {/* Side panel */}
        <div className="blueprints-side-panel">
          {showPatternBrush ? (
            <div className="pattern-brush-panel">
              <h3>🖌 Кисть узора</h3>
              <p className="hint">Выберите узор и нажмите «Добавить на выкройку»</p>
              <div className="pattern-grid">
                {patterns.map((p, idx) => {
                  const rows = (p.pattern_data || "").split("\n").filter(r => r.trim());
                  const isSelected = selectedPatternForBrush === p.id;
                  const cellSize = Math.max(1, Math.floor(50 / Math.max(p.width, p.height)));
                  return (
                    <div
                      key={`pat-${p.id}-${idx}-${p.name}`}
                      className={`pattern-tile ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedPatternForBrush(p.id)}
                      title={p.name}
                    >
                      <div
                        className="pattern-preview"
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${p.width}, ${cellSize}px)`,
                          width: p.width * cellSize,
                          height: rows.length * cellSize,
                        }}
                      >
                        {rows.map((row, ri) =>
                          row.split("").map((cell, ci) => (
                            <div
                              key={`${ri}-${ci}`}
                              style={{
                                width: cellSize,
                                height: cellSize,
                                background: cell === "1" ? "#2196F3" : "transparent",
                              }}
                            />
                          ))
                        )}
                      </div>
                      <span className="pattern-tile-name">{p.name}</span>
                    </div>
                  );
                })}
                {patterns.length === 0 && (
                  <p className="no-patterns">Нет доступных узоров</p>
                )}
              </div>
              {selectedPatternForBrush && (
                <button className="btn-primary" onClick={handleAddPatternStamp} disabled={isAddingStamp}>
                  {isAddingStamp ? "Добавление..." : "Добавить на выкройку"}
                </button>
              )}
            </div>
          ) : (
            <div className="knitting-settings-panel">
              <h3>⚙️ Настройки вязания</h3>
              <div className="setting-group">
                <label>Границы датчиков:</label>
                <select
                  value={knittingSettings.boundary_mode}
                  onChange={(e) =>
                    setKnittingSettings((prev) => ({
                      ...prev,
                      boundary_mode: e.target.value,
                    }))
                  }
                >
                  <option value="pattern_width">По ширине узора</option>
                  <option value="garment_width">По ширине изделия</option>
                </select>
              </div>
              <div className="setting-group">
                <label>Пустые ряды:</label>
                <select
                  value={knittingSettings.empty_row_mode}
                  onChange={(e) =>
                    setKnittingSettings((prev) => ({
                      ...prev,
                      empty_row_mode: e.target.value,
                    }))
                  }
                >
                  <option value="skip">Пропускать</option>
                  <option value="empty">Отправлять пустыми</option>
                </select>
              </div>
              <div className="setting-group">
                <label>
                  <input
                    type="checkbox"
                    checked={knittingSettings.auto_calculate_nodes}
                    onChange={(e) =>
                      setKnittingSettings((prev) => ({
                        ...prev,
                        auto_calculate_nodes: e.target.checked,
                      }))
                    }
                  />
                  Авто-расчёт узлов
                </label>
              </div>
            </div>
          )}

          {/* Calculation info */}
          {calculation && (
            <div className="calc-info">
              {/* === RAGLAN calculation info === */}
              {calculation.type === "raglan" && activePart === "back" && (
                <>
                  <h4>Спинка — размеры</h4>
                  <p>Ширина: {calculation.back_width_stitches} п.</p>
                  <p>Высота: {calculation.total_rows} р.</p>
                  <h4>Спинка — убавки реглана</h4>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(
                      calculation.back_decrease_rows,
                      calculation.back_decrease_counts
                    )}
                  </p>
                  <p>Всего убавок: {calculation.total_decreases} п.</p>
                  <h4>Подрезы (спинка)</h4>
                  <p className="podrez-info">
                    Ряд подреза: {calculation.raglan_start_row_front} от подола
                  </p>
                  <p className="podrez-info">
                    Ширина подреза: {calculation.decrease_shoulder_cuts} п. с каждой стороны
                  </p>
                  <h4>Горловина (спинка)</h4>
                  <p>Ширина: {calculation.neck_width_stitches} п.</p>
                </>
              )}
              {calculation.type === "raglan" && activePart === "front" && (
                <>
                  <h4>Перед — размеры</h4>
                  <p>Ширина: {calculation.front_width_stitches} п.</p>
                  <p>Высота: {calculation.total_rows} р.</p>
                  <h4>Перед — убавки реглана</h4>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(
                      calculation.front_decrease_rows,
                      calculation.front_decrease_counts
                    )}
                  </p>
                  <h4>Подрезы (перед)</h4>
                  <p className="podrez-info">
                    Ряд подреза: {calculation.raglan_start_row_front} от подола
                  </p>
                  <p className="podrez-info">
                    Ширина подреза: {calculation.decrease_shoulder_cuts} п. с каждой стороны
                  </p>
                  <h4>Горловина ({necklineType}-вырез)</h4>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.neck_decrease_rows,
                      calculation.neck_decrease_counts
                    )}
                  </p>
                  <p>Глубина: {calculation.neck_depth_rows} рядов</p>
                </>
              )}
              {calculation.type === "raglan" && activePart === "sleeve_left" && (
                <>
                  <h4>Рукав левый — размеры</h4>
                  <p>Ширина манжеты: {calculation.sleeve_cuff_stitches} п.</p>
                  <p>Ширина оката: {calculation.sleeve_top_stitches} п.</p>
                  <p>Высота: {calculation.sleeve_height_rows} р.</p>
                  <h4>Рукав левый — прибавки</h4>
                  <p className="podrez-info">
                    Прибавлять с обеих сторон:
                  </p>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(calculation.sleeve_increase_rows)}
                  </p>
                  <h4>Подрез рукава</h4>
                  <p className="podrez-info">
                    Ряд подреза: {calculation.sleeve_shoulder_cut_rows} от манжеты
                  </p>
                  <p className="podrez-info">
                    Ширина подреза: {calculation.decrease_shoulder_cuts} п. с каждой стороны
                  </p>
                  <h4>Рукав левый — убавки оката</h4>
                  <p className="podrez-info">
                    🔻 Убавлять СЛЕВА (перед):
                  </p>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(
                      calculation.sleeve_raglan_rows_front
                    )}
                  </p>
                  <p className="podrez-info">
                    🔻 Убавлять СПРАВА (спинка):
                  </p>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(
                      calculation.sleeve_raglan_rows_back
                    )}
                  </p>
                  <p>Скос вершины: {calculation.sleeve_cap_offset.toFixed(1)}</p>
                </>
              )}
              {calculation.type === "raglan" && activePart === "sleeve_right" && (
                <>
                  <h4>Рукав правый — размеры</h4>
                  <p>Ширина манжеты: {calculation.sleeve_cuff_stitches} п.</p>
                  <p>Ширина оката: {calculation.sleeve_top_stitches} п.</p>
                  <p>Высота: {calculation.sleeve_height_rows} р.</p>
                  <h4>Рукав правый — прибавки</h4>
                  <p className="podrez-info">
                    Прибавлять с обеих сторон:
                  </p>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(calculation.sleeve_increase_rows)}
                  </p>
                  <h4>Подрез рукава</h4>
                  <p className="podrez-info">
                    Ряд подреза: {calculation.sleeve_shoulder_cut_rows} от манжеты
                  </p>
                  <p className="podrez-info">
                    Ширина подреза: {calculation.decrease_shoulder_cuts} п. с каждой стороны
                  </p>
                  <h4>Рукав правый — убавки оката (ЗЕРКАЛЬНО)</h4>
                  <p className="podrez-info">
                    🔻 Убавлять СПРАВА (перед):
                  </p>
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(
                      calculation.sleeve_raglan_rows_back
                    )}
                  </p>
                  <p className="podrez-info">
                    🔻 Убавлять СЛЕВА (спинка):
                  </p>
                  
                  <p>
                    Ряды:{" "}
                    {formatDecreaseRows(
                      calculation.sleeve_raglan_rows_front
                    )}
                  </p>
                  
                  <p>Скос вершины: {calculation.sleeve_cap_offset.toFixed(1)}</p>
                </>
              )}

              {/* === SET-IN calculation info === */}
              {calculation.type === "set_in" && activePart === "back" && (
                <>
                  <h4>Спинка — размеры (Втачной)</h4>
                  <p>Ширина низа: {calculation.hem_width_stitches} п.</p>
                  <p>Ширина подмышки: {calculation.underarm_width_stitches} п.</p>
                  <p>Высота изделия: {calculation.total_garment_rows} р.</p>
                  <h4>Пройма — убавки</h4>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.armhole_decrease_rows,
                      calculation.armhole_decrease_counts
                    )}
                  </p>
                  <p>Высота проймы: {calculation.armhole_height_rows} р.</p>
                  <h4>Горловина (спинка)</h4>
                  <p>Ширина: {calculation.neck_width_stitches} п.</p>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.neck_decreases_rows_back,
                      calculation.neck_decreases_counts_back
                    )}
                  </p>
                  <h4>Скос плеча</h4>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.shoulder_decrease_rows,
                      calculation.shoulder_decrease_counts
                    )}
                  </p>
                  <p>Начало скоса: {calculation.start_shoulder_slope_row} ряд</p>
                  <h4>Талия</h4>
                  <p>Убавки (бёдра → талия): {calculation.waist_decreases?.length || 0} раз(а)</p>
                  <p>Прибавки (талия → грудь): {calculation.waist_increases?.length || 0} раз(а)</p>
                </>
              )}
              {calculation.type === "set_in" && activePart === "front" && (
                <>
                  <h4>Перед — размеры (Втачной)</h4>
                  <p>Ширина низа: {calculation.hem_width_stitches} п.</p>
                  <p>Ширина подмышки: {calculation.underarm_width_stitches} п.</p>
                  <p>Высота изделия: {calculation.total_garment_rows} р.</p>
                  <h4>Пройма — убавки</h4>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.armhole_decrease_rows,
                      calculation.armhole_decrease_counts
                    )}
                  </p>
                  <h4>Горловина ({necklineType}-вырез)</h4>
                  <p>Ширина: {calculation.neck_width_stitches} п.</p>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.neck_decreases_rows_front,
                      calculation.neck_decreases_counts_front
                    )}
                  </p>
                  <p>Глубина: {calculation.neck_depth_rows} рядов</p>
                </>
              )}
              {calculation.type === "set_in" && (activePart === "sleeve_left" || activePart === "sleeve_right") && (
                <>
                  <h4>Рукав — размеры (Втачной)</h4>
                  <p>Ширина манжеты: {calculation.sleeve_cuff_stitches} п.</p>
                  <p>Ширина оката: {calculation.sleeve_widest_stitches} п.</p>
                  <p>Длина до оката: {calculation.sleeve_body_rows} р.</p>
                  <p>Высота оката: {calculation.sleeve_cap_height_rows} р.</p>
                  <h4>Окат — убавки</h4>
                  <p>
                    Убавки:{" "}
                    {formatDecreaseRows(
                      calculation.sleeve_cap_decrease_rows,
                      calculation.sleeve_cap_decrease_counts
                    )}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Measurement modal */}
      <MeasurementModal
        isOpen={showMeasurementModal}
        onClose={() => setShowMeasurementModal(false)}
        onSave={handleSaveMeasurements}
        initialMeasurements={measurements}
      />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
