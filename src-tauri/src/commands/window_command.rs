use crate::state::WindowState;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::log;

#[tauri::command]
pub async fn open_start_window(app: AppHandle) -> Result<(), String> {
    // Если окно "main" уже есть - фокусируем его
    if let Some(window) = app.get_webview_window("main") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Если есть окно create_project - закрываем его
    if let Some(window) = app.get_webview_window("start") {
        let _ = window.close();
    }
    
    // Если есть окно editor - закрываем его
    if let Some(window) = app.get_webview_window("editor") {
        let _ = window.close();
    }

    // Создаём главное окно
    let _window = WebviewWindowBuilder::new(&app, "main", WebviewUrl::App("#/".into()))
        .title("EsketitKnit - Главная")
        .inner_size(900.0, 700.0)
        .resizable(false)
        .build()
        .map_err(|e| format!("Failed to create main window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_create_project_window(
    app: AppHandle,
    window_state: State<'_, WindowState>,
) -> Result<(), String> {
    // Закрываем старое main/editor окна если есть
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("editor") {
        let _ = w.close();
    }

    // Если окно уже открыто — фокусируем его
    if let Some(window) = app.get_webview_window("start") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window =
        WebviewWindowBuilder::new(&app, "start", WebviewUrl::App("#/create_project".into()))
            .title("Создание проекта")
            .inner_size(800.0, 700.0)
            .resizable(false)
            .build()
            .map_err(|e| format!("Failed to create window: {}", e))?;

    // Помечаем как открытое
    window_state.set_open(true);

    // Сбрасываем флаг при закрытии
    let flag = window_state.create_project_open.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            flag.store(false, std::sync::atomic::Ordering::Release);
        }
    });

    #[cfg(debug_assertions)]
    window.open_devtools();

    Ok(())
}

#[tauri::command]
pub async fn open_project_window(
    app: AppHandle,
    _window_state: State<'_, WindowState>,
) -> Result<(), String> {
    // Закрываем старое main окно если есть
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("editor") {
        let _ = w.close();
    }

    // Если окно уже открыто — фокусируем его
    if let Some(window) = app.get_webview_window("open_project") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let _window = WebviewWindowBuilder::new(
        &app,
        "open_project",
        WebviewUrl::App("#/open_project".into()),
    )
    .title("Открыть проект")
    .inner_size(900.0, 700.0)
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_project_editor(app: AppHandle, project_id: i64) -> Result<(), String> {
    let window_label = "editor";

    // Окно уже открыто — просто фокусируем
    if let Some(window) = app.get_webview_window(&window_label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Закрываем старое окно если есть
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    } else if let Some(w) = app.get_webview_window("start") {
        let _ = w.close();
    } else if let Some(w) = app.get_webview_window("open_project") {
        let _ = w.close();
    }

    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::App(format!("#/editor/{}", project_id).into()),
    )
    .title("Редактор проекта")
    .inner_size(1200.0, 800.0)
    .resizable(true)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}
