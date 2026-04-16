#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod state;
mod database;
mod utilities;
mod algorhytms;
pub mod blueprint;

use tauri::Manager;
use state::{ThemeState, WindowState};
use config::load_config;
use commands::*;
use database::*;
use crate::algorhytms::convert_image_to_pattern;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Плагины
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new()
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
            ])
            .build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        
        // Инициализация состояния
       .setup(|app| {
            // === Инициализация БД (async в setup) ===
            let app_handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(init_db(&app_handle))
                .expect("Failed to initialize database");
            app.manage(pool);  // Делаем пул доступным для команд
            
            // === Тема ===
            let cfg = load_config(app.handle());
            let theme_state = ThemeState::new(cfg.theme);
            theme_state.set_app_handle(app.handle().clone());
            app.manage(theme_state);
            
            // === Состояние окон ===
            app.manage(WindowState::new());
            
            Ok(())
        })
        
        // Регистрация команд
        .invoke_handler(tauri::generate_handler![
            get_theme,
            set_theme,
            open_start_window,
            open_create_project_window,
            open_project_window,
            get_recent_projects,
            open_project,
            open_project_by_id,
            open_project_by_path,
            start_esp32_http_server,
            stop_esp32_http_server,
            get_esp32_http_server_status,
            get_computer_ip,
            send_esp_restart_signal,
            get_current_row_info,
            restore_knitting_progress,
            reset_knitting_progress,
            convert_image_to_pattern,
            create_project,
            get_garment_types,
            open_project_editor,
            read_dir,
            read_file_text,
            copy_file,
            remove_file,
            create_dir,
            file_exists,
            save_conversion,
            save_pattern,
            save_pattern_to_file,
            // Blueprint commands
            get_blueprint_templates,
            get_blueprint_nodes,
            save_blueprint_measurement,
            get_project_blueprint_measurements,
            update_blueprint_node,
            get_custom_blueprint_nodes,
            save_blueprint_pattern_stamp,
            get_blueprint_pattern_stamps,
            delete_blueprint_pattern_stamp,
            update_blueprint_pattern_stamp,
            clone_blueprint_pattern_stamp,
            save_blueprint_knitting_settings,
            get_blueprint_knitting_settings,
            calculate_blueprint,
            get_patterns_for_project,
            // Garment row-by-row knitting
            get_garment_row_instructions,
            get_garment_row_info,
            get_garment_part_row_range,
            save_garment_progress,
            load_garment_progress,
            calculate_blueprint,
        ])
        
        // Обработка закрытия окон
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" || window.label() == "start" {
                    let app = window.app_handle();
                    for w in app.webview_windows().values() {
                        if w.label() != "main" && w.label() != "start" {
                            w.close().ok();
                        }
                    }
                }
            }
        })
        
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}