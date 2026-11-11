use bytes::Bytes;
use http_body_util::Full;
use hyper::{server::conn::http1, service::service_fn, Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::json;
use std::net::SocketAddr;
use std::sync::{Arc, LazyLock};
use tauri_plugin_log::log::error;
use tokio::sync::{Mutex, Notify, RwLock};

use crate::utilities::KnitPattern;
use keepawake::{Builder, KeepAwake};

/// Состояние HTTP сервера
#[derive(Clone)]
pub struct HttpServerState {
    pub pattern: Arc<RwLock<KnitPattern>>,
    pub current_row: Arc<Mutex<usize>>,
    pub current_direction: Arc<Mutex<String>>, // "left" или "right"
    pub is_esp_connected: Arc<Mutex<bool>>,    // ESP32 подключился хотя бы раз
    pub total_rows: usize,
    pub is_running: Arc<Mutex<bool>>,
    pub server_ip: Arc<RwLock<String>>,
    pub restart: Arc<Mutex<bool>>,
    pub shutdown: Arc<Notify>,
    pub keepawake: Arc<Mutex<Option<KeepAwake>>>,
}

impl HttpServerState {
    pub fn new(pattern: KnitPattern) -> Self {
        let total_rows = pattern.height;
        Self {
            pattern: Arc::new(RwLock::new(pattern)),
            current_row: Arc::new(Mutex::new(0)),
            current_direction: Arc::new(Mutex::new("right".to_string())),
            is_esp_connected: Arc::new(Mutex::new(false)),
            total_rows,
            is_running: Arc::new(Mutex::new(false)),
            server_ip: Arc::new(RwLock::new(String::new())),
            restart: Arc::new(Mutex::new(false)),
            shutdown: Arc::new(Notify::new()),
            keepawake: Arc::new(Mutex::new(None)),
        }
    }
}

// Глобальное состояние сервера
static SERVER_STATE: LazyLock<Arc<RwLock<Option<Arc<HttpServerState>>>>> =
    LazyLock::new(|| Arc::new(RwLock::new(None)));

/// Запуск HTTP сервера для ESP32
#[tauri::command]
pub async fn start_esp32_http_server(
    pattern_rows: Vec<Vec<bool>>,
    pattern_width: usize,
    pattern_height: usize,
    _chunk_size: Option<usize>, // Игнорируется, узор отправляется целиком
    port: Option<u16>,
) -> Result<String, String> {
    // Проверяем, не запущен ли уже сервер
    {
        let state_guard = SERVER_STATE.read().await;
        if let Some(state) = &*state_guard {
            let is_running = *state.is_running.lock().await;
            if is_running {
                println!("⚠️ Сервер уже запущен, останавливаем...");
                drop(state_guard);
                stop_esp32_http_server().await?;
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }

    let pattern = KnitPattern {
        rows: pattern_rows,
        width: pattern_width,
        height: pattern_height,
    };

    let state = Arc::new(HttpServerState::new(pattern));
    let mut keepawake_guard = state.keepawake.lock().await;
    *keepawake_guard =
        Some(Builder::default()
        .display(true)
        .idle(true)
        .create().map_err(|e| format!("Не удалось заблокировать сон: {}", e))?);
    println!("🔒 Сон системы и выключение экрана заблокированы, пока работает сервер");

    *state.restart.lock().await = true;
    let port = port.unwrap_or(6666);

    let server_ip = get_local_ip().unwrap_or_else(|| "192.168.1.160".to_string());
    *state.server_ip.write().await = server_ip.clone();

    *SERVER_STATE.write().await = Some(state.clone());
    let server_ip_clone = server_ip.clone();

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    let state_clone = state.clone();

    tokio::spawn(async move {
        *state_clone.is_running.lock().await = true;

        println!("🎧 HTTP сервер запущен на http://{}:{}", server_ip, port);
        println!("📡 Ожидание подключений от ESP32...");

        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("❌ Ошибка запуска сервера: {}", e);
                if e.kind() == std::io::ErrorKind::AddrInUse {
                    println!("🔄 Адрес занят, очищаем состояние и пробуем снова...");
                    {
                        let mut state = SERVER_STATE.write().await;
                        *state = None;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                    match tokio::net::TcpListener::bind(addr).await {
                        Ok(l) => l,
                        Err(e2) => {
                            eprintln!("❌ Не удалось запустить после перезапуска: {}", e2);
                            return;
                        }
                    }
                } else {
                    *state_clone.is_running.lock().await = false;
                    return;
                }
            }
        };

        loop {
            tokio::select! {
                accept = listener.accept() => {
                    match accept {
                        Ok((stream, addr)) => {
                            println!("✅ ESP32 подключился: {}", addr);
                            let io = TokioIo::new(stream);
                            let state = state_clone.clone();

                            tokio::spawn(async move {
                                if let Err(err) = http1::Builder::new()
                                    .serve_connection(
                                        io,
                                        service_fn(move |req| handle_request(req, state.clone())),
                                    )
                                    .await
                                {
                                    eprintln!("❌ Ошибка соединения: {:?}", err);
                                }
                            });
                        }
                        Err(e) => {
                            eprintln!("❌ Ошибка подключения: {}", e);
                        }
                    }
                }
                _ = state_clone.shutdown.notified() => {
                    println!("🛑 Shutdown signal received, stopping HTTP listener");
                    break;
                }
            }
        }
        *state_clone.is_running.lock().await = false;
        println!("🛑 HTTP listener task exited");
    });

    Ok(format!(
        "HTTP сервер запущен на http://{}:{}",
        server_ip_clone, port
    ))
}

/// Обработка HTTP запросов от ESP32
async fn handle_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let path = req.uri().path();
    let method = req.method();

    let mut response = if method == Method::GET
        && (path == "/pattern" || path == "/image" || path == "/full_pattern")
    {
        handle_full_pattern_request(state.clone()).await
    } else if (method == Method::GET || method == Method::POST) && path.starts_with("/row_info") {
        handle_row_info_request(req, state.clone()).await
    } else if method == Method::GET && path.starts_with("/chunk") {
        handle_chunk_disabled_request().await
    } else if method == Method::GET && path.starts_with("/ready") {
        handle_ready_request(req, state.clone()).await
    } else if method == Method::GET && path == "/status" {
        handle_status_request(state.clone()).await
    } else if method == Method::GET && path == "/check_restart" {
        handle_check_restart_request(state.clone()).await
    } else if method == Method::POST && path == "/set_restart" {
        handle_set_restart_request(state.clone()).await
    } else {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Full::new(Bytes::from("Not Found")))
            .unwrap()
    };

    // Добавляем CORS заголовки
    {
        let headers = response.headers_mut();
        headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        headers.insert(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS".parse().unwrap(),
        );
        headers.insert(
            "Access-Control-Allow-Headers",
            "Content-Type".parse().unwrap(),
        );
    }

    Ok(response)
}

