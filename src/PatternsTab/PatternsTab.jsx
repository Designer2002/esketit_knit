import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import useToast from "../Toast/useToast";
import "../Toast/Toast.css";
import ImageConverter from "../ImageConverter/ImageConverter";
import "./PatternsTab.css";

export default function PatternsTab({ projectId, garmentTypeId, onSelectPattern }) {
  const { addToast, ToastContainer } = useToast();
  const [patterns, setPatterns] = useState([]);
  const [invertedPatternId, setInvertedPatternId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [projectPath, setProjectPath] = useState(null);
  const [patternFile, setPatternFile] = useState(null);
  const [importSourceFile, setImportSourceFile] = useState(null);
  const [theme, setTheme] = useState("dark-blue");

  // Конвертация изображений
  const [converting, setConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);

  // Режим выбора файла для импорта
  const [importMode, setImportMode] = useState(false);
  
  // Режим конвертера
  const [useNewConverter, setUseNewConverter] = useState(true);

  const [modal, setModal] = useState(null); // Удаляем modal state

  // Хелперы для уведомлений (заглушки, используем addToast)
  const showAlert = (message, type = "info") => addToast(message, type);
  const showConfirm = ({ title, message, onConfirm, confirmText = "Да", cancelText = "Нет" }) => {
    // Для confirm используем window.confirm
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm?.();
    }
  };

  const canvasRef = useRef(null);

  // Отрисовка паттерна на canvas
  const drawPatternPreview = useCallback((rows, width, height) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Загружаем сохранённые цвета из localStorage
    const savedColors = localStorage.getItem('patternColors');
    const colors = savedColors ? JSON.parse(savedColors) : { dark: "#1e40af", light: "#e5e7eb" };

    const ctx = canvas.getContext("2d");
    const maxCanvasSize = 500;
    const cellSize = Math.max(2, Math.min(12, Math.floor(maxCanvasSize / Math.max(width, height))));

    canvas.width = width * cellSize;
    canvas.height = height * cellSize;

    // Очистка canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Отрисовка каждого пикселя с использованием сохранённых цветов
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] === true || row[x] === 1 || row[x] === "1" || row[x] === "#") {
          // Тёмный пиксель (узор)
          ctx.fillStyle = colors.dark;
        } else {
          // Светлый пиксель (фон)
          ctx.fillStyle = colors.light;
        }
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    
    // Добавляем сетку для наглядности
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(canvas.width, y * cellSize);
      ctx.stroke();
    }
  }, []);

  // Загрузка проекта и узоров
  useEffect(() => {
    console.log("📐 PatternsTab mounted, projectId:", projectId);
    const loadProjectAndPatterns = async () => {
      console.log("🔄 Загрузка проекта, projectId:", projectId);
      try {
        const projectData = await invoke("open_project_by_id", {
          projectId: parseInt(projectId)
        });

        console.log("✅ Проект загружен:", projectData);
        console.log("📁 file_path:", projectData.file_path);
        
        if (!projectData.file_path) {
          console.warn("⚠️ file_path пустой!");
          showAlert("У проекта не указан путь к файлу. Создайте проект заново.", "warning");
          return;
        }
        
        setProjectPath(projectData.file_path);

        // Загружаем тему
        try {
          const savedTheme = await invoke("get_theme");
          setTheme(savedTheme);
        } catch (e) {
          console.error("Failed to load theme:", e);
        }

        await loadPatterns(projectData.file_path);
      } catch (error) {
        console.error("❌ Failed to load project:", error);
        showAlert("Не удалось загрузить проект: " + error, "error");
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      loadProjectAndPatterns();
    }
  }, [projectId]);
  
  // Отрисовка превью при выборе паттерна
  useEffect(() => {
    if (selectedPattern && selectedPattern.pattern_data && canvasRef.current) {
      // Небольшая задержка чтобы canvas успел отрендериться
      setTimeout(() => {
        drawPatternPreview(
          selectedPattern.pattern_data,
          selectedPattern.width,
          selectedPattern.height
        );
      }, 50);
    }
  }, [selectedPattern, drawPatternPreview]);

  // Загрузка узоров из папки patterns
  const loadPatterns = async (projPath) => {
    try {
      const patternsDir = `${projPath}/patterns`;

      try {
        const entries = await invoke("read_dir", { path: patternsDir });

        const patternFiles = entries.filter(
          entry => !entry.is_dir && (entry.name.endsWith('.swaga') || entry.name.endsWith('.txt'))
        );

        const loadedPatterns = await Promise.all(
          patternFiles.map(async (file) => {
            const filePath = `${patternsDir}/${file.name}`;
            const content = await invoke("read_file_text", { path: filePath });
            const parsed = parsePatternFile(content, file.name, filePath);
            return parsed;
          })
        );

        setPatterns(loadedPatterns.filter(p => p !== null));
      } catch (error) {
        console.log("Patterns directory does not exist yet");
        setPatterns([]);
      }
    } catch (error) {
      console.error("Failed to load patterns:", error);
      setPatterns([]);
    }
  };

  // Парсинг файла узора
  const parsePatternFile = (content, fileName, filePath) => {
    const lines = content.split('\n').filter(line => line.trim() !== '');

    let metadata = {};
    let patternLines = [];
    let inHeader = true;

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (inHeader) {
          if (line.includes('=')) {
            const [key, value] = line.substring(1).split('=').map(s => s.trim());
            metadata[key] = value;
          }
          if (line.includes('# end_header')) {
            inHeader = false;
          }
        }
      } else if (!inHeader) {
        patternLines.push(line.trim());
      }
    }

    if (patternLines.length === 0 && lines.length > 0) {
      patternLines = lines.filter(line => !line.startsWith('#')).map(line => line.trim());
    }

    const height = patternLines.length;
    const width = patternLines.length > 0 ? patternLines[0].length : 0;

    const rows = patternLines.map(line =>
      line.split('').map(char => char === '1' || char === '#')
    );

    return {
      id: fileName,
      name: fileName.replace(/\.(swaga|txt)$/, ''),
      width,
      height,
      file_path: filePath,
      pattern_data: rows,
      metadata,
    };
  };

  // Открытие диалога выбора файла
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        title: importMode ? "Выберите файл узора (.swaga или .txt)" : "Выберите изображение для конвертации",
        multiple: false,
        filters: importMode ? [{
          name: "Pattern Files",
          extensions: ["swaga", "txt"]
        }] : [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "bmp", "gif"]
        }]
      });

      if (selected) {
        if (importMode) {
          if (selected.endsWith('.swaga') || selected.endsWith('.txt')) {
            setImportSourceFile(selected);
          } else {
            showAlert("Выберите файл .swaga или .txt для импорта", "warning");
          }
        } else {
          setPatternFile(selected);
          setSelectedPattern(null);
          setConversionResult(null);
        }
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
      showAlert(`Ошибка выбора файла: ${err.message || err}`, "error");
    }
  };

  // Инвертировать цвета узора и ПЕРЕЗАПИСАТЬ файл
  const handleInvertPattern = async (pattern) => {
    try {
      // pattern_data is array of rows, each row is array of booleans
      if (!Array.isArray(pattern.pattern_data)) {
        addToast("Этот узор нельзя инвертировать", "warning");
        return;
      }

      const invertedRows = pattern.pattern_data.map((row) =>
        row.map((cell) => !cell)
      );

      // Save inverted pattern to file
      await invoke("save_pattern_to_file", {
        filePath: pattern.file_path,
        patternData: invertedRows,
        width: pattern.width,
        height: pattern.height,
      });

      // Update local state
      setPatterns((prev) =>
        prev.map((p) => {
          if (p.id !== pattern.id) return p;
          return { ...p, pattern_data: invertedRows };
        })
      );

      // Update selected pattern
      if (selectedPattern?.id === pattern.id) {
        setSelectedPattern((prev) => ({
          ...prev,
          pattern_data: invertedRows,
        }));
      }

      setInvertedPatternId(pattern.id);
      setTimeout(() => setInvertedPatternId(null), 1500);
      addToast("Цвета инвертированы и сохранены!", "success");
    } catch (e) {
      addToast("Ошибка сохранения: " + e, "error");
    }
  };

  // Конвертация выбранного изображения в узор
  const handleConvertImage = async () => {
    if (!patternFile || !projectPath) {
      showAlert("Выберите изображение и дождитесь загрузки проекта", "warning");
      return;
    }

    try {
      setConverting(true);

      const patternFileName = `pattern_${Date.now()}.swaga`;
      const outputPath = `${projectPath}/patterns/${patternFileName}`;

      const result = await invoke("convert_image_to_pattern", {
        req: {
          image_path: patternFile,
          output_path: outputPath,
          mirror_horizontal: true,
          threshold: 128,
          invert: false,
          pattern_char_dark: "1",
          pattern_char_light: "0",
        }
      });

      if (!result.success) {
        throw new Error(result.error || "Конвертация не удалась");
      }

      setConversionResult(result);
      await loadPatterns(projectPath);
      showAlert("Узор успешно создан!", "success");

    } catch (error) {
      console.error("Conversion failed:", error);
      showAlert(`Ошибка конвертации: ${error.message}`, "error");
      setConversionResult({ success: false, error: error.message });
    } finally {
      setConverting(false);
    }
  };

  // Импорт узора из другого места
  const handleImportPattern = async () => {
    if (!importSourceFile || !projectPath) {
      showAlert("Выберите файл узора (.swaga или .txt) для импорта", "warning");
      return;
    }

    showConfirm({
      title: "Импортировать узор?",
      message: `Скопировать "${importSourceFile.split('/').pop()}" в папку patterns проекта?`,
      confirmText: "Импортировать",
      onConfirm: async () => {
        try {
          const fileName = importSourceFile.split('/').pop();
          const destPath = `${projectPath}/patterns/${fileName}`;

          await invoke("copy_file", {
            from: importSourceFile,
            to: destPath
          });

          showAlert(`Узор "${fileName}" импортирован!`, "success");
          setImportSourceFile(null);
          setImportMode(false);
          await loadPatterns(projectPath);
        } catch (error) {
          showAlert(`Ошибка импорта: ${error.message}`, "error");
        }
      },
      onCancel: () => {
        setImportSourceFile(null);
      }
    });
  };

  // Отмена импорта
  const handleCancelImport = () => {
    setImportMode(false);
    setImportSourceFile(null);
  };

  // Удаление узора
  const handleDeletePattern = (pattern) => {
    showConfirm({
      title: "Удалить узор?",
      message: `Вы уверены, что хотите удалить узор "${pattern.name}"?`,
      confirmText: "Удалить",
      onConfirm: async () => {
        try {
          await invoke("remove_file", { path: pattern.file_path });
          showAlert("Узор удалён", "success");
          setSelectedPattern(null);
          await loadPatterns(projectPath);
        } catch (error) {
          showAlert(`Ошибка удаления: ${error.message}`, "error");
        }
      }
    });
  };

 
  
  // Создание мини-превью для карточки (возвращает data URL)
  const createMiniPreview = useCallback((rows, width, height, size = 60) => {
    if (!rows || rows.length === 0) return '';
    
    // Загружаем сохранённые цвета из localStorage
    const savedColors = localStorage.getItem('patternColors');
    const colors = savedColors ? JSON.parse(savedColors) : { dark: "#1e40af", light: "#e5e7eb" };
    
    const miniCanvas = document.createElement('canvas');
    const cellSize = Math.max(1, Math.floor(size / Math.max(width, height)));
    miniCanvas.width = Math.max(1, width * cellSize);
    miniCanvas.height = Math.max(1, height * cellSize);
    
    const ctx = miniCanvas.getContext('2d');
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] === true || row[x] === 1 || row[x] === "1" || row[x] === "#") {
          ctx.fillStyle = colors.dark;
        } else {
          ctx.fillStyle = colors.light;
        }
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    
    return miniCanvas.toDataURL('image/png');
  }, []);
  
  

  return (
    <div className="patterns-tab">
      {/* Toolbar */}
      <div className="patterns-toolbar">
        {!importMode ? (
          <>
            <button
              className="btn-import"
              onClick={() => setImportMode(true)}
              disabled={!projectPath}
            >
              📥 Импорт узора
            </button>
            <button
              className={`btn-toggle-converter ${useNewConverter ? "active" : ""}`}
              onClick={() => setUseNewConverter(!useNewConverter)}
            >
              {useNewConverter ? "🖼️ Новый конвертер" : "🔲 Редактор узоров"}
            </button>
          </>
        ) : (
          <div className="import-mode-toolbar">
            <span className="import-mode-label">📁 Режим импорта: выберите файл .swaga или .txt</span>
            <button
              className="btn-confirm-import"
              onClick={handleImportPattern}
              disabled={!importSourceFile}
            >
              ✅ Импортировать
            </button>
            <button
              className="btn-cancel-import"
              onClick={handleCancelImport}
            >
              ✕ Отмена
            </button>
          </div>
        )}
      </div>

      {/* Новый конвертер */}
      {useNewConverter && (
        projectPath ? (
          <ImageConverter
            projectPath={projectPath}
            projectId={projectId}
            onPatternCreated={(pattern) => {
              loadPatterns(projectPath);
              showAlert(`Узор "${pattern.name}" создан и добавлен в галерею!`, "success");
            }}
          />
        ) : (
          <div className="converter-loading">
            <div className="loading-spinner"></div>
            <p>Загрузка проекта...</p>
          </div>
        )
      )}

      {/* Two columns layout */}
      <div className={`patterns-layout ${useNewConverter ? "hidden" : ""}`}>
        {/* Left: File Selection */}
        <div className="patterns-left-panel">
          <h4>
            {importMode
              ? "📂 Выберите файл узора для импорта"
              : "📂 Выберите изображение для конвертации"}
          </h4>

          <button
            className="btn-select-file-patterns"
            onClick={handleSelectFile}
            disabled={!projectPath}
          >
            📁 {importMode ? "Выбрать файл узора" : "Выбрать изображение"}
          </button>

          {importMode && importSourceFile && (
            <div className="selected-file-info">
              <span className="file-path">📄 {importSourceFile.split('/').pop()}</span>
              <span className="file-hint">Готов к импорту</span>
            </div>
          )}

          {!importMode && patternFile && (
            <div className="selected-file-info">
              <span className="file-path">📄 {patternFile.split('/').pop()}</span>
              <button
                className="btn-convert"
                onClick={handleConvertImage}
                disabled={converting || !projectPath}
              >
                {converting ? "⏳ Конвертация..." : "✨ Конвертировать в узор"}
              </button>
            </div>
          )}
        </div>

        {/* Right: Patterns grid */}
        <div className="patterns-right-panel">
          <h4>🧶 Узоры проекта ({patterns.length})</h4>

          <div className="patterns-grid">
            {loading ? (
              <div className="patterns-loading">Загрузка узоров...</div>
            ) : patterns.length === 0 ? (
              <div className="patterns-empty">
                <div className="empty-icon">🧶</div>
                <p>Нет узоров в проекте</p>
                <p className="hint">
                  Конвертируйте изображение или импортируйте готовый узор .swaga
                </p>
              </div>
            ) : (
              patterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className={`pattern-card ${selectedPattern?.id === pattern.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedPattern(pattern);
                  }}
                >
                  <div className="pattern-preview">
                    {pattern.pattern_data ? (
                      <img
                        src={createMiniPreview(pattern.pattern_data, pattern.width, pattern.height, 60)}
                        alt={pattern.name}
                        className="mini-pattern-preview"
                      />
                    ) : (
                      <span className="pattern-placeholder">🧶</span>
                    )}
                  </div>
                  <div className="pattern-info">
                    <h4>{pattern.name}</h4>
                    <span className="pattern-size">{pattern.width}×{pattern.height}</span>
                    <span className="pattern-format">
                      {pattern.file_path.endsWith('.swaga') ? '.swaga' : '.txt'}
                    </span>
                  </div>
                  <div className="pattern-actions">
                    <button
                      className={`btn-invert ${invertedPatternId === pattern.id ? "active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInvertPattern(pattern);
                      }}
                      title="Инвертировать цвета"
                    >
                      🔄
                    </button>
                    <button
                      className="btn-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePattern(pattern);
                      }}
                      title="Удалить узор"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pattern Preview */}
          {selectedPattern && (
            <div className="pattern-detail-panel">
              <h4>📋 {selectedPattern.name}</h4>
              <div className="pattern-info-grid">
                <span>📐 Размер: <strong>{selectedPattern.width}×{selectedPattern.height}</strong></span>
                <span>📄 Формат: <strong>{selectedPattern.file_path.endsWith('.swaga') ? '.swaga' : '.txt'}</strong></span>
                <span>📁 Путь: <strong>{selectedPattern.file_path}</strong></span>
              </div>
              <div className="pattern-canvas-wrapper">
                <canvas ref={canvasRef} className="pattern-canvas" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}
