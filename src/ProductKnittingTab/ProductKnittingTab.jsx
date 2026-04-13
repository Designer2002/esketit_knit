import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import useToast from "../Toast/useToast";
import "./ProductKnittingTab.css";

// Sounds
import addNeedle from "../assets/sounds/add_needle.mp3";
import removeNeedle from "../assets/sounds/remove_needle.mp3";
import patAdjust from "../assets/sounds/pat_adjust.mp3";

export default function ProductKnittingTab({ projectId }) {
  const { addToast, ToastContainer } = useToast();
  const [currentRow, setCurrentRow] = useState(1);
  const [activePart, setActivePart] = useState("front");
  const [rowInfo, setRowInfo] = useState(null);
  const [partRange, setPartRange] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isKnitting, setIsKnitting] = useState(false); // synced with pattern tab
  const [prevPatternId, setPrevPatternId] = useState(null);
  const [prevWidth, setPrevWidth] = useState(null);

  // Audio refs
  const addSoundRef = useRef(null);
  const removeSoundRef = useRef(null);
  const patSoundRef = useRef(null);

  useEffect(() => {
    addSoundRef.current = new Audio(addNeedle);
    removeSoundRef.current = new Audio(removeNeedle);
    patSoundRef.current = new Audio(patAdjust);
  }, []);

  // Load row data
  useEffect(() => {
    loadPartData();
    loadSavedProgress();
  }, [projectId, activePart]);

  // Load row info when row changes
  useEffect(() => {
    if (allRows.length > 0 && partRange) {
      const info = allRows.find(r => r.row === currentRow && r.part_code === activePart);
      setRowInfo(info || null);

      // Check for notifications
      checkRowNotifications(info);
    }
  }, [currentRow, activePart, allRows, partRange]);

  const loadPartData = async () => {
    setLoading(true);
    try {
      const [range, instructions] = await Promise.all([
        invoke("get_garment_part_row_range", { projectId, partCode: activePart }).catch(() => null),
        invoke("get_garment_row_instructions", { projectId }).catch(() => []),
      ]);
      setPartRange(range);
      setAllRows(instructions);
      if (range) {
        setCurrentRow(prev => Math.min(prev, range.end_row));
      }
    } catch (e) {
      console.error("Failed to load part data:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedProgress = async () => {
    try {
      const progress = await invoke("load_garment_progress", { projectId });
      if (progress && progress.current_row && progress.part_code) {
        setActivePart(progress.part_code);
        setCurrentRow(progress.current_row);
      }
    } catch (e) {
      console.error("Failed to load progress:", e);
    }
  };

  const saveProgress = async () => {
    try {
      await invoke("save_garment_progress", {
        projectId,
        currentRow,
        partCode: activePart,
      });
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  };

  // Send restart signal to ESP server (called when user resets progress, changes pattern, etc.)
  const sendEspRestart = async () => {
    try {
      await invoke("send_esp_restart_signal");
    } catch (e) {
      // Server might not be running, that's ok
      console.log("ESP restart signal not sent (server not running):", e);
    }
  };

  // Auto-save on row change
  useEffect(() => {
    const timer = setTimeout(saveProgress, 1000);
    return () => clearTimeout(timer);
  }, [currentRow, activePart]);

  const checkRowNotifications = (info) => {
    if (!info) return;

    // Sound + toast for decrease
    if (info.action === "decrease" && info.decrease_count > 0) {
      removeSoundRef.current?.play().catch(() => {});
      addToast(
        ` Ряд ${info.row}: ${info.action_detail || "убавка"}`,
        "warning",
        5000
      );
    }

    // Sound + toast for increase
    if (info.action === "increase") {
      addSoundRef.current?.play().catch(() => {});
      addToast(
        `🔺 Ряд ${info.row}: ${info.action_detail || "прибавка"}`,
        "info",
        5000
      );
    }

    // Sound for neckline close
    if (info.action === "neck_close") {
      removeSoundRef.current?.play().catch(() => {});
      addToast(
        ` Ряд ${info.row}: ${info.action_detail}`,
        "warning",
        5000
      );
    }

    // Pattern notifications
    if (info.is_pattern_row && info.pattern_id) {
      // Pattern start or change
      if (prevPatternId !== info.pattern_id) {
        patSoundRef.current?.play().catch(() => {});
        addToast(
          `🎨 Ряд ${info.row}: начало узора "${info.pattern_name || ''}"`,
          "info",
          5000
        );
        setPrevPatternId(info.pattern_id);
      }

      // Pattern width change → sensor reminder
      if (prevWidth !== null && prevWidth !== info.stitches) {
        addToast(
          `📐 Датчики: ширина изменилась с ${prevWidth} на ${info.stitches} п.`,
          "warning",
          4000
        );
      }
      setPrevWidth(info.stitches);
    } else if (!info.is_pattern_row && prevWidth !== null) {
      // Exiting pattern area
      setPrevPatternId(null);
      setPrevWidth(null);
    }
  };

  const goToRow = (row) => {
    if (!partRange) return;
    const clamped = Math.max(partRange.start_row, Math.min(partRange.end_row, row));
    setCurrentRow(clamped);
    // Send restart signal when going back to start of part
    if (clamped === partRange.start_row) {
      sendEspRestart();
    }
  };

  const prevRow = () => goToRow(currentRow - 1);
  const nextRow = () => goToRow(currentRow + 1);

  const handleRowInput = (e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) goToRow(val);
  };

  // Sync with pattern knitting
  const handleStartKnitting = async () => {
    setIsKnitting(true);
    // This will be observed by the pattern tab via localStorage or event
    localStorage.setItem('garment_knitting_sync', JSON.stringify({
      projectId,
      currentRow,
      part: activePart,
      timestamp: Date.now()
    }));
    addToast("Вязание изделия синхронизировано с вязанием узора!", "success");
  };

  const handleStopKnitting = () => {
    setIsKnitting(false);
    localStorage.removeItem('garment_knitting_sync');
  };

  // Render stitch row visualization
  const renderStitchRow = () => {
    if (!rowInfo || !partRange) return null;

    const stitches = rowInfo.stitches;
    const maxStitches = Math.max(
      ...(allRows.filter(r => r.part_code === activePart).map(r => r.stitches))
    );
    const padding = Math.max(0, (maxStitches - stitches) / 2);

    return (
      <div className="stitch-row-visual">
        <div className="stitch-row-container">
          {/* Left padding (empty needles) */}
          {Array.from({ length: Math.floor(padding) }, (_, i) => (
            <div key={`lp-${i}`} className="stitch-cell empty" />
          ))}
          {/* Active stitches */}
          {Array.from({ length: stitches }, (_, i) => {
            // Highlight decrease/increase positions
            const isLeftEdge = i === 0;
            const isRightEdge = i === stitches - 1;
            const isDecreaseLeft = rowInfo.decrease_left && isLeftEdge;
            const isDecreaseRight = rowInfo.decrease_right && isRightEdge;
            const isPatternCell = rowInfo.is_pattern_row;

            return (
              <div
                key={`s-${i}`}
                className={`stitch-cell ${
                  isDecreaseLeft ? 'decrease-left' :
                  isDecreaseRight ? 'decrease-right' :
                  isPatternCell ? 'pattern' :
                  'active'
                }`}
                title={isDecreaseLeft || isDecreaseRight ? "убавка" : isPatternCell ? "узор" : "лицевая"}
              />
            );
          })}
          {/* Right padding */}
          {Array.from({ length: Math.ceil(padding) }, (_, i) => (
            <div key={`rp-${i}`} className="stitch-cell empty" />
          ))}
        </div>
        <div className="stitch-labels">
          <span>← {padding.toFixed(0)} пустых</span>
          <span className="stitch-count">{stitches} п. активно</span>
          <span>{padding.toFixed(0)} пустых →</span>
        </div>
      </div>
    );
  };

  // Calculate progress
  const progressPercent = partRange
    ? ((currentRow / partRange.end_row) * 100).toFixed(1)
    : 0;

  if (loading) {
    return (
      <div className="product-knitting-tab">
        <div className="loading-spinner">Загрузка рядов...</div>
      </div>
    );
  }

  return (
    <div className="product-knitting-tab">
      <ToastContainer />

      {/* Header */}
      <div className="pk-header">
        <h2>🧶 Вязание изделия</h2>
        <div className="pk-actions">
          {!isKnitting ? (
            <button className="btn-start-knit" onClick={handleStartKnitting}>
              ▶ Начать вязание
            </button>
          ) : (
            <button className="btn-stop-knit" onClick={handleStopKnitting}>
              ⏹ Остановить
            </button>
          )}
        </div>
      </div>

      {/* Part selector */}
      <div className="pk-part-selector">
        <button
          className={`part-btn ${activePart === "front" ? "active" : ""}`}
          onClick={() => { setActivePart("front"); setCurrentRow(1); sendEspRestart(); }}
        >
          Перед ({partRange?.part_code === "front" ? `1–${partRange.end_row}` : "?"})
        </button>
        <button
          className={`part-btn ${activePart === "back" ? "active" : ""}`}
          onClick={() => { setActivePart("back"); setCurrentRow(1); sendEspRestart(); }}
        >
          Спинка ({partRange?.part_code === "back" ? `1–${partRange.end_row}` : "?"})
        </button>
        <button
          className={`part-btn ${activePart === "sleeve" ? "active" : ""}`}
          onClick={() => { setActivePart("sleeve"); setCurrentRow(1); sendEspRestart(); }}
        >
          Рукав ({partRange?.part_code === "sleeve" ? `1–${partRange.end_row}` : "?"})
        </button>
      </div>

      {/* Progress bar */}
      <div className="pk-progress">
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="progress-text">Ряд {currentRow} / {partRange?.end_row || "?"} ({progressPercent}%)</span>
      </div>

      {/* Row navigator */}
      <div className="pk-row-navigator">
        <button className="nav-btn" onClick={prevRow} disabled={currentRow <= 1}>
          ◀
        </button>
        <div className="row-input-group">
          <input
            type="number"
            min={partRange?.start_row || 1}
            max={partRange?.end_row || 999}
            value={currentRow}
            onChange={handleRowInput}
            onBlur={() => goToRow(currentRow)}
          />
          <span className="row-label">ряд</span>
        </div>
        <button className="nav-btn" onClick={nextRow} disabled={!partRange || currentRow >= partRange.end_row}>
          ▶
        </button>
        <button className="nav-btn jump-btn" onClick={() => goToRow(partRange?.end_row || currentRow)} title="В конец">
          ⏭
        </button>
      </div>

      {/* Stitch row visualization */}
      <div className="pk-stitch-display">
        <h3>Ряд {currentRow} — {activePart === "front" ? "Перед" : activePart === "back" ? "Спинка" : "Рукав"}</h3>
        {renderStitchRow()}

        {/* Row info */}
        {rowInfo && (
          <div className="pk-row-info">
            {rowInfo.action && (
              <div className={`row-action ${rowInfo.action}`}>
                <span className="action-icon">
                  {rowInfo.action === "decrease" && "🔻"}
                  {rowInfo.action === "increase" && "🔺"}
                  {rowInfo.action === "neck_close" && "⭕"}
                </span>
                <span className="action-text">{rowInfo.action_detail}</span>
              </div>
            )}
            {rowInfo.is_pattern_row && (
              <div className="row-pattern">
                🎨 Узор: {rowInfo.pattern_name || `#${rowInfo.pattern_id}`}
              </div>
            )}
            {!rowInfo.action && !rowInfo.is_pattern_row && (
              <div className="row-normal">
                Обычный ряд — {rowInfo.stitches} петель
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick navigation to special rows */}
      {allRows.length > 0 && (
        <div className="pk-special-rows">
          <h4>Ключевые ряды:</h4>
          <div className="special-row-list">
            {allRows
              .filter(r => r.part_code === activePart && (r.action || r.is_pattern_row))
              .slice(0, 10)
              .map(r => (
                <button
                  key={r.row}
                  className="special-row-btn"
                  onClick={() => goToRow(r.row)}
                >
                  <span className="special-row-num">#{r.row}</span>
                  <span className="special-row-action">
                    {r.action === "decrease" && "🔻"}
                    {r.action === "increase" && "🔺"}
                    {r.action === "neck_close" && "⭕"}
                    {r.is_pattern_row && "🎨"}
                    {" "}{r.action_detail?.substring(0, 30) || r.pattern_name}
                  </span>
                </button>
              ))
            }
          </div>
        </div>
      )}

      {/* Sync status */}
      {isKnitting && (
        <div className="pk-sync-status">
          <span className="sync-indicator">🔄</span>
          Синхронизировано с вязанием узора — ряд {currentRow}
        </div>
      )}
    </div>
  );
}
