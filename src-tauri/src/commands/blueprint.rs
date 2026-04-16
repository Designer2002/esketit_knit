use sqlx::{Row, SqlitePool};
use std::fs;
use std::path::Path;
use tauri::command;
use crate::blueprint::BlueprintCalculation;
use crate::blueprint::types::*;
use crate::blueprint::ProjectMeasurements;
use crate::blueprint::RaglanCalculation;
use crate::blueprint::calculator::BlueprintCalculator;
use crate::blueprint::calculator::decrease_groups_to_rows;



// ===== ТАУРИ-КОМАНДЫ: БАЗА ДАННЫХ И ПАТТЕРНЫ =====
#[command]
pub async fn get_patterns_for_project(
    project_id: i64, pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<PatternInfo>, String> {
    let project = sqlx::query("SELECT file_path FROM projects WHERE id = ?")
        .bind(project_id).fetch_optional(pool.inner()).await
        .map_err(|e| format!("Failed to fetch project: {}", e))?;
    let patterns_dir = match project {
        Some(row) => { let file_path: String = row.get("file_path"); format!("{}/patterns", file_path) }
        None => return Ok(vec![]),
    };
    let dir_path = Path::new(&patterns_dir);
    if !dir_path.exists() { return Ok(vec![]); }
    let entries = fs::read_dir(dir_path).map_err(|e| format!("Failed to read patterns dir: {}", e))?;
    let mut patterns = Vec::new();
    let mut file_idx: i64 = 1;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if !path.is_file() || (!file_name.ends_with(".swaga") && !file_name.ends_with(".txt")) { continue; }
        let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read pattern file: {}", e))?;
        if let Some(pattern) = parse_pattern_file(&content, &file_name) {
            patterns.push(PatternInfo { id: file_idx, name: pattern.name, pattern_type: "file".to_string(), width: pattern.width as i64, height: pattern.height as i64, pattern_data: pattern.data, category: pattern.category });
            file_idx += 1;
        }
    }
    let db_patterns = sqlx::query_as::<_, PatternInfo>("SELECT id, name, pattern_type, width, height, pattern_data, category FROM patterns WHERE is_global = 1").fetch_all(pool.inner()).await.unwrap_or_default();
    patterns.extend(db_patterns);
    Ok(patterns)
}

struct ParsedPattern { name: String, width: usize, height: usize, data: String, category: Option<String> }
fn parse_pattern_file(content: &str, file_name: &str) -> Option<ParsedPattern> {
    let lines: Vec<&str> = content.split('\n').filter(|l| !l.trim().is_empty()).collect();
    let mut metadata = std::collections::HashMap::new();
    let mut pattern_lines = Vec::new();
    let mut in_header = true;
    for line in &lines {
        if line.starts_with('#') {
            if in_header && line.contains('=') {
                let parts: Vec<&str> = line[1..].split('=').map(|s| s.trim()).collect();
                if parts.len() == 2 { metadata.insert(parts[0].to_string(), parts[1].to_string()); }
            }
            if line.contains("# end_header") || line.contains("#END_HEADER") { in_header = false; }
            continue;
        }
        in_header = false;
        pattern_lines.push(line);
    }
    if pattern_lines.is_empty() { return None; }
    let width = pattern_lines[0].len();
    let height = pattern_lines.len();
    let data = pattern_lines.iter().map(|s| **s).collect::<Vec<&str>>().join("\n");
    let name = metadata.get("name").cloned().unwrap_or_else(|| file_name.replace(".swaga", "").replace(".txt", ""));
    let category = metadata.get("category").cloned();
    Some(ParsedPattern { name, width, height, data, category })
}

