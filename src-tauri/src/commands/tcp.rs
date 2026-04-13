use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::utilities::KnitPattern;

#[derive(Debug, Clone)]
pub struct TcpServerState {
    pub pattern: Arc<KnitPattern>,
    pub chunk_size: usize,      // Сколько рядов в чанке (по умолчанию 4)
    pub current_row: Arc<Mutex<usize>>,
    pub is_connected: Arc<Mutex<bool>>,
}

impl TcpServerState {
    pub fn new(pattern: KnitPattern, chunk_size: usize) -> Self {
        Self {
            pattern: Arc::new(pattern),
            chunk_size,
            current_row: Arc::new(Mutex::new(0)),
            is_connected: Arc::new(Mutex::new(false)),
        }
    }
}

// Запуск TCP-сервера
#[tauri::command]
pub async fn start_esp32_tcp_server(
    pattern_rows: Vec<Vec<bool>>,
    pattern_width: usize,
    pattern_height: usize,
    chunk_size: Option<usize>,
    port: Option<u16>,
) -> Result<String, String> {
    let pattern = KnitPattern {
        rows: pattern_rows,
        width: pattern_width,
        height: pattern_height,
    };
    
    let state = Arc::new(TcpServerState::new(
        pattern,
        chunk_size.unwrap_or(4),
    ));
    
    let port = port.unwrap_or(6666);
    let addr = format!("0.0.0.0:{}", port);
    
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind TCP server: {}", e))?;
    
    println!("🎧 TCP-сервер запущен на {}:{}", addr.replace("0.0.0.0", "192.168.0.1"), port);
    println!("📡 Ожидание подключения ESP32...");
    
    let state_clone = state.clone();
    
    // Запускаем сервер в отдельной задаче
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    println!("✅ ESP32 подключился: {}", addr);
                    *state_clone.is_connected.lock().await = true;
                    
                    let state = state_clone.clone();
                    tokio::spawn(async move {
                        handle_client(stream, state).await;
                    });
                }
                Err(e) => {
                    eprintln!("❌ Ошибка подключения: {}", e);
                }
            }
        }
    });
    
    Ok(format!("TCP-сервер запущен на порту {}", port))
}

// Обработка подключения клиента (ESP32)
async fn handle_client(stream: TcpStream, state: Arc<TcpServerState>) {
    let (mut reader, mut writer) = stream.into_split();
    let mut buf_reader = BufReader::new(reader);
    let mut line = String::new();
    
    // Отправляем первый чанк (первые 4 ряда)
    if let Err(e) = send_next_chunk(&mut writer, &state).await {
        eprintln!("❌ Ошибка отправки чанка: {}", e);
        return;
    }
    
    // Цикл ожидания команд от ESP32
    loop {
        line.clear();
        match buf_reader.read_line(&mut line).await {
            Ok(0) => {
                // Клиент отключился
                println!("🔌 ESP32 отключился");
                *state.is_connected.lock().await = false;
                break;
            }
            Ok(_) => {
                let msg = line.trim();
                println!("📩 Получено от ESP32: {}", msg);
                
                // Парсим команду от ESP32
                // Формат: "ROW_COMPLETE:3" или "NEXT_CHUNK:4"
                if msg.starts_with("ROW_COMPLETE:") {
                    if let Some(row_num) = msg.strip_prefix("ROW_COMPLETE:").and_then(|s| s.parse::<usize>().ok()) {
                        println!("✅ ESP32 завершил ряд {}", row_num);
                        
                        // Обновляем текущий ряд
                        *state.current_row.lock().await = row_num + 1;
                        
                        // Отправляем следующий чанк
                        if let Err(e) = send_next_chunk(&mut writer, &state).await {
                            eprintln!("❌ Ошибка отправки: {}", e);
                            break;
                        }
                    }
                } else if msg == "PING" {
                    // Ответ на ping
                    let _ = writer.write_all(b"PONG\n").await;
                } else if msg == "STATUS" {
                    // Отправляем статус
                    let current = *state.current_row.lock().await;
                    let total = state.pattern.height;
                    let status = format!("STATUS:rows={}/total={}\n", current, total);
                    let _ = writer.write_all(status.as_bytes()).await;
                }
            }
            Err(e) => {
                eprintln!("❌ Ошибка чтения: {}", e);
                break;
            }
        }
    }
}

// Отправка следующего чанка рядов
async fn send_next_chunk(
    writer: &mut tokio::net::tcp::OwnedWriteHalf,
    state: &Arc<TcpServerState>,
) -> Result<(), String> {
    let mut current = state.current_row.lock().await;
    let pattern = &state.pattern;
    
    if *current >= pattern.height {
        println!("✅ Все ряды отправлены!");
        let _ = writer.write_all(b"COMPLETE\n").await;
        return Ok(());
    }
    
    // Вычисляем диапазон рядов для чанка
    let start = *current;
    let end = std::cmp::min(start + state.chunk_size, pattern.height);
    
    // Формируем чанк
    let mut chunk_data = Vec::new();
    for row_idx in start..end {
        let row = &pattern.rows[row_idx];
        // Конвертируем ряд битов в байты
        let mut row_bytes = Vec::new();
        for chunk in row.chunks(8) {
            let mut byte: u8 = 0;
            for (i, &bit) in chunk.iter().enumerate() {
                if bit {
                    byte |= 1 << i;
                }
            }
            row_bytes.push(byte);
        }
        chunk_data.push(row_bytes);
    }
    
    // Формат сообщения: CHUNK:start:end:row1_bytes:row2_bytes:...
    let mut message = format!("CHUNK:{}:{}:", start, end);
    for row_bytes in &chunk_data {
        for byte in row_bytes {
            message.push_str(&format!("{:02X}", byte));
        }
        message.push(':');
    }
    message.push_str("\n");
    
    // Отправляем
    writer.write_all(message.as_bytes())
        .await
        .map_err(|e| format!("Failed to send chunk: {}", e))?;
    
    println!("📤 Отправлен чанк ряды {}-{} ({} байт)", start, end - 1, chunk_data.len() * chunk_data[0].len());
    
    *current = end;
    
    Ok(())
}

// Остановка сервера
#[tauri::command]
pub async fn stop_esp32_tcp_server() -> Result<String, String> {
    // Здесь можно добавить логику остановки через канал
    Ok("TCP-сервер остановлен".to_string())
}

// Получение статуса сервера
#[tauri::command]
pub async fn get_esp32_server_status(
    state: tauri::State<'_, Arc<TcpServerState>>,
) -> Result<String, String> {
    let connected = *state.is_connected.lock().await;
    let current = *state.current_row.lock().await;
    let total = state.pattern.height;
    
    Ok(format!(
        "Connected: {}, Progress: {}/{} rows",
        connected, current, total
    ))
}