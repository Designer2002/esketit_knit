use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct ThemeState {
    pub current: Mutex<String>,
    pub app_handle: Mutex<Option<AppHandle>>,
}

impl ThemeState {
    pub fn new(initial_theme: String) -> Self {
        Self {
            current: Mutex::new(initial_theme),
            app_handle: Mutex::new(None),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        if let Ok(mut h) = self.app_handle.lock() {
            *h = Some(handle);
        }
    }

    pub fn get_current(&self) -> String {
        self.current.lock().unwrap().clone()
    }

    pub fn update(&self, new_theme: String) -> Result<(), String> {
        let mut cur = self.current.lock().unwrap();
        if *cur != new_theme {
            *cur = new_theme.clone();
            if let Ok(app_handle_guard) = self.app_handle.lock() {
                if let Some(handle) = app_handle_guard.as_ref() {
                    handle.emit("event:theme-changed", new_theme)
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    }
}