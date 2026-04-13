use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark-blue".to_string(),
        }
    }
}

pub fn get_config_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir()
        .expect("Failed to get app config directory");
    if !dir.exists() {
        fs::create_dir_all(&dir).expect("Failed to create config directory");
    }
    dir.join("config.json")
}

pub fn load_config(app: &AppHandle) -> AppConfig {
    let path = get_config_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str(&content) {
                return cfg;
            }
        }
    }
    AppConfig::default()
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app);
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}