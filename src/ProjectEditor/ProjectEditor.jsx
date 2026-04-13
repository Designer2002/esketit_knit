import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./ProjectEditor.css";

// ===== Компоненты-вкладки =====
import PatternsTab from "../PatternsTab/PatternsTab";
import KnittingTab from "../KnittingTab/KnittingTab";
import SettingsTab from "../SettingsTab/SettingsTab";
import BlueprintsTab from "../BlueprintsTab/BlueprintsTab";
import ProductKnittingTab from "../ProductKnittingTab/ProductKnittingTab";
import RenderTab from "../RenderTab/RenderTab";


export default function ProjectEditor() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("knitting");
  const [theme, setTheme] = useState("dark-blue");
  const [selectedPatternForKnitting, setSelectedPatternForKnitting] = useState(null);

  // Загрузка темы и применение при изменении
  useEffect(() => {
    const loadAndApplyTheme = async () => {
      try {
        const savedTheme = await invoke("get_theme");
        setTheme(savedTheme);
        applyTheme(savedTheme);
      } catch (error) {
        console.error("Failed to load theme:", error);
      }
    };
    loadAndApplyTheme();
  }, []);

  // Функция применения темы к CSS переменным
  const applyTheme = (themeName) => {
    const root = document.documentElement;
    root.className = themeName;
  };

  // Обработчик изменения темы из SettingsTab
  const handleThemeChange = async (newTheme) => {
    try {
      await invoke("set_theme", { theme: newTheme });
      setTheme(newTheme);
      applyTheme(newTheme);
    } catch (error) {
      console.error("Failed to set theme:", error);
    }
  };

  // Загрузка проекта
  useEffect(() => {
    const loadProject = async () => {
      try {
        const data = await invoke("open_project_by_id", { 
          projectId: parseInt(projectId),
        });
        setProject(data);
        
        // Парсим базовые данные из XML (опционально)
        // const parsed = parseProjectXml(data.xml_content);
        // setProject(prev => ({ ...prev, ...parsed }));
        
      } catch (error) {
        console.error("Failed to load project:", error);
        // Можно показать модалку с ошибкой и вернуться назад
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  // Обработка закрытия окна
  const handleClose = useCallback(async () => {
    // Здесь можно добавить проверку на несохранённые изменения
    await getCurrentWindow().close();
  }, []);

  // Горячие клавиши
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          // handleSave();
        } else if (e.key === "w") {
          e.preventDefault();
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  if (loading) {
    return (
      <div className={`editor-loading ${theme}`}>
        <div className="spinner" />
        <p>Загрузка проекта...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className={`editor-error ${theme}`}>
        <p>❌ Не удалось загрузить проект</p>
        <button onClick={() => navigate("/")}>На главную</button>
      </div>
    );
  }

  return (
    <div className={`project-editor ${theme}`}>
      {/* Header */}
      <header className="editor-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate("/")}>
            ←
          </button>
          <h1>{project.name}</h1>
          <span className="project-id">#{project.project_id}</span>
        </div>
        <div className="header-right">
          <button className="btn-save" title="Сохранить (Ctrl+S)">
            💾 Сохранить
          </button>
          <button className="btn-close" onClick={handleClose} title="Закрыть (Ctrl+W)">
            ✕
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="editor-tabs">
        <button
          className={`tab-btn ${activeTab === "product" ? "active" : ""}`}
          onClick={() => setActiveTab("product")}
        >
          🧶 Вязание изделия
        </button>
        <button
          className={`tab-btn ${activeTab === "knitting" ? "active" : ""}`}
          onClick={() => setActiveTab("knitting")}
        >
           Вязание узора
        </button>
        <button
          className={`tab-btn ${activeTab === "patterns" ? "active" : ""}`}
          onClick={() => setActiveTab("patterns")}
        >
          📐 Узоры
        </button>
        <button
          className={`tab-btn ${activeTab === "blueprints" ? "active" : ""}`}
          onClick={() => setActiveTab("blueprints")}
        >
          📝 Выкройки
        </button>
        <button
          className={`tab-btn ${activeTab === "render" ? "active" : ""}`}
          onClick={() => setActiveTab("render")}
        >
          🎨 Рендер
        </button>
        <button
          className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          ⚙️ Настройки
        </button>
      </nav>

      {/* Content */}
      <main className="editor-content">
        {activeTab === "product" && (
          <ProductKnittingTab projectId={project.project_id} />
        )}
        {activeTab === "knitting" && (
          <KnittingTab
            projectId={project.project_id}
            garmentTypeId={project.garment_type_id}
            selectedPatternFromPatterns={selectedPatternForKnitting}
            onSelectPatternFromGallery={setSelectedPatternForKnitting}
          />
        )}
        {activeTab === "patterns" && (
          <PatternsTab
            projectId={project.project_id}
            garmentTypeId={project.garment_type_id}
          />
        )}
        {activeTab === "blueprints" && (
          <BlueprintsTab projectId={project.project_id} />
        )}
        {activeTab === "render" && (
          <RenderTab projectId={project.project_id} />
        )}
        {activeTab === "settings" && (
          <SettingsTab project={project} theme={theme} onThemeChange={handleThemeChange} />
        )}
      </main>
    </div>
  );
}