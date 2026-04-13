import { useState, useEffect, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sweater3DPreview } from "../Sweater3D/Sweater3D";
import "./RenderTab.css";

export default function RenderTab({ projectId }) {
  const [calculation, setCalculation] = useState(null);
  const [sleeveType, setSleeveType] = useState("raglan");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCalculation();
  }, [projectId, sleeveType]);

  const loadCalculation = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load sleeve type
      try {
        const type = await invoke("get_project_sleeve_type", { projectId });
        setSleeveType(type);
      } catch (e) {
        console.warn("Could not load sleeve type, defaulting to raglan");
      }
      
      // Load calculation
      const calc = await invoke("calculate_blueprint", { 
        projectId, 
        sleeveType 
      });
      setCalculation(calc);
    } catch (e) {
      console.error("Failed to load calculation:", e);
      setError("Не удалось загрузить расчёт. Проверьте мерки в разделе 'Выкройки'.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="render-tab">
      <div className="render-header">
        <h2>🎨 3D Рендер изделия</h2>
        <button className="btn-secondary" onClick={loadCalculation} disabled={loading}>
          {loading ? "⏳ Загрузка..." : "🔄 Обновить"}
        </button>
      </div>

      {error && (
        <div className="render-error">
          <p>⚠️ {error}</p>
          <button className="btn-secondary" onClick={() => setError(null)}>
            Закрыть
          </button>
        </div>
      )}

      {loading && !calculation ? (
        <div className="render-loading">
          <div className="spinner" />
          <p>Загрузка 3D модели...</p>
        </div>
      ) : (
        <div className="render-content">
          <div className="render-3d-wrapper">
            <Suspense fallback={<div className="render-loading">Загрузка 3D...</div>}>
              <Sweater3DPreview 
                calculation={calculation} 
                sleeveType={sleeveType}
                height={500}
              />
            </Suspense>
          </div>

          <div className="render-info">
            <h4>ℹ️ Управление</h4>
            <ul>
              <li>🖱️ <strong>Вращение:</strong> зажмите левую кнопку мыши и двигайте</li>
              <li>🔍 <strong>Масштаб:</strong> колёсико мыши или pinch на тачпаде</li>
              <li>✋ <strong>Перемещение:</strong> зажмите правую кнопку мыши</li>
            </ul>
            
            <div className="render-legend">
              <div className="legend-item">
                <span className="legend-color" style={{ background: "#2196F3" }}></span>
                <span>Спинка</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: "#4CAF50" }}></span>
                <span>Перед</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ background: "#FF9800" }}></span>
                <span>Рукава</span>
              </div>
            </div>

            {calculation && (
              <div className="render-calc-info">
                <h4>📊 Параметры модели</h4>
                {calculation.type === "raglan" ? (
                  <>
                    <p>Тип: <strong>Реглан</strong></p>
                    <p>Ширина спинки: {calculation.back_width_stitches} п.</p>
                    <p>Высота: {calculation.total_rows} р.</p>
                    <p>Убавок: {calculation.total_decreases} п.</p>
                  </>
                ) : (
                  <>
                    <p>Тип: <strong>Втачной рукав</strong></p>
                    <p>Ширина низа: {calculation.hem_width_stitches} п.</p>
                    <p>Высота: {calculation.total_garment_rows} р.</p>
                    <p>Высота проймы: {calculation.armhole_height_rows} р.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