#[command]
pub async fn get_blueprint_templates(garment_type_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Vec<BlueprintTemplate>, String> {
    sqlx::query_as::<_, BlueprintTemplate>("SELECT * FROM blueprints WHERE garment_type_id = ?").bind(garment_type_id).fetch_all(pool.inner()).await.map_err(|e| format!("Failed to fetch blueprint templates: {}", e))
}
#[command]
pub async fn get_blueprint_nodes(blueprint_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Vec<BlueprintNode>, String> {
    sqlx::query_as::<_, BlueprintNode>("SELECT * FROM blueprint_nodes WHERE blueprint_id = ? ORDER BY id").bind(blueprint_id).fetch_all(pool.inner()).await.map_err(|e| format!("Failed to fetch blueprint nodes: {}", e))
}
#[command]
pub async fn save_blueprint_measurement(req: SaveBlueprintMeasurementRequest, pool: tauri::State<'_, SqlitePool>) -> Result<i64, String> {
    let unit = req.unit.unwrap_or_else(|| "cm".to_string());
    let result = sqlx::query("INSERT INTO project_blueprint_measurements (project_id, measurement_code, value, unit, is_default, note) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(project_id, measurement_code) DO UPDATE SET value = excluded.value, unit = excluded.unit, note = excluded.note, is_default = 0")
        .bind(req.project_id).bind(&req.measurement_code).bind(req.value).bind(&unit).bind(&req.note)
        .execute(pool.inner()).await.map_err(|e| format!("Failed to save measurement: {}", e))?;
    Ok(result.last_insert_rowid())
}
#[command]
pub async fn get_project_blueprint_measurements(project_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Vec<BlueprintMeasurement>, String> {
    let rows = sqlx::query("SELECT * FROM project_blueprint_measurements WHERE project_id = ?").bind(project_id).fetch_all(pool.inner()).await.map_err(|e| format!("Failed to fetch measurements: {}", e))?;
    Ok(rows.iter().map(|r| BlueprintMeasurement::from(r)).collect())
}
#[command]
pub async fn update_blueprint_node(project_id: i64, node_name: String, x: f64, y: f64, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
    let existing: Option<String> = sqlx::query_scalar("SELECT calculation_log FROM calculations WHERE project_id = ?").bind(project_id).fetch_optional(pool.inner()).await.map_err(|e| format!("Failed to fetch calculations: {}", e))?;
    let mut nodes_json: serde_json::Value = existing.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!({}));
    if nodes_json.get("nodes").and_then(|n| n.as_array()).is_none() { nodes_json["nodes"] = serde_json::json!([]); }
    let nodes = nodes_json["nodes"].as_array_mut().unwrap();
    let mut found = false;
    for node in nodes.iter_mut() {
        if node["node_name"] == node_name { node["x"] = serde_json::json!(x); node["y"] = serde_json::json!(y); found = true; break; }
    }
    if !found { nodes.push(serde_json::json!({ "node_name": node_name, "x": x, "y": y })); }
    let log = serde_json::to_string(&nodes_json).map_err(|e| format!("Failed to serialize: {}", e))?;
    sqlx::query("INSERT INTO calculations (project_id, calculation_log) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET calculation_log = excluded.calculation_log").bind(project_id).bind(&log).execute(pool.inner()).await.map_err(|e| format!("Failed to save node: {}", e))?;
    Ok(())
}
#[command]
pub async fn get_custom_blueprint_nodes(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<BlueprintNodeDTO>, String> {

    let existing: Option<String> = sqlx::query_scalar(
        "SELECT calculation_log FROM calculations WHERE project_id = ?"
    )
    .bind(project_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch calculations: {}", e))?;

    let nodes = existing
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["nodes"].as_array().cloned())
        .map(|arr| {
            arr.iter()
                .filter_map(|n| {
                    Some(BlueprintNodeDTO {
                        node_name: n["node_name"].as_str()?.to_string(),
                        x: n["x"].as_f64()?,
                        y: n["y"].as_f64()?,
                        was_manually_moved: true,
                        part_code: n["part_code"]
                            .as_str()
                            .unwrap_or("front")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(nodes)
}
#[command]
pub async fn save_blueprint_pattern_stamp(req: SaveBlueprintPatternStampRequest, pool: tauri::State<'_, SqlitePool>) -> Result<BlueprintPatternStamp, String> {
    let pattern_data_str = req.pattern_data.clone().unwrap_or_default();
    let result = sqlx::query("INSERT INTO blueprint_patterns (project_id, part_code, pattern_id, position_x, position_y, width, height, is_selected, z_order, pattern_data) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)")
        .bind(req.project_id).bind(&req.part_code).bind(req.pattern_id).bind(req.position_x).bind(req.position_y).bind(req.width).bind(req.height).bind(&pattern_data_str)
        .execute(pool.inner()).await.map_err(|e| format!("Failed to save pattern stamp: {}", e))?;
    let id = result.last_insert_rowid();
    sqlx::query_as::<_, BlueprintPatternStamp>("SELECT * FROM blueprint_patterns WHERE id = ?").bind(id).fetch_optional(pool.inner()).await.map_err(|e| format!("Failed to fetch saved stamp: {}", e))?.ok_or("Failed to retrieve saved stamp".into())
}
#[command]
pub async fn get_blueprint_pattern_stamps(project_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Vec<BlueprintPatternStamp>, String> {
    sqlx::query_as::<_, BlueprintPatternStamp>("SELECT * FROM blueprint_patterns WHERE project_id = ? ORDER BY z_order").bind(project_id).fetch_all(pool.inner()).await.map_err(|e| format!("Failed to fetch pattern stamps: {}", e))
}
#[command]
pub async fn delete_blueprint_pattern_stamp(stamp_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM blueprint_patterns WHERE id = ?").bind(stamp_id).execute(pool.inner()).await.map_err(|e| format!("Failed to delete pattern stamp: {}", e))?;
    Ok(())
}
#[command]
pub async fn update_blueprint_pattern_stamp(stamp_id: i64, position_x: f64, position_y: f64, custom_color: Option<String>, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("UPDATE blueprint_patterns SET position_x = ?, position_y = ?, custom_color = ? WHERE id = ?").bind(position_x).bind(position_y).bind(custom_color.as_deref()).bind(stamp_id).execute(pool.inner()).await.map_err(|e| format!("Failed to update pattern stamp: {}", e))?;
    Ok(())
}
#[command]
pub async fn save_blueprint_knitting_settings(settings: BlueprintKnittingSettings, pool: tauri::State<'_, SqlitePool>) -> Result<i64, String> {
    let result = sqlx::query("INSERT INTO blueprint_knitting_settings (project_id, boundary_mode, empty_row_mode, auto_calculate_nodes, needle_boundary_left, needle_boundary_right) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET boundary_mode = excluded.boundary_mode, empty_row_mode = excluded.empty_row_mode, auto_calculate_nodes = excluded.auto_calculate_nodes, needle_boundary_left = excluded.needle_boundary_left, needle_boundary_right = excluded.needle_boundary_right")
        .bind(settings.project_id).bind(&settings.boundary_mode).bind(&settings.empty_row_mode).bind(settings.auto_calculate_nodes).bind(settings.needle_boundary_left).bind(settings.needle_boundary_right)
        .execute(pool.inner()).await.map_err(|e| format!("Failed to save knitting settings: {}", e))?;
    Ok(result.last_insert_rowid())
}
#[command]
pub async fn clone_blueprint_pattern_stamp(stamp_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<BlueprintPatternStamp, String> {
    let row = sqlx::query("SELECT * FROM blueprint_patterns WHERE id = ?").bind(stamp_id).fetch_optional(pool.inner()).await.map_err(|e| format!("Failed to fetch stamp: {}", e))?.ok_or("Stamp not found")?;
    let project_id: i64 = row.get("project_id");
    let part_code: String = row.get("part_code");
    let pattern_id: Option<i64> = row.get("pattern_id");
    let position_x: f64 = row.get("position_x");
    let position_y: f64 = row.get("position_y");
    let width: i32 = row.get("width");
    let height: i32 = row.get("height");
    let z_order: i32 = row.get("z_order");
    let pattern_data: Option<String> = row.try_get("pattern_data").ok().flatten();
    let custom_color: Option<String> = row.try_get("custom_color").ok().flatten();
    sqlx::query("INSERT INTO blueprint_patterns (project_id, part_code, pattern_id, position_x, position_y, width, height, is_selected, z_order, pattern_data, custom_color) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)")
        .bind(project_id).bind(&part_code).bind(pattern_id).bind(position_x + 15.0).bind(position_y + 15.0).bind(width).bind(height).bind(z_order + 1).bind(pattern_data.as_deref()).bind(custom_color.as_deref())
        .execute(pool.inner()).await.map_err(|e| format!("Failed to clone stamp: {}", e))?;
    sqlx::query_as::<_, BlueprintPatternStamp>("SELECT * FROM blueprint_patterns ORDER BY id DESC LIMIT 1").fetch_optional(pool.inner()).await.map_err(|e| format!("Failed to fetch cloned stamp: {}", e))?.ok_or("Failed to retrieve cloned stamp".into())
}
#[command]
pub async fn get_blueprint_knitting_settings(project_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Option<BlueprintKnittingSettings>, String> {
    let row = sqlx::query("SELECT * FROM blueprint_knitting_settings WHERE project_id = ?").bind(project_id).fetch_optional(pool.inner()).await.map_err(|e| format!("Failed to fetch knitting settings: {}", e))?;
    Ok(row.map(|r| BlueprintKnittingSettings {
        id: r.get("id"), project_id: r.get("project_id"), boundary_mode: r.get("boundary_mode"),
        empty_row_mode: r.get("empty_row_mode"), auto_calculate_nodes: r.get::<i64, _>("auto_calculate_nodes") != 0,
        needle_boundary_left: r.get("needle_boundary_left"), needle_boundary_right: r.get("needle_boundary_right"),
    }))
}

// ===== ТАУРИ-КОМАНДЫ: ПРОГРЕСС И ИНСТРУКЦИИ =====
#[command]
pub async fn get_garment_row_instructions(project_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Vec<GarmentRowInfo>, String> {
    let calc = calculate_raglan_pattern_internal(project_id, pool.inner()).await?;
    let stamps = sqlx::query("SELECT bp.*, p.name as pattern_name FROM blueprint_patterns bp LEFT JOIN patterns p ON bp.pattern_id = p.id WHERE bp.project_id = ?").bind(project_id).fetch_all(pool.inner()).await.map_err(|e| format!("{}", e))?;
    let mut rows: Vec<GarmentRowInfo> = Vec::new();
    let max_h = calc.total_rows.max(calc.sleeve_height_rows);
    let has_pattern_at = |row: i32, part: &str| -> (bool, Option<i64>, Option<String>) {
        let svg_y = max_h - row;
        for s in &stamps {
            let sp: String = s.get("part_code");
            if sp != part { continue; }
            let py: f64 = s.get("position_y");
            let h: i32 = s.get("height");
            if (svg_y as f64) >= py && (svg_y as f64) < py + h as f64 { return (true, Some(s.get("pattern_id")), Some(s.get("pattern_name"))); }
        }
        (false, None, None)
    };
    for row in 0..calc.total_rows {
        let mut action: Option<String> = None;
        let mut detail: Option<String> = None;
        let mut dl = false; let mut dr = false; let mut dc = 0;
        if let Some(i) = calc.back_decrease_rows.iter().position(|&r| r == row) { dl = true; dr = true; dc = calc.back_decrease_counts[i] as i32; action = Some("decrease".into()); detail = Some(format!("убавить {} п. реглан", dc)); }
        let (ip, pid, pn) = has_pattern_at(row, "back");
        rows.push(GarmentRowInfo { row: row + 1, part_code: "back".into(), stitches: calc.back_width_stitches, action, action_detail: detail, is_pattern_row: ip, pattern_id: pid, pattern_name: pn, decrease_left: dl, decrease_right: dr, decrease_count: dc });
    }
    for row in 0..calc.total_rows {
        let mut action: Option<String> = None;
        let mut detail: Option<String> = None;
        let mut dl = false; let mut dr = false; let mut dc = 0;
        if let Some(i) = calc.front_decrease_rows.iter().position(|&r| r == row) { dl = true; dr = true; dc = calc.front_decrease_counts[i] as i32; action = Some("decrease".into()); detail = Some(format!("убавить {} п. реглан", dc)); }
        if let Some(i) = calc.neck_decrease_rows.iter().position(|&r| r == row) { let nc = calc.neck_decrease_counts[i]; action = Some("neck".into()); detail = Some(format!("убавить {} п. горловина", nc)); }
        let (ip, pid, pn) = has_pattern_at(row, "front");
        rows.push(GarmentRowInfo { row: row + 1, part_code: "front".into(), stitches: calc.front_width_stitches, action, action_detail: detail, is_pattern_row: ip, pattern_id: pid, pattern_name: pn, decrease_left: dl, decrease_right: dr, decrease_count: dc });
    }
    for row in 0..calc.sleeve_height_rows {
        let mut action: Option<String> = None;
        let mut detail: Option<String> = None;
        let mut dl = false; let mut dr = false; let mut dc = 0;
        if calc.sleeve_increase_rows.contains(&row) { action = Some("increase".into()); detail = Some("прибавить по 1 п.".into()); }
        let (ip, pid, pn) = has_pattern_at(row, "sleeve");
        rows.push(GarmentRowInfo { row: row + 1, part_code: "sleeve".into(), stitches: calc.sleeve_top_stitches, action, action_detail: detail, is_pattern_row: ip, pattern_id: pid, pattern_name: pn, decrease_left: dl, decrease_right: dr, decrease_count: dc });
    }
    rows.sort_by_key(|r| (r.part_code.clone(), r.row));
    Ok(rows)
}

#[command]
pub async fn get_garment_row_info(project_id: i64, row: i32, part_code: String, pool: tauri::State<'_, SqlitePool>) -> Result<Option<GarmentRowInfo>, String> {
    let all_rows = get_garment_row_instructions(project_id, pool).await?;
    Ok(all_rows.into_iter().find(|r| r.row == row && r.part_code == part_code))
}

#[command]
pub async fn get_garment_part_row_range(project_id: i64, part_code: String, pool: tauri::State<'_, SqlitePool>) -> Result<GarmentRowRange, String> {
    let calc = calculate_raglan_pattern_internal(project_id, pool.inner()).await?;
    let end_row = match part_code.as_str() { "back" => calc.total_rows, "front" => calc.total_rows, "sleeve" => calc.sleeve_height_rows, _ => calc.total_rows };
    Ok(GarmentRowRange { start_row: 1, end_row, part_code })
}

#[command]
pub async fn save_garment_progress(project_id: i64, current_row: i32, part_code: String, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
    let progress_json = serde_json::json!({ "current_row": current_row, "part_code": part_code, "timestamp": chrono::Local::now().to_rfc3339() });
    sqlx::query("INSERT INTO calculations (project_id, calculation_log) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET calculation_log = excluded.calculation_log").bind(project_id).bind(&progress_json.to_string()).execute(pool.inner()).await.map_err(|e| format!("Failed to save garment progress: {}", e))?;
    Ok(())
}

#[command]
pub async fn load_garment_progress(project_id: i64, pool: tauri::State<'_, SqlitePool>) -> Result<Option<serde_json::Value>, String> {
    let log: Option<String> = sqlx::query_scalar("SELECT calculation_log FROM calculations WHERE project_id = ?").bind(project_id).fetch_optional(pool.inner()).await.map_err(|e| format!("Failed to load garment progress: {}", e))?;
    Ok(log.and_then(|s| serde_json::from_str(&s).ok()))
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ БД-ЗАПРОСОВ (используются в инструкциях) =====
async fn get_raglan_measurements_internal(project_id: i64, pool: &SqlitePool) -> Result<ProjectMeasurements, String> {
    let garment_type_id: i64 = sqlx::query_scalar("SELECT garment_type_id FROM projects WHERE id = ?").bind(project_id).fetch_optional(pool).await.map_err(|e| format!("Failed to get garment type: {}", e))?.unwrap_or(15);
    let default_json: String = sqlx::query_scalar("SELECT base_measurements FROM garment_types WHERE id = ?").bind(garment_type_id).fetch_optional(pool).await.map_err(|e| format!("Failed to get default measurements: {}", e))?.unwrap_or_else(|| r#"{"og":94,"dr":60,"oz":16,"or":32,"di":62,"glg":8,"oh":58,"ease":6,"gauge_stitches_per_cm":2.5,"gauge_rows_per_cm":3.5}"#.to_string());
    let defaults: serde_json::Value = serde_json::from_str(&default_json).map_err(|e| format!("Failed to parse defaults: {}", e))?;
    let user_measurements = sqlx::query("SELECT measurement_code, value FROM project_blueprint_measurements WHERE project_id = ?").bind(project_id).fetch_all(pool).await.map_err(|e| format!("Failed to fetch user measurements: {}", e))?;
    let mut user_map = std::collections::HashMap::new();
    for row in user_measurements { let code: String = row.get("measurement_code"); let value: f64 = row.get("value"); user_map.insert(code, value); }
    let get_val = |key: &str, default: f64| -> f64 { if let Some(v) = user_map.get(key) { *v } else { defaults.get(key).and_then(|v| v.as_f64()).unwrap_or(default) } };
    Ok(ProjectMeasurements {
        og: get_val("og", 94.0), dr: get_val("dr", 60.0), oz: get_val("oz", 16.0), oh: get_val("oh", 58.0),
        or_val: get_val("or", 32.0), di: get_val("di", 62.0), glg: get_val("glg", 8.0), ease: get_val("ease", 6.0),
        gauge_stitches_per_cm: get_val("gauge_stitches_per_cm", 2.5), gauge_rows_per_cm: get_val("gauge_rows_per_cm", 3.5),
        shoulder_height: get_val("shoulder_height", 5.5), shoulder_length: get_val("shoulder_length", 13.0),
        waist_circumference: get_val("waist_circumference", 70.0), hip_circumference: get_val("hip_circumference", 100.0),
        back_len: get_val("back_len", 40.0), hip_len: get_val("hip_len", 20.0),
    })
}

async fn calculate_raglan_pattern_internal(project_id: i64, pool: &SqlitePool) -> Result<RaglanCalculation, String> {
    let measurements = get_raglan_measurements_internal(project_id, pool).await?;
    // Используем новый калькулятор вместо старой функции
    let calc = BlueprintCalculator::new("raglan").calculate_from_measurements(&measurements)?;
    match calc {
        BlueprintCalculation::Raglan(r) => Ok(r),
        _ => Err("Expected raglan calculation".into())
    }
}

// ===== УНИФИЦИРОВАННАЯ КОМАНДА РАСЧЁТА (использует BlueprintCalculator) =====
#[command]
pub async fn calculate_blueprint(
    project_id: i64,
    sleeve_type: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<serde_json::Value, String> {
    let calc = BlueprintCalculator::new(&sleeve_type)
        .calculate(project_id, pool.inner())
        .await?;

    match calc {
        BlueprintCalculation::Raglan(r) => Ok(serde_json::json!({
            "type": "raglan",
            "back_width_stitches": r.back_width_stitches,
            "front_width_stitches": r.front_width_stitches,
            "neck_width_stitches": r.neck_width_stitches,
            "sleeve_top_stitches": r.sleeve_top_stitches,
            "sleeve_cuff_stitches": r.sleeve_cuff_stitches,
            "total_rows": r.total_rows,
            "raglan_start_row_front": r.raglan_start_row_front,
            "raglan_start_row_back": r.raglan_start_row_back,
            "raglan_end_row": r.raglan_end_row,
            "sleeve_height_rows": r.sleeve_height_rows,
            "sleeve_increase_rows": r.sleeve_increase_rows,
            "total_decreases": r.total_decreases,
            "neck_decrease_counts": r.neck_decrease_counts,
            "neck_decrease_rows": r.neck_decrease_rows,
            "decrease_shoulder_cuts": r.decrease_shoulder_cuts,
            "viewbox_width": r.viewbox_width,
            "viewbox_height": r.viewbox_height,
            "sleeve_shoulder_cut_rows": r.sleeve_shoulder_cut_rows,
            "sleeve_slope_start_x": r.sleeve_slope_start_x,
            "sleeve_slope_end_x": r.sleeve_slope_end_x,
            "sleeve_cap_offset": r.sleeve_cap_offset,
            "sleeve_width_stitches": r.sleeve_width_stitches,
            "back_decrease_rows": r.back_decrease_rows,
            "back_decrease_counts": r.back_decrease_counts,
            "front_decrease_rows": r.front_decrease_rows,
            "front_decrease_counts": r.front_decrease_counts,
            "neck_depth_rows": r.neck_depth_rows,
            "nodes": r.nodes,
            "sleeve_raglan_rows_back": r.sleeve_raglan_rows_back,
            "sleeve_raglan_rows_front": r.sleeve_raglan_rows_front,
            "blueprint_stitch_data": r.blueprint_stitch_data,
            "blueprint_row_data": r.blueprint_row_data,
        })),
        BlueprintCalculation::SetIn(s) => {
            let (armhole_rows, armhole_counts) = decrease_groups_to_rows(&s.armhole_decreases);
            let (sleeve_cap_rows, sleeve_cap_counts) = decrease_groups_to_rows(&s.sleeve_cap_decreases);
            let (shoulder_rows, shoulder_counts) = decrease_groups_to_rows(&s.shoulder_decreases);
            let (neck_back_rows, neck_back_counts) = decrease_groups_to_rows(&s.neck_decreases_rows_back);
            let (neck_front_rows, neck_front_counts) = decrease_groups_to_rows(&s.neck_decreases_rows_front);
            
            Ok(serde_json::json!({
                "type": "set_in",
                "hem_width_stitches": s.hem_width_stitches,
                "underarm_width_stitches": s.underarm_width_stitches,
                "armhole_height_rows": s.armhole_height_rows,
                "total_garment_rows": s.total_garment_rows,
                "viewbox_width": s.viewbox_width,
                "viewbox_height": s.viewbox_height,
                "nodes": s.nodes,
                "armhole_decrease_rows": armhole_rows,
                "armhole_decrease_counts": armhole_counts,
                "armhole_decreases": s.armhole_decreases,
                "neck_width_stitches": s.neck_width_stitches,
                "neck_depth_rows": s.neck_depth_rows,
                "neck_decreases_rows_back": neck_back_rows,
                "neck_decreases_counts_back": neck_back_counts,
                "neck_decreases_rows_front": neck_front_rows,
                "neck_decreases_counts_front": neck_front_counts,
                "rem_back": s.rem_back,
                "rem_front": s.rem_front,
                "shoulder_slope_height_rows": s.shoulder_slope_height_rows,
                "start_shoulder_slope_row": s.start_shoulder_slope_row,
                "shoulder_decrease_stitches": s.shoulder_decrease_stitches,
                "shoulder_decrease_times": s.shoulder_decrease_times,
                "shoulder_decrease_rows": shoulder_rows,
                "shoulder_decrease_counts": shoulder_counts,
                "shoulder_decreases": s.shoulder_decreases,
                "sleeve_cuff_stitches": s.sleeve_cuff_stitches,
                "sleeve_widest_stitches": s.sleeve_widest_stitches,
                "sleeve_cap_height_rows": s.sleeve_cap_height_rows,
                "sleeve_cap_decrease_rows": sleeve_cap_rows,
                "sleeve_cap_decrease_counts": sleeve_cap_counts,
                "sleeve_cap_decreases": s.sleeve_cap_decreases,
                "sleeve_body_rows": s.sleeve_body_rows,
                "waist_decreases": s.waist_decreases,
                "waist_increases": s.waist_increases,
                "waist_start_row": s.waist_start_row,
                "waist_end_row": s.waist_end_row,
                "waist_point_row": s.waist_point_row,
                "blueprint_stitch_data": s.blueprint_stitch_data,
                "blueprint_row_data": s.blueprint_row_data,
            }))
        }
    }
}