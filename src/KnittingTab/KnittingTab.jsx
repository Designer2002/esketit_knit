import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./KnittingTab.css";
import esp_connect from "../assets/sounds/esp_connect.mp3"
import knit_complete from "../assets/sounds/knit_complete.mp3"

export default function KnittingTab({ projectId, garmentTypeId, selectedPatternFromPatterns, onSelectPatternFromGallery }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [patternData, setPatternData] = useState(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState("dark-blue");
  const [projectPath, setProjectPath] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [showPatternGallery, setShowPatternGallery] = useState(false);
  
  // Настройки цветов паттерна
  const [patternColors, setPatternColors] = useState(() => {
    // Загружаем сохранённые цвета из localStorage
    const saved = localStorage.getItem('patternColors');
    return saved ? JSON.parse(saved) : {
      dark: "#1e40af",
      light: "#e5e7eb",
    };
  });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [previewKey, setPreviewKey] = useState(0); // Для принудительной перерисовки canvas
  
  // Сохранение цветов при изменении
  useEffect(() => {
    localStorage.setItem('patternColors', JSON.stringify(patternColors));
  }, [patternColors]);

  // HTTP сервер
  const [httpServer, setHttpServer] = useState({
    running: false,
    port: 6666,
    serverIp: "",
    connected: false,
    isEspConnected: false, // ESP32 подключился хотя бы раз
    currentRow: 0,
    currentDirection: "right", // "left" или "right"
    totalRows: 0,
    progressPercent: 0,
    chunksSent: 0,
    maxSentRow: 0,
  });

  const [computerIp, setComputerIp] = useState("");
  const canvasRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const hasShownCompletionNotification = useRef(false); // Чтобы показать уведомление только один раз
  const hasPlayedConnectSound = useRef(false); // Чтобы звук подключения сыграл только один раз
  
  // Toast уведомления
  const [toasts, setToasts] = useState([]);
  
  // Звуки
  const connectSoundRef = useRef(null);
  const completeSoundRef = useRef(null);
  
  // Сохранённый прогресс вязания
  const [savedProgress, setSavedProgress] = useState(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  // Modal
  const [modal, setModal] = useState({
    isOpen: false, title: "", message: "", type: "info",
    onConfirm: null, onCancel: null, showCancel: false,
    confirmText: "OK", cancelText: "Отмена",
  });

  const previewCanvasRef = useRef(null);

  const showModal = ({ title, message, type = "info", onConfirm, onCancel, showCancel = false, confirmText = "OK", cancelText = "Отмена" }) => {
    setModal({ isOpen: true, title, message, type, onConfirm, onCancel, showCancel, confirmText, cancelText });
  };
  const showAlert = (message, type = "info") => {
    showModal({ title: type === "error" ? "Ошибка" : type === "success" ? "Успех" : "Внимание", message, type });
  };

  // Получение IP компьютера при загрузке
  useEffect(() => {
    const fetchIp = async () => {
      try {
        const ip = await invoke("get_computer_ip");
        setComputerIp(ip);
      } catch (err) {
        console.error("Failed to get IP:", err);
        setComputerIp("192.168.1.100");
      }
    };
    fetchIp();
  }, []);

  // Загрузка звуков
  useEffect(() => {
    // Звук подключения ESP
    connectSoundRef.current = new Audio(esp_connect);
    connectSoundRef.current.volume = 0.5;
    
    // Звук завершения вязания
    completeSoundRef.current = new Audio(knit_complete);
    completeSoundRef.current.volume = 0.7;
  }, []);

  // Функция добавления toast-уведомления
  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = `knitting-toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  // Функция воспроизведения звука
  const playSound = useCallback((soundRef) => {
    if (soundRef && soundRef.current) {
      soundRef.current.currentTime = 0;
      soundRef.current.play().catch(e => console.log("Sound play error:", e));
    }
  }, []);

  // Send ESP restart signal when pattern changes while server is running
  useEffect(() => {
    if (patternData && httpServer.running) {
      invoke("send_esp_restart_signal").catch((e) => {
        console.log("ESP restart signal not sent:", e);
      });
    }
  }, [patternData, httpServer.running]);

  // Отрисовка паттерна на canvas
  const drawPatternPreview = useCallback((rows, width, height, currentRow = 0, direction = "right") => {
    console.log("🎨 drawPatternPreview called:", { rows: rows?.length, width, height, currentRow, direction });
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn("⚠️ canvasRef.current is null!");
      return;
    }
    if (!rows || rows.length === 0) {
      console.warn("⚠️ rows is empty!");
      return;
    }

    const ctx = canvas.getContext("2d");
    const maxCanvasSize = 400;

    // Рассчитываем размер ячейки так, чтобы паттерн влезал в canvas
    const cellSize = Math.max(1, Math.floor(maxCanvasSize / Math.max(width, height)));
    console.log("📐 cellSize:", cellSize, "canvas:", width * cellSize, "x", height * cellSize);

    // Устанавливаем размер canvas по размеру паттерна
    canvas.width = Math.min(width * cellSize, maxCanvasSize);
    canvas.height = Math.min(height * cellSize, maxCanvasSize);

    // Очистка
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Рассчитываем видимую область для больших паттернов
    const visibleWidth = Math.floor(canvas.width / cellSize);
    const visibleHeight = Math.floor(canvas.height / cellSize);
    const startX = Math.max(0, Math.floor((width - visibleWidth) / 2));
    const startY = Math.max(0, Math.floor((height - visibleHeight) / 2));

    console.log("🔍 Drawing", visibleWidth, "x", visibleHeight, "pixels from", startX, startY);

    // Отрисовка рядов с использованием выбранных цветов
    let pixelsDrawn = 0;
    for (let y = 0; y < visibleHeight && (startY + y) < height; y++) {
      const row = rows[startY + y];
      if (!row) continue; // Пропускаем если ряд не существует
      for (let x = 0; x < visibleWidth && (startX + x) < width; x++) {
        const pixelIndex = startX + x;
        if (row[pixelIndex]) {
          // Тёмный пиксель (узор) - используем выбранный цвет
          ctx.fillStyle = patternColors.dark;
        } else {
          // Светлый пиксель (фон) - используем выбранный цвет
          ctx.fillStyle = patternColors.light;
        }
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        pixelsDrawn++;
      }
    }

    console.log("✅ Drew", pixelsDrawn, "pixels");

    // Подсветка текущей позиции с направлением
    if (currentRow > 0) {
      const adjustedRow = currentRow - startY;
      const yPos = adjustedRow * cellSize;

      if (yPos >= 0 && yPos <= canvas.height) {
        // Цвет линии зависит от направления
        ctx.strokeStyle = direction === "right" ? "#22c55e" : "#3b82f6";
        ctx.lineWidth = 3;

        // Рисуем линию
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(canvas.width, yPos);
        ctx.stroke();

        // Рисуем стрелку направления
        const arrowSize = 10;
        ctx.fillStyle = direction === "right" ? "#22c55e" : "#3b82f6";

        if (direction === "right") {
          // Стрелка вправо
          ctx.beginPath();
          ctx.moveTo(canvas.width - 5, yPos);
          ctx.lineTo(canvas.width - 5 - arrowSize, yPos - arrowSize / 2);
          ctx.lineTo(canvas.width - 5 - arrowSize, yPos + arrowSize / 2);
          ctx.closePath();
          ctx.fill();
        } else {
          // Стрелка влево
          ctx.beginPath();
          ctx.moveTo(5, yPos);
          ctx.lineTo(5 + arrowSize, yPos - arrowSize / 2);
          ctx.lineTo(5 + arrowSize, yPos + arrowSize / 2);
          ctx.closePath();
          ctx.fill();
        }

        // Текст с номером ряда
        ctx.fillStyle = "#000";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(
          `Ряд ${currentRow} ${direction === "right" ? "→" : "←"}`,
          5,
          yPos - 5
        );
      }
    }

    // Добавляем информацию о масштабе для больших паттернов
    if (width > visibleWidth || height > visibleHeight) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.font = "12px sans-serif";
      ctx.fillText(
        `Показано: ${visibleWidth}×${visibleHeight} из ${width}×${height}`,
        5,
        canvas.height - 5
      );
    }
  }, [patternColors]);

  // Ключ для localStorage (уникальный для каждого проекта)
  const getProgressKey = useCallback(() => {
    return `knitting_progress_${projectId}`;
  }, [projectId]);

  // Загрузка сохранённого прогресса при монтировании
  useEffect(() => {
    if (!projectId || !patternData) return;
    
    const key = getProgressKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const progress = JSON.parse(saved);
        // Проверяем что прогресс актуален (тот же проект и тот же узор)
        if (progress.patternWidth === patternData.width &&
            progress.patternHeight === patternData.height) {
          setSavedProgress(progress);
          console.log("📂 Найден сохранённый прогресс:", progress);
        } else {
          console.log("🗑️ Найденный прогресс не актуален, удаляем");
          localStorage.removeItem(key);
          setSavedProgress(null);
        }
      } catch (e) {
        console.error("Ошибка загрузки прогресса:", e);
      }
    } else {
      setSavedProgress(null);
    }
  }, [projectId, patternData?.width, patternData?.height, getProgressKey]);

  // Сохранить прогресс
  const saveProgress = useCallback(() => {
    if (!patternData || !httpServer.running) {
      showAlert("Сначала запустите вязание", "warning");
      return;
    }

    const progress = {
      currentRow: httpServer.currentRow,
      currentDirection: httpServer.currentDirection,
      maxSentRow: httpServer.maxSentRow,
      totalRows: httpServer.totalRows,
      patternWidth: patternData.width,
      patternHeight: patternData.height,
      savedAt: new Date().toISOString(),
    };

    const key = getProgressKey();
    localStorage.setItem(key, JSON.stringify(progress));
    setSavedProgress(progress);

    addToast(`💾 Прогресс сохранён! Ряд ${progress.currentRow}/${progress.totalRows}`, "success", 4000);
    console.log("💾 Прогресс сохранён:", progress);
  }, [patternData, httpServer.running, httpServer.currentRow, httpServer.currentDirection, httpServer.maxSentRow, httpServer.totalRows, getProgressKey, addToast, showAlert]);
 const showConfirm = useCallback(({
    title, message, onConfirm, onCancel,
    confirmText = "Да", cancelText = "Нет"
  }) => {
    showModal({
      title, message, type: "confirm", onConfirm, onCancel,
      showCancel: true, confirmText, cancelText
    });
  }, [showModal]);
  // Восстановить прогресс
  const restoreProgress = useCallback(() => {
    if (!savedProgress) {
      showAlert("Нет сохранённого прогресса", "warning");
      return;
    }

    showConfirm({
      title: "🔄 Восстановить прогресс?",
      message: `Продолжить вязание с ряда ${savedProgress.currentRow}/${savedProgress.totalRows}?\n\nНаправление: ${savedProgress.currentDirection === "right" ? "→ вправо" : "← влево"}\nСохранено: ${new Date(savedProgress.savedAt).toLocaleString("ru-RU")}`,
      confirmText: "Восстановить и запустить",
      cancelText: "Отмена",
      onConfirm: async () => {
        try {
          // Обновляем локальное состояние
          setHttpServer(prev => ({
            ...prev,
            running: true,
            currentRow: savedProgress.currentRow,
            currentDirection: savedProgress.currentDirection,
            maxSentRow: savedProgress.maxSentRow,
            totalRows: savedProgress.totalRows,
            progressPercent: Math.round((savedProgress.currentRow / savedProgress.totalRows) * 100),
            serverIp: computerIp,
          }));

          // Перерисовываем превью
          if (patternData) {
            drawPatternPreview(
              patternData.rows,
              patternData.width,
              patternData.height,
              savedProgress.currentRow,
              savedProgress.currentDirection
            );
          }

          // Запускаем сервер
          const result = await invoke("start_esp32_http_server", {
            patternRows: patternData.rows,
            patternWidth: patternData.width,
            patternHeight: patternData.height,
            chunkSize: 4,
            port: 6666,
          }).catch(async (err) => {
            // Если сервер не запустился из-за занятого порта, пробуем перезапустить
            if (err.message && err.message.includes("Address already in use")) {
              console.log("🔄 Порт занят, пробуем перезапустить сервер...");
              
              // Останавливаем старый сервер
              await invoke("stop_esp32_http_server").catch(() => {});
              
              // Ждём немного
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Пробуем снова
              return await invoke("start_esp32_http_server", {
                patternRows: patternData.rows,
                patternWidth: patternData.width,
                patternHeight: patternData.height,
                chunkSize: 4,
                port: 6666,
              });
            }
            throw err;
          });

          console.log("HTTP server started:", result);

          // Восстанавливаем прогресс на сервере
          await invoke("restore_knitting_progress", {
            projectId: parseInt(projectId),
            currentRow: savedProgress.currentRow,
            currentDirection: savedProgress.currentDirection,
            maxSentRow: savedProgress.maxSentRow,
          });

          console.log("🔄 Прогресс восстановлен на сервере: ряд", savedProgress.currentRow);

          // Запускаем опрос статуса
          startStatusPolling();

          addToast(`Прогресс восстановлен! Ряд ${savedProgress.currentRow}/${savedProgress.totalRows}`, "success", 5000);
          setShowRestorePrompt(false);
        } catch (error) {
          console.error("Ошибка восстановления прогресса:", error);
          showAlert(`Ошибка восстановления: ${error.message || error}`, "error");
        }
      },
    });
  }, [savedProgress, patternData, drawPatternPreview, addToast, showAlert, showConfirm, computerIp]);

  // Удалить сохранённый прогресс
  const deleteSavedProgress = useCallback(() => {
    const key = getProgressKey();
    localStorage.removeItem(key);
    setSavedProgress(null);
    setShowRestorePrompt(false);
    addToast("🗑️ Сохранённый прогресс удалён", "info", 3000);
  }, [getProgressKey, addToast]);

  // Сбросить прогресс (отправить ESP32 чанк с reset: true)
  const resetProgress = useCallback(() => {
    if (!httpServer.running) {
      showAlert("Сначала запустите вязание", "warning");
      return;
    }

    showConfirm({
      title: "⚠️ Сбросить прогресс вязания?",
      message: `Это отправит ESP32 команду сброса и начнёт вязание сначала!\n\nТекущий ряд: ${httpServer.currentRow}/${httpServer.totalRows}\n\nВсе несохранённые данные будут потеряны.`,
      confirmText: "Сбросить",
      cancelText: "Отмена",
      onConfirm: async () => {
        try {
          // Вызываем Rust команду для сброса
          const resetData = await invoke("reset_knitting_progress");

          console.log("🔄 Прогресс сбролен:", resetData);

          // Обновляем локальное состояние
          setHttpServer(prev => ({
            ...prev,
            currentRow: 0,
            currentDirection: "right",
            maxSentRow: 0,
            progressPercent: 0,
            chunksSent: 0,
          }));

          // Очищаем сохранённый прогресс
          const key = getProgressKey();
          localStorage.removeItem(key);
          setSavedProgress(null);

          // Отправляем сигнал перезагрузки ESP через сервер
          try {
            await invoke("send_esp_restart_signal");
            console.log("🔄 ESP restart signal sent after progress reset");
          } catch (e) {
            console.log("ESP restart signal not sent (server may not be running):", e);
          }

          // Перерисовываем превью
          if (patternData) {
            drawPatternPreview(patternData.rows, patternData.width, patternData.height, 0, "right");
          }

          addToast("Прогресс сброшен! Начинаем сначала.", "warning", 5000);
        } catch (error) {
          console.error("Ошибка сброса прогресса:", error);
          showAlert(`Ошибка сброса: ${error.message || error}`, "error");
        }
      },
    });
  }, [httpServer.running, httpServer.currentRow, httpServer.totalRows, patternData, drawPatternPreview, getProgressKey, addToast, showAlert, showConfirm]);

  // Загрузка темы
  useEffect(() => {
    invoke("get_theme").then(setTheme).catch(() => {});
  }, []);
  
  // Загрузка проекта и узоров
  useEffect(() => {
    const loadProjectAndPatterns = async () => {
      try {
        const projectData = await invoke("open_project_by_id", {
          projectId: parseInt(projectId)
        });
        setProjectPath(projectData.file_path);
        
        // Загружаем узоры из папки patterns
        const patternsDir = `${projectData.file_path}/patterns`;
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
        console.error("Failed to load project:", error);
      }
    };

    if (projectId) {
      loadProjectAndPatterns();
    }
  }, [projectId]);
  
  // Обработка выбранного узора из PatternsTab
  useEffect(() => {
    if (selectedPatternFromPatterns && selectedPatternFromPatterns.pattern_data) {
      const pattern = selectedPatternFromPatterns;
      const rows = pattern.pattern_data;
      const width = pattern.width;
      const height = pattern.height;

      setPatternData({ rows, width, height, format: "from_patterns" });

      // Принудительно перерисовываем превью после установки данных
      setTimeout(() => {
        drawPatternPreview(rows, width, height, 0, "right");
      }, 50);
    }
  }, [selectedPatternFromPatterns, drawPatternPreview]);
  

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
  
  // Выбор узора из галереи
  const handleSelectPatternFromGallery = (pattern) => {
    const rows = pattern.pattern_data;
    const width = pattern.width;
    const height = pattern.height;
    
    setPatternData({ rows, width, height, format: "from_gallery" });
    setShowPatternGallery(false);

    // Принудительно перерисовываем превью после установки данных
    setTimeout(() => {
      drawPatternPreview(rows, width, height, 0, "right");
    }, 50);

    if (onSelectPatternFromGallery) {
      onSelectPatternFromGallery(pattern);
    }
  };

  // Выбор файла через диалог
  const handleSelectImage = async () => {
    try {
      const selected = await open({
        title: "Выберите изображение для узора",
        multiple: false,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "bmp", "gif"]
        }]
      });

      if (selected) {
        setSelectedImage(selected);
        setError(null);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
      setError(err.message || "Не удалось выбрать изображение");
    }
  };

  // Конвертация изображения в паттерн (0 и 1)
  const handleConvertAndLoad = async () => {
    if (!selectedImage) return;

    try {
      setConverting(true);
      setError(null);

      // Получаем путь к папке проекта
      const projectData = await invoke("open_project_by_id", {
        projectId: parseInt(projectId)
      });

      const projectFolderPath = projectData.file_path;
      const patternFileName = `pattern_${Date.now()}.swaga`;
      const outputPath = `${projectFolderPath}/patterns/${patternFileName}`;

      
      const result = await invoke("convert_image_to_pattern", {
        req: {
          image_path: selectedImage,
          output_path: outputPath,
          mirror_horizontal: false,
          threshold: 128,
          invert: true,
          pattern_char_dark: "1",
          pattern_char_light: "0",
        }
      });

      if (!result.success) {
        throw new Error(result.error || "Конвертация не удалась");
      }

      // Парсим результат
      const rows = result.preview_lines.map(line =>
        line.split('').map(char => char === "1")
      );

      const width = result.width;
      const height = result.height;

      const parsed = { rows, width, height, format: "converted" };
      setPatternData(parsed);

      // Рисуем превью
      drawPatternPreview(rows, width, height, 0, "right");

    } catch (err) {
      console.error("Conversion failed:", err);
      setError(err.message || "Не удалось конвертировать изображение");
    } finally {
      setConverting(false);
    }
  };

  
  // Запуск HTTP сервера
  const startHttpServer = async () => {
    if (!patternData) return;

    // Проверяем наличие узоров на выкройке и показываем подсказку про датчики
    try {
      const stamps = await invoke("get_blueprint_pattern_stamps", { projectId }).catch(() => []);
      if (stamps && stamps.length > 0) {
        // Находим самый широкий узор в выкройке
        const widestStamp = stamps.reduce((max, s) => s.width > max.width ? s : max, stamps[0]);
        const patternName = stamps.find(s => s.id === widestStamp.pattern_id)?.name || '#' + widestStamp.pattern_id;
        // Добавляем toast через существующую систему
        addToast(
          `📐 Датчики: выставьте на ширину самого широкого узора — ${widestStamp.width} п. (${patternName}). Вязание по ${patternData.width} п.`,
          "info",
          8000
        );
      }
    } catch (e) {
      // Если blueprint таблицы нет — ничего страшного, вяжем как обычно
      console.log("Blueprint stamps not available, knitting normally");
    }

    // Показываем модалку с подтверждением
    const confirmStart = window.confirm(
      "🧶 Начать вязание?\n\n" +
      "Убедитесь, что:\n" +
      "• ESP32 включен и подключён к WiFi\n" +
      `• IP адрес ESP32 настроен на: ${computerIp}\n` +
      "• Нить заправлена в машину\n\n" +
      "Нажмите OK для запуска или Отмена для отмены."
    );

    if (!confirmStart) return;

    try {
      // Сбрасываем прогресс перед новым запуском
      setHttpServer(prev => ({
        ...prev,
        currentRow: 0,
        progressPercent: 0,
        chunksSent: 0,
        connected: false,
      }));

      const result = await invoke("start_esp32_http_server", {
        patternRows: patternData.rows,
        patternWidth: patternData.width,
        patternHeight: patternData.height,
        chunkSize: 4,
        port: 6666,
      }).catch(async (err) => {
        // Если сервер не запустился из-за занятого порта, пробуем перезапустить
        if (err.message && err.message.includes("Address already in use")) {
          console.log("🔄 Порт занят, пробуем перезапустить сервер...");
          
          // Останавливаем старый сервер
          await invoke("stop_esp32_http_server").catch(() => {});
          
          // Ждём немного
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Пробуем снова
          return await invoke("start_esp32_http_server", {
            patternRows: patternData.rows,
            patternWidth: patternData.width,
            patternHeight: patternData.height,
            chunkSize: 4,
            port: 6666,
          });
        }
        throw err;
      });

      console.log("HTTP server started:", result);

      setHttpServer(prev => ({
        ...prev,
        running: true,
        serverIp: computerIp,
        totalRows: patternData.height,
      }));

      // Запускаем опрос статуса
      startStatusPolling();

    } catch (err) {
      console.error("Failed to start HTTP server:", err);
      setError(err.message || "Не удалось запустить сервер");
      showAlert("Ошибка запуска сервера: " + err.message, "error");
    }
  };

  // Остановка сервера
  const stopHttpServer = async () => {
    try {
      await invoke("stop_esp32_http_server");
      setHttpServer(prev => ({ ...prev, running: false }));
      stopStatusPolling();
      // Сбрасываем флаг чтобы при следующем запуске уведомление снова показалось
      hasShownCompletionNotification.current = false;
    } catch (err) {
      console.error("Failed to stop server:", err);
    }
  };

  // Опрос статуса сервера
  const startStatusPolling = () => {
    // Сбрасываем флаги при новом запуске
    hasShownCompletionNotification.current = false;
    hasPlayedConnectSound.current = false;

    // Track pattern width for change detection
    let lastPatternWidth = patternData?.width || 0;
    let lastStampPatternId = null;

    stopStatusPolling();

    statusIntervalRef.current = setInterval(async () => {
      try {
        // Получаем информацию о текущем ряде
        const rowInfo = await invoke("get_current_row_info");

        const current = rowInfo.row || 0;
        const direction = rowInfo.direction || "right";
        const total = rowInfo.total || 0;
        const isEspConnected = rowInfo.is_esp_connected || false;
        const maxSentRow = rowInfo.max_sent_row || 0;

        // Check for blueprint pattern stamp width changes
        try {
          const stamps = await invoke("get_blueprint_pattern_stamps", { projectId }).catch(() => []);
          if (stamps && stamps.length > 0) {
            // Find which stamp (if any) covers the current row
            // Convert knitting row to SVG y coordinate
            const svgY = total - current;
            let currentStamp = null;
            for (const stamp of stamps) {
              const posY = stamp.position_y;
              const h = stamp.height;
              if (svgY >= posY && svgY < posY + h) {
                currentStamp = stamp;
                break;
              }
            }

            if (currentStamp) {
              if (lastStampPatternId !== currentStamp.pattern_id) {
                // New pattern started
                lastStampPatternId = currentStamp.pattern_id;
                if (lastPatternWidth !== 0 && lastPatternWidth !== currentStamp.width) {
                  addToast(
                    `📐 Датчики: ширина узора изменилась с ${lastPatternWidth} на ${currentStamp.width} п.`,
                    "warning",
                    5000
                  );
                }
                lastPatternWidth = currentStamp.width;
              }
            } else if (lastStampPatternId !== null) {
              // Exited pattern area
              lastStampPatternId = null;
              lastPatternWidth = patternData?.width || 0;
            }
          }
        } catch (e) {
          // Blueprint not available, ignore
        }

        if (total > 0) {
          const progress = Math.round((current / total) * 100);
          const chunksSent = Math.ceil(maxSentRow / 4);

          // Проверяем, подключился ли ESP32 (используем флаг с сервера)
          const connected = isEspConnected;

          // Если ESP только что подключился - показываем уведомление и играем звук
          if (isEspConnected && !hasPlayedConnectSound.current) {
            hasPlayedConnectSound.current = true;
            console.log("🔌 ESP32 подключён!");
            addToast("🔌 ESP32 подключён!", "success", 3000);
            playSound(connectSoundRef);
          }

          setHttpServer(prev => ({
            ...prev,
            running: true,
            currentRow: current,
            currentDirection: direction,
            totalRows: total,
            progressPercent: progress,
            chunksSent,
            connected,
            isEspConnected,
            maxSentRow,
          }));

          // Обновляем canvas с новой позицией
          if (patternData) {
            drawPatternPreview(patternData.rows, patternData.width, patternData.height, current, direction);
          }

          // Проверяем завершение вязания (ряд >= total)
          if (current >= total && total > 0 && !hasShownCompletionNotification.current) {
            hasShownCompletionNotification.current = true;
            console.log("✅ Вязание завершено!");
            
            // Показываем toast-уведомление
            addToast(`Вязание завершено! Все ${total} рядов связаны!`, "success", 8000);
            
            // Играем звук завершения
            playSound(completeSoundRef);
          }
        }
      } catch (err) {
        console.error("Status poll failed:", err);
        // Не останавливаем сервер при ошибке polling - продолжаем попытки
      }
    }, 1000);
  };

  const stopStatusPolling = () => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  };

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      stopStatusPolling();
      hasShownCompletionNotification.current = false;
    };
  }, []);

  // Перерисовка при изменении currentRow и direction
  useEffect(() => {
    if (patternData && canvasRef.current) {
      drawPatternPreview(
        patternData.rows,
        patternData.width,
        patternData.height,
        httpServer.currentRow,
        httpServer.currentDirection
      );
    }
  }, [httpServer.currentRow, httpServer.currentDirection, patternData, drawPatternPreview]);

  // Перерисовка при появлении patternData (когда узор выбран)
  useEffect(() => {
    console.log("🎨 patternData useEffect:", patternData ? `${patternData.width}x${patternData.height}` : "null");
    console.log("🖼️ canvasRef.current:", canvasRef.current);
    
    if (!patternData) {
      console.log("⚠️ patternData is null, skipping");
      return;
    }
    
    // Небольшая задержка чтобы DOM успел обновиться
    const timer = setTimeout(() => {
      console.log("🎨 setTimeout callback, canvasRef:", canvasRef.current);
      
      if (!canvasRef.current) {
        console.warn("⚠️ canvasRef.current is still null after timeout!");
        return;
      }
      
      console.log("🎨 Drawing preview...");
      drawPatternPreview(
        patternData.rows,
        patternData.width,
        patternData.height,
        httpServer.currentRow,
        httpServer.currentDirection
      );
    }, 200);
    
    return () => clearTimeout(timer);
  }, [patternData]);

  // Перерисовка при изменении цветов паттерна
  useEffect(() => {
    if (patternData && canvasRef.current) {
      drawPatternPreview(
        patternData.rows,
        patternData.width,
        patternData.height,
        httpServer.currentRow,
        httpServer.currentDirection
      );
    }
  }, [patternColors, patternData, drawPatternPreview, httpServer.currentRow, httpServer.currentDirection]);
  
  // Создание мини-превью для галереи
  const createMiniPreview = useCallback((rows, width, height, size = 60) => {
    if (!rows || rows.length === 0) return '';
    
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
          ctx.fillStyle = patternColors.dark;
        } else {
          ctx.fillStyle = patternColors.light;
        }
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    
    return miniCanvas.toDataURL('image/png');
  }, [patternColors]);

  return (
    <div className="knitting-tab">
      {/* Выбор узора из галереи */}
      <div className="pattern-gallery-selection">
        <h4>🧶 Выберите узор для вязания</h4>
        
        {!showPatternGallery ? (
          <button
            className="btn-open-gallery"
            onClick={() => setShowPatternGallery(true)}
            disabled={patterns.length === 0}
          >
            📂 {patternData ? "Изменить узор" : "Выбрать узор из галереи"}
          </button>
        ) : (
          <div className="gallery-modal">
            <div className="gallery-header">
              <h5>📐 Галерея узоров ({patterns.length})</h5>
              <button
                className="btn-close-gallery"
                onClick={() => setShowPatternGallery(false)}
              >
                ✕
              </button>
            </div>
            <div className="gallery-grid">
              {patterns.length === 0 ? (
                <div className="gallery-empty">
                  <p>Нет доступных узоров</p>
                  <p className="hint">Создайте узор во вкладке "Узоры"</p>
                </div>
              ) : (
                patterns.map((pattern) => (
                  <div
                    key={pattern.id}
                    className={`gallery-pattern-card ${patternData?.width === pattern.width && patternData?.height === pattern.height ? 'selected' : ''}`}
                    onClick={() => handleSelectPatternFromGallery(pattern)}
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
                    <div className="gallery-pattern-info">
                      <h6>{pattern.name}</h6>
                      <span className="gallery-pattern-size">{pattern.width}×{pattern.height}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {patternData && !showPatternGallery && (
          <div className="selected-pattern-info">
            <span className="selected-pattern-name">
              ✅ Выбран узор: <strong>{patternData.format === "from_patterns" ? selectedPatternFromPatterns?.name : 'Из галереи'}</strong>
            </span>
            <span className="selected-pattern-size">
              📐 Размер: {patternData.width}×{patternData.height}
            </span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="knitting-toolbar">
        <button
          className="btn-color-palette"
          onClick={() => setShowColorPicker(!showColorPicker)}
          type="button"
          title="Настроить цвета узора"
        >
          🎨 Цвета
        </button>

        {/* Кнопки сохранения/восстановления прогресса */}
        {httpServer.running && (
          <>
            <button
              className="btn-save-progress"
              onClick={saveProgress}
              type="button"
              title="Сохранить текущий прогресс вязания"
            >
              💾 Сохранить прогресс
            </button>

            <button
              className="btn-reset-progress"
              onClick={resetProgress}
              type="button"
              title="Сбросить прогресс и начать сначала"
            >
              ⚠️ Сбросить прогресс
            </button>
          </>
        )}

        {savedProgress && !httpServer.running && (
          <button
            className="btn-restore-progress"
            onClick={restoreProgress}
            type="button"
            title={`Восстановить прогресс: ряд ${savedProgress.currentRow}/${savedProgress.totalRows}`}
          >
            🔄 Восстановить прогресс
          </button>
        )}

        {savedProgress && !httpServer.running && (
          <button
            className="btn-delete-progress"
            onClick={deleteSavedProgress}
            type="button"
            title="Удалить сохранённый прогресс"
          >
            🗑️
          </button>
        )}

        {httpServer.running ? (
          <button className="btn-stop" onClick={stopHttpServer}>
            ⏹️ Завершить
          </button>
        ) : (
          <button
            className="btn-start-knitting"
            onClick={() => {
              if (!patternData) {
                addToast("Сначала выберите или создайте узор!", "error", 4000);
                return;
              }
              startHttpServer();
            }}
            title={!patternData ? "Сначала выберите узор" : "Начать вязание"}
          >
            ▶️ НАЧАТЬ ВЯЗАНИЕ
          </button>
        )}

        {computerIp && (
          <div className="ip-display">
            📡 IP сервера: <code>{httpServer.serverIp || computerIp}:6666</code>
          </div>
        )}
      </div>

      {/* Информация о сохранённом прогрессе */}
      {savedProgress && !httpServer.running && (
        <div className="saved-progress-info">
          <div className="progress-info-header">
            <span className="progress-icon">💾</span>
            <span className="progress-title">Сохранённый прогресс</span>
          </div>
          <div className="progress-details">
            <span>Ряд: <strong>{savedProgress.currentRow}/{savedProgress.totalRows}</strong></span>
            <span>Направление: <strong>{savedProgress.currentDirection === "right" ? "→ вправо" : "← влево"}</strong></span>
            <span>Сохранено: <strong>{new Date(savedProgress.savedAt).toLocaleString("ru-RU")}</strong></span>
          </div>
        </div>
      )}

      {/* Палитра цветов */}
      {showColorPicker && patternData && (
        <div className="color-picker-panel">
          <h5>🎨 Настройка цветов узора</h5>
          <div className="color-picker-grid">
            <div className="color-picker-item">
              <label>Тёмный (узор):</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={patternColors.dark}
                  onChange={(e) => setPatternColors(prev => ({ ...prev, dark: e.target.value }))}
                  className="color-picker-input"
                />
                <input
                  type="text"
                  value={patternColors.dark}
                  onChange={(e) => setPatternColors(prev => ({ ...prev, dark: e.target.value }))}
                  className="color-text-input"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div className="color-picker-item">
              <label>Светлый (фон):</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={patternColors.light}
                  onChange={(e) => setPatternColors(prev => ({ ...prev, light: e.target.value }))}
                  className="color-picker-input"
                />
                <input
                  type="text"
                  value={patternColors.light}
                  onChange={(e) => setPatternColors(prev => ({ ...prev, light: e.target.value }))}
                  className="color-text-input"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>
            <div className="color-picker-presets">
              <span className="preset-label">Предустановки:</span>
              <div className="preset-buttons">
                <button onClick={() => setPatternColors({ dark: "#1e40af", light: "#e5e7eb" })}>
                  🔵 Синий
                </button>
                <button onClick={() => setPatternColors({ dark: "#000000", light: "#ffffff" })}>
                  ⚫ Ч/Б
                </button>
                <button onClick={() => setPatternColors({ dark: "#dc2626", light: "#fef3c7" })}>
                  🔴 Красный
                </button>
                <button onClick={() => setPatternColors({ dark: "#059669", light: "#d1fae5" })}>
                  🟢 Зелёный
                </button>
                <button onClick={() => setPatternColors({ dark: "#7c3aed", light: "#ede9fe" })}>
                  🟣 Фиолетовый
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Подготовка к вязанию - подсказка */}
      {patternData && !httpServer.running && (
        <div className="ready-to-knit-info">
          <div className="info-icon">🧶</div>
          <h4>Готово к вязанию!</h4>
          <p>
            <strong>Узор загружен:</strong> {patternData.width}×{patternData.height}
            ({Math.ceil(patternData.height / 4)} чанков по 4 ряда)
          </p>
          <div className="steps">
            <div className="step">
              <span className="step-number">1</span>
              <span>Заправьте нити в вязальную машину</span>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <span>Включите ESP32 и убедитесь, что он подключён к WiFi</span>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <span>Нажмите <strong>▶️ НАЧАТЬ ВЯЗАНИЕ</strong></span>
            </div>
          </div>
          <p className="hint">
            💡 Убедитесь, что ESP32 настроен на IP: <code>{computerIp}</code>
          </p>
        </div>
      )}

      {/* Info Panel */}
      {patternData && (
        <div className="pattern-info-panel">
          <h4>📋 Информация об узоре</h4>
          <div className="info-grid">
            <span>📐 Размер: <strong>{patternData.width}×{patternData.height}</strong></span>
            <span>📄 Формат: <strong>Бинарный (0/1)</strong></span>
            <span>🧶 Чанков: <strong>{Math.ceil(patternData.height / 4)}</strong> (по 4 ряда)</span>
            <span>🔗 ESP32 IP: <strong>{httpServer.serverIp || computerIp}:6666</strong></span>
          </div>
        </div>
      )}

      {/* Server Status */}
      {httpServer.running && (
        <div className="server-status-panel">
          <div className="status-header">
            <h4>📡 Статус сервера</h4>
            <span className={`status-badge ${httpServer.isEspConnected ? "connected" : "waiting"}`}>
              {httpServer.isEspConnected ? "✅ ESP32 подключён" : "🔌 Ожидание подключения"}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="progress-section">
            <div className="progress-label">
              <span>Прогресс вязания</span>
              <span>{httpServer.currentRow}/{httpServer.totalRows} рядов ({httpServer.progressPercent}%)</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${httpServer.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Chunk Progress */}
          <div className="chunk-progress">
            <h5>📦 Отправленные чанки:</h5>
            <div className="chunk-grid">
              {Array.from({ length: Math.ceil(httpServer.totalRows / 4) }, (_, i) => {
                const chunkStart = i * 4;
                const chunkEnd = Math.min((i + 1) * 4, httpServer.totalRows);
                const isSent = chunkStart < httpServer.currentRow;
                const isCurrent = chunkStart >= httpServer.currentRow &&
                                  chunkStart < httpServer.currentRow + 4;

                return (
                  <div
                    key={i}
                    className={`chunk-item ${isSent ? 'sent' : ''} ${isCurrent ? 'current' : ''}`}
                    title={`Чанк ${i + 1}: ряды ${chunkStart}-${chunkEnd - 1}`}
                  >
                    <span className="chunk-number">{i + 1}</span>
                    <span className="chunk-rows">{chunkStart}-{chunkEnd - 1}</span>
                    {isSent && <span className="chunk-status">✓</span>}
                    {isCurrent && <span className="chunk-status">⟳</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connection Info */}
          <div className="connection-info">
            <p>
              <strong>Настройте ESP32:</strong><br />
              В файле <code>client.rs</code> укажите IP вашего компьютера:
            </p>
            <code className="ip-code">
              client::init_server_ip("{httpServer.serverIp || computerIp}");
            </code>
            <p className="hint">
              💡 Подключите ESP32 и компьютер к одной WiFi сети
            </p>
          </div>
        </div>
      )}

      {/* Pattern Preview */}
      {patternData && (
        <div className="pattern-preview-section">
          <h4>🎨 Предпросмотр узора</h4>
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} className="pattern-canvas" />
          </div>
          {httpServer.currentRow > 0 && (
            <div className="current-row-indicator">
              🔴 Текущая позиция: ряд {httpServer.currentRow}
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Empty State */}
      {!patternData && !converting && (
        <div className="empty-state">
          <div className="empty-icon">🧶</div>
          <p>Выберите изображение и конвертируйте его в узор</p>
          <p className="hint">
            Поддерживаемые форматы: PNG, JPG, JPEG, BMP, GIF
          </p>
        </div>
      )}

      {/* Toast уведомления */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
