use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use serde_json::json;
use hyper::{Method, Request, Response, StatusCode, server::{self, conn::http1}, service::service_fn};
use hyper_util::rt::TokioIo;
use http_body_util::Full;
use bytes::Bytes;
use std::net::SocketAddr;

use crate::utilities::KnitPattern;

/// Состояние HTTP сервера
#[derive(Debug, Clone)]
pub struct HttpServerState {
    pub pattern: Arc<RwLock<KnitPattern>>,
    pub chunk_size: usize,
    pub current_row: Arc<Mutex<usize>>,
    pub current_direction: Arc<Mutex<String>>, // "left" или "right"
    pub max_sent_row: Arc<Mutex<usize>>, // Максимальный отправленный ряд (для предотвращения повторов)
    pub is_esp_connected: Arc<Mutex<bool>>, // ESP32 подключился хотя бы раз
    pub total_rows: usize,
    pub is_running: Arc<Mutex<bool>>,
    pub server_ip: Arc<RwLock<String>>,
    pub restart_flag: Arc<Mutex<bool>>,
}

impl HttpServerState {
    pub fn new(pattern: KnitPattern, chunk_size: usize) -> Self {
        let total_rows = pattern.height;
        Self {
            pattern: Arc::new(RwLock::new(pattern)),
            chunk_size,
            current_row: Arc::new(Mutex::new(0)),
            current_direction: Arc::new(Mutex::new("right".to_string())),
            max_sent_row: Arc::new(Mutex::new(0)),
            is_esp_connected: Arc::new(Mutex::new(false)),
            total_rows,
            is_running: Arc::new(Mutex::new(false)),
            server_ip: Arc::new(RwLock::new(String::new())),
            restart_flag: Arc::new(Mutex::new(false)),
        }
    }
}

// Глобальное состояние сервера
static SERVER_STATE: once_cell::sync::Lazy<Arc<RwLock<Option<Arc<HttpServerState>>>>> = 
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(None)));

/// Запуск HTTP сервера для ESP32
#[tauri::command]
pub async fn start_esp32_http_server(
    pattern_rows: Vec<Vec<bool>>,
    pattern_width: usize,
    pattern_height: usize,
    chunk_size: Option<usize>,
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
                // Останавливаем старый сервер
                stop_esp32_http_server().await?;
                // Даём порту освободиться
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }

    let pattern = KnitPattern {
        rows: pattern_rows,
        width: pattern_width,
        height: pattern_height,
    };

    let state = Arc::new(HttpServerState::new(
        pattern,
        chunk_size.unwrap_or(4),
    ));

    let port = port.unwrap_or(6666);

    // Получаем IP компьютера
    let server_ip = get_local_ip().unwrap_or_else(|| "192.168.1.160".to_string());
    *state.server_ip.write().await = server_ip.clone();

    // Сохраняем состояние глобально
    *SERVER_STATE.write().await = Some(state.clone());
    let server_ip_clone = server_ip.clone();

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    let state_clone = state.clone();

    // Запускаем сервер в отдельной задаче
    tokio::spawn(async move {
        *state_clone.is_running.lock().await = true;

        println!("🎧 HTTP сервер запущен на http://{}:{}", server_ip, port);
        println!("📡 Ожидание подключений от ESP32...");

        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("❌ Ошибка запуска сервера: {}", e);
                
                // Если адрес занят, очищаем состояние и пробуем снова
                if e.kind() == std::io::ErrorKind::AddrInUse {
                    println!("🔄 Адрес занят, очищаем состояние и пробуем снова...");
                    
                    // Очищаем состояние
                    {
                        let mut state = SERVER_STATE.write().await;
                        *state = None;
                    }
                    
                    // Ждём освобождения порта
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                    
                    // Пробуем снова
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
            match listener.accept().await {
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
    });

    Ok(format!("HTTP сервер запущен на http://{}:{}", server_ip_clone, port))
}

/// Обработка HTTP запросов от ESP32
async fn handle_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let path = req.uri().path();
    let method = req.method();

    // CORS заголовки для ESP32
    let mut response = if method == Method::GET && path.starts_with("/chunk") {
        handle_chunk_request(req, state.clone()).await
    } else if method == Method::GET && path.starts_with("/row_info") {
        handle_row_info_request(req, state.clone()).await
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
        headers.insert("Access-Control-Allow-Methods", "GET, OPTIONS".parse().unwrap());
        headers.insert("Access-Control-Allow-Headers", "Content-Type".parse().unwrap());
    }

    Ok(response)
}

