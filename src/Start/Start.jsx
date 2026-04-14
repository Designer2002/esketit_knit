import { useEffect, useState } from "react";
import logo from "../assets/pics/logo.png";
import item1 from "../assets/pics/silver_reed.jpg";
import item2 from "../assets/pics/cloth1.png";
import item3 from "../assets/pics/cloth2.avif";
import { invoke } from "@tauri-apps/api/core";
import "./Start.css";
import "../CreateProject/CreateProject.css";
import { Window } from "@tauri-apps/api/window";


const themes = {
  "dark-blue": {
    bgGradient: "linear-gradient(135deg, #0f172a 0%, #1e40af 100%)",
    textColor: "#e0e7ff",
    btnBg: "#1e40af",
    btnHoverBg: "#1e3a8a",
    btnText: "#e0e7ff",
    selectBg: "rgba(15, 23, 42, 0.7)",
  },
  "dark-pink": {
    bgGradient: "linear-gradient(135deg, #1e293b 0%, #be185d 100%)",
    textColor: "#fce7f3",
    btnBg: "#be185d",
    btnHoverBg: "#9d174d",
    btnText: "#fce7f3",
    selectBg: "rgba(30, 41, 59, 0.7)",
  },
  "light-orange": {
    bgGradient: "linear-gradient(135deg, #fed7aa 0%, #fef3c7 100%)",
    textColor: "#5f370e",
    btnBg: "#fb923c",
    btnHoverBg: "#f97316",
    btnText: "#5f370e",
    selectBg: "rgba(255, 247, 237, 0.75)",
  },
  "light-green": {
    bgGradient: "linear-gradient(135deg, #bbf7d0 0%, #d1fae5 100%)",
    textColor: "#064e3b",
    btnBg: "#22c55e",
    btnHoverBg: "#16a34a",
    btnText: "#064e3b",
    selectBg: "rgba(220, 252, 231, 0.75)",
  },
  "mrak": {
    bgGradient: "linear-gradient(135deg, #150f16 0%, #374652 50%, #5b3d3d 100%)",
    textColor: "#e9ded8",
    btnBg: "#ba1f1f",
    btnHoverBg: "#8b1515",
    btnText: "#e9ded8",
    selectBg: "rgba(21, 15, 22, 0.9)",
  },
  "mystika": {
    bgGradient: "linear-gradient(135deg, #100a18 0%, #311b50 40%, #472970 70%, #924bef 100%)",
    textColor: "#e9ded8",
    btnBg: "#924bef",
    btnHoverBg: "#6d538f",
    btnText: "#e9ded8",
    selectBg: "rgba(16, 10, 24, 0.9)",
  },
  "volshebstvo": {
    bgGradient: "linear-gradient(135deg, #100a18 0%, #710042 30%, #017c83 70%, #95eef4 100%)",
    textColor: "#fbccdc",
    btnBg: "#00b5ae",
    btnHoverBg: "#017c83",
    btnText: "#ffffff",
    selectBg: "rgba(0, 84, 101, 0.9)",
  },
};

