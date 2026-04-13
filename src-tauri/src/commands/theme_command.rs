use tauri::{State, AppHandle};
use crate::state::ThemeState;
use crate::config::{load_config, save_config, AppConfig};

#[tauri::command]
pub fn get_theme(state: State<ThemeState>) -> String {
    state.get_current()
}

#[tauri::command]
pub fn set_theme(
    theme: String,
    state: State<ThemeState>,
    app: AppHandle,
) -> Result<(), String> {
    // Обновляем в памяти
    state.update(theme.clone())?;
    
    // Сохраняем на диск
    let config = AppConfig { theme };
    save_config(&app, &config)?;
    
    Ok(())
}