import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./KnittingTab.css";
import esp_connect from "../assets/sounds/esp_connect.mp3";
import knit_complete from "../assets/sounds/knit_complete.mp3";

export default function KnittingTab({
  projectId,
  garmentTypeId,
  selectedPatternFromPatterns,
  onSelectPatternFromGallery,
}) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [patternData, setPatternData] = useState(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState("dark-blue");
  const [projectPath, setProjectPath] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [showPatternGallery, setShowPatternGallery] = useState(false);
  // === ТЕСТ НА СООТВЕТСТВИЕ DOB ===
  const [solenoidHits, setSolenoidHits] = useState([]);
  const [hitStats, setHitStats] = useState({
    total: 0,
    correct: 0,
    misses: 0,
    false_positives: 0,
    accuracy_pct: 100,
  });
  const [showTestPanel, setShowTestPanel] = useState(false);
  const testCanvasRef = useRef(null);
  const solenoidIntervalRef = useRef(null);

  // Настройки цветов паттерна
  const [patternColors, setPatternColors] = useState(() => {
    const saved = localStorage.getItem("patternColors");
    return saved
      ? JSON.parse(saved)
      : {
          dark: "#1e40af",
          light: "#e5e7eb",
        };
  });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    localStorage.setItem("patternColors", JSON.stringify(patternColors));
  }, [patternColors]);

  // HTTP сервер
  const [httpServer, setHttpServer] = useState({
    running: false,
    port: 6666,
    serverIp: "",
    connected: false,
    isEspConnected: false,
    currentRow: 0,
    currentDirection: "right",
    totalRows: 0,
    progressPercent: 0,
    chunksSent: 0,
    maxSentRow: 0,
  });

  const [computerIp, setComputerIp] = useState("");
  const canvasRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const hasShownCompletionNotification = useRef(false);
  const hasPlayedConnectSound = useRef(false);

  const [toasts, setToasts] = useState([]);
  const connectSoundRef = useRef(null);
  const completeSoundRef = useRef(null);

  const [savedProgress, setSavedProgress] = useState(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: null,
    onCancel: null,
    showCancel: false,
    confirmText: "OK",
    cancelText: "Отмена",
  });

  const previewCanvasRef = useRef(null);

  const showModal = ({
    title,
    message,
    type = "info",
    onConfirm,
    onCancel,
    showCancel = false,
    confirmText = "OK",
    cancelText = "Отмена",
  }) => {
    setModal({
      isOpen: true,
      title,
      message,
      type,
      onConfirm,
      onCancel,
      showCancel,
      confirmText,
      cancelText,
    });
  };

  const showAlert = (message, type = "info") => {
    showModal({
      title:
        type === "error" ? "Ошибка" : type === "success" ? "Успех" : "Внимание",
      message,
      type,
    });
  };

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

  useEffect(() => {
    connectSoundRef.current = new Audio(esp_connect);
    connectSoundRef.current.volume = 0.5;
    completeSoundRef.current = new Audio(knit_complete);
    completeSoundRef.current.volume = 0.7;
  }, []);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = `knitting-toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const playSound = useCallback((soundRef) => {
    if (soundRef && soundRef.current) {
      soundRef.current.currentTime = 0;
      soundRef.current.play().catch((e) => console.log("Sound play error:", e));
    }
  }, []);

  useEffect(() => {
    if (patternData && httpServer.running) {
      invoke("send_esp_restart_signal").catch((e) => {
        console.log("ESP restart signal not sent:", e);
      });
    }
  }, [patternData, httpServer.running]);

  const drawPatternPreview = useCallback(
    (rows, width, height, currentRow = 0, direction = "right") => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!rows || rows.length === 0) return;

      const ctx = canvas.getContext("2d");
      const maxCanvasSize = 400;
      const cellSize = Math.max(
        1,
        Math.floor(maxCanvasSize / Math.max(width, height)),
      );

      canvas.width = Math.min(width * cellSize, maxCanvasSize);
      canvas.height = Math.min(height * cellSize, maxCanvasSize);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const visibleWidth = Math.floor(canvas.width / cellSize);
      const visibleHeight = Math.floor(canvas.height / cellSize);
      const startX = Math.max(0, Math.floor((width - visibleWidth) / 2));
      const startY = Math.max(0, Math.floor((height - visibleHeight) / 2));

      for (let y = 0; y < visibleHeight && startY + y < height; y++) {
        const visualY = height - 1 - (startY + y);
        const row = rows[visualY];
        if (!row) continue;

        for (let x = 0; x < visibleWidth && startX + x < width; x++) {
          const pixelIndex = startX + x;
          ctx.fillStyle = row[pixelIndex]
            ? patternColors.dark
            : patternColors.light;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }

      if (currentRow > 0) {
        const visualRow = height - currentRow;
        const adjustedRow = visualRow - startY;
        const yPos = adjustedRow * cellSize;

        if (yPos >= 0 && yPos <= canvas.height) {
          ctx.strokeStyle = direction === "right" ? "#22c55e" : "#3b82f6";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, yPos);
          ctx.lineTo(canvas.width, yPos);
          ctx.stroke();

          const arrowSize = 10;
          ctx.fillStyle = direction === "right" ? "#22c55e" : "#3b82f6";
          if (direction === "right") {
            ctx.beginPath();
            ctx.moveTo(canvas.width - 5, yPos);
            ctx.lineTo(canvas.width - 5 - arrowSize, yPos - arrowSize / 2);
            ctx.lineTo(canvas.width - 5 - arrowSize, yPos + arrowSize / 2);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(5, yPos);
            ctx.lineTo(5 + arrowSize, yPos - arrowSize / 2);
            ctx.lineTo(5 + arrowSize, yPos + arrowSize / 2);
            ctx.closePath();
            ctx.fill();
          }

          ctx.fillStyle = "#000";
          ctx.font = "bold 11px sans-serif";
          ctx.fillText(
            `Ряд ${visualRow} ${direction === "right" ? "→" : "←"}`,
            5,
            yPos - 5,
          );
        }
      }

      if (width > visibleWidth || height > visibleHeight) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.font = "12px sans-serif";
        ctx.fillText(
          `Показано: ${visibleWidth}×${visibleHeight} из ${width}×${height}`,
          5,
          canvas.height - 5,
        );
      }
    },
    [patternColors],
  );

  const getProgressKey = useCallback(() => {
    return `knitting_progress_${projectId}`;
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !patternData) return;
    const key = getProgressKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const progress = JSON.parse(saved);
        if (
          progress.patternWidth === patternData.width &&
          progress.patternHeight === patternData.height
        ) {
          setSavedProgress(progress);
        } else {
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
    addToast(
      `💾 Прогресс сохранён! Ряд ${progress.currentRow}/${progress.totalRows}`,
      "success",
      4000,
    );
  }, [patternData, httpServer, getProgressKey, addToast, showAlert]);

  const showConfirm = useCallback(
    ({
      title,
      message,
      onConfirm,
      onCancel,
      confirmText = "Да",
      cancelText = "Нет",
    }) => {
      showModal({
        title,
        message,
        type: "confirm",
        onConfirm,
        onCancel,
        showCancel: true,
        confirmText,
        cancelText,
      });
    },
    [showModal],
  );

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
          setHttpServer((prev) => ({
            ...prev,
            running: true,
            currentRow: savedProgress.currentRow,
            currentDirection: savedProgress.currentDirection,
            maxSentRow: savedProgress.maxSentRow,
            totalRows: savedProgress.totalRows,
            progressPercent: Math.round(
              (savedProgress.currentRow / savedProgress.totalRows) * 100,
            ),
            serverIp: computerIp,
          }));

          if (patternData) {
            drawPatternPreview(
              patternData.rows,
              patternData.width,
              patternData.height,
              savedProgress.currentRow,
              savedProgress.currentDirection,
            );
          }

          // Сначала останавливаем старый сервер
          await invoke("stop_esp32_http_server").catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 500));

          const result = await invoke("start_esp32_http_server", {
            patternRows: patternData.rows,
            patternWidth: patternData.width,
            patternHeight: patternData.height,
            chunkSize: 4,
            port: 6666,
          });

          await invoke("restore_knitting_progress", {
            projectId: parseInt(projectId),
            currentRow: savedProgress.currentRow,
            currentDirection: savedProgress.currentDirection,
            maxSentRow: savedProgress.maxSentRow,
          });

          startStatusPolling();
          addToast(
            `Прогресс восстановлен! Ряд ${savedProgress.currentRow}/${savedProgress.totalRows}`,
            "success",
            5000,
          );
          setShowRestorePrompt(false);
        } catch (error) {
          console.error("Ошибка восстановления прогресса:", error);
          showAlert(
            `Ошибка восстановления: ${error.message || error}`,
            "error",
          );
        }
      },
    });
  }, [
    savedProgress,
    patternData,
    drawPatternPreview,
    addToast,
    showAlert,
    showConfirm,
    computerIp,
    projectId,
  ]);

  const deleteSavedProgress = useCallback(() => {
    const key = getProgressKey();
    localStorage.removeItem(key);
    setSavedProgress(null);
    setShowRestorePrompt(false);
    addToast("🗑️ Сохранённый прогресс удалён", "info", 3000);
  }, [getProgressKey, addToast]);

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
          await invoke("reset_knitting_progress");
          setHttpServer((prev) => ({
            ...prev,
            currentRow: 0,
            currentDirection: "right",
            maxSentRow: 0,
            progressPercent: 0,
            chunksSent: 0,
          }));
          // После reset_knitting_progress добавь:
          await invoke("clear_solenoid_hits").catch(() => {});
          setSolenoidHits([]);
          setHitStats({
            total: 0,
            correct: 0,
            misses: 0,
            false_positives: 0,
            accuracy_pct: 100,
          });
          const key = getProgressKey();
          localStorage.removeItem(key);
          setSavedProgress(null);
          try {
            await invoke("send_esp_restart_signal");
          } catch (e) {
            console.log("ESP restart signal not sent:", e);
          }
          if (patternData) {
            drawPatternPreview(
              patternData.rows,
              patternData.width,
              patternData.height,
              0,
              "right",
            );
          }
          addToast("Прогресс сброшен! Начинаем сначала.", "warning", 5000);
        } catch (error) {
          console.error("Ошибка сброса прогресса:", error);
          showAlert(`Ошибка сброса: ${error.message || error}`, "error");
        }
      },
    });
  }, [
    httpServer,
    patternData,
    drawPatternPreview,
    getProgressKey,
    addToast,
    showAlert,
    showConfirm,
  ]);

  useEffect(() => {
    invoke("get_theme")
      .then(setTheme)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadProjectAndPatterns = async () => {
      try {
        const projectData = await invoke("open_project_by_id", {
          projectId: parseInt(projectId),
        });
        setProjectPath(projectData.file_path);
        const patternsDir = `${projectData.file_path}/patterns`;
        try {
          const entries = await invoke("read_dir", { path: patternsDir });
          const patternFiles = entries.filter(
            (entry) =>
              !entry.is_dir &&
              (entry.name.endsWith(".swaga") || entry.name.endsWith(".txt")),
          );
          const loadedPatterns = await Promise.all(
            patternFiles.map(async (file) => {
              const filePath = `${patternsDir}/${file.name}`;
              const content = await invoke("read_file_text", {
                path: filePath,
              });
              return parsePatternFile(content, file.name, filePath);
            }),
          );
          setPatterns(loadedPatterns.filter((p) => p !== null));
        } catch (error) {
          setPatterns([]);
        }
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    };
    if (projectId) loadProjectAndPatterns();
  }, [projectId]);

  useEffect(() => {
    if (
      selectedPatternFromPatterns &&
      selectedPatternFromPatterns.pattern_data
    ) {
      const pattern = selectedPatternFromPatterns;
      setPatternData({
        rows: pattern.pattern_data,
        width: pattern.width,
        height: pattern.height,
        format: "from_patterns",
      });
      setTimeout(() => {
        drawPatternPreview(
          pattern.pattern_data,
          pattern.width,
          pattern.height,
          0,
          "right",
        );
      }, 50);
    }
  }, [selectedPatternFromPatterns, drawPatternPreview]);

  const parsePatternFile = (content, fileName, filePath) => {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    let metadata = {};
    let patternLines = [];
    let inHeader = true;
    for (const line of lines) {
      if (line.startsWith("#")) {
        if (inHeader) {
          if (line.includes("=")) {
            const [key, value] = line
              .substring(1)
              .split("=")
              .map((s) => s.trim());
            metadata[key] = value;
          }
          if (line.includes("# end_header")) inHeader = false;
        }
      } else if (!inHeader) {
        patternLines.push(line.trim());
      }
    }
    if (patternLines.length === 0 && lines.length > 0) {
      patternLines = lines
        .filter((line) => !line.startsWith("#"))
        .map((line) => line.trim());
    }
    const height = patternLines.length;
    const width = patternLines.length > 0 ? patternLines[0].length : 0;
    const rows = patternLines.map((line) =>
      line.split("").map((char) => char === "1" || char === "#"),
    );
    return {
      id: fileName,
      name: fileName.replace(/\.(swaga|txt)$/, ""),
      width,
      height,
      file_path: filePath,
      pattern_data: rows,
      metadata,
    };
  };

  const handleSelectPatternFromGallery = (pattern) => {
    setPatternData({
      rows: pattern.pattern_data,
      width: pattern.width,
      height: pattern.height,
      format: "from_gallery",
    });
    setShowPatternGallery(false);
    setTimeout(() => {
      drawPatternPreview(
        pattern.pattern_data,
        pattern.width,
        pattern.height,
        0,
        "right",
      );
    }, 50);
    if (onSelectPatternFromGallery) onSelectPatternFromGallery(pattern);
  };

  const handleSelectImage = async () => {
    try {
      const selected = await open({
        title: "Выберите изображение для узора",
        multiple: false,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "gif"] },
        ],
      });
      if (selected) {
        setSelectedImage(selected);
        setError(null);
      }
    } catch (err) {
      setError(err.message || "Не удалось выбрать изображение");
    }
  };

  const handleConvertAndLoad = async () => {
    if (!selectedImage) return;
    try {
      setConverting(true);
      setError(null);
      const projectData = await invoke("open_project_by_id", {
        projectId: parseInt(projectId),
      });
      const projectFolderPath = projectData.file_path;
      const patternFileName = `pattern_${Date.now()}.swaga`;
      const outputPath = `${projectFolderPath}/patterns/${patternFileName}`;
      const result = await invoke("convert_image_to_pattern", {
        req: {
          image_path: selectedImage,
          output_path: outputPath,
          reverse: true,
          threshold: 128,
          invert: true,
          pattern_char_dark: "1",
          pattern_char_light: "0",
        },
      });
      if (!result.success)
        throw new Error(result.error || "Конвертация не удалась");
      const rows = result.preview_lines.map((line) =>
        line.split("").map((char) => char === "1"),
      );
      const parsed = {
        rows,
        width: result.width,
        height: result.height,
        format: "converted",
      };
      setPatternData(parsed);
      drawPatternPreview(rows, result.width, result.height, 0, "right");
    } catch (err) {
      setError(err.message || "Не удалось конвертировать изображение");
    } finally {
      setConverting(false);
    }
  };

  // === ИЗМЕНЕНИЯ: KSL только ручной ввод, ширина узора из Rust ===
  const [kslWidth, setKslWidth] = useState(0); // Ширина полотна (ручной ввод)
  const [patternWithPadding, setPatternWithPadding] = useState(null);

  // Функция для добавления нулей по краям узора
  const padPatternWithZeros = useCallback((rows, targetWidth) => {
    if (!rows || rows.length === 0) return null;
    const currentWidth = rows[0].length;
    if (currentWidth >= targetWidth) return rows;
    const paddingEachSide = Math.floor((targetWidth - currentWidth) / 2);
    const remainder = (targetWidth - currentWidth) % 2;
    return rows.map((row) => {
      const leftPadding = Array(paddingEachSide).fill(false);
      const rightPadding = Array(paddingEachSide + remainder).fill(false);
      return [...leftPadding, ...row, ...rightPadding];
    });
  }, []);

  // === ИЗМЕНЕНИЯ: startHttpServer — берём ширину из Rust, всегда стопаем старый сервер ===
  const startHttpServer = async () => {
    if (!patternData) {
      addToast("Сначала выберите узор!", "error", 4000);
      return;
    }

    // 1. Загружаем stamps из Rust чтобы получить ширину детали
    let patternTargetWidth = patternData.width;
    let stampInfo = null;

    try {
      const stamps = await invoke("get_blueprint_pattern_stamps", {
        projectId: parseInt(projectId),
      });
      if (stamps && stamps.length > 0) {
        // Находим самый широкий штамп
        const widestStamp = stamps.reduce(
          (max, s) => (s.width > max.width ? s : max),
          stamps[0],
        );
        patternTargetWidth = widestStamp.width;
        stampInfo = {
          width: widestStamp.width,
          name:
            stamps.find((s) => s.id === widestStamp.pattern_id)?.name ||
            "#" + widestStamp.pattern_id,
        };
      }
    } catch (e) {
      console.log("Blueprint stamps not available, using pattern width");
    }

    // 2. Применяем padding к паттерну (до ширины из stamps)
    const paddedRows = padPatternWithZeros(
      patternData.rows,
      patternTargetWidth,
    );
    const finalPattern = paddedRows
      ? {
          rows: paddedRows,
          width: patternTargetWidth,
          height: patternData.height,
        }
      : patternData;

    // 3. Показываем подсказку
    if (stampInfo) {
      addToast(
        `📐 Ширина детали: ${stampInfo.width} п. (${stampInfo.name}). Узор расширен. Датчики: ${kslWidth} п.`,
        "info",
        8000,
      );
    } else {
      addToast(`📐 Датчики: выставьте на ${kslWidth<=0?patternData.width:kslWidth} петель`, "info", 5000);
    }

    // 4. Подтверждение запуска
    const confirmStart = window.confirm(
      "🧶 Начать вязание?\n\n" +
        "Убедитесь, что:\n" +
        "• ESP32 включен и подключён к WiFi\n" +
        `• IP адрес ESP32 настроен на: ${computerIp}\n` +
        `• Датчики (KSL) выставлены на ${kslWidth<=0?patternData.width:kslWidth} игл\n` +
        "• Нить заправлена в машину\n\n" +
        "Нажмите OK для запуска или Отмена для отмены.",
    );
    if (!confirmStart) return;

    try {
      setHttpServer((prev) => ({
        ...prev,
        currentRow: 0,
        progressPercent: 0,
        chunksSent: 0,
        connected: false,
      }));

      // 5. ВСЕГДА останавливаем старый сервер перед запуском нового
      await invoke("stop_esp32_http_server").catch(() => {});
      // Даём время на освобождение порта
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 6. Запускаем новый сервер с расширенным паттерном
      const result = await invoke("start_esp32_http_server", {
        patternRows: finalPattern.rows,
        patternWidth: finalPattern.width,
        patternHeight: finalPattern.height,
        chunkSize: 4,
        port: 6666,
      });

      console.log("HTTP server started:", result);

      setHttpServer((prev) => ({
        ...prev,
        running: true,
        serverIp: computerIp,
        totalRows: finalPattern.height,
      }));

      startStatusPolling();
    } catch (err) {
      console.error("Failed to start HTTP server:", err);
      setError(err.message || "Не удалось запустить сервер");
      showAlert("Ошибка запуска сервера: " + err.message, "error");
    }
  };

  const stopHttpServer = async () => {
    try {
      await invoke("stop_esp32_http_server");
      setHttpServer((prev) => ({ ...prev, running: false }));
      stopStatusPolling();
      stopSolenoidPolling(); 
      hasShownCompletionNotification.current = false;
    } catch (err) {
      console.error("Failed to stop server:", err);
    }
  };

  const startStatusPolling = () => {
    hasShownCompletionNotification.current = false;
    hasPlayedConnectSound.current = false;
    let lastPatternWidth = patternData?.width || 0;
    let lastStampPatternId = null;
    stopStatusPolling();

    statusIntervalRef.current = setInterval(async () => {
      try {
        const rowInfo = await invoke("get_current_row_info");
        const current = rowInfo.row || 0;
        const direction = rowInfo.direction || "right";
        const total = rowInfo.total || 0;
        const isEspConnected = rowInfo.is_esp_connected || false;
        const maxSentRow = rowInfo.max_sent_row || 0;

        try {
          const stamps = await invoke("get_blueprint_pattern_stamps", {
            projectId: parseInt(projectId),
          }).catch(() => []);
          if (stamps && stamps.length > 0) {
            const svgY = total - current;
            let currentStamp = null;
            for (const stamp of stamps) {
              if (
                svgY >= stamp.position_y &&
                svgY < stamp.position_y + stamp.height
              ) {
                currentStamp = stamp;
                break;
              }
            }
            if (currentStamp) {
              if (lastStampPatternId !== currentStamp.pattern_id) {
                lastStampPatternId = currentStamp.pattern_id;
                if (
                  lastPatternWidth !== 0 &&
                  lastPatternWidth !== currentStamp.width
                ) {
                  addToast(
                    `📐 Датчики: ширина узора изменилась с ${lastPatternWidth} на ${currentStamp.width} п.`,
                    "warning",
                    5000,
                  );
                }
                lastPatternWidth = currentStamp.width;
              }
            } else if (lastStampPatternId !== null) {
              lastStampPatternId = null;
              lastPatternWidth = patternData?.width || 0;
            }
          }
        } catch (e) {}

        if (total > 0) {
          const progress = Math.round((current / total) * 100);
          const chunksSent = Math.ceil(maxSentRow / 4);
          const connected = isEspConnected;

          if (isEspConnected && !hasPlayedConnectSound.current) {
            hasPlayedConnectSound.current = true;
            addToast("🔌 ESP32 подключён!", "success", 3000);
            playSound(connectSoundRef);
          }

          setHttpServer((prev) => ({
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

          if (patternData) {
            drawPatternPreview(
              patternData.rows,
              patternData.width,
              patternData.height,
              current,
              direction,
            );
          }

          if (
            current >= total &&
            total > 0 &&
            !hasShownCompletionNotification.current
          ) {
            hasShownCompletionNotification.current = true;
            addToast(
              `Вязание завершено! Все ${total} рядов связаны!`,
              "success",
              8000,
            );
            playSound(completeSoundRef);
          }
        }
      } catch (err) {
        console.error("Status poll failed:", err);
      }
    }, 1000);
  };

  const stopStatusPolling = () => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopStatusPolling();
      hasShownCompletionNotification.current = false;
    };
  }, []);

  useEffect(() => {
    if (patternData && canvasRef.current) {
      drawPatternPreview(
        patternData.rows,
        patternData.width,
        patternData.height,
        httpServer.currentRow,
        httpServer.currentDirection,
      );
    }
  }, [
    httpServer.currentRow,
    httpServer.currentDirection,
    patternData,
    drawPatternPreview,
  ]);

  useEffect(() => {
    if (!patternData) return;
    const timer = setTimeout(() => {
      if (!canvasRef.current) return;
      drawPatternPreview(
        patternData.rows,
        patternData.width,
        patternData.height,
        httpServer.currentRow,
        httpServer.currentDirection,
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [patternData]);

  useEffect(() => {
    if (patternData && canvasRef.current) {
      drawPatternPreview(
        patternData.rows,
        patternData.width,
        patternData.height,
        httpServer.currentRow,
        httpServer.currentDirection,
      );
    }
  }, [
    patternColors,
    patternData,
    drawPatternPreview,
    httpServer.currentRow,
    httpServer.currentDirection,
  ]);

  const createMiniPreview = useCallback(
    (rows, width, height, size = 60) => {
      if (!rows || rows.length === 0) return "";
      const miniCanvas = document.createElement("canvas");
      const cellSize = Math.max(1, Math.floor(size / Math.max(width, height)));
      miniCanvas.width = Math.max(1, width * cellSize);
      miniCanvas.height = Math.max(1, height * cellSize);
      const ctx = miniCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
      for (let y = 0; y < rows.length; y++) {
        const visualY = height - 1 - y;
        const row = rows[visualY];
        for (let x = 0; x < row.length; x++) {
          ctx.fillStyle =
            row[x] === true || row[x] === 1 || row[x] === "1" || row[x] === "#"
              ? patternColors.dark
              : patternColors.light;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
      return miniCanvas.toDataURL("image/png");
    },
    [patternColors],
  );

  // Рисуем клеточную доску с фактическими срабатываниями
  const drawTestGrid = useCallback((hits, width, height) => {
    const canvas = testCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const maxCanvasSize = 500;
    const cellSize = Math.max(
      2,
      Math.floor(maxCanvasSize / Math.max(width, height)),
    );

    canvas.width = Math.min(width * cellSize, maxCanvasSize);
    canvas.height = Math.min(height * cellSize, maxCanvasSize);

    const visibleWidth = Math.floor(canvas.width / cellSize);
    const visibleHeight = Math.floor(canvas.height / cellSize);
    const startX = Math.max(0, Math.floor((width - visibleWidth) / 2));
    const startY = Math.max(0, Math.floor((height - visibleHeight) / 2));

    // Фон
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Индекс хитов для быстрого доступа: key "row:needle" → hit
    const hitMap = new Map();
    for (const h of hits) {
      hitMap.set(`${h.row}:${h.needle}`, h);
    }

    // Рисуем клетки (вертикальный флип, как в основном preview)
    for (let y = 0; y < visibleHeight && startY + y < height; y++) {
      const visualY = height - 1 - (startY + y);
      for (let x = 0; x < visibleWidth && startX + x < width; x++) {
        const pixelIndex = startX + x;
        const hit = hitMap.get(`${visualY}:${pixelIndex}`);

        if (!hit) {
          // Ещё не провязано — серая клетка
          ctx.fillStyle = "#2a2a2a";
        } else if (hit.miss) {
          // Пропуск — БЕЛЫЙ (должен был, но нет)
          ctx.fillStyle = "#ffffff";
        } else if (hit.false_pos) {
          // Ложное срабатывание — КРАСНЫЙ
          ctx.fillStyle = "#ef4444";
        } else {
          // Верное — ЗЕЛЁНЫЙ
          ctx.fillStyle = "#22c55e";
        }

        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }, []);

  // Опрашиваем сервер о хитах
  const startSolenoidPolling = useCallback(() => {
    if (solenoidIntervalRef.current) return;

    solenoidIntervalRef.current = setInterval(async () => {
      try {
        // Читаем напрямую из Rust — никакого HTTP!
        const data = await invoke("get_solenoid_hits_data");
        console.log(data);
        setSolenoidHits(data.hits || []);
        setHitStats(
          data.stats || {
            total: 0,
            correct: 0,
            misses: 0,
            false_positives: 0,
            accuracy_pct: 100,
          },
        );

        // Перерисовываем canvas
        if (patternData && data.hits && data.hits.length > 0) {
          drawTestGrid(data.hits, patternData.width, patternData.height);
        }
      } catch (e) {
        console.log("Solenoid hits poll error:", e);
      }
    }, 1500);
  }, [patternData, drawTestGrid]);

  const stopSolenoidPolling = () => {
    if (solenoidIntervalRef.current) {
      clearInterval(solenoidIntervalRef.current);
      solenoidIntervalRef.current = null;
    }
  };

  // Запуск/остановка теста при открытии панели
  useEffect(() => {
    if (showTestPanel && httpServer.running) {
      startSolenoidPolling();
    } else {
      stopSolenoidPolling();
    }
    return () => stopSolenoidPolling();
  }, [showTestPanel, httpServer.running, startSolenoidPolling]);

  // Остановка вместе с сервером
  useEffect(() => {
    if (!httpServer.running) {
      stopSolenoidPolling();
    }
  }, [httpServer.running]);

  return (
    <div className="knitting-tab">
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
                    className={`gallery-pattern-card ${patternData?.width === pattern.width && patternData?.height === pattern.height ? "selected" : ""}`}
                    onClick={() => handleSelectPatternFromGallery(pattern)}
                  >
                    <div className="pattern-preview">
                      {pattern.pattern_data ? (
                        <img
                          src={createMiniPreview(
                            pattern.pattern_data,
                            pattern.width,
                            pattern.height,
                            60,
                          )}
                          alt={pattern.name}
                          className="mini-pattern-preview"
                        />
                      ) : (
                        <span className="pattern-placeholder">🧶</span>
                      )}
                    </div>
                    <div className="gallery-pattern-info">
                      <h6>{pattern.name}</h6>
                      <span className="gallery-pattern-size">
                        {pattern.width}×{pattern.height}
                      </span>
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
              ✅ Выбран узор:{" "}
              <strong>
                {patternData.format === "from_patterns"
                  ? selectedPatternFromPatterns?.name
                  : "Из галереи"}
              </strong>
            </span>
            <span className="selected-pattern-size">
              📐 Размер: {patternData.width}×{patternData.height}
            </span>
          </div>
        )}
      </div>

      <div className="knitting-toolbar">
        <button
          className="btn-color-palette"
          onClick={() => setShowColorPicker(!showColorPicker)}
          type="button"
          title="Настроить цвета узора"
        >
          🎨 Цвета
        </button>

        {/* === ИЗМЕНЕНИЯ: Только ручной ввод ширины полотна, без чекбокса === */}
        {!httpServer.running && patternData && (
          <div className="ksl-settings-inline">
            <label className="ksl-label">Ширина полотна (игл):</label>
            <input
              type="number"
              className="ksl-input"
              min="1"
              max="200"
              value={patternData.width}
              onChange={(e) => setKslWidth(Number(e.target.value))}
              title="Ширина датчиков (петель) — ручной ввод"
            />
            <span className="ksl-hint">п.</span>
          </div>
        )}

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
          <>
            <button
              className="btn-restore-progress"
              onClick={restoreProgress}
              type="button"
              title={`Восстановить прогресс: ряд ${savedProgress.currentRow}/${savedProgress.totalRows}`}
            >
              🔄 Восстановить прогресс
            </button>
            <button
              className="btn-delete-progress"
              onClick={deleteSavedProgress}
              type="button"
              title="Удалить сохранённый прогресс"
            >
              🗑️
            </button>
          </>
        )}
        {httpServer.running && (
          <button
            className="btn-test-toggle"
            onClick={() => setShowTestPanel(!showTestPanel)}
            type="button"
            title="Показать/скрыть тест на соответствие DOB"
          >
            🧪 Тест {showTestPanel ? "▼" : "▶"}
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

      {savedProgress && !httpServer.running && (
        <div className="saved-progress-info">
          <div className="progress-info-header">
            <span className="progress-icon">💾</span>
            <span className="progress-title">Сохранённый прогресс</span>
          </div>
          <div className="progress-details">
            <span>
              Ряд:{" "}
              <strong>
                {savedProgress.currentRow}/{savedProgress.totalRows}
              </strong>
            </span>
            <span>
              Направление:{" "}
              <strong>
                {savedProgress.currentDirection === "right"
                  ? "→ вправо"
                  : "← влево"}
              </strong>
            </span>
            <span>
              Сохранено:{" "}
              <strong>
                {new Date(savedProgress.savedAt).toLocaleString("ru-RU")}
              </strong>
            </span>
          </div>
        </div>
      )}

      {showColorPicker && patternData && (
        <div className="color-picker-panel">
          <h5>🎨 Настройка цветов узора</h5>
          <div className="color-picker-grid">
            <div className="color-picker-item">
              <label>Фон:</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={patternColors.dark}
                  onChange={(e) =>
                    setPatternColors((prev) => ({
                      ...prev,
                      dark: e.target.value,
                    }))
                  }
                  className="color-picker-input"
                />
                <input
                  type="text"
                  value={patternColors.dark}
                  onChange={(e) =>
                    setPatternColors((prev) => ({
                      ...prev,
                      dark: e.target.value,
                    }))
                  }
                  className="color-text-input"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div className="color-picker-item">
              <label>Узор:</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={patternColors.light}
                  onChange={(e) =>
                    setPatternColors((prev) => ({
                      ...prev,
                      light: e.target.value,
                    }))
                  }
                  className="color-picker-input"
                />
                <input
                  type="text"
                  value={patternColors.light}
                  onChange={(e) =>
                    setPatternColors((prev) => ({
                      ...prev,
                      light: e.target.value,
                    }))
                  }
                  className="color-text-input"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>
            <div className="color-picker-presets">
              <span className="preset-label">Предустановки:</span>
              <div className="preset-buttons">
                <button
                  onClick={() =>
                    setPatternColors({ dark: "#1e40af", light: "#e5e7eb" })
                  }
                >
                  🔵 Синий
                </button>
                <button
                  onClick={() =>
                    setPatternColors({ dark: "#000000", light: "#ffffff" })
                  }
                >
                  ⚫ Ч/Б
                </button>
                <button
                  onClick={() =>
                    setPatternColors({ dark: "#dc2626", light: "#fef3c7" })
                  }
                >
                  🔴 Красный
                </button>
                <button
                  onClick={() =>
                    setPatternColors({ dark: "#059669", light: "#d1fae5" })
                  }
                >
                  🟢 Зелёный
                </button>
                <button
                  onClick={() =>
                    setPatternColors({ dark: "#7c3aed", light: "#ede9fe" })
                  }
                >
                  🟣 Фиолетовый
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {patternData && !httpServer.running && (
        <div className="ready-to-knit-info">
          <div className="info-icon">🧶</div>
          <h4>Готово к вязанию!</h4>
          <p>
            <strong>Узор загружен:</strong> {patternData.width}×
            {patternData.height} ({Math.ceil(patternData.height / 4)} чанков по
            4 ряда)
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
              <span>
                Нажмите <strong>▶️ НАЧАТЬ ВЯЗАНИЕ</strong>
              </span>
            </div>
          </div>
          <p className="hint">
            💡 Убедитесь, что ESP32 настроен на IP: <code>{computerIp}</code>
          </p>
        </div>
      )}

      {patternData && (
        <div className="pattern-info-panel">
          <h4>📋 Информация об узоре</h4>
          <div className="info-grid">
            <span>
              📐 Размер:{" "}
              <strong>
                {patternData.width}×{patternData.height}
              </strong>
            </span>
            <span>
              📄 Формат: <strong>Бинарный (0/1)</strong>
            </span>
            <span>
              🧶 Чанков: <strong>{Math.ceil(patternData.height / 4)}</strong>{" "}
              (по 4 ряда)
            </span>
            <span>
              📏 Ширина полотна: <strong>{kslWidth} игл</strong> (ручной ввод)
            </span>
            <span>
              🔗 ESP32 IP:{" "}
              <strong>{httpServer.serverIp || computerIp}:6666</strong>
            </span>
          </div>
        </div>
      )}

      {httpServer.running && (
        <div className="server-status-panel">
          <div className="status-header">
            <h4>📡 Статус сервера</h4>
            <span
              className={`status-badge ${httpServer.isEspConnected ? "connected" : "waiting"}`}
            >
              {httpServer.isEspConnected
                ? "✅ ESP32 подключён"
                : "🔌 Ожидание подключения"}
            </span>
          </div>
          <div className="progress-section">
            <div className="progress-label">
              <span>Прогресс вязания</span>
              <span>
                {httpServer.currentRow}/{httpServer.totalRows} рядов (
                {httpServer.progressPercent}%)
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${httpServer.progressPercent}%` }}
              />
            </div>
          </div>
          <div className="chunk-progress">
            <h5>📦 Отправленные чанки:</h5>
            <div className="chunk-grid">
              {Array.from(
                { length: Math.ceil(httpServer.totalRows / 4) },
                (_, i) => {
                  const chunkStart = i * 4;
                  const chunkEnd = Math.min((i + 1) * 4, httpServer.totalRows);
                  const isSent = chunkStart < httpServer.currentRow;
                  const isCurrent =
                    chunkStart >= httpServer.currentRow &&
                    chunkStart < httpServer.currentRow + 4;
                  return (
                    <div
                      key={i}
                      className={`chunk-item ${isSent ? "sent" : ""} ${isCurrent ? "current" : ""}`}
                      title={`Чанк ${i + 1}: ряды ${chunkStart}-${chunkEnd - 1}`}
                    >
                      <span className="chunk-number">{i + 1}</span>
                      <span className="chunk-rows">
                        {chunkStart}-{chunkEnd - 1}
                      </span>
                      {isSent && <span className="chunk-status">✓</span>}
                      {isCurrent && <span className="chunk-status">⟳</span>}
                    </div>
                  );
                },
              )}
            </div>
          </div>
          <div className="connection-info">
            <p>
              <strong>Настройте ESP32:</strong>
              <br />В файле <code>client.rs</code> укажите IP вашего компьютера:
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
      {/* === ПАНЕЛЬ ТЕСТА НА СООТВЕТСТВИЕ === */}
      {showTestPanel && patternData && (
        <div className="solenoid-test-panel">
          <div className="test-header">
            <h4>🧪 Тест на соответствие DOB</h4>
            <button
              className="btn-close-test"
              onClick={() => setShowTestPanel(false)}
            >
              ✕
            </button>
          </div>

          {/* Статистика */}
          <div className="test-stats">
            <div className="stat-item stat-correct">
              <span className="stat-dot green"></span>
              <span>
                Верно: <strong>{hitStats.correct}</strong>
              </span>
            </div>
            <div className="stat-item stat-miss">
              <span className="stat-dot white"></span>
              <span>
                Пропуски: <strong>{hitStats.misses}</strong>
              </span>
            </div>
            <div className="stat-item stat-false">
              <span className="stat-dot red"></span>
              <span>
                Лишние: <strong>{hitStats.false_positives}</strong>
              </span>
            </div>
            <div className="stat-item stat-total">
              <span>
                Всего: <strong>{hitStats.total}</strong>
              </span>
            </div>
            <div className="stat-item stat-accuracy">
              <span>
                Точность: <strong>{hitStats.accuracy_pct}%</strong>
              </span>
            </div>
          </div>

          {/* Легенда */}
          <div className="test-legend">
            <span>
              <span className="legend-box green"></span> Верное срабатывание
            </span>
            <span>
              <span className="legend-box red"></span> Лишнее (сработал зря)
            </span>
            <span>
              <span className="legend-box white"></span> Пропуск (должен был)
            </span>
            <span>
              <span className="legend-box gray"></span> Не провязано
            </span>
          </div>

          {/* Canvas */}
          <div className="test-canvas-wrapper">
            <canvas ref={testCanvasRef} className="test-canvas" />
          </div>

          {hitStats.total === 0 && (
            <p className="test-hint">Ожидание данных от ESP32... Вяжите!</p>
          )}

          {hitStats.accuracy_pct < 90 && hitStats.total > 50 && (
            <div className="test-warning">
              ⚠️ Точность ниже 90%. Проверьте:
              <ul>
                <li>Дребезг контактов KSL/CCP</li>
                <li>Полярность DOB (LOW/HIGH)</li>
                <li>Скорость каретки</li>
                <li>Синхронизацию ND1</li>
              </ul>
            </div>
          )}
        </div>
      )}
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

      {error && <div className="error-message">❌ {error}</div>}

      {!patternData && !converting && (
        <div className="empty-state">
          <div className="empty-icon">🧶</div>
          <p>Выберите изображение и конвертируйте его в узор</p>
          <p className="hint">
            Поддерживаемые форматы: PNG, JPG, JPEG, BMP, GIF
          </p>
        </div>
      )}

      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