/// Обработка запроса информации о текущем ряде
/// GET /row_info?row=N&dir=left|right
async fn handle_row_info_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Response<Full<Bytes>> {
    let query = req.uri().query().unwrap_or("");
    let row = parse_query_param(query, "row").unwrap_or(0);
    let direction = parse_query_param_str(query, "dir").unwrap_or("right".to_string());

    println!("📍 Row info ЗАПРОШЕН: row={}, dir={}", row, direction);

    // Обновляем текущий ряд и направление
    *state.current_row.lock().await = row;
    *state.current_direction.lock().await = direction.clone();

    println!("📊 Текущий статус: ряд {}/{}, направление {}", row, state.total_rows, direction);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({
                "success": true,
                "row": row,
                "direction": direction
            }).to_string().into_bytes()
        )))
        .unwrap()
}

/// Парсинг строкового параметра из query
fn parse_query_param_str(query: &str, key: &str) -> Option<String> {
    query.split('&')
        .find(|pair| pair.starts_with(&format!("{}=", key)))
        .and_then(|pair| pair.split('=').nth(1))
        .map(|v| v.to_string())
}

/// Обработка запроса на получение чанка узора
/// GET /chunk?row=N
async fn handle_chunk_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Response<Full<Bytes>> {
    let query = req.uri().query().unwrap_or("");
    let requested_row = parse_query_param(query, "row").unwrap_or(0);

    println!("📩 Запрос чанка: row={}", requested_row);

    // Отмечаем что ESP32 подключился
    *state.is_esp_connected.lock().await = true;

    let pattern = state.pattern.read().await;
    let chunk_size = state.chunk_size;

    // Получаем максимальный отправленный ряд
    let mut max_sent = state.max_sent_row.lock().await;
    
    // Если ESP32 запрашивает ряд который уже был отправлен - используем следующий ряд
    let start_row = if requested_row < *max_sent {
        println!("⚠️ ESP32 запросил уже отправленный ряд {} (max_sent={}), отправляем ряд {}", 
                 requested_row, *max_sent, *max_sent);
        *max_sent
    } else {
        requested_row
    };

    // Проверяем, есть ли ещё ряды для отправки
    if start_row >= pattern.height {
        println!("✅ Все ряды отправлены!");
        return Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(
                json!({
                    "rows": [],
                    "start_row": start_row,
                    "complete": true
                }).to_string().into_bytes()
            )))
            .unwrap()
    }

    // Берём chunk_size рядов начиная с start_row (БЕЗ зеркалирования!)
    let end_row = std::cmp::min(start_row + chunk_size, pattern.height);
    let rows: Vec<Vec<i32>> = pattern.rows[start_row..end_row]
        .iter()
        .map(|row| row.iter().map(|&b| if b { 1 } else { 0 }).collect())
        .collect();

    println!("📤 Отправка чанка: ряды {}-{} (ширина={}), БЕЗ зеркалирования", start_row, end_row - 1, pattern.width);

    // Обновляем максимальный отправленный ряд
    *max_sent = end_row;
    drop(max_sent); // Освобождаем lock

    // НЕ обновляем current_row здесь! 
    // current_row обновляется ТОЛЬКО из /row_info запросов от ESP32
    // Это предотвращает "откат" ряда когда polling получает старое значение

    let response_json = json!({
        "rows": rows,
        "start_row": start_row,
        "end_row": end_row,
        "complete": false,
        "width": pattern.width,
        "total_rows": pattern.height,
        "max_sent_row": *state.max_sent_row.lock().await
    });

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(response_json.to_string().into_bytes())))
        .unwrap()
}

/// Обработка флага готовности (ESP32 сообщает, что готов принять новые данные)
/// GET /ready?row=N
async fn handle_ready_request(
    req: Request<hyper::body::Incoming>,
    state: Arc<HttpServerState>,
) -> Response<Full<Bytes>> {
    let query = req.uri().query().unwrap_or("");
    let row = parse_query_param(query, "row").unwrap_or(0);

    println!("🚩 Флаг готовности от ESP32: row={}", row);

    // Можно использовать для синхронизации или логирования
    let current = *state.current_row.lock().await;
    let progress = if state.total_rows > 0 {
        (current as f64 / state.total_rows as f64 * 100.0).round() as u32
    } else {
        0
    };

    println!("📊 Прогресс: {}/{} рядов ({}%)", current, state.total_rows, progress);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({
                "status": "ok",
                "current_row": current,
                "total_rows": state.total_rows,
                "progress_percent": progress
            }).to_string().into_bytes()
        )))
        .unwrap()
}