#[tauri::command]
pub async fn clear_esp_restart_signal() -> Result<(), String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        *state.restart.lock().await = false;
        println!("🔄 ESP restart flag CLEARED (Resume mode)");
        Ok(())
    } else {
        Err("HTTP сервер не запущен".to_string())
    }
}

/// Обработка запроса информации о текущем ряде (ТОЛЬКО для отображения на фронтенде)
async fn handle_row_info_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Response<Full<Bytes>> {
    // let body = format!("{{\"row\":{},\"dir\":\"{}\"}}", row, dir_str);
    // let body_bytes = body.as_bytes();
    let max_size = 1024 * 64; // 64KB limit
    let collected_body = match http_body_util::BodyExt::collect(req.into_body()).await {
        Ok(collected) => collected,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Full::new(Bytes::from(
                    json!({ "error": format!("Failed to read body: {}", e) })
                        .to_string()
                        .into_bytes(),
                )))
                .unwrap();
        }
    };
    let bytes = collected_body.to_bytes();
    // 3. Convert collected bytes to a continuous slice and parse JSON
    let json_value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Full::new(Bytes::from(
                    json!({ "error": format!("Invalid JSON: {}", e) })
                        .to_string()
                        .into_bytes(),
                )))
                .unwrap();
        }
    };
    let row = json_value.get("row").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let direction = json_value
        .get("dir")
        .and_then(|v| v.as_str())
        .unwrap_or("right")
        .to_string();

    println!(
        "📍 Row info received (display only): row={}, dir={}",
        row, direction
    );

    *state.current_row.lock().await = row;
    *state.current_direction.lock().await = direction.clone();
    *state.is_esp_connected.lock().await = true;

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({
                "success": true,
                "row": row,
                "direction": direction,
                "note": "stored for display only, full pattern is already on ESP"
            })
            .to_string()
            .into_bytes(),
        )))
        .unwrap()
}

/// Старый протокол chunking больше не используется.
async fn handle_chunk_disabled_request() -> Response<Full<Bytes>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({
                "disabled": true,
                "message": "chunk requests are disabled; use /pattern or /image to get the full bitmap",
            })
            .to_string()
            .into_bytes(),
        )))
        .unwrap()
}

