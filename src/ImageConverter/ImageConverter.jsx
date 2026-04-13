import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import Croppie from "croppie";
import "croppie/croppie.css";
import useToast from "../Toast/useToast";
import "../Toast/Toast.css";
import "./ImageConverter.css";

export default function ImageConverter({ projectPath, projectId, onPatternCreated }) {
  const { addToast, ToastContainer } = useToast();
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImageInfo, setSourceImageInfo] = useState(null);
  const [pixelSize, setPixelSize] = useState(4);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  // Toast уведомления
  const [toasts, setToasts] = useState([]);
  // Croppie
  const croppieContainerRef = useRef(null);
  const croppieInstance = useRef(null);
  const [croppieVisible, setCroppieVisible] = useState(false);
  const [cropShape, setCropShape] = useState("square"); // "square" | "circle"
  const [viewportSize, setViewportSize] = useState({ width: 300, height: 300 });
  const [maxViewportSize, setMaxViewportSize] = useState({ width: 500, height: 500 });
  const [isCroppieInitializing, setIsCroppieInitializing] = useState(false);
  const [croppedCanvasCache, setCroppedCanvasCache] = useState(null);

  // Preview
  const [pixelatedPreview, setPixelatedPreview] = useState(null);
  const [converting, setConverting] = useState(false);

  // Modal
  const [modal, setModal] = useState({
    isOpen: false, title: "", message: "", type: "info",
    onConfirm: null, onCancel: null, showCancel: false,
    confirmText: "OK", cancelText: "Отмена",
  });

  const previewCanvasRef = useRef(null);

  const showModal = null; // Удаляем
  const showAlert = (message, type = "info") => addToast(message, type);
  const showConfirm = ({ title, message, onConfirm }) => {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm?.();
    }
  };

  // Выбор изображения
  const handleSelectImage = async () => {
    try {
      const selected = await open({
        title: "Выберите изображение для конвертации",
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp"] }]
      });

      if (selected) {
        const fileData = await readFile(selected);
        const blob = new Blob([fileData]);
        const blobUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          setSourceImage(img);
          setSourceImageInfo({ width: img.width, height: img.height, path: selected, blobUrl});
          // Clear cropped cache when new image is loaded
          setCroppedCanvasCache(null);
          // Обрезка по умолчанию свёрнута
          setCroppieVisible(false);
          // Устанавливаем максимальный размер области обрезки
          setMaxViewportSize({ width: img.width, height: img.height });
          // Устанавливаем начальный размер области (не больше изображения)
          const initWidth = Math.min(300, img.width);
          const initHeight = Math.min(300, img.height);
          setViewportSize({ width: initWidth, height: initHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          showAlert("Не удалось загрузить изображение", "error");
        };
        img.src = blobUrl;
      }
    } catch (err) {
      showAlert(`Ошибка выбора файла: ${err.message || err}`, "error");
    }
  };

  // Инициализация Croppie
  const initCroppie = useCallback(() => {
    if (!sourceImageInfo?.blobUrl || !croppieContainerRef.current) return;

    // Clear old cache when reinitializing
    setCroppedCanvasCache(null);

    // Безопасно уничтожаем старый экземпляр
    if (croppieInstance.current) {
      try {
        croppieInstance.current.destroy();
      } catch (e) {
        console.warn("Croppie destroy error:", e);
      }
      croppieInstance.current = null;
    }

    setIsCroppieInitializing(true);

    // Небольшая задержка чтобы DOM успел обновиться
    setTimeout(() => {
      if (!croppieContainerRef.current) return;

      try {
        // Ограничиваем размер Croppie чтобы не занимал весь экран
        const maxBoundarySize = 500;
        const boundaryWidth = Math.min(maxViewportSize.width, maxBoundarySize);
        const boundaryHeight = Math.min(maxViewportSize.height, maxBoundarySize);

        croppieInstance.current = new Croppie(croppieContainerRef.current, {
          viewport: {
            width: Math.min(viewportSize.width, boundaryWidth),
            height: Math.min(viewportSize.height, boundaryHeight),
            type: cropShape
          },
          boundary: { width: boundaryWidth, height: boundaryHeight },
          enableExif: true,
          enableZoom: true,
          enableOrientation: true,
          mouseWheelZoom: true,
          showZoomer: true,
          enableResize: true,
          resizeViewport: true,
        });

        croppieInstance.current.bind({
          url: sourceImageInfo.blobUrl,
        });
      } catch (e) {
        console.error("Croppie init error:", e);
      } finally {
        setIsCroppieInitializing(false);
      }
    }, 50);
  }, [sourceImageInfo, cropShape, viewportSize, maxViewportSize]);

  // Инициализация Croppie при изменении параметров
  useEffect(() => {
    if (croppieVisible && sourceImageInfo?.blobUrl) {
      initCroppie();
    }

    return () => {
      if (croppieInstance.current) {
        try {
          croppieInstance.current.destroy();
        } catch (e) {
          console.warn("Croppie cleanup error:", e);
        }
        croppieInstance.current = null;
      }
    };
  }, [croppieVisible, initCroppie]);

  // Сброс обрезки
  const handleResetCrop = () => {
    setCropShape("square");
    const initWidth = Math.min(300, sourceImageInfo?.width || 300);
    const initHeight = Math.min(300, sourceImageInfo?.height || 300);
    setViewportSize({ width: initWidth, height: initHeight });
    setTimeout(() => initCroppie(), 100);
  };

  // Очистка blob URL
  useEffect(() => {
    return () => {
      if (sourceImageInfo?.blobUrl) {
        URL.revokeObjectURL(sourceImageInfo.blobUrl);
      }
    };
  }, [sourceImageInfo]);

  // Применение фильтров
  const applyImageFilters = useCallback((img) => {
    if (!img) {
      console.warn("⚠️ applyImageFilters: img is null");
      return null;
    }

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    tempCanvas.width = img.width || 1;
    tempCanvas.height = img.height || 1;
    
    try {
      tempCtx.drawImage(img, 0, 0);
    } catch (e) {
      console.error("❌ drawImage error:", e);
      return null;
    }

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    const brightnessFactor = brightness;
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const saturationFactor = 1 + saturation / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      r += brightnessFactor;
      g += brightnessFactor;
      b += brightnessFactor;

      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + saturationFactor * (r - gray);
      g = gray + saturationFactor * (g - gray);
      b = gray + saturationFactor * (b - gray);

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    tempCtx.putImageData(imageData, 0, 0);
    return tempCanvas;
  }, [brightness, contrast, saturation]);

  // Обработка canvas (фильтры + пикселизация + превью)
  const processCanvas = useCallback((canvas) => {
    if (!canvas || !canvas.width || !canvas.height) {
      console.error("❌ processCanvas: canvas is invalid!", canvas);
      return;
    }

    console.log("🎨 processCanvas started:", canvas.width, "x", canvas.height);

    try {
      // Применяем фильтры
      const filteredCanvas = applyImageFilters(canvas);
      const source = filteredCanvas || canvas;

      if (!source || !source.width || !source.height) {
        console.error("❌ source is invalid after filtering!");
        return;
      }

      console.log("🎨 Source after filters:", source.width, "x", source.height);

      // Рассчитываем размер пикселя
      const targetWidth = Math.floor(source.width / pixelSize);
      const targetHeight = Math.floor(source.height / pixelSize);

      console.log("📐 Target size:", targetWidth, "x", targetHeight, "pixelSize:", pixelSize);

      // Проверка на ограничение 200 игл
      if (targetWidth > 200) {
        showAlert(
          `⚠️ Ширина узора (${targetWidth} пикселей) превышает лимит в 200 игл!\n\n` +
          `Увеличьте размер пикселя (сейчас: ${pixelSize}) или обрежьте изображение.`,
          "warning"
        );
        return;
      }

      // Создаём пикселизированное изображение
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      tempCanvas.width = targetWidth;
      tempCanvas.height = targetHeight;

      tempCtx.drawImage(source, 0, 0, targetWidth, targetHeight);

      // Конвертируем в Ч/Б
      const imageData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);
      const data = imageData.data;
      const rows = [];

      for (let y = 0; y < targetHeight; y++) {
        let row = "";
        for (let x = 0; x < targetWidth; x++) {
          const idx = (y * targetWidth + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const isDark = invert ? gray > threshold : gray < threshold;
          row += isDark ? "1" : "0";
        }
        rows.push(row);
      }

      console.log("✅ Generated", rows.length, "rows");

      // Отрисовываем пикселизированное превью
      const previewCanvas = previewCanvasRef.current;
      if (previewCanvas) {
        const ctx = previewCanvas.getContext("2d");
        const previewPixelSize = Math.max(2, Math.min(6, Math.floor(300 / Math.max(targetWidth, targetHeight))));
        previewCanvas.width = targetWidth * previewPixelSize;
        previewCanvas.height = targetHeight * previewPixelSize;

        const savedColors = localStorage.getItem('patternColors');
        const colors = savedColors ? JSON.parse(savedColors) : { dark: "#1e40af", light: "#e5e7eb" };

        for (let y = 0; y < targetHeight; y++) {
          for (let x = 0; x < targetWidth; x++) {
            ctx.fillStyle = rows[y][x] === "1" ? colors.dark : colors.light;
            ctx.fillRect(x * previewPixelSize, y * previewPixelSize, previewPixelSize, previewPixelSize);
          }
        }
        console.log("🎨 Preview drawn:", previewCanvas.width, "x", previewCanvas.height);
      }

      setPixelatedPreview({ rows, width: targetWidth, height: targetHeight });
    } catch (error) {
      console.error("❌ processCanvas error:", error);
      showAlert("Ошибка пикселизации изображения", "error");
    }
  }, [pixelSize, threshold, invert, brightness, contrast, saturation, applyImageFilters]);

const base64ToCanvas = (base64) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = base64;
  });
};
  // Пикселизация изображения
  // Пикселизация изображения
