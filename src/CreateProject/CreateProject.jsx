import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import "./CreateProject.css";
import useToast from "../Toast/useToast";
import "../Toast/Toast.css";
import { Sweater3DPreview } from "../Sweater3D/Sweater3D";

// ===== Компонент кнопки =====
function FancyButton({ children, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      className="fancy-button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: hover ? "var(--btn-hover-bg)" : "var(--btn-bg)",
        color: "var(--btn-text)",
        marginTop: "1.6rem",
      }}
      type="button"
    >
      {children}
    </button>
  );
}

export default function CreateProject() {
  const { addToast, ToastContainer } = useToast();
  
  // ===== Состояния =====
  const [theme, setTheme] = useState(() => {
    // Try to get theme from localStorage first (persists across tabs)
    try {
      return localStorage.getItem("app_theme") || "dark-blue";
    } catch {
      return "dark-blue";
    }
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [garmentTypes, setGarmentTypes] = useState([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedDirForNewFolder, setSelectedDirForNewFolder] = useState(null);
  const [newDirName, setNewDirName] = useState("");
  const [showAddDirInput, setShowAddDirInput] = useState(false);

  // ===== Загрузка типов изделий из БД =====
  const loadGarmentTypes = useCallback(async () => {
    try {
      const types = await invoke("get_garment_types");
      const formatted = types.map((type) => ({
        value: `gt_${type.id}`,
        title: type.name,
        description: `${type.category_name}: ${type.category_description || ""}`,
        db_id: type.id,
        category_name: type.category_name,
        category_description: type.category_description,
        body_region: type.body_region,
        base_measurements: type.base_measurements,
        included_parts: type.included_parts,
      }));
      setGarmentTypes(formatted);
    } catch (error) {
      console.error("Failed to load garment types:", error);
      setGarmentTypes([]);
    } finally {
      setIsLoadingTypes(false);
    }
  }, []);

  // ===== Выбор директории через диалог =====
  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        title: "Выберите директорию для проекта",
        multiple: false,
        directory: true
      });

      if (selected) {
        setSelectedDirForNewFolder(selected);
      }
    } catch (err) {
      console.error("Failed to open directory dialog:", err);
      addToast(`Ошибка выбора директории: ${err.message || err}`, "error");
    }
  };

  // ===== Создание новой папки =====
  const createNewDir = useCallback(async () => {
    if (!newDirName.trim()) {
      addToast("Пожалуйста, введите имя для новой папки", "warning");
      return;
    }
    if (!selectedDirForNewFolder) {
      addToast("Пожалуйста, выберите директорию для новой папки", "warning");
      return;
    }

    const newDirPath = `${selectedDirForNewFolder}/${newDirName}`;
    try {
      await invoke("create_dir", { path: newDirPath });
      setNewDirName("");
      setShowAddDirInput(false);
      setSelectedDirForNewFolder(newDirPath+"/"+newDirName);
      addToast(`Папка "${newDirName}" создана!`, "success");

    } catch (error) {
      console.error("Error creating directory:", error);
      addToast(`Ошибка: ${error}`, "error");
    }
  }, [newDirName, selectedDirForNewFolder]);

  // ===== Загрузка темы =====
  useEffect(() => {
    const initializeTheme = async () => {
      try {
        const savedTheme = await invoke("get_theme");
        setTheme(savedTheme);
        document.documentElement.className = savedTheme;
        // Persist to localStorage
        localStorage.setItem("app_theme", savedTheme);
      } catch (error) {
        console.error("Failed to load theme:", error);
        const fallback = "dark-blue";
        setTheme(fallback);
        document.documentElement.className = fallback;
        localStorage.setItem("app_theme", fallback);
      }
      setIsInitialized(true);
    };
    initializeTheme();
  }, []);

  // ===== Инициализация домашней директории =====
  useEffect(() => {
    const initHomeDir = async () => {
      try {
        const homePath = await homeDir();
        setSelectedDirForNewFolder(homePath);
      } catch (err) {
        console.error("Failed to get home directory:", err);
      }
    };
    initHomeDir();
  }, []);

  // ===== Загрузка типов изделий =====
  useEffect(() => { loadGarmentTypes(); }, [loadGarmentTypes]);

  // ===== Применение темы =====
  useEffect(() => {
    if (isInitialized) {
      document.documentElement.className = theme;
    }
  }, [theme, isInitialized]);

  // ===== Dropdown logic =====
  const dropdownRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleDropdown() { setIsOpen((prev) => !prev); }

  function setSelectedContent(option) {
    if (!option) {
      return (
        <div>
          <h2>Выберите изделие</h2>
          <p>Тип изделия определит доступные мерки и шаблоны деталей</p>
        </div>
      );
    }
    return (
      <div>
        <h2>{option.title}</h2>
        <p>{option.description}</p>
        {option.db_id && (
          <small style={{ opacity: 0.7, display: "block", marginTop: "0.5rem" }}>
            ID типа: {option.db_id}
          </small>
        )}
      </div>
    );
  }

  function onOptionSelect(option) {
    setSelectedOption(option);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function onKeyDown(event) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
      setHighlightedIndex(0);
      event.preventDefault();
    } else if (isOpen) {
      if (event.key === "ArrowDown") {
        setHighlightedIndex((idx) => (idx < garmentTypes.length ? idx + 1 : 0));
        event.preventDefault();
      } else if (event.key === "ArrowUp") {
        setHighlightedIndex((idx) => (idx > 0 ? idx - 1 : garmentTypes.length));
        event.preventDefault();
      } else if (event.key === "Enter" && highlightedIndex >= 0) {
        onOptionSelect(highlightedIndex < garmentTypes.length ? garmentTypes[highlightedIndex] : { value: "custom", title: "Другое изделие", description: "Создать вручную", db_id: null });
        event.preventDefault();
      } else if (event.key === "Escape") {
        setIsOpen(false);
        setHighlightedIndex(-1);
        event.preventDefault();
      }
    }
  }

  return (
    <>
      <div className="app-container" role="main" aria-label="Application Main Container">
        {/* Back Button */}
        <button
          className="btn-back-global"
          onClick={async () => {
            try {
              await invoke("open_create_project_window");
            } catch (error) {
              console.error("Failed to navigate back:", error);
            }
          }}
          type="button"
          aria-label="Назад"
          title="Вернуться на главную"
        >
          ← Назад
        </button>

        {/* ===== Left panel: Combobox + Preview ===== */}
        <section className="left-panel" aria-labelledby="select-heading">
          <div className="project-name-wrapper">
            <label htmlFor="project-name-input" className="project-name-label">
              Название проекта *
            </label>
            <input
              id="project-name-input"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Например: Мой первый свитер"
              className="project-name-input"
              maxLength={100}
              autoFocus
            />
            {projectName.trim() && (
              <small className="project-name-hint">
                Файл будет сохранён как: <strong>{projectName.trim()}.esketit</strong>
              </small>
            )}
          </div>

          <div className="project-description-wrapper">
            <label htmlFor="project-description-input" className="project-description-label">
              Описание проекта
            </label>
            <textarea
              id="project-description-input"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Например: Свитер с аранами для зимы"
              className="project-description-input"
              maxLength={500}
              rows={3}
            />
          </div>

          <label id="select-heading" htmlFor="dropdown-button">Выберите изделие</label>
          <div className="dropdown-wrapper" ref={dropdownRef}>
            <button
              className={`dropdown-button${isOpen ? " open" : ""}`}
              type="button"
              onClick={toggleDropdown}
              onKeyDown={onKeyDown}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              aria-labelledby="select-heading"
              id="dropdown-button"
            >
              <span>{selectedOption ? selectedOption.title : "Выберите изделие"}</span>
              <span className="arrow" aria-hidden="true">▾</span>
            </button>

            {isOpen && (
              <ul className="dropdown-list" role="listbox" aria-labelledby="select-heading" tabIndex={-1}>
                {isLoadingTypes ? (
                  <li className="dropdown-item" style={{ fontStyle: "italic", opacity: 0.7 }}>Загрузка типов изделий...</li>
                ) : garmentTypes.length === 0 ? (
                  <li className="dropdown-item" style={{ fontStyle: "italic", opacity: 0.7 }}>Нет доступных типов. Добавьте в БД.</li>
                ) : (
                  <>
                    {garmentTypes.map((option, idx) => (
                      <li
                        key={option.value}
                        role="option"
                        aria-selected={selectedOption?.value === option.value ? "true" : "false"}
                        tabIndex={-1}
                        className={`dropdown-item ${idx === highlightedIndex ? "highlighted" : ""}`}
                        onClick={() => onOptionSelect(option)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onMouseLeave={() => setHighlightedIndex(-1)}
                      >
                        <span>{option.title}</span>
                        <span className="dropdown-item-description">{option.description}</span>
                      </li>
                    ))}
                    <li key="custom" role="option" className="dropdown-item" onClick={() => onOptionSelect({ value: "custom", title: "Другое изделие", description: "Создать вручную", db_id: null })}>
                      <span>🛠️ Другое изделие</span>
                      <span className="dropdown-item-description">Изделие, выкройка которого спроектирована вручную</span>
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>

          <div className="checkbox-wrapper" aria-live="polite" style={{ marginTop: "-1.5rem", fontWeight: 600, fontSize: "1rem" }}>
            {setSelectedContent(selectedOption)}
          </div>
        </section>

        {/* ===== Right panel: Directory Selection ===== */}
        <section className="right-panel" aria-labelledby="dir-heading">
          <label id="dir-heading">Выберите директорию</label>
          <div className="subtext">Папка, в которой будет создан проект</div>

          {/* Directory selection button */}
          <div className="directory-selection-area">
            <button
              className="btn-select-directory"
              onClick={handleSelectDirectory}
              type="button"
            >
              📁 {selectedDirForNewFolder ? "Изменить директорию" : "Выбрать директорию"}
            </button>

            {selectedDirForNewFolder && (
              <div className="selected-directory-info">
                <div className="directory-path" title={selectedDirForNewFolder}>
                  📂 {selectedDirForNewFolder}
                </div>
              </div>
            )}
          </div>

          {/* Кнопка создания папки */}
          {selectedDirForNewFolder && !showAddDirInput && (
            <button onClick={() => setShowAddDirInput(true)} className="add-dir-button" type="button" title="Создать новую папку">
              + Новая папка
            </button>
          )}

          {/* Input для новой папки */}
          {showAddDirInput && (
            <div className="add-dir-input-container">
              <input
                type="text"
                value={newDirName}
                onChange={(e) => setNewDirName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createNewDir();
                  if (e.key === "Escape") { setShowAddDirInput(false); setNewDirName(""); }
                }}
                placeholder="Имя папки"
                className="new-dir-name-input"
                autoFocus
              />
              <div className="add-dir-buttons">
                <button onClick={createNewDir} className="btn-confirm-dir" type="button" title="Создать папку">✓</button>
                <button onClick={() => { setShowAddDirInput(false); setNewDirName(""); }} className="btn-cancel-dir" type="button" title="Отмена">✕</button>
              </div>
            </div>
          )}

          {/* 3D превью свитера (компактное, после директории) */}
          {isInitialized && (
            <div role="region" aria-label="3D preview" className="preview-3d preview-3d-compact">
              <Sweater3DPreview height={140} />
            </div>
          )}

          <FancyButton
            onClick={async () => {
              if (!selectedOption) { addToast("Пожалуйста, выберите тип изделия", "warning"); return; }
              if (!selectedDirForNewFolder) { addToast("Пожалуйста, выберите директорию", "warning"); return; }
              if (!projectName.trim()) {
                const input = document.getElementById("project-name-input");
                if (input) {
                  input.style.borderColor = "#ef4444";
                  input.focus();
                  setTimeout(() => { input.style.borderColor = ""; }, 2000);
                }
                addToast("Пожалуйста, введите название проекта", "warning");
                return;
              }

              try {
                const response = await invoke("create_project", {
                  request: {
                    name: projectName.trim(),
                    description: projectDescription.trim() || null,
                    garment_type_id: selectedOption.db_id ?? 1,
                    file_path: selectedDirForNewFolder,
                  },
                });
                addToast(`Проект создан!\n📁 Файл: ${response.file_path}\n🆔 ID: ${response.project_id}`, "success");
                await invoke("open_project_editor", { projectId: response.project_id });
              } catch (error) {
                console.error("Failed to create project:", error);
                addToast(`Ошибка создания проекта:\n${error}`, "error");
              }
            }}
          >
            Подтвердить
          </FancyButton>
        </section>
      </div>

      {/* ===== Toast Container ===== */}
      <ToastContainer />
    </>
  );
}
