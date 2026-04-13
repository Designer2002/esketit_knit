use crate::state::WindowState;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::log;

#[tauri::command]
pub async fn open_start_window(app: AppHandle) -> Result<(), String> {
    // Закрываем текущее окно create_project
    if let Some(window) = app.get_webview_window("start") {
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
    // Если окно уже открыто — ничего не делаем
    if window_state.is_open() {
        return Ok(());
    }

    let window =
        WebviewWindowBuilder::new(&app, "start", WebviewUrl::App("#/create_project".into()))
            .title("Создание проекта")
            .inner_size(800.0, 700.0)
            .resizable(false)
            .build()
            .map_err(|e| format!("Failed to create window: {}", e))?;
    let w = app.get_webview_window("main").unwrap();
    w.close();
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
    window_state: State<'_, WindowState>,
) -> Result<(), String> {
    // Если окно уже открыто — ничего не делаем
    if window_state.is_open() {
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
    // 1. Создаём окно редактора
    let window_label = "editor";
    //let ALL_WINDOWS_LABELS: Vec<String> = app.webview_windows().keys().cloned().collect();
    let w = app.get_webview_window("main").unwrap_or_else(|| app.get_webview_window("start").expect("no windows"));
    w.close();
    if app.get_webview_window(&window_label).is_some() {
        // Окно уже открыто — просто фокусируем
        if let Some(window) = app.get_webview_window(&window_label) {
            window.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(());
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
