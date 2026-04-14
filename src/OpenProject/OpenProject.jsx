import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import useToast from "../Toast/useToast";
import "../Toast/Toast.css";
import "./OpenProject.css";

export default function OpenProject() {
  const navigate = useNavigate();
  const { addToast, ToastContainer } = useToast();
  const [theme, setTheme] = useState("dark-blue");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Загрузка темы
  useEffect(() => {
    invoke("get_theme").then(setTheme).catch(() => {});
  }, []);

  // Открытие диалога выбора файла
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        title: "Выберите файл проекта .esketit",
        multiple: false,
        filters: [{
          name: "Esketit Project",
          extensions: ["esketit"]
        }]
      });

      if (selected) {
        setSelectedFile(selected);
        setError(null);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
      addToast(`Ошибка выбора файла: ${err.message || err}`, "error");
    }
  };

  // Открытие проекта
  const handleOpen = async () => {
    if (!selectedFile) {
      setError("Пожалуйста, выберите файл .esketit");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke("open_project_by_path", {
        path: selectedFile
      });

      console.log("Project opened:", result);
      addToast(`Проект открыт: ${result.name}`, "success");

    } catch (err) {
      console.error("Failed to open project:", err);
      setError(`Ошибка: ${err.message || err}`);
      addToast(`Ошибка открытия: ${err.message || err}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`open-project ${theme}`}>
      <button
        className="btn-back-global"
        onClick={() => navigate("/")}
        type="button"
        aria-label="Назад"
      >
        ← Назад
      </button>

      <div className="open-project-header">
        <h2>📂 Открыть проект</h2>
        <p>Выберите файл .esketit</p>
      </div>

      <div className="open-project-body">
        <div className="file-select-area">
          <button
            className="btn-select-file"
            onClick={handleSelectFile}
            disabled={loading}
          >
            📁 {selectedFile ? "Изменить файл" : "Выбрать файл"}
          </button>

          {selectedFile && (
            <div className="selected-file-info">
              <div className="file-name">
                📄 {selectedFile.split("/").pop()}
              </div>
              <div className="file-path" title={selectedFile}>
                {selectedFile}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}
      </div>

      <div className="open-project-footer">
        <div className="buttons">
          <button
            className="btn-open"
            onClick={handleOpen}
            disabled={!selectedFile || loading}
          >
            {loading ? "Открытие..." : "Открыть"}
          </button>
          <button
            className="btn-cancel"
            onClick={() => window.close()}
            disabled={loading}
          >
            Отмена
          </button>
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}
