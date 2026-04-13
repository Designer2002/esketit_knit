use std::fs::File;
use std::io::Write;
use std::path::{self, Path};

use tauri::command;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool};
use quick_xml::Writer;
use quick_xml::events::{Event, BytesText, BytesStart, BytesEnd};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveConversionRequest {
    pub project_id: i64,
    pub source_image_path: String,
    pub source_width: i64,
    pub source_height: i64,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavePatternRequest {
    pub name: String,
    pub pattern_type: String,
    pub width: i64,
    pub height: i64,
    pub pattern_data: String,
    pub category: String,
    pub source: String,
}

#[command]
pub async fn save_conversion(
    req: SaveConversionRequest,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<i64, String> {
    let result = sqlx::query(
        "INSERT INTO conversions (project_id, source_image_path, source_width, source_height, status)
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(req.project_id)
    .bind(&req.source_image_path)
    .bind(req.source_width)
    .bind(req.source_height)
    .bind(&req.status)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save conversion: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[command]
pub async fn save_pattern(
    req: SavePatternRequest,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<i64, String> {
    let result = sqlx::query(
        "INSERT INTO patterns (name, pattern_type, width, height, pattern_data, category, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name, width, height) DO UPDATE SET
             pattern_data = excluded.pattern_data,
             pattern_type = excluded.pattern_type,
             category = excluded.category,
             source = excluded.source"
    )
    .bind(&req.name)
    .bind(&req.pattern_type)
    .bind(req.width)
    .bind(req.height)
    .bind(&req.pattern_data)
    .bind(&req.category)
    .bind(&req.source)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save pattern: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[command]
pub async fn save_pattern_to_file(
    file_path: String,
    pattern_data: Vec<Vec<bool>>,
    width: i32,
    height: i32,
) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;

    let mut file = File::create(&file_path)
        .map_err(|e| format!("Failed to create pattern file: {}", e))?;

    // Write header
    writeln!(file, "# swaga Pattern File").map_err(|e| e.to_string())?;
    writeln!(file, "# width={}", width).map_err(|e| e.to_string())?;
    writeln!(file, "# height={}", height).map_err(|e| e.to_string())?;
    writeln!(file, "# end_header").map_err(|e| e.to_string())?;

    // Write rows
    for row in &pattern_data {
        let line: String = row.iter().map(|&b| if b { '1' } else { '0' }).collect();
        writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(Debug, Serialize)]
pub struct OpenProjectResponse {
    pub project_id: i64,
    pub name: String,
    pub file_path: String,
    pub xml_content: String, // Опционально: для быстрой загрузки на фронт
    pub garment_type_id: i64,
    pub pin_to_top: bool,
}

#[command]
pub async fn open_project_by_id(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<OpenProjectResponse, String> {
    // 1. Получаем проект из БД (без макроса!)
    let project = sqlx::query(
        "SELECT id, name, file_path, garment_type_id FROM projects WHERE id = ?"
    )
    .bind(project_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch project: {}", e))?;

    // 2. Извлекаем поля вручную
    let id: i64 = project.get("id");
    let name: String = project.get("name");
    let file_path: String = project.get("file_path");
    let garment_type_id: i64 = project.get("garment_type_id");
    let pin_to_top = false;

    // 3. Проверяем существование файла
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Project file not found: {}", file_path));
    }

    // 4. Читаем XML
    let path_inside = path.join(format!("{}.esketit", sanitize_file_name(&name)));
    let xml_content = fs::read_to_string(path_inside)
        .map_err(|e| format!("Failed to read project file: {}", e))?;

    // 5. Обновляем recent_projects
    sqlx::query(
        "UPDATE recent_projects 
         SET last_opened = CURRENT_TIMESTAMP, open_count = open_count + 1 
         WHERE project_id = ?"
    )
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to update recent project: {}", e))?;

    Ok(OpenProjectResponse {
        project_id: id,
        name,
        file_path,
        xml_content,
        garment_type_id,
        pin_to_top
    })
}
#[command]
pub async fn open_project_by_path(
    path: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<OpenProjectResponse, String> {
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }

    if !path.ends_with(".esketit") {
        return Err("Invalid file format: expected .esketit".to_string());
    }

    // Ищем проект в БД
    let project = sqlx::query(
        "SELECT id, name, file_path, garment_type_id FROM projects WHERE file_path = ?"
    )
    .bind(&path)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let (project_id, name, garment_type_id) = if let Some(row) = project {
        (
            row.get("id"),
            row.get("name"),
            row.get("garment_type_id"),
        )
    } else {
        // Создаём новую запись
        let name = Path::new(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
        
        let result = sqlx::query(
            "INSERT INTO projects (name, file_path, garment_type_id, created_at, modified_at) 
             VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        )
        .bind(&name)
        .bind(&path)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to create project record: {}", e))?;
        
        (result.last_insert_rowid(), name, 1)
    };

    let xml_content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read project file: {}", e))?;

    // Обновляем recent_projects (UPSERT для SQLite)
    sqlx::query(
        "INSERT INTO recent_projects (project_id, last_opened, open_count, pin_to_top)
         VALUES (?, CURRENT_TIMESTAMP, 1, 0)
         ON CONFLICT(project_id) DO UPDATE SET
             last_opened = CURRENT_TIMESTAMP,
             open_count = open_count + 1"
    )
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to update recent projects: {}", e))?;

    Ok(OpenProjectResponse {
        project_id,
        name,
        file_path: path,
        xml_content,
        garment_type_id,
        pin_to_top: true
    })
}
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub garment_type_id: i64,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
pub struct CreateProjectResponse {
    pub project_id: i64,
    pub file_path: String,
}

// Функция для генерации полного XML проекта
fn generate_project_xml(req: &CreateProjectRequest, project_id: i64) -> String {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    
    // XML declaration
    writer.write_event(Event::Decl(quick_xml::events::BytesDecl::new("1.0", Some("UTF-8"), None))).unwrap();
    
    // Root element
    let mut root = BytesStart::new("esketit_project");
    root.push_attribute(("version", "1.0"));
    root.push_attribute(("schema_version", "1.0"));
    writer.write_event(Event::Start(root)).unwrap();
    
    // ===== METADATA =====
    writer.write_event(Event::Start(BytesStart::new("metadata"))).unwrap();
    
    write_text_element(&mut writer, "id", &project_id.to_string());
    write_text_element(&mut writer, "name", &req.name);
    
    if let Some(desc) = &req.description {
        write_text_element(&mut writer, "description", desc);
    }
    
    write_text_element(&mut writer, "garment_type_id", &req.garment_type_id.to_string());
    write_text_element(&mut writer, "file_path", &req.file_path);
    write_text_element(&mut writer, "created_at", &chrono::Local::now().to_rfc3339());
    write_text_element(&mut writer, "modified_at", &chrono::Local::now().to_rfc3339());
    
    writer.write_event(Event::End(BytesEnd::new("metadata"))).unwrap();
    
    // ===== MEASUREMENTS (Мерки Проекта) =====
    writer.write_event(Event::Start(BytesStart::new("measurements"))).unwrap();
    // Пустой контейнер - мерки добавляются пользователем позже
    // Структура одной мерки:
    // <measurement type_id="1" code="bust_circumference" unit="cm" value="90.0" manual="true" note=""/>
    writer.write_event(Event::End(BytesEnd::new("measurements"))).unwrap();
    
    // ===== PARTS (Детали Проекта) =====
    writer.write_event(Event::Start(BytesStart::new("parts"))).unwrap();
    // Структура детали:
    // <part code="front" instance_name="Перед с карманом" width="120" height="180">
    //   <stitch_data format="rle">...</stitch_data>
    //   <modifications>{...}</modifications>
    //   <sync with="back" enabled="false"/>
    //   <features>...</features>
    // </part>
    writer.write_event(Event::End(BytesEnd::new("parts"))).unwrap();
    
    // ===== YARNS (Пряжа Проекта) =====
    writer.write_event(Event::Start(BytesStart::new("yarns"))).unwrap();
    // Структура пряжи:
    // <yarn id="42" quantity_grams="250.0">
    //   <info name="Merino Extrafine" brand="Drops" material="wool" thickness="400" color="#FF6B9D"/>
    // </yarn>
    writer.write_event(Event::End(BytesEnd::new("yarns"))).unwrap();
    
    // ===== PATTERNS (Узоры Проекта) =====
    writer.write_event(Event::Start(BytesStart::new("patterns"))).unwrap();
    // Структура узора:
    // <pattern id="15" assigned_to="front" position_x="10" position_y="5" repeat_x="true" repeat_y="3">
    //   <data type="cable" width="24" height="32" format="json">...</data>
    // </pattern>
    writer.write_event(Event::End(BytesEnd::new("patterns"))).unwrap();
    
    // ===== GAUGE (Петельные Пробы) =====
    writer.write_event(Event::Start(BytesStart::new("gauge"))).unwrap();
    // Структура пробы:
    // <swatch yarn_id="42" stitches_per_10cm="22.5" rows_per_10cm="30.0" needle_size="4.0" user_defined="true"/>
    writer.write_event(Event::End(BytesEnd::new("gauge"))).unwrap();
    
    // ===== CALCULATIONS (Расчёты) =====
    writer.write_event(Event::Start(BytesStart::new("calculations"))).unwrap();
    let mut totals = BytesStart::new("totals");
    totals.push_attribute(("stitches", "0"));
    totals.push_attribute(("rows", "0"));
    totals.push_attribute(("yarn_grams", "0.0"));
    totals.push_attribute(("time_minutes", "0"));
    totals.push_attribute(("difficulty", "1"));
    writer.write_event(Event::Empty(totals)).unwrap();
    // <log>{...}</log> - детальный журнал расчётов
    writer.write_event(Event::End(BytesEnd::new("calculations"))).unwrap();
    
    // ===== MACHINE_SETTINGS (Настройки Машины) =====
    writer.write_event(Event::Start(BytesStart::new("machine_settings"))).unwrap();
    let mut connection = BytesStart::new("connection");
    connection.push_attribute(("model", "Silver Reed SK840"));
    connection.push_attribute(("esp32_ip", ""));
    connection.push_attribute(("esp32_port", "80"));
    connection.push_attribute(("connection_type", "http"));
    writer.write_event(Event::Empty(connection)).unwrap();
    let mut parameters = BytesStart::new("parameters");
    parameters.push_attribute(("tension", "5"));
    parameters.push_attribute(("row_counter", "up"));
    writer.write_event(Event::Empty(parameters)).unwrap();
    // <needle_calibration>{...}</needle_calibration>
    writer.write_event(Event::End(BytesEnd::new("machine_settings"))).unwrap();
    
    // ===== CONVERSIONS (Конвертации Изображений) =====
    writer.write_event(Event::Start(BytesStart::new("conversions"))).unwrap();
    // <conversion id="1" source_path="..." status="pending" created_at="...">
    //   <params quantization="..." dithering="..." pixelation="..."/>
    //   <results>...</results>
    // </conversion>
    writer.write_event(Event::End(BytesEnd::new("conversions"))).unwrap();
    
    // ===== AI_REQUESTS (Запросы к ИИ) =====
    writer.write_event(Event::Start(BytesStart::new("ai_requests"))).unwrap();
    // <request type="pattern_generation" model="..." created_at="..." success="true">
    //   <prompt>...</prompt>
    //   <response>{...}</response>
    //   <generated_pattern_id>...</generated_pattern_id>
    // </request>
    writer.write_event(Event::End(BytesEnd::new("ai_requests"))).unwrap();
    
    // ===== ARCHIVE (Архив/История изменений) =====
    writer.write_event(Event::Start(BytesStart::new("archive"))).unwrap();
    // <entry timestamp="..." action="create" user="..."/>
    writer.write_event(Event::End(BytesEnd::new("archive"))).unwrap();
    
    // Close root
    writer.write_event(Event::End(BytesEnd::new("esketit_project"))).unwrap();
    
    String::from_utf8(writer.into_inner()).unwrap_or_default()
}

// Вспомогательная функция для записи текстовых элементов
fn write_text_element(writer: &mut Writer<Vec<u8>>, tag: &str, content: &str) {
    writer.write_event(Event::Start(BytesStart::new(tag))).unwrap();
    writer.write_event(Event::Text(BytesText::new(content))).unwrap();
    writer.write_event(Event::End(BytesEnd::new(tag))).unwrap();
}

#[command]
pub async fn create_project(
    request: CreateProjectRequest,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<CreateProjectResponse, String> {
    use std::fs;

    // 1. Вставляем запись в projects
    let result = sqlx::query(
        "INSERT INTO projects (name, description, garment_type_id, file_path, modified_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
    )
    .bind(&request.name)
    .bind(&request.description)
    .bind(request.garment_type_id)
    .bind(&request.file_path)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    // 2. Получаем ID созданной записи
    let project_id = result.last_insert_rowid();
    
    // 3. Создаём папку с именем проекта
    let project_folder = Path::new(&request.file_path).join(&sanitize_folder_name(&request.name));
    
    // Создаём папку проекта, если она не существует
    if !project_folder.exists() {
        fs::create_dir_all(&project_folder)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    
    // 4. Создаём структуру папок внутри проекта
    let patterns_dir = project_folder.join("patterns");
    let garments_dir = project_folder.join("garments");
    let exports_dir = project_folder.join("exports");
    
    fs::create_dir_all(&patterns_dir)
        .map_err(|e| format!("Failed to create patterns folder: {}", e))?;
    fs::create_dir_all(&garments_dir)
        .map_err(|e| format!("Failed to create garments folder: {}", e))?;
    fs::create_dir_all(&exports_dir)
        .map_err(|e| format!("Failed to create exports folder: {}", e))?;

    // 5. Создаём .esketit файл внутри папки проекта
    let xml_content = generate_project_xml(&request, project_id);
    let file_path = project_folder.join(format!("{}.esketit", sanitize_file_name(&request.name)));

    let mut file = File::create(&file_path)
        .map_err(|e| format!("Failed to create project file: {}", e))?;
    file.write_all(xml_content.as_bytes())
        .map_err(|e| format!("Failed to write project file: {}", e))?;

    // 6. Обновляем путь в БД на новую папку
    sqlx::query(
        "UPDATE projects SET file_path = ? WHERE id = ?"
    )
    .bind(project_folder.to_str().ok_or("Invalid path")?)
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to update project path: {}", e))?;

    // 7. Добавляем в recent_projects
    sqlx::query(
        "INSERT INTO recent_projects (project_id, last_opened, open_count, pin_to_top)
         VALUES (?, CURRENT_TIMESTAMP, 1, 0)"
    )
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create recent project: {}", e))?;

    Ok(CreateProjectResponse {
        project_id,
        file_path: project_folder.to_str().ok_or("Invalid path")?.to_string(),
    })
}

// Вспомогательная функция для безопасного имени папки
fn sanitize_folder_name(name: &str) -> String {
    name.trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .replace(' ', "_")
}

// Вспомогательная функция для безопасного имени файла
fn sanitize_file_name(name: &str) -> String {
    name.trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
}

#[derive(Debug, Serialize, FromRow)]
pub struct RecentProject {
    pub id: i64,
    pub name: String,
    pub file_path: String,
    pub created_at: String,
    pub last_opened: String,
    pub open_count: i64,
    pub pin_to_top: bool,
}

#[command]
pub async fn get_recent_projects(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<RecentProject>, String> {
    sqlx::query_as::<_, RecentProject>(
        r#"
        SELECT 
            p.id,
            p.name,
            p.file_path,
            p.created_at,
            rp.last_opened,
            rp.open_count,
            rp.pin_to_top
        FROM recent_projects rp
        INNER JOIN projects p ON rp.project_id = p.id
        ORDER BY rp.pin_to_top DESC, rp.last_opened DESC
        LIMIT 20
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch recent projects: {}", e))
}

#[tauri::command]
pub async fn open_project(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    // Обновляем статистику открытия
    sqlx::query(
        "UPDATE recent_projects 
         SET last_opened = CURRENT_TIMESTAMP, open_count = open_count + 1 
         WHERE project_id = ?"
    )
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to update recent project: {}", e))?;

    // Возвращаем путь к файлу для открытия
    let path: String = sqlx::query_scalar("SELECT file_path FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Failed to get project path: {}", e))?;

    Ok(path)
}