fn encode_pattern(pattern: &crate::utilities::KnitPattern) -> Vec<u8> {
    let row_count = pattern.rows.len();

    if row_count == 0 {
        return Vec::new();
    }

    let width = pattern.rows[0].len();

    // Проверяем, что все строки одинаковой ширины
    if pattern.rows.iter().any(|row| row.len() != width) {
        error!("Width shouldnt differ!!");
        return Vec::new();
    }

    let mut output = Vec::new();

    // Magic "PK"
    output.extend_from_slice(b"PK");

    // Format version 2
    output.extend_from_slice(&2u16.to_le_bytes());

    // Number of rows
    output.extend_from_slice(&(row_count as u16).to_le_bytes());

    // Width (один раз для всего паттерна)
    output.extend_from_slice(&(width as u16).to_le_bytes());

    // Количество байт на строку
    let bytes_per_row = (width + 7) / 8;

    // Pack all rows
    for row in &pattern.rows {
        let row_start = output.len();

        // Резервируем место под packed row
        output.resize(row_start + bytes_per_row, 0);

        for (index, &value) in row.iter().enumerate() {
            if value {
                output[row_start + index / 8] |= 1 << (index % 8);
            }
        }
        for (index, &value) in row.iter().enumerate() {
            if value {
                // Инвертируем индекс по горизонтали: 
                // 0-й пиксель становится последним, последний становится 0-м.
                let mirrored_index = width - 1 - index;
                output[row_start + mirrored_index / 8] |= 1 << (mirrored_index % 8);
            }
        }
    }

    output
}

/// Отправка полной картинки (бинарный массив) из памяти сервера.
async fn handle_full_pattern_request(state: Arc<HttpServerState>) -> Response<Full<Bytes>> {
    let pattern = state.pattern.read().await;
    *state.is_esp_connected.lock().await = true;
    println!("📷 Full pattern sent to ESP32: {} rows", pattern.rows.len());

    let encoded = encode_pattern(&pattern);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/octet-stream")
        .header("Content-Length", encoded.len())
        .header("Connection", "keep-alive")
        .body(Full::new(Bytes::from(encoded)))
        .unwrap()
}

/// Обработка флага готовности (ESP32 сообщает, что готова)
async fn handle_ready_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Response<Full<Bytes>> {
    let query = req.uri().query().unwrap_or("");
    let row = parse_query_param(query, "row").unwrap_or(0);

    println!("🚩 Флаг готовности от ESP32: row={}", row);

    let current = *state.current_row.lock().await;
    let progress = if state.total_rows > 0 {
        (current as f64 / state.total_rows as f64 * 100.0).round() as u32
    } else {
        0
    };

    println!(
        "📊 Прогресс: {}/{} рядов ({}%)",
        current, state.total_rows, progress
    );

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({
                "status": "ok",
                "current_row": current,
                "total_rows": state.total_rows,
                "progress_percent": progress
            })
            .to_string()
            .into_bytes(),
        )))
        .unwrap()
}

/// Обработка запроса статуса
async fn handle_status_request(state: Arc<HttpServerState>) -> Response<Full<Bytes>> {
    let current = *state.current_row.lock().await;
    let is_running = *state.is_running.lock().await;
    let server_ip = state.server_ip.read().await.clone();
    let progress = if state.total_rows > 0 {
        (current as f64 / state.total_rows as f64 * 100.0).round() as u32
    } else {
        0
    };

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({
                "is_running": is_running,
                "current_row": current,
                "total_rows": state.total_rows,
                "progress_percent": progress,
                "server_ip": server_ip,
            })
            .to_string()
            .into_bytes(),
        )))
        .unwrap()
}

/// ESP32 опрашивает этот эндпоинт, чтобы узнать, нужно ли ей перезапустить свое состояние
async fn handle_check_restart_request(state: Arc<HttpServerState>) -> Response<Full<Bytes>> {
    let restart = *state.restart.lock().await;
    if restart {
        *state.restart.lock().await = false; // Auto-reset (one-shot)
        println!("🔄 ESP restart flag: TRUE (auto-reset)");
    }

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({ "restart": restart }).to_string().into_bytes(),
        )))
        .unwrap()
}

/// Фронтенд вызывает это для триггера перезагрузки ESP32
async fn handle_set_restart_request(state: Arc<HttpServerState>) -> Response<Full<Bytes>> {
    *state.restart.lock().await = true;
    println!("🔄 Restart flag SET by frontend");

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({ "success": true, "restart": true })
                .to_string()
                .into_bytes(),
        )))
        .unwrap()
}

/// Вспомогательная функция для парсинга числового параметра из query
fn parse_query_param(query: &str, param_name: &str) -> Option<usize> {
    query
        .split('&')
        .find(|pair| pair.starts_with(&format!("{}=", param_name)))
        .and_then(|pair| pair.split('=').nth(1))
        .and_then(|value| value.parse::<usize>().ok())
}

