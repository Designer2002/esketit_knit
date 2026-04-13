import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./SettingsTab.css";

export default function SettingsTab({ project, theme, onThemeChange }) {
  const [localTheme, setLocalTheme] = useState(theme);

  // Синхронизация с пропсами
  useEffect(() => {
    setLocalTheme(theme);
  }, [theme]);

  // Обработчик изменения темы
  const handleThemeChange = async (newTheme) => {
    setLocalTheme(newTheme);
    if (onThemeChange) {
      await onThemeChange(newTheme);
    }
  };

  return (
    <div className="settings-tab">
      <h3>⚙️ Настройки проекта</h3>

      <div className="settings-section">
        <h4>📊 Информация о проекте</h4>
        <div className="info-row">
          <span className="label">Название:</span>
          <span className="value">{project?.name || "—"}</span>
        </div>
        <div className="info-row">
          <span className="label">ID проекта:</span>
          <span className="value">{project?.project_id || "—"}</span>
        </div>
        <div className="info-row">
          <span className="label">Тип изделия:</span>
          <span className="value">{project?.garment_type_id || "—"}</span>
        </div>
      </div>

      <div className="settings-section">
        <h4>🎨 Тема интерфейса</h4>
        <select
          value={localTheme}
          onChange={(e) => handleThemeChange(e.target.value)}
          className="theme-select"
        >
          <option value="dark-blue">Ночь</option>
          <option value="dark-pink">Закат</option>
          <option value="light-orange">Рассвет</option>
          <option value="light-green">День</option>
          <option value="mrak">Мрак</option>
          <option value="mystika">Мистика</option>
          <option value="volshebstvo">Волшебство</option>
        </select>
      </div>

      <div className="settings-section">
        <h4>🔧 Настройки вязания</h4>
        <p className="hint">
          Настройки будут доступны в следующей версии
        </p>
      </div>
    </div>
  );
}