export default function App() {
  const [theme, setTheme] = useState("dark-blue");
  const [isInitialized, setIsInitialized] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  // ===== Состояние для модалки недавних проектов =====
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [recentSearch, setRecentSearch] = useState("");

  // Фильтрация списка:
  const filteredProjects = recentProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(recentSearch.toLowerCase()) ||
      p.file_path.toLowerCase().includes(recentSearch.toLowerCase()),
  );

  const load_config = async () => {
    try {
      const theme = await invoke("get_theme");
      return { theme };
    } catch (error) {
      console.error("Failed to load config:", error);
      return { theme: "dark-blue" }; // fallback
    }
  };

  const saveSettings = async (settings) => {
    try {
      await invoke("set_theme", { theme: settings.theme });
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  const loadRecentProjects = async () => {
    setLoadingRecent(true);
    try {
      const projects = await invoke("get_recent_projects");
      setRecentProjects(projects);
    } catch (error) {
      console.error("Failed to load recent projects:", error);
      setRecentProjects([]);
    } finally {
      setLoadingRecent(false);
    }
  };

const handleOpenProject = async (project) => {
  try {
    setShowRecentModal(false);
    // 1. Открываем окно редактора
    await invoke("open_project_editor", { projectId: project.id });
  
    
    
  } catch (error) {
    console.error("Failed to open project:", error);
  }
};
  // ===== Обработка клавиатуры в модалке =====
  const handleRecentModalKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, recentProjects.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && recentProjects[highlightedIndex]) {
      e.preventDefault();
      handleOpenProject(recentProjects[highlightedIndex]);
    } else if (e.key === "Escape") {
      setShowRecentModal(false);
    }
  };

  useEffect(() => {
    // Загружаем настройки асинхронно
    const loadSettings = async () => {
      const settings = await load_config();
      setTheme(settings.theme);
      setIsInitialized(true);
    };

    loadSettings();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      document.documentElement.className = theme;
      saveSettings({ theme });
    }
  }, [theme, isInitialized]);

  const currentTheme = themes[theme]; // This will now always be valids
  const btnStyle = {
    backgroundColor: currentTheme.btnBg,
    color: currentTheme.btnText,
    boxShadow:
      "0 4px 6px rgba(0,0,0,0.3), inset 0 0 0 0 rgba(255, 255, 255, 0)",
    borderRadius: "12px",
    padding: "12px 24px",
    fontWeight: "600",
    cursor: "pointer",
    transition:
      "transform 0.15s ease, background-color 0.3s ease, box-shadow 0.3s ease",
    border: "none",
    userSelect: "none",
    backdropFilter: "blur(6px)",
  };

  const buttonHoverStyle = {
    backgroundColor: currentTheme.btnHoverBg,
    boxShadow:
      "0 8px 12px rgba(0,0,0,0.4), inset 0 0 15px 2px rgba(255, 255, 255, 0.15)",
  };

  const showModal = ({
    title,
    message,
    type = "confirm",
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

  const closeModal = () => {
    setModal((prev) => ({ ...prev, isOpen: false }));
  };

  const FancyButton = ({ label, onClick }) => {
    const [hover, setHover] = useState(false);
    const [active, setActive] = useState(false);

    const style = {
      ...btnStyle,
      ...(hover ? buttonHoverStyle : {}),
      transform: active ? "scale(0.95)" : hover ? "scale(1.05)" : "scale(1)",
      outline: "none",
    };

    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          setActive(false);
        }}
        onMouseDown={() => setActive(true)}
        onMouseUp={() => setActive(false)}
        onFocus={() => setHover(true)}
        onBlur={() => {
          setHover(false);
          setActive(false);
        }}
        style={style}
        type="button"
        aria-label={label}
      >
        {label}
      </button>
    );
  };

  // Responsive handling to stack vertically on small screens
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: currentTheme.bgGradient,
        color: currentTheme.textColor,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0",
        width: "100%",
        transition: "all 0.6s ease-in-out",
        fontFamily:
          "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif, serif",
        userSelect: "none",
        position: "relative",
      }}
      id="root"
    >
      {/* Theme Selector */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10,
        }}
      >
        <select
          aria-label="Select Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          style={{
            borderRadius: "16px",
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            fontWeight: "600",
            color: currentTheme.textColor,
            backgroundColor: currentTheme.selectBg,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            backdropFilter: "blur(10px)",
            transition: "background-color 0.3s ease, color 0.3s ease",
            userSelect: "none",
          }}
        >
          <option value="dark-blue">Ночь</option>
          <option value="light-orange">Рассвет</option>
          <option value="light-green">День</option>
          <option value="dark-pink">Закат</option>
          <option value="mrak">Мрак</option>
          <option value="mystika">Мистика</option>
          <option value="volshebstvo">Волшебство</option>
        </select>
      </div>

      {/* Container with glass effect */}
      <div
        style={{
          maxWidth: "900px",
          width: "80%",
          backgroundColor: theme.includes("dark")
            ? "rgba(0, 0, 0, 0.5)"
            : "rgba(255, 255, 255, 0.5)",
          borderRadius: "24px",
          padding: "2.5rem 3rem",
          boxShadow:
            "0 8px 32px 0 rgba(31, 38, 135, 0.37), inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(15px)",
          color: currentTheme.textColor,
          userSelect: "text",
          transition: "background-color 0.5s ease",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
          alignItems: "stretch",
        }}
      >
        {/* Header: Title + Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1.5rem",
          }}
        >
          {/* Description */}
          <h1
            style={{
              flex: 1,
              fontSize: "2rem",
              fontWeight: "900",
              lineHeight: 1.1,
              textShadow:
                "0 0 8px rgba(255, 255, 255, 0.7), 0 0 16px rgba(0, 0, 0, 0.6)",
              textAlign: isMobile ? "center" : "left",
              margin: 0,
            }}
          >
            Готовы воплотить Ваши идеи?
          </h1>

          {/* Logo */}
          <div
            style={{
              flex: "0 0 280px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img
              src={logo}
              alt="Logo"
              style={{
                maxWidth: "100%",
                borderRadius: "30px",
                boxShadow:
                  "0 12px 20px rgba(0,0,0,0.7), 0 0 40px rgba(255,255,255,0.15)",
                transition: "transform 0.5s ease",
                cursor: "pointer",
                userSelect: "none",
                transformOrigin: "center",
              }}
              loading="lazy"
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "rotate(6deg)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "rotate(0deg)")
              }
            />
          </div>
        </div>

        {/* Images row — теперь ПОСЛЕ заголовка, со скруглёнными углами */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {[item1, item2, item3].map((src, idx) => (
            <img
              key={idx}
              src={src}
              alt={`Preview ${idx + 1}`}
              style={{
                maxWidth: "180px",
                width: "30%",
                borderRadius: "16px", // ✨ скруглённые углы
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                objectFit: "cover",
                transition: "transform 0.2s ease",
                cursor: "pointer",
                userSelect: "none",
              }}
              loading="lazy"
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "scale(1.03)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            />
          ))}
        </div>

        {/* Description text & buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            alignItems: isMobile ? "center" : "flex-start",
            maxWidth: "600px",
            margin: "0 auto",
            textAlign: isMobile ? "center" : "left",
          }}
        >
          <p
            aria-live="polite"
            style={{
              fontStyle: "italic",
              opacity: 0.85,
              fontSize: "1.25rem",
              fontFamily: "'Georgia', serif",
              textShadow:
                "1px 1px 1px rgba(0,0,0,0.4), -1px -1px 2px rgba(255,255,255,0.3)",
              margin: 0,
            }}
          >
            Творите свободно. Ваш стиль - Ваш флекс. Эщкере.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              justifyContent: isMobile ? "center" : "flex-start",
            }}
          >
            <FancyButton
              label="Недавние проекты"
              onClick={() => {
                loadRecentProjects();
                setShowRecentModal(true);
                setHighlightedIndex(0);
              }}
            />
            <FancyButton
              label="Новый проект"
              onClick={() => invoke("open_create_project_window")}
            />
            <FancyButton
              label="Открыть проект"
              onClick={() => invoke("open_project_window")}
            />
            <FancyButton 
              label="Выйти" 
              onClick={() => {
                const appWindow = Window.getCurrent();
                appWindow.close();
              }} 
            />
          </div>
        </div>
      </div>
      {/* Footer */}
      <footer
        style={{
          marginTop: "2rem",
          fontSize: "0.875rem",
          opacity: 0.75,
          borderTop: `1px solid ${currentTheme.textColor}33`,
          paddingTop: "1rem",
          width: "100%",
          maxWidth: "900px",
          textAlign: "center",
          userSelect: "none",
          color: currentTheme.textColor,
          fontWeight: "400",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          transition: "color 0.3s ease",
        }}
      >
        Эщкере Книт © 2025-2026{" "}
        <a
          href="https://github.com/Designer2002"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline", color: currentTheme.textColor }}
        >
          https://github.com/Designer2002
        </a>
      </footer>
      {/* ===== MODAL: Recent Projects ===== */}
      {showRecentModal && (
        <div
          className="modal-backdrop"
          onClick={(e) =>
            e.target === e.currentTarget && setShowRecentModal(false)
          }
          onKeyDown={handleRecentModalKeyDown}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div className="modal-card recent-projects">
            <div className="modal-header">
              <span className="modal-icon">📁</span>
              <h3 className="modal-title">Недавние проекты</h3>
              <button
                className="modal-close"
                onClick={() => setShowRecentModal(false)}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            {recentProjects.length > 5 && (
              <input
                type="text"
                placeholder="🔍 Поиск проектов..."
                value={recentSearch}
                onChange={(e) => {
                  setRecentSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                className="recent-search-input"
                autoFocus
              />
            )}
            <div className="recent-list">
              {loadingRecent ? (
                <div className="recent-item loading">Загрузка...</div>
              ) : recentProjects.length === 0 ? (
                <div className="recent-item empty">
                  Нет недавних проектов.
                  <br />
                  <small>Создайте новый проект, чтобы он появился здесь.</small>
                </div>
              ) : (
                recentProjects.map((proj, idx) => (
                  <div
                    key={proj.id}
                    className={`recent-item ${idx === highlightedIndex ? "highlighted" : ""} ${proj.pinned ? "pinned" : ""}`}
                    onClick={() => handleOpenProject(proj)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="recent-header">
                      {proj.pinned && (
                        <span className="pin-icon" title="Закреплён">
                          📌
                        </span>
                      )}
                      <span className="recent-name">{proj.name}</span>
                    </div>
                    <div className="recent-path" title={proj.file_path}>
                      {proj.file_path}
                    </div>
                    <div className="recent-meta">
                      <span>
                        Создан:{" "}
                        {new Date(proj.created_at).toLocaleDateString("ru-RU")}
                      </span>
                      <span>•</span>
                      <span>
                        Открыт:{" "}
                        {new Date(proj.last_opened).toLocaleDateString("ru-RU")}
                      </span>
                      <span>•</span>
                      <span>{proj.open_count} раз</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-footer">
              <small className="modal-hint">
                ↑↓ навигация • Enter открыть • Esc закрыть
              </small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