/// Обработка запроса статуса
/// GET /status
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
                "chunk_size": state.chunk_size
            }).to_string().into_bytes()
        )))
        .unwrap()
}

/// ESP32 polls this to check if it should restart its state
/// GET /check_restart
async fn handle_check_restart_request(state: Arc<HttpServerState>) -> Response<Full<Bytes>> {
    let restart = *state.restart_flag.lock().await;
    // Auto-reset the flag after reading (one-shot)
    if restart {
        *state.restart_flag.lock().await = false;
        println!("🔄 ESP restart flag: TRUE (auto-reset)");
    }

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({ "restart": restart }).to_string().into_bytes()
        )))
        .unwrap()
}

/// Frontend calls this to trigger ESP restart
/// POST /set_restart
async fn handle_set_restart_request(state: Arc<HttpServerState>) -> Response<Full<Bytes>> {
    *state.restart_flag.lock().await = true;
    println!("🔄 Restart flag SET by frontend");

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(
            json!({ "success": true, "restart": true }).to_string().into_bytes()
        )))
        .unwrap()
}

/// Вспомогательная функция для парсинга query параметров
fn parse_query_param(query: &str, param_name: &str) -> Option<usize> {
    query
        .split('&')
        .find(|pair| pair.starts_with(param_name))
        .and_then(|pair| pair.split('=').nth(1))
        .and_then(|value| value.parse::<usize>().ok())
}

/// Остановка HTTP сервера
#[tauri::command]
pub async fn stop_esp32_http_server() -> Result<String, String> {
    // Сбрасываем состояние
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
        None => Ok("Server not running".to_string())
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
            let max_sent = *state.max_sent_row.lock().await;

            Ok(json!({
                "row": current,
                "direction": direction,
                "total": total,
                "is_esp_connected": is_connected,
                "max_sent_row": max_sent
            }))
        }
        None => Ok(json!({
            "row": 0,
            "direction": "right",
            "total": 0,
            "is_esp_connected": false,
            "max_sent_row": 0
        }))
    }
}

/// Восстановление прогресса вязания
#[tauri::command]
pub async fn restore_knitting_progress(
    project_id: i64,
    current_row: usize,
    current_direction: String,
    max_sent_row: usize,
) -> Result<String, String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        let total_rows = state.total_rows;
        
        // Обновляем текущий ряд
        *state.current_row.lock().await = current_row;
        *state.current_direction.lock().await = current_direction.clone();
        *state.max_sent_row.lock().await = max_sent_row;

        println!("🔄 Прогресс восстановлен: проект {}, ряд {}/{}, направление {}, max_sent={}",
                 project_id, current_row, total_rows, current_direction, max_sent_row);

        Ok(format!("Прогресс восстановлен: ряд {}/{}", current_row, total_rows))
    } else {
        Err("Сервер не запущен".to_string())
    }
}

/// Сброс прогресса вязания (отправляет ESP32 чанк с reset: true)
#[tauri::command]
pub async fn reset_knitting_progress() -> Result<serde_json::Value, String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        let pattern = state.pattern.read().await;
        let chunk_size = state.chunk_size;

        // Сбрасываем состояние
        *state.current_row.lock().await = 0;
        *state.current_direction.lock().await = "right".to_string();
        *state.max_sent_row.lock().await = 0;

        // Берём первые chunk_size рядов для отправки
        let end_row = std::cmp::min(chunk_size, pattern.height);
        let rows: Vec<Vec<i32>> = pattern.rows[0..end_row]
            .iter()
            .map(|row| row.iter().map(|&b| if b { 1 } else { 0 }).collect())
            .collect();

        println!("🔄 Сброс прогресса: отправляем ряды 0-{} с флагом reset", end_row - 1);

        // Возвращаем чанк с флагом reset
        Ok(json!({
            "rows": rows,
            "start_row": 0,
            "end_row": end_row,
            "reset": true,
            "width": pattern.width,
            "total_rows": pattern.height
        }))
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
            // Fallback: пробуем получить IP через соккет
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
/// Вызывается когда пользователь сбрасывает прогресс, меняет узор или не сохраняет прогресс
#[tauri::command]
pub async fn send_esp_restart_signal() -> Result<(), String> {
    let state_guard = SERVER_STATE.read().await;
    if let Some(state) = &*state_guard {
        *state.restart_flag.lock().await = true;
        println!("🔄 ESP restart signal sent from frontend");
        Ok(())
    } else {
        Err("HTTP сервер не запущен".to_string())
    }
}