const pixelateImage = useCallback(async (useCroppie = true) => {
  if (!sourceImage) {
    console.log("⚠️ pixelateImage: sourceImage is null");
    return;
  }

  console.log("🎨 pixelateImage started, useCroppie:", useCroppie);

  let sourceCanvas = null;

  // ===== БЛОК CROPPIE =====
  if (useCroppie && croppieInstance.current) {
    try {
      console.log("✂️ Calling croppie.result()...");

      // 1. Ждём, пока Croppie будет готов (небольшая задержка)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Вызываем result с правильными опциями
      const result = await croppieInstance.current.result({
        type: "canvas",
        size: "viewport",
        format: "png",
        quality: 1
      });

      // 3. Проверяем и кэшируем результат
      if (result && result instanceof HTMLCanvasElement) {
        sourceCanvas = result;
        setCroppedCanvasCache(result);
      } else if (typeof result === "string") {
        // base64 fallback
        sourceCanvas = await base64ToCanvas(result);
        setCroppedCanvasCache(sourceCanvas);
      } else {
        console.warn("⚠️ Croppie returned invalid result, using cached or fallback");
        sourceCanvas = croppedCanvasCache;
      }

    } catch (e) {
      console.error("❌ Croppie error:", e.message);
      sourceCanvas = croppedCanvasCache;
    }
  }

  // ===== FALLBACK: cached cropped canvas or full source image =====
  if (!sourceCanvas) {
    if (croppedCanvasCache) {
      console.log("🖼️ Using cached cropped canvas");
      sourceCanvas = croppedCanvasCache;
    } else {
      console.log("🖼️ Using full source image");
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = sourceImage.naturalWidth || sourceImage.width;
      tempCanvas.height = sourceImage.naturalHeight || sourceImage.height;
      const ctx = tempCanvas.getContext("2d");
      ctx.drawImage(sourceImage, 0, 0);
      sourceCanvas = tempCanvas;
    }
  }

  // ===== Обработка канваса =====
  if (sourceCanvas) {
    console.log("🎨 Processing canvas:", sourceCanvas.width, "x", sourceCanvas.height);
    processCanvas(sourceCanvas);
  } else {
    console.error("❌ sourceCanvas is still null after all attempts!");
    showAlert("Не удалось обработать изображение", "error");
  }
}, [sourceImage, processCanvas]);

  // Автоматическая пикселизация при изменении фильтров (БЕЗ Croppie)
  useEffect(() => {
    if (!sourceImage) return;

    const timer = setTimeout(() => {
      pixelateImage(false); // false = не использовать Croppie, только фильтры
    }, 150);

    return () => clearTimeout(timer);
  }, [pixelSize, threshold, invert, brightness, contrast, saturation, sourceImage]);

  // Конвертация в .swaga
  const handleConvertToSwaga = async () => {
    if (!pixelatedPreview || !projectPath) {
      showAlert("Сначала выберите изображение и дождитесь загрузки проекта", "warning");
      return;
    }

    if (pixelatedPreview.width > 200) {
      showAlert(`Ширина узора (${pixelatedPreview.width}) превышает 200 игл! Увеличьте размер пикселя или обрежьте изображение.`, "error");
      return;
    }

    showConfirm({
      title: "Конвертировать в .swaga?",
      message: `Создать узор размером ${pixelatedPreview.width}×${pixelatedPreview.height} пикселей?`,
      confirmText: "Конвертировать",
      onConfirm: async () => {
        try {
          setConverting(true);

          const patternFileName = `pattern_${Date.now()}.swaga`;
          const outputPath = `${projectPath}/patterns/${patternFileName}`;

          const swagaContent = [
            "# swaga Pattern File",
            `# width=${pixelatedPreview.width}`,
            `# height=${pixelatedPreview.height}`,
            `# threshold=${threshold}`,
            `# invert=${invert}`,
            `# pixel_size=${pixelSize}`,
            `# brightness=${brightness}`,
            `# contrast=${contrast}`,
            `# saturation=${saturation}`,
            `# source=${sourceImageInfo?.path || "unknown"}`,
            "# end_header",
            ...pixelatedPreview.rows,
          ].join("\n");

          await invoke("create_dir", { path: `${projectPath}/patterns` }).catch(() => {});
          await writeTextFile(outputPath, swagaContent);

          try {
            await invoke("save_conversion", { req: {
              project_id: parseInt(projectId),
              source_image_path: sourceImageInfo?.path || "",
              source_width: sourceImageInfo?.width || 0,
              source_height: sourceImageInfo?.height || 0,
              status: "completed",
            }});
          } catch (e) {
            console.log("Failed to save conversion to DB:", e);
          }

          try {
            await invoke("save_pattern", { req: {
              name: patternFileName.replace(".swaga", ""),
              pattern_type: "pixel_art",
              width: pixelatedPreview.width,
              height: pixelatedPreview.height,
              pattern_data: pixelatedPreview.rows.join("\n"),
              category: "converted",
              source: sourceImageInfo?.path || "",
            }});
          } catch (e) {
            console.log("Failed to save pattern to DB:", e);
          }

          // Only show toast if parent doesn't handle onPatternCreated
          if (!onPatternCreated) {
            showAlert(`Узор создан!\n📐 Размер: ${pixelatedPreview.width}×${pixelatedPreview.height}\n📁 Файл: ${patternFileName}`, "success");
          }

          if (onPatternCreated) {
            onPatternCreated({
              name: patternFileName.replace(".swaga", ""),
              width: pixelatedPreview.width,
              height: pixelatedPreview.height,
              file_path: outputPath,
            });
          }

        } catch (error) {
          console.error("Conversion failed:", error);
          showAlert(`Ошибка конвертации: ${error.message || error}`, "error");
        } finally {
          setConverting(false);
        }
      },
    });
  };

  return (
    <div className="image-converter">
      <h4>🖼️ Конвертер изображений в узор</h4>
      <p className="converter-description">
        Загрузите изображение, обрежьте, настройте параметры и конвертируйте в .swaga узор
      </p>

      {/* Выбор изображения */}
      <div className="converter-section">
        <button className="btn-select-image" onClick={handleSelectImage}>
          📁 {sourceImage ? "Изменить изображение" : "Выбрать изображение"}
        </button>

        {sourceImageInfo && (
          <div className="source-image-info">
            <span>📄 {sourceImageInfo.path.split("/").pop()}</span>
            <span>📐 {sourceImageInfo.width}×{sourceImageInfo.height} px</span>
          </div>
        )}
      </div>

      {sourceImage && (
        <>
          {/* Croppie обрезка */}
          <div className="converter-section">
            <div className="section-header">
              <h5>✂️ Обрезка изображения</h5>
              <div className="crop-header-buttons">
                <button
                  className="btn-toggle-croppie"
                  onClick={() => setCroppieVisible(!croppieVisible)}
                >
                  {croppieVisible ? "🔼 Свернуть" : "🔽 Развернуть"}
                </button>
              </div>
            </div>

            {croppieVisible && (
              <>
                <div className="crop-controls-row">
                  <div className="crop-shape-buttons">
                    <button
                      className={`btn-crop-shape ${cropShape === "square" ? "active" : ""}`}
                      onClick={() => setCropShape("square")}
                    >
                      ⬜ Квадрат
                    </button>
                    <button
                      className={`btn-crop-shape ${cropShape === "circle" ? "active" : ""}`}
                      onClick={() => setCropShape("circle")}
                    >
                      ⭕ Круг
                    </button>
                  </div>
                  <button
                    className="btn-reset-crop"
                    onClick={handleResetCrop}
                  >
                    ↺ Сбросить
                  </button>
                </div>

                <div className="viewport-size-control">
                  <label>Размер области: {viewportSize.width}×{viewportSize.height}px</label>
                  <div className="viewport-size-sliders">
                    <div className="size-slider-item">
                      <span>Ширина:</span>
                      <input
                        type="range"
                        min="50"
                        max={maxViewportSize.width}
                        value={viewportSize.width}
                        onChange={(e) => setViewportSize(prev => ({ ...prev, width: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="size-slider-item">
                      <span>Высота:</span>
                      <input
                        type="range"
                        min="50"
                        max={maxViewportSize.height}
                        value={viewportSize.height}
                        onChange={(e) => setViewportSize(prev => ({ ...prev, height: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="croppie-container">
                  <div ref={croppieContainerRef} className="croppie-wrapper" />
                </div>

                <div className="crop-actions">
                  <button
                    className="btn-apply-crop"
                    onClick={async () => {
                      console.log("🔄 Applying crop...");
                      await pixelateImage(true);
                      // Don't show crop toast if width warning was already shown by processCanvas
                      setCroppieVisible(!croppieVisible);
                    }}
                  >
                    ✅ Применить обрезку
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Настройки изображения */}
          <div className="converter-section">
            <h5>🎨 Настройки изображения</h5>
            <div className="settings-grid">
              <div className="setting-item">
                <label>Яркость: {brightness > 0 ? `+${brightness}` : brightness}</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                />
              </div>
              <div className="setting-item">
                <label>Контраст: {contrast > 0 ? `+${contrast}` : contrast}</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                />
              </div>
              <div className="setting-item">
                <label>Насыщенность: {saturation > 0 ? `+${saturation}` : saturation}</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={saturation}
                  onChange={(e) => setSaturation(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Настройки пикселизации */}
          <div className="converter-section">
            <h5>🔲 Пикселизация</h5>
            <div className="settings-grid">
              <div className="setting-item">
                <label>Размер пикселя: {pixelSize}px</label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={pixelSize}
                  onChange={(e) => setPixelSize(Number(e.target.value))}
                />
                {pixelatedPreview && pixelatedPreview.width > 200 && (
                  <span className="setting-warning">
                    ⚠️ Ширина {pixelatedPreview.width} больше 200 игл!
                  </span>
                )}
              </div>
              <div className="setting-item">
                <label>Порог: {threshold}</label>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </div>
              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={invert}
                    onChange={(e) => setInvert(e.target.checked)}
                  />
                  Инвертировать цвета
                </label>
              </div>
            </div>

            {/* Информация о результате */}
            {pixelatedPreview && (
              <div className="result-info">
                <span>📐 Результат: <strong>{pixelatedPreview.width}×{pixelatedPreview.height}</strong> пикселей</span>
                <span>🧶 Чанков: <strong>{Math.ceil(pixelatedPreview.height / 4)}</strong> (по 4 ряда)</span>
              </div>
            )}
          </div>

          {/* Превью */}
          <div className="converter-section">
            <h5>👁️ Предпросмотр узора</h5>
            <div className="preview-container">
              <canvas ref={previewCanvasRef} className="pixelated-preview" />
            </div>
          </div>

          {/* Кнопка конвертации */}
          <div className="converter-actions">
            <button
              className="btn-convert-to-swaga"
              onClick={handleConvertToSwaga}
              disabled={converting || !pixelatedPreview || pixelatedPreview.width > 200}
            >
              {converting ? "⏳ Конвертация..." : "💾 Конвертировать в .swaga"}
            </button>
          </div>
        </>
      )}

      <ToastContainer />
    </div>
  );
}