/// Вспомогательная функция для парсинга строкового параметра из query
fn parse_query_param_str(query: &str, key: &str) -> Option<String> {
    query
        .split('&')
        .find(|pair| pair.starts_with(&format!("{}=", key)))
        .and_then(|pair| pair.split('=').nth(1))
        .map(|v| v.to_string())
}

/// Остановка HTTP сервера
#[tauri::command]
pub async fn stop_esp32_http_server() -> Result<String, String> {
    {
        let guard = SERVER_STATE.read().await;
        if let Some(state) = &*guard {
            let mut keepawake_guard = state.keepawake.lock().await;
            *keepawake_guard = None;
            println!("🔓 Блокировка сна снята");
            
            state.shutdown.notify_waiters();
        }
    }
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    *SERVER_STATE.write().await = None;
    Ok("HTTP сервер остановлен".to_string())
}

/// Получение статуса HTTP сервера
#[tauri::command]
pub async fn get_esp32_http_server_status() -> Result<String, String> {
    let state_guard = SERVER_STATE.read().await;
    match &*state_guard {
        Some(state) => {
            let is_running = *state.is_running.lock().await;
            let current = *state.current_row.lock().await;
            let direction = state.current_direction.lock().await.clone();
            let total = state.total_rows;
            let server_ip = state.server_ip.read().await.clone();

            Ok(format!(
                "Running: {}, IP: {}, Progress: {}/{}, Direction: {}",
                is_running, server_ip, current, total, direction
            ))
        }
        None => Ok("Server not running".to_string()),
    }
}

/// Получение информации о текущем ряде (для фронтенда)
#[tauri::command]
pub async fn get_current_row_info() -> Result<serde_json::Value, String> {
    let state_guard = SERVER_STATE.read().await;
    match &*state_guard {
        Some(state) => {
            let current = *state.current_row.lock().await;
            let direction = state.current_direction.lock().await.clone();
            let total = state.total_rows;
            let is_connected = *state.is_esp_connected.lock().await;

            Ok(json!({
                "row": current,
                "direction": direction,
                "total": total,
                "is_esp_connected": is_connected
            }))
        }
        None => Ok(json!({
            "row": 0,
            "direction": "right",
            "total": 0,
            "is_esp_connected": false
        })),
    }
}

/// Восстановление прогресса вязания
#[tauri::command]
pub async fn restore_knitting_progress(
    project_id: i64,
    current_row: usize,
    current_direction: String,
    // _max_sent_row: usize, // Раскомментируй, если фронтенд все еще присылает этот аргумент
) -> Result<String, String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        let total_rows = state.total_rows;

        *state.current_row.lock().await = current_row;
        *state.current_direction.lock().await = current_direction.clone();
        *state.restart.lock().await = false;
        println!(
            "🔄 Прогресс восстановлен: проект {}, ряд {}/{}, направление {}",
            project_id, current_row, total_rows, current_direction
        );

        Ok(format!(
            "Прогресс восстановлен: ряд {}/{}",
            current_row, total_rows
        ))
    } else {
        Err("Сервер не запущен".to_string())
    }
}

/// Сброс прогресса вязания
#[tauri::command]
pub async fn reset_knitting_progress() -> Result<String, String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        *state.current_row.lock().await = 0;
        *state.current_direction.lock().await = "right".to_string();
        *state.restart.lock().await = true; // Сигнал ESP32 сбросить свое состояние

        println!("🔄 Прогресс сброшен: ряд 0, направление right, флаг перезагрузки установлен");
        Ok("Прогресс сброшен, ESP32 получит сигнал перезагрузки".to_string())
    } else {
        Err("Сервер не запущен".to_string())
    }
}

/// Получить локальный IP адрес компьютера
pub fn get_local_ip() -> Option<String> {
    get_if_addrs::get_if_addrs()
        .ok()
        .and_then(|interfaces| {
            interfaces
                .iter()
                .find(|iface| !iface.is_loopback() && iface.ip().is_ipv4())
                .map(|iface| iface.ip().to_string())
        })
        .or_else(|| {
            use std::net::UdpSocket;
            UdpSocket::bind("0.0.0.0:0")
                .ok()
                .and_then(|socket| {
                    socket.connect("8.8.8.8:80").ok()?;
                    socket.local_addr().ok()
                })
                .map(|addr| addr.ip().to_string())
        })
}

/// Команда для получения IP адреса компьютера
#[tauri::command]
pub fn get_computer_ip() -> Result<String, String> {
    get_local_ip().ok_or_else(|| "Не удалось получить IP адрес".to_string())
}

/// Команда для отправки флага перезагрузки ESP
#[tauri::command]
pub async fn send_esp_restart_signal() -> Result<(), String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        *state.restart.lock().await = true;
        println!("🔄 ESP restart signal sent from frontend");
        Ok(())
    } else {
        Err("HTTP сервер не запущен".to_string())
    }
}
