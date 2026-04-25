import React, { useState, useEffect, Suspense, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sweater3DPreview from "../Sweater3D/Sweater3D";
import "./RenderTab.css";

// 🔹 Вычисляем 2D-границы прямо здесь, чтобы не зависеть от BlueprintsTab
function buildBounds2D(nodes) {
  const grouped = {};
  nodes.forEach((n) => {
    if (!grouped[n.part_code]) grouped[n.part_code] = [];
    grouped[n.part_code].push(n);
  });
  const bounds = {};
  Object.entries(grouped).forEach(([part, list]) => {
    bounds[part] = {
      minX: Math.min(...list.map((n) => n.x)),
      maxX: Math.max(...list.map((n) => n.x)),
      minY: Math.min(...list.map((n) => n.y)),
      maxY: Math.max(...list.map((n) => n.y)),
    };
  });
  return bounds;
}

function adaptMeasurementsArray(meas) {
  if (!Array.isArray(meas)) return meas || {};
  return meas.reduce((acc, item) => {
    if (item?.key && item?.value !== undefined) acc[item.key] = item.value;
    return acc;
  }, {});
}

const MEASUREMENTS_MAPPING = {
  chest_circumference: "chest",
  waist_circumference: "waist",
  hip_circumference: "hips",
  neck_circumference: "neck",
  upperarm_circumference: "armWidth",
  wrist_circumference: "wrist",
  garment_length: "bodyLength",
  sleeve_length: "sleeveLength",
  shoulder_length: "shoulderLength",
  shoulder_height: "shoulderHeight",
  neck_depth: "neckDepth",
};

function normalizeMeasurement(value, min, max, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const clamped = Math.min(Math.max(value, min), max);
  return (clamped - min) / (max - min);
}

export default function RenderTab({ projectId }) { // 🔹 убрали bounds2D из пропсов
  const [calculation, setCalculation] = useState(null);
  const [sleeveType, setSleeveType] = useState("raglan");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patternStamps, setPatternStamps] = useState([]);
  const [rawMeasurements, setRawMeasurements] = useState(null);

  // 🔹 Вычисляем bounds2D локально из загруженных узлов
  const bounds2D = useMemo(() => {
    if (calculation?.nodes) return buildBounds2D(calculation.nodes);
    return {};
  }, [calculation?.nodes]);

  const measurements3D = useMemo(() => {
    if (!rawMeasurements) return {};
    const normalized = {};
    const ranges = {
      chest_circumference: [80, 120], waist_circumference: [60, 100],
      hip_circumference: [85, 130], neck_circumference: [30, 50],
      upperarm_circumference: [25, 45], wrist_circumference: [14, 22],
      garment_length: [40, 80], sleeve_length: [50, 70],
      shoulder_length: [10, 20], shoulder_height: [10, 25],
      neck_depth: [5, 25],
    };

    Object.entries(MEASUREMENTS_MAPPING).forEach(([backendKey, componentKey]) => {
      const value = rawMeasurements[backendKey];
      const [min, max] = ranges[backendKey] || [0, 100];
      normalized[componentKey] = normalizeMeasurement(value, min, max);
    });
    return normalized;
  }, [rawMeasurements]);

  useEffect(() => {
    loadAllData();
  }, [projectId, sleeveType]);

  const loadAllData = async () => {
    setLoading(true); setError(null);
    try {
      const [type, calc, stamps, pats, meas] = await Promise.all([
        invoke("get_project_sleeve_type", { projectId }).catch(() => "raglan"),
        invoke("calculate_blueprint", { projectId, sleeveType }),
        invoke("get_blueprint_pattern_stamps", { projectId }).catch(() => []),
        invoke("get_patterns_for_project", { projectId }).catch(() => []),
        invoke("get_project_blueprint_measurements", { projectId }).catch(() => null),
      ]);
      setSleeveType(type);
      setCalculation(calc);
      setPatternStamps(stamps);
      setRawMeasurements(adaptMeasurementsArray(meas));
    } catch (e) {
      console.error("Failed to load data:", e);
      setError("Не удалось загрузить данные для рендера");
    } finally {
      setLoading(false);
    }
  };

  const yarnColor = rawMeasurements?.yarn_color || localStorage.getItem(`yarn_color_${projectId}`) || "#c77d9e";

  return (
    <div className="render-tab">
      <h2>🎨 3D Рендер изделия</h2>

      {error && <div className="render-error"><p>⚠️ {error}</p><button className="btn-secondary" onClick={() => setError(null)}>Закрыть</button></div>}

      {loading && !calculation ? (
        <div className="render-loading"><div className="spinner" /><p>Загрузка 3D модели...</p></div>
      ) : (
        <div className="render-content">
          <div className="render-3d-wrapper">
            <Suspense fallback={<div className="render-loading">Загрузка 3D...</div>}>
              <Sweater3DPreview
                initialMeasurements={measurements3D}
                yarnColor={yarnColor}
                scaleFactor={2}
                offsetY={-70}
                textureUrl="/textures/knit_3d.jpg"
                stamps={patternStamps}
                bounds2D={bounds2D} // 🔹 теперь всегда есть данные
                height={500}
                autoRotate={true}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}