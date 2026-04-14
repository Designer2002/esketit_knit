use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, SqlitePool};
use std::fs;
use std::path::Path;
use tauri::command;
use crate::blueprint::{BlueprintCalculation, BlueprintCalculator, BlueprintNodePosition, DecreaseGroup, ProjectMeasurements, RaglanCalculation};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct PatternInfo {
    pub id: i64,
    pub name: String,
    pub pattern_type: String,
    pub width: i64,
    pub height: i64,
    pub pattern_data: String,
    pub category: Option<String>,
}

// ===== СТРУКТУРЫ =====

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintTemplate {
    pub id: i64,
    pub garment_type_id: i64,
    pub name: String,
    pub part_code: String,
    pub svg_template: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintNode {
    pub id: i64,
    pub blueprint_id: i64,
    pub node_name: String,
    pub x: f64,
    pub y: f64,
    pub is_movable: bool,
    pub is_required: bool,
    pub tooltip: Option<String>,
    pub config: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveBlueprintMeasurementRequest {
    pub project_id: i64,
    pub measurement_code: String,
    pub value: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BlueprintMeasurement {
    pub id: i64,
    pub project_id: i64,
    pub measurement_code: String,
    pub value: f64,
    pub unit: String,
    pub is_default: bool,
    pub note: Option<String>,
}

impl From<&sqlx::sqlite::SqliteRow> for BlueprintMeasurement {
    fn from(row: &sqlx::sqlite::SqliteRow) -> Self {
        BlueprintMeasurement {
            id: row.get("id"),
            project_id: row.get("project_id"),
            measurement_code: row.get("measurement_code"),
            value: row.get("value"),
            unit: row.get("unit"),
            is_default: row.get::<i64, _>("is_default") != 0,
            note: row.get("note"),
        }
    }
}


#[derive(Debug, Serialize, Deserialize)]
pub struct SaveBlueprintNodesRequest {
    pub project_id: i64,
    pub nodes: Vec<BlueprintNodePosition>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveBlueprintPatternStampRequest {
    pub project_id: i64,
    pub part_code: String,
    pub pattern_id: Option<i64>,
    pub position_x: f64,
    pub position_y: f64,
    pub width: i32,
    pub height: i32,
    pub pattern_data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintPatternStamp {
    pub id: i64,
    pub project_id: i64,
    pub part_code: String,
    pub pattern_id: Option<i64>,
    pub position_x: f64,
    pub position_y: f64,
    pub width: i32,
    pub height: i32,
    pub pattern_data: Option<String>,
    pub custom_color: Option<String>,
    pub is_selected: bool,
    pub z_order: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BlueprintKnittingSettings {
    pub id: i64,
    pub project_id: i64,
    pub boundary_mode: String,
    pub empty_row_mode: String,
    pub auto_calculate_nodes: bool,
    pub needle_boundary_left: Option<i32>,
    pub needle_boundary_right: Option<i32>,
}

// ===== INTERNAL: Get measurements without tauri::State =====
async fn get_raglan_measurements_internal(
    project_id: i64,
    pool: &SqlitePool,
) -> Result<ProjectMeasurements, String> {
    let garment_type_id: i64 =
        sqlx::query_scalar("SELECT garment_type_id FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to get garment type: {}", e))?
            .unwrap_or(15);

    let default_json: String = sqlx::query_scalar(
        "SELECT base_measurements FROM garment_types WHERE id = ?"
    )
    .bind(garment_type_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to get default measurements: {}", e))?
    .unwrap_or_else(|| r#"{"og":94,"dr":60,"oz":16,"or":32,"di":62,"glg":8,"oh":58,"ease":6,"gauge_stitches_per_cm":2.5,"gauge_rows_per_cm":3.5}"#.to_string());

    let defaults: serde_json::Value = serde_json::from_str(&default_json)
        .map_err(|e| format!("Failed to parse defaults: {}", e))?;

    let user_measurements = sqlx::query(
        "SELECT measurement_code, value FROM project_blueprint_measurements WHERE project_id = ?",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch user measurements: {}", e))?;

    let mut user_map = std::collections::HashMap::new();
    for row in user_measurements {
        let code: String = row.get("measurement_code");
        let value: f64 = row.get("value");
        user_map.insert(code, value);
    }

    let get_val = |key: &str, default: f64| -> f64 {
        if let Some(v) = user_map.get(key) {
            *v
        } else {
            defaults
                .get(key)
                .and_then(|v| v.as_f64())
                .unwrap_or(default)
        }
    };

    Ok(ProjectMeasurements {
        og: get_val("og", 94.0),
        dr: get_val("dr", 60.0),
        oz: get_val("oz", 16.0),
        oh: get_val("oh", 58.0),
        or_val: get_val("or", 32.0),
        di: get_val("di", 62.0),
        glg: get_val("glg", 8.0),
        ease: get_val("ease", 6.0),
        gauge_stitches_per_cm: get_val("gauge_stitches_per_cm", 2.5),
        gauge_rows_per_cm: get_val("gauge_rows_per_cm", 3.5),
        shoulder_height: get_val("shoulder_height", 5.5),
        shoulder_length: get_val("shoulder_length", 13.0),
        waist_circumference: get_val("waist_circumference", 70.0),
        hip_circumference: get_val("hip_circumference", 100.0),
        back_len: get_val("back_len", 40.0),
        hip_len: get_val("hip_len", 20.0),
    })
}

/// Влияние мерок (ML data):
/// - Старт тела: di (59%), r (41%)
/// - Смещение рукава: di (38%), oh (35%), r (17%)  
/// - Высота скоса: r (84%), og (16%)
fn calculate_raglan(m: &ProjectMeasurements) -> RaglanCalculation {
    let p = m.gauge_stitches_per_cm;
    let r = m.gauge_rows_per_cm;

    let half_chest = (m.og / 2.0) + m.ease;

    let mut shoulder_cuts = 2.0;
    if m.og > 100.0 && m.og <= 120.0 {
        shoulder_cuts += 0.5;
    }
    if m.og > 120.0 {
        shoulder_cuts += 1.0;
    }

    let raglan_line_front = (half_chest / 3.0) + 7.0;
    let raglan_line_back = raglan_line_front + 2.0;

    let neck_line_back = (m.oh / 3.0) - 1.0;
    let neck_line_front = m.oh / 3.0;
    let neck_st_back = (neck_line_back * p).round() as i32;
    let neck_st_front = (neck_line_front * p).round() as i32;

    let hem_stitches = (half_chest * p).round() as i32;
    //let hem_rows = (half_chest * r).round() as i32;
    let garment_length_rows = (m.di * r).round() as i32;
    let raglan_rows_back = (raglan_line_back * r).round() as i32;
    let raglan_rows_front = (raglan_line_front * r).round() as i32;

    //let dec_shoulders_back = garment_length_rows - raglan_rows_back;
    //let dec_shoulders_front = garment_length_rows - raglan_rows_front;

    let dec_shoulder_st = (shoulder_cuts * p).round() as i32;

    let dec_raglan_back = ((hem_stitches - dec_shoulder_st * 2) - neck_st_back) / 2;
    let dec_raglan_front = ((hem_stitches - dec_shoulder_st * 2) - neck_st_front) / 2;
    // let first_dec_back = raglan_rows_back + 2;
    // let first_dec_front = raglan_rows_front + 2;
    let last_dec = garment_length_rows - 2;

    let raglan_start_back = garment_length_rows - raglan_rows_back;
    let raglan_start_front = garment_length_rows - raglan_rows_front;

    let (back_dec_rows, back_dec_counts) =
        gen_raglan_decreases(raglan_start_back, garment_length_rows, dec_raglan_back);

    let (front_dec_rows, front_dec_counts) =
        gen_raglan_decreases(raglan_start_front, garment_length_rows, dec_raglan_front);
    let neck_cut_rows = (m.glg * r).round() as i32;
    let neck_start = garment_length_rows - neck_cut_rows;
    let (neck_dec_rows, neck_dec_counts) = gen_neckline_decreases(
        neck_start,
        garment_length_rows,
        neck_st_front,
        neck_cut_rows,
    );

    let sleeve_width_st = ((m.or_val + m.ease) * p).round() as i32;
    let start_raglan_st = sleeve_width_st - dec_shoulder_st * 2;
    let sleeve_cap = ((m.oh / 6.0) * p).round() as i32;
 
    let sleeve_length_rows = (m.dr * r).round() as i32;
    let sleeve_cut_rows = sleeve_length_rows - raglan_rows_front;
    let sleeve_cuff_st = ((m.oz * p).round() as i32).max(10);
    let total_sleeve_inc = (start_raglan_st - sleeve_cuff_st).max(0) / 2;
    let sleeve_increase_zone = sleeve_length_rows - sleeve_cut_rows- 4;
    //let sleeve_raglan_zone_start = sleeve_cut_rows_back;
   let viewbox_w = (hem_stitches * 2 + sleeve_cap * 2 + 100) as i32;
    let viewbox_h = (garment_length_rows.max(sleeve_length_rows) + 50) as i32;

   let cx = viewbox_w as f64 / 2.0;
   
    let (sleeve_inc_rows, _) = gen_sleeve_increases(total_sleeve_inc, sleeve_increase_zone);
 let cuff_w = sleeve_cuff_st as f64;
    let top_w = sleeve_cap as f64;
    let slope_start_x = cx - top_w / 2.0;
    let slope_end_x = cx - cuff_w / 2.0;
    let cap_offset = if total_sleeve_inc > 0 {
        (total_sleeve_inc as f64 * 0.3).min(top_w * 0.25)
    } else {
        0.0
    };
    let left_rows = sleeve_length_rows; // перед
    let right_rows = sleeve_length_rows - cap_offset.round() as i32; // спинка (ниже!)
    let (sleeve_raglan_front, _) =
        gen_raglan_decreases(sleeve_increase_zone, left_rows, dec_raglan_front);

    let (sleeve_raglan_back, _) =
        gen_raglan_decreases(sleeve_increase_zone, right_rows, dec_raglan_back);
    
    
    let mut nodes = Vec::new();
    let hem_y = viewbox_h as f64 - 20.0;
    let underarm_y = raglan_rows_back as f64;
    let neck_y = 30.0;
    let bcx = (viewbox_w * 3 / 4) as f64;
    let fcx = (viewbox_w / 4) as f64;

    nodes.extend([
        BlueprintNodePosition {
            node_name: "back_left_hem".into(),
            x: bcx - hem_stitches as f64 / 2.0,
            y: hem_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_right_hem".into(),
            x: bcx + hem_stitches as f64 / 2.0,
            y: hem_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_left_underarm".into(),
            x: bcx - hem_stitches as f64 / 2.0,
            y: underarm_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_right_underarm".into(),
            x: bcx + hem_stitches as f64 / 2.0,
            y: underarm_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_left_shoulder".into(),
            x: bcx - hem_stitches as f64 / 2.0 + dec_shoulder_st as f64,
            y: underarm_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_right_shoulder".into(),
            x: bcx + hem_stitches as f64 / 2.0 - dec_shoulder_st as f64,
            y: underarm_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_left_raglan".into(),
            x: bcx - neck_st_back as f64 / 2.0,
            y: neck_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_right_raglan".into(),
            x: bcx + neck_st_back as f64 / 2.0,
            y: neck_y,
            part_code: "back".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "back_neck_center".into(),
            x: bcx,
            y: neck_y + (m.glg * r * 0.25) as f64,
            part_code: "back".into(),
            was_manually_moved: false,
        },
    ]);

    let shoulder_row = *neck_dec_rows.iter().max().unwrap_or(&garment_length_rows);
    let neck_y_shoulder = hem_y - shoulder_row as f64;
    let bottom_row = *neck_dec_rows.iter().min().unwrap_or(&garment_length_rows);
    let neck_y_bottom = hem_y - bottom_row as f64;
    let half_neck_front_st = ((m.oh / 2.0 / 2.0) * p);
    let rem: f64 =(m.glg- half_neck_front_st).max(0.0);

    nodes.extend([
        BlueprintNodePosition {
            node_name: "front_left_hem".into(),
            x: fcx - hem_stitches as f64 / 2.0,
            y: hem_y,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_right_hem".into(),
            x: fcx + hem_stitches as f64 / 2.0,
            y: hem_y,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_left_underarm".into(),
            x: fcx - hem_stitches as f64 / 2.0,
            y: underarm_y,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_right_underarm".into(),
            x: fcx + hem_stitches as f64 / 2.0,
            y: underarm_y,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_left_shoulder".into(),
            x: fcx - hem_stitches as f64 / 2.0 + dec_shoulder_st as f64,
            y: underarm_y,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_right_shoulder".into(),
            x: fcx + hem_stitches as f64 / 2.0 - dec_shoulder_st as f64,
            y: underarm_y,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_left_raglan".into(),
            x: fcx - neck_st_front as f64 / 2.0,
            y: neck_y_shoulder,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_right_raglan".into(),
            x: fcx + neck_st_front as f64 / 2.0,
            y: neck_y_shoulder,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_neck_left".into(),
            x: fcx - neck_st_front as f64 / 2.0,
            y: neck_y_shoulder,
            part_code: "front".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "front_neck_right".into(),
            x: fcx + neck_st_front as f64 / 2.0,
            y: neck_y_shoulder,
            part_code: "front".into(),
            was_manually_moved: false,
        },

        BlueprintNodePosition {
            node_name: "front_neck_center".into(),
            x: fcx,
            y: neck_y_bottom,
            part_code: "front".into(),
            was_manually_moved: false,
        },
    ]);

    // Внутри генерации nodes
    let padding = 40.0;
    let sl_cuff_y = sleeve_length_rows as f64 + padding;
    let sl_base_y = padding;
    let sl_cut_y = sleeve_cut_rows as f64 + padding;

    let sl_left_cuff = cx - cuff_w / 2.0;
    let sl_right_cuff = cx + cuff_w / 2.0;

    // Подрезы (самые крайние точки подмышки)
    let sl_left_cut = cx - start_raglan_st as f64 / 2.0;
    let sl_right_cut = cx + start_raglan_st as f64 / 2.0;

    // Вершины (самый верх рукава)
    let sl_left_top = cx - top_w / 2.0;
    let sl_right_top = cx + top_w / 2.0;
    let sl_slope_drop = cap_offset.max(6.0);

    // LEFT SLEEVE nodes
    nodes.extend([
        BlueprintNodePosition {
            node_name: "sleeve_cuff_left".into(),
            x: sl_left_cuff,
            y: sl_cuff_y,
            part_code: "sleeve_left".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_cuff_right".into(),
            x: sl_right_cuff,
            y: sl_cuff_y,
            part_code: "sleeve_left".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_underarm_left".into(),
            x: sl_left_cut,
            y: sl_cut_y,
            part_code: "sleeve_left".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_underarm_right".into(),
            x: sl_right_cut,
            y: sl_cut_y,
            part_code: "sleeve_left".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_top_left".into(),
            x: sl_left_top,
            y: sl_base_y,
            part_code: "sleeve_left".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_top_right".into(),
            x: sl_right_top,
            y: sl_base_y + sl_slope_drop,
            part_code: "sleeve_left".into(),
            was_manually_moved: false,
        },
    ]);

    // RIGHT SLEEVE nodes (mirrored positions with different part_code)
    nodes.extend([
        BlueprintNodePosition {
            node_name: "sleeve_cuff_left".into(),
            x: sl_left_cuff,
            y: sl_cuff_y,
            part_code: "sleeve_right".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_cuff_right".into(),
            x: sl_right_cuff,
            y: sl_cuff_y,
            part_code: "sleeve_right".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_underarm_left".into(),
            x: sl_left_cut,
            y: sl_cut_y,
            part_code: "sleeve_right".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_underarm_right".into(),
            x: sl_right_cut,
            y: sl_cut_y,
            part_code: "sleeve_right".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_top_left".into(),
            x: sl_left_top,
            y: sl_base_y,
            part_code: "sleeve_right".into(),
            was_manually_moved: false,
        },
        BlueprintNodePosition {
            node_name: "sleeve_top_right".into(),
            x: sl_right_top,
            y: sl_base_y + sl_slope_drop,
            part_code: "sleeve_right".into(),
            was_manually_moved: false,
        },
    ]);

    RaglanCalculation {
        back_width_stitches: hem_stitches,
        front_width_stitches: hem_stitches,
        neck_width_stitches: neck_st_back,
        sleeve_top_stitches: sleeve_cap,
        sleeve_cuff_stitches: sleeve_cuff_st,
        total_rows: garment_length_rows,
        raglan_start_row_front: raglan_rows_front,
        raglan_start_row_back: raglan_rows_back,
        raglan_end_row: last_dec,
        sleeve_height_rows: sleeve_length_rows,
        sleeve_increase_rows: sleeve_inc_rows,
        total_decreases: dec_raglan_back,
        neck_decrease_counts: neck_dec_counts,
        neck_decrease_rows: neck_dec_rows,
        decrease_shoulder_cuts: dec_shoulder_st,
        viewbox_width: viewbox_w,
        viewbox_height: viewbox_h,
        sleeve_shoulder_cut_rows: sleeve_cut_rows,
        sleeve_slope_start_x: slope_start_x,
        sleeve_slope_end_x: slope_end_x,
        sleeve_cap_offset: cap_offset,
        sleeve_width_stitches: sleeve_width_st as f64,
        back_decrease_rows: back_dec_rows,
        back_decrease_counts: back_dec_counts,
        front_decrease_rows: front_dec_rows,
        front_decrease_counts: front_dec_counts,
        neck_depth_rows: neck_cut_rows,
        nodes,
        sleeve_raglan_rows_back: sleeve_raglan_back,
        sleeve_raglan_rows_front: sleeve_raglan_front,
        neck_rem: rem
    }
}

fn gen_raglan_decreases(
    start_row: i32,
    end_row: i32,
    total_decreases: i32,
) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();
    if total_decreases <= 0 {
        return (rows, counts);
    }

    // Считаем реальный интервал между убавками
    // (Конечный ряд - начальный) / кол-во убавок
    let distance = (end_row - start_row).max(1);
    let interval = distance as f64 / total_decreases as f64;

    for i in 0..total_decreases {
        // Рассчитываем ряд для каждой убавки
        // Используем .round(), чтобы распределить максимально честно
        let row = start_row + (i as f64 * interval).round() as i32;

        // Чтобы не было убавок в одном и том же ряду (минимум через один)
        // Если ряд совпадает с предыдущим, сдвигаем на +1 или +2
        let mut final_row = row;
        if !rows.is_empty() && final_row <= *rows.last().unwrap() {
            final_row = rows.last().unwrap() + 2;
        }

        rows.push(final_row);
        counts.push(1); // В реглане обычно убавляют по 1 петле с каждой стороны
    }

    // Гарантируем, что последняя убавка не вылетела за пределы end_row
    if let Some(last) = rows.last_mut() {
        if *last > end_row {
            *last = end_row;
        }
    }

    (rows, counts)
}

fn gen_neckline_decreases(
    start_row: i32,
    total_rows: i32,
    neck_width_stitches: i32,
    neck_depth_rows: i32,
) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();

    if neck_width_stitches <= 0 || neck_depth_rows <= 1 {
        return (rows, counts);
    }

    // 1. Закрываем центральную часть (дно выреза)
    // Чтобы низ не был острым, закрываем сразу ~20-30% петель в одном ряду
    let center_close = (neck_width_stitches as f64 * 0.25).round() as i32;
    let center_close = center_close.max(1);

    rows.push(start_row);
    counts.push(center_close);

    let remaining_stitches = neck_width_stitches - center_close;
    if remaining_stitches <= 0 {
        return (rows, counts);
    }

    // 2. Распределяем остальные убавки по дуге
    let neck_end_row = start_row + neck_depth_rows;
    let available_rows = (neck_end_row - start_row).max(1);

    for i in 0..remaining_stitches {
        // progress от 0.0 до 1.0
        let progress = i as f64 / remaining_stitches as f64;

        // КВАДРАТИЧНАЯ ФУНКЦИЯ:
        // progress^2 создает параболу.
        // В начале (у центра) row_offset растет медленно -> дно круглое.
        // В конце (у плеч) row_offset растет быстро -> резкий подъем к плечу.
        let row_offset = available_rows as f64 * progress.powi(2);

        let row = start_row + row_offset.round() as i32;
        //дубликаты отметаем

        // Чтобы не вылететь за пределы изделия
        if row > total_rows {
            break;
        }

        if !rows.is_empty() && &row != rows.last().unwrap() {
            rows.push(row);
            counts.push(1);
        }
    }

    (rows, counts)
}
fn gen_sleeve_increases(total_increases: i32, sleeve_height_rows: i32) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();

    if total_increases <= 0 || sleeve_height_rows <= 0 {
        return (rows, counts);
    }

    // Интервал: всю высоту делим на количество прибавок
    // Минус 2-4 ряда в конце, чтобы не делать прибавку прямо в подмышке
    let available_height = (sleeve_height_rows - 4).max(1);
    let interval = available_height as f64 / total_increases as f64;

    for i in 0..total_increases {
        // Распределяем равномерно: 1-я прибавка через интервал, 2-я через 2 интервала и т.д.
        let row = ((i + 1) as f64 * interval).round() as i32;
        rows.push(row);
        counts.push(1);
    }

    (rows, counts)
}

fn regenerate_node_positions(calc: &mut RaglanCalculation, _m: &ProjectMeasurements) {
    let hem_y = calc.viewbox_height as f64 - 20.0;
    let underarm_y = calc.raglan_start_row_front as f64;
    let neck_y = 30.0;
    let bcx = (calc.viewbox_width * 3 / 4) as f64;
    let fcx = (calc.viewbox_width / 4) as f64;
    let neck_w = calc.neck_width_stitches as f64;
    let hem_w = calc.back_width_stitches as f64;
    let dec_st = calc.decrease_shoulder_cuts as f64;

    let mut update = |name: &str, part: &str, x: f64, y: f64| {
        if let Some(node) = calc
            .nodes
            .iter_mut()
            .find(|n| n.node_name == name && n.part_code == part)
        {
            if !node.was_manually_moved {
                node.x = x;
                node.y = y;
            }
        }
    };

    update("back_left_hem", "back", bcx - hem_w / 2.0, hem_y);
    update("back_right_hem", "back", bcx + hem_w / 2.0, hem_y);
    update("back_left_underarm", "back", bcx - hem_w / 2.0, underarm_y);
    update("back_right_underarm", "back", bcx + hem_w / 2.0, underarm_y);
    update(
        "back_left_shoulder",
        "back",
        bcx - hem_w / 2.0 + dec_st,
        underarm_y,
    );
    update(
        "back_right_shoulder",
        "back",
        bcx + hem_w / 2.0 - dec_st,
        underarm_y,
    );
    update("back_left_raglan", "back", bcx - neck_w / 2.0, neck_y);
    update("back_right_raglan", "back", bcx + neck_w / 2.0, neck_y);
    update(
        "back_neck_center",
        "back",
        bcx,
        neck_y + calc.neck_depth_rows as f64 * 0.25,
    );

    let shoulder_row = *calc
        .neck_decrease_rows
        .iter()
        .max()
        .unwrap_or(&calc.total_rows);
    let bottom_row = *calc
        .neck_decrease_rows
        .iter()
        .min()
        .unwrap_or(&calc.total_rows);
    let neck_y_shoulder = hem_y - shoulder_row as f64;
    let neck_y_bottom = hem_y - bottom_row as f64;

    update("front_left_hem", "front", fcx - hem_w / 2.0, hem_y);
    update("front_right_hem", "front", fcx + hem_w / 2.0, hem_y);
    update(
        "front_left_underarm",
        "front",
        fcx - hem_w / 2.0,
        underarm_y,
    );
    update(
        "front_right_underarm",
        "front",
        fcx + hem_w / 2.0,
        underarm_y,
    );
    update(
        "front_left_shoulder",
        "front",
        fcx - hem_w / 2.0 + dec_st,
        underarm_y,
    );
    update(
        "front_right_shoulder",
        "front",
        fcx + hem_w / 2.0 - dec_st,
        underarm_y,
    );
    update(
        "front_left_raglan",
        "front",
        fcx - neck_w / 2.0,
        neck_y_shoulder,
    );
    update(
        "front_right_raglan",
        "front",
        fcx + neck_w / 2.0,
        neck_y_shoulder,
    );
    update(
        "front_neck_left",
        "front",
        fcx - neck_w / 2.0,
        neck_y_shoulder,
    );
    update(
        "front_neck_right",
        "front",
        fcx + neck_w / 2.0,
        neck_y_shoulder,
    );
    update("front_neck_center", "front", fcx, neck_y_bottom);
}

pub fn recalculate_from_nodes(
    nodes: &[BlueprintNodePosition],
    measurements: &ProjectMeasurements,
) -> RaglanCalculation {
    let mut calc = calculate_raglan(measurements);
    regenerate_node_positions(&mut calc, measurements);
    for node in &mut calc.nodes {
        if let Some(moved) = nodes.iter().find(|n| {
            n.node_name == node.node_name && n.part_code == node.part_code && n.was_manually_moved
        }) {
            node.x = moved.x;
            node.y = moved.y;
            node.was_manually_moved = true;
        }
    }
    calc
}

#[command]
pub async fn get_patterns_for_project(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<PatternInfo>, String> {
    // 1. Get project file path from DB
    let project = sqlx::query("SELECT file_path FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch project: {}", e))?;

    let patterns_dir = match project {
        Some(row) => {
            let file_path: String = row.get("file_path");
            format!("{}/patterns", file_path)
        }
        None => return Ok(vec![]),
    };

    // 2. Read patterns directory
    let dir_path = Path::new(&patterns_dir);
    if !dir_path.exists() {
        return Ok(vec![]);
    }

    let entries =
        fs::read_dir(dir_path).map_err(|e| format!("Failed to read patterns dir: {}", e))?;

    let mut patterns = Vec::new();
    let mut file_idx: i64 = 1;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if !path.is_file() {
            continue;
        }
        if !file_name.ends_with(".swaga") && !file_name.ends_with(".txt") {
            continue;
        }

        // 3. Parse pattern file
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read pattern file: {}", e))?;

        let parsed = parse_pattern_file(&content, &file_name);
        if let Some(pattern) = parsed {
            patterns.push(PatternInfo {
                id: file_idx,
                name: pattern.name,
                pattern_type: "file".to_string(),
                width: pattern.width as i64,
                height: pattern.height as i64,
                pattern_data: pattern.data,
                category: pattern.category,
            });
            file_idx += 1;
        }
    }

    // 4. Also fetch global patterns from DB
    let db_patterns = sqlx::query_as::<_, PatternInfo>(
        "SELECT id, name, pattern_type, width, height, pattern_data, category FROM patterns WHERE is_global = 1"
    )
    .fetch_all(pool.inner())
    .await
    .unwrap_or_default();

    patterns.extend(db_patterns);

    Ok(patterns)
}

struct ParsedPattern {
    name: String,
    width: usize,
    height: usize,
    data: String,
    category: Option<String>,
}

fn parse_pattern_file(content: &str, file_name: &str) -> Option<ParsedPattern> {
    let lines: Vec<&str> = content
        .split('\n')
        .filter(|l| l.trim().is_empty() == false)
        .collect();

    let mut metadata: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut pattern_lines = Vec::new();
    let mut in_header = true;

    for line in &lines {
        if line.starts_with('#') {
            if in_header {
                if line.contains('=') {
                    let parts: Vec<&str> = line[1..].split('=').map(|s| s.trim()).collect();
                    if parts.len() == 2 {
                        metadata.insert(parts[0].to_string(), parts[1].to_string());
                    }
                }
                if line.contains("# end_header") || line.contains("#END_HEADER") {
                    in_header = false;
                }
            }
            continue;
        }
        in_header = false;
        pattern_lines.push(line);
    }

    if pattern_lines.is_empty() {
        return None;
    }

    let width = pattern_lines[0].len();
    let height = pattern_lines.len();
    let data: String = pattern_lines
        .iter()
        .map(|s| **s)
        .collect::<Vec<&str>>()
        .join("\n");

    let name = metadata
        .get("name")
        .cloned()
        .unwrap_or_else(|| file_name.replace(".swaga", "").replace(".txt", ""));
    let category = metadata.get("category").cloned();

    Some(ParsedPattern {
        name,
        width,
        height,
        data,
        category,
    })
}

#[command]
pub async fn get_blueprint_templates(
    garment_type_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<BlueprintTemplate>, String> {
    sqlx::query_as::<_, BlueprintTemplate>("SELECT * FROM blueprints WHERE garment_type_id = ?")
        .bind(garment_type_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch blueprint templates: {}", e))
}

#[command]
pub async fn get_blueprint_nodes(
    blueprint_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<BlueprintNode>, String> {
    sqlx::query_as::<_, BlueprintNode>(
        "SELECT * FROM blueprint_nodes WHERE blueprint_id = ? ORDER BY id",
    )
    .bind(blueprint_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch blueprint nodes: {}", e))
}

#[command]
pub async fn save_blueprint_measurement(
    req: SaveBlueprintMeasurementRequest,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<i64, String> {
    let unit = req.unit.unwrap_or_else(|| "cm".to_string());
    let result = sqlx::query(
        "INSERT INTO project_blueprint_measurements (project_id, measurement_code, value, unit, is_default, note)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT(project_id, measurement_code) DO UPDATE SET
             value = excluded.value, unit = excluded.unit, note = excluded.note, is_default = 0"
    )
    .bind(req.project_id)
    .bind(&req.measurement_code)
    .bind(req.value)
    .bind(&unit)
    .bind(&req.note)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save measurement: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[command]
pub async fn get_project_blueprint_measurements(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<BlueprintMeasurement>, String> {
    let rows = sqlx::query("SELECT * FROM project_blueprint_measurements WHERE project_id = ?")
        .bind(project_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch measurements: {}", e))?;

    Ok(rows.iter().map(|r| BlueprintMeasurement::from(r)).collect())
}

#[command]
pub async fn get_raglan_measurements(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<ProjectMeasurements, String> {
    get_raglan_measurements_internal(project_id, pool.inner()).await
}

async fn calculate_raglan_pattern_internal(
    project_id: i64,
    pool: &SqlitePool,
) -> Result<RaglanCalculation, String> {
    let measurements = get_raglan_measurements_internal(project_id, pool).await?;
    Ok(calculate_raglan(&measurements))
}

#[command]
pub async fn calculate_raglan_pattern(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<RaglanCalculation, String> {
    calculate_raglan_pattern_internal(project_id, pool.inner()).await
}

#[command]
pub async fn update_blueprint_node(
    project_id: i64,
    node_name: String,
    x: f64,
    y: f64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT calculation_log FROM calculations WHERE project_id = ?")
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Failed to fetch calculations: {}", e))?;

    // Parse existing JSON, ensure "nodes" array exists (calculation_log may contain garment progress JSON)
    let mut nodes_json: serde_json::Value = existing
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));

    // Ensure nodes array exists
    if nodes_json.get("nodes").and_then(|n| n.as_array()).is_none() {
        nodes_json["nodes"] = serde_json::json!([]);
    }

    let nodes = nodes_json["nodes"].as_array_mut().unwrap();

    let mut found = false;
    for node in nodes.iter_mut() {
        if node["node_name"] == node_name {
            node["x"] = serde_json::json!(x);
            node["y"] = serde_json::json!(y);
            found = true;
            break;
        }
    }

    if !found {
        nodes.push(serde_json::json!({
            "node_name": node_name,
            "x": x,
            "y": y
        }));
    }

    let log =
        serde_json::to_string(&nodes_json).map_err(|e| format!("Failed to serialize: {}", e))?;

    sqlx::query(
        "INSERT INTO calculations (project_id, calculation_log) VALUES (?, ?)
         ON CONFLICT(project_id) DO UPDATE SET calculation_log = excluded.calculation_log",
    )
    .bind(project_id)
    .bind(&log)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save node: {}", e))?;

    Ok(())
}

#[command]
pub async fn get_custom_blueprint_nodes(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<BlueprintNodePosition>, String> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT calculation_log FROM calculations WHERE project_id = ?")
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Failed to fetch calculations: {}", e))?;

    let nodes: Vec<BlueprintNodePosition> = existing
        .and_then(|s| serde_json::from_str(&s).ok())
        .and_then(|v: serde_json::Value| {
            v["nodes"].as_array().map(|arr| {
                arr.iter()
                    .filter_map(|n| {
                        Some(BlueprintNodePosition {
                            node_name: n["node_name"].as_str()?.to_string(),
                            x: n["x"].as_f64()?,
                            y: n["y"].as_f64()?,
                            part_code: n["part_code"].as_str().unwrap_or("front").to_string(),
                            was_manually_moved: true,
                        })
                    })
                    .collect()
            })
        })
        .unwrap_or_default();

    Ok(nodes)
}

#[command]
pub async fn save_blueprint_pattern_stamp(
    req: SaveBlueprintPatternStampRequest,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<BlueprintPatternStamp, String> {
    let pattern_data_str = req.pattern_data.clone().unwrap_or_default();

    let result = sqlx::query(
        "INSERT INTO blueprint_patterns (project_id, part_code, pattern_id, position_x, position_y, width, height, is_selected, z_order, pattern_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)"
    )
    .bind(req.project_id)
    .bind(&req.part_code)
    .bind(req.pattern_id)
    .bind(req.position_x)
    .bind(req.position_y)
    .bind(req.width)
    .bind(req.height)
    .bind(&pattern_data_str)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save pattern stamp: {}", e))?;

    let id = result.last_insert_rowid();

    // Return the full stamp with pattern_data
    let stamp =
        sqlx::query_as::<_, BlueprintPatternStamp>("SELECT * FROM blueprint_patterns WHERE id = ?")
            .bind(id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Failed to fetch saved stamp: {}", e))?
            .ok_or("Failed to retrieve saved stamp")?;

    Ok(stamp)
}

#[command]
pub async fn get_blueprint_pattern_stamps(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<BlueprintPatternStamp>, String> {
    sqlx::query_as::<_, BlueprintPatternStamp>(
        "SELECT * FROM blueprint_patterns WHERE project_id = ? ORDER BY z_order",
    )
    .bind(project_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch pattern stamps: {}", e))
}

#[command]
pub async fn delete_blueprint_pattern_stamp(
    stamp_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM blueprint_patterns WHERE id = ?")
        .bind(stamp_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete pattern stamp: {}", e))?;
    Ok(())
}

#[command]
pub async fn update_blueprint_pattern_stamp(
    stamp_id: i64,
    position_x: f64,
    position_y: f64,
    custom_color: Option<String>,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE blueprint_patterns SET position_x = ?, position_y = ?, custom_color = ? WHERE id = ?")
        .bind(position_x)
        .bind(position_y)
        .bind(custom_color.as_deref())
        .bind(stamp_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update pattern stamp: {}", e))?;
    Ok(())
}

#[command]
pub async fn save_blueprint_knitting_settings(
    settings: BlueprintKnittingSettings,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<i64, String> {
    let result = sqlx::query(
        "INSERT INTO blueprint_knitting_settings (project_id, boundary_mode, empty_row_mode, auto_calculate_nodes, needle_boundary_left, needle_boundary_right)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
             boundary_mode = excluded.boundary_mode,
             empty_row_mode = excluded.empty_row_mode,
             auto_calculate_nodes = excluded.auto_calculate_nodes,
             needle_boundary_left = excluded.needle_boundary_left,
             needle_boundary_right = excluded.needle_boundary_right"
    )
    .bind(settings.project_id)
    .bind(&settings.boundary_mode)
    .bind(&settings.empty_row_mode)
    .bind(settings.auto_calculate_nodes)
    .bind(settings.needle_boundary_left)
    .bind(settings.needle_boundary_right)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save knitting settings: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[command]
pub async fn clone_blueprint_pattern_stamp(
    stamp_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<BlueprintPatternStamp, String> {
    let row = sqlx::query("SELECT * FROM blueprint_patterns WHERE id = ?")
        .bind(stamp_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch stamp: {}", e))?
        .ok_or("Stamp not found")?;

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

    sqlx::query(
        "INSERT INTO blueprint_patterns (project_id, part_code, pattern_id, position_x, position_y, width, height, is_selected, z_order, pattern_data, custom_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)"
    )
    .bind(project_id)
    .bind(&part_code)
    .bind(pattern_id)
    .bind(position_x + 15.0)
    .bind(position_y + 15.0)
    .bind(width)
    .bind(height)
    .bind(z_order + 1)
    .bind(pattern_data.as_deref())
    .bind(custom_color.as_deref())
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to clone stamp: {}", e))?;

    // Return the new stamp
    let new_stamp = sqlx::query_as::<_, BlueprintPatternStamp>(
        "SELECT * FROM blueprint_patterns ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch cloned stamp: {}", e))?
    .ok_or("Failed to retrieve cloned stamp")?;

    Ok(new_stamp)
}

#[command]
pub async fn get_blueprint_knitting_settings(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Option<BlueprintKnittingSettings>, String> {
    let row = sqlx::query("SELECT * FROM blueprint_knitting_settings WHERE project_id = ?")
        .bind(project_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch knitting settings: {}", e))?;

    Ok(row.map(|r| BlueprintKnittingSettings {
        id: r.get("id"),
        project_id: r.get("project_id"),
        boundary_mode: r.get("boundary_mode"),
        empty_row_mode: r.get("empty_row_mode"),
        auto_calculate_nodes: r.get::<i64, _>("auto_calculate_nodes") != 0,
        needle_boundary_left: r.get("needle_boundary_left"),
        needle_boundary_right: r.get("needle_boundary_right"),
    }))
}

// #[command]
// pub async fn clone_blueprint_pattern_stamp(
//     stamp_id: i64,
//     pool: tauri::State<'_, SqlitePool>,
// ) -> Result<i64, String> {
//     let row = sqlx::query("SELECT * FROM blueprint_patterns WHERE id = ?")
//         .bind(stamp_id)
//         .fetch_optional(pool.inner())
//         .await
//         .map_err(|e| format!("Failed to fetch stamp: {}", e))?
//         .ok_or("Stamp not found")?;

//     let project_id: i64 = row.get("project_id");
//     let part_code: String = row.get("part_code");
//     let pattern_id: i64 = row.get("pattern_id");
//     let position_x: f64 = row.get("position_x");
//     let position_y: f64 = row.get("position_y");
//     let width: i32 = row.get("width");
//     let height: i32 = row.get("height");
//     let z_order: i32 = row.get("z_order");

//     let result = sqlx::query(
//         "INSERT INTO blueprint_patterns (project_id, part_code, pattern_id, position_x, position_y, width, height, is_selected, z_order)
//          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)"
//     )
//     .bind(project_id)
//     .bind(&part_code)
//     .bind(pattern_id)
//     .bind(position_x + 10.0)
//     .bind(position_y + 10.0)
//     .bind(width)
//     .bind(height)
//     .bind(z_order + 1)
//     .execute(pool.inner())
//     .await
//     .map_err(|e| format!("Failed to clone stamp: {}", e))?;

//     Ok(result.last_insert_rowid())
// }

// #[command]
// pub async fn get_blueprint_svg(
//     project_id: i64,
//     part_code: String,
//     pool: tauri::State<'_, SqlitePool>,
// ) -> Result<String, String> {
//     let calc = calculate_raglan_pattern_internal(project_id, pool.inner()).await?;

//     let garment_type_id: i64 =
//         sqlx::query_scalar("SELECT garment_type_id FROM projects WHERE id = ?")
//             .bind(project_id)
//             .fetch_optional(pool.inner())
//             .await
//             .map_err(|e| format!("Failed to get garment type: {}", e))?
//             .unwrap_or(15);

//     let template: Option<String> = sqlx::query_scalar(
//         "SELECT svg_template FROM blueprints WHERE garment_type_id = ? AND part_code = ?",
//     )
//     .bind(garment_type_id)
//     .bind(&part_code)
//     .fetch_optional(pool.inner())
//     .await
//     .map_err(|e| format!("Failed to fetch template: {}", e))?;

//     let svg = template.unwrap_or_default();

//     let svg = svg
//         .replace("{viewbox_width}", &calc.viewbox_width.to_string())
//         .replace("{viewbox_height}", &calc.viewbox_height.to_string())
//         .replace(
//             "{back_width_stitches}",
//             &calc.back_width_stitches.to_string(),
//         )
//         .replace("{back_height_rows}", &calc.total_rows.to_string())
//         .replace(
//             "{front_width_stitches}",
//             &calc.front_width_stitches.to_string(),
//         )
//         .replace("{front_height_rows}", &calc.total_rows.to_string());

//     let mut result = svg;
//     for node in &calc.nodes {
//         if node.part_code == part_code || part_code == "all" {
//             // Replace {node_name_x} with X value
//             let key_x = format!("{}_x", node.node_name);
//             result = result.replace(&format!("{{{}}}", key_x), &format!("{:.1}", node.x));
//             // Replace {node_name_y} with Y value
//             let key_y = format!("{}_y", node.node_name);
//             result = result.replace(&format!("{{{}}}", key_y), &format!("{:.1}", node.y));
//         }
//     }

//     Ok(result)
// }

// ===== ROW-BY-ROW GARMENT INSTRUCTIONS =====

#[derive(Debug, Serialize, Deserialize)]
pub struct GarmentRowInfo {
    pub row: i32,
    pub part_code: String, // "front", "back", "sleeve_left", "sleeve_right"
    pub stitches: i32,     // how many needles active this row
    pub action: Option<String>, // "decrease", "increase", "neck_close", "pattern_start", "pattern_change", null
    pub action_detail: Option<String>, // e.g. "убавить 1 п. справа", "закрыть 5 п. центр", "начало узора 'цветы'"
    pub is_pattern_row: bool,          // is this row part of a pattern stamp
    pub pattern_id: Option<i64>,       // which pattern is active this row
    pub pattern_name: Option<String>,
    // For raglan: which side has decreases
    pub decrease_left: bool,
    pub decrease_right: bool,
    pub decrease_count: i32, // how many stitches to decrease total this row
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GarmentRowRange {
    pub start_row: i32,
    pub end_row: i32,
    pub part_code: String,
}

/// Получить построчные инструкции для всего изделия (все детали)
#[command]
pub async fn get_garment_row_instructions(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<GarmentRowInfo>, String> {
    let calc = calculate_raglan_pattern_internal(project_id, pool.inner()).await?;
    let stamps = sqlx::query(
        "SELECT bp.*, p.name as pattern_name FROM blueprint_patterns bp LEFT JOIN patterns p ON bp.pattern_id = p.id WHERE bp.project_id = ?"
    ).bind(project_id).fetch_all(pool.inner()).await.map_err(|e| format!("{}", e))?;

    let mut rows: Vec<GarmentRowInfo> = Vec::new();
    let max_h = calc.total_rows.max(calc.sleeve_height_rows);

    let has_pattern_at = |row: i32, part: &str| -> (bool, Option<i64>, Option<String>) {
        let svg_y = max_h - row;
        for s in &stamps {
            let sp: String = s.get("part_code");
            if sp != part {
                continue;
            }
            let py: f64 = s.get("position_y");
            let h: i32 = s.get("height");
            if (svg_y as f64) >= py && (svg_y as f64) < py + h as f64 {
                return (true, Some(s.get("pattern_id")), Some(s.get("pattern_name")));
            }
        }
        (false, None, None)
    };

    // BACK
    for row in 0..calc.total_rows {
        let mut action: Option<String> = None;
        let mut detail: Option<String> = None;
        let mut dl = false;
        let mut dr = false;
        let mut dc = 0;
        if let Some(i) = calc.back_decrease_rows.iter().position(|&r| r == row) {
            dl = true;
            dr = true;
            dc = calc.back_decrease_counts[i] as i32;
            action = Some("decrease".into());
            detail = Some(format!("убавить {} п. реглан", dc));
        }
        let (ip, pid, pn) = has_pattern_at(row, "back");
        rows.push(GarmentRowInfo {
            row: row + 1,
            part_code: "back".into(),
            stitches: calc.back_width_stitches,
            action,
            action_detail: detail,
            is_pattern_row: ip,
            pattern_id: pid,
            pattern_name: pn,
            decrease_left: dl,
            decrease_right: dr,
            decrease_count: dc,
        });
    }

    // FRONT
    for row in 0..calc.total_rows {
        let mut action: Option<String> = None;
        let mut detail: Option<String> = None;
        let mut dl = false;
        let mut dr = false;
        let mut dc = 0;
        if let Some(i) = calc.front_decrease_rows.iter().position(|&r| r == row) {
            dl = true;
            dr = true;
            dc = calc.front_decrease_counts[i] as i32;
            action = Some("decrease".into());
            detail = Some(format!("убавить {} п. реглан", dc));
        }
        if let Some(i) = calc.neck_decrease_rows.iter().position(|&r| r == row) {
            let nc = calc.neck_decrease_counts[i];
            action = Some("neck".into());
            detail = Some(format!("убавить {} п. горловина", nc));
        }
        let (ip, pid, pn) = has_pattern_at(row, "front");
        rows.push(GarmentRowInfo {
            row: row + 1,
            part_code: "front".into(),
            stitches: calc.front_width_stitches,
            action,
            action_detail: detail,
            is_pattern_row: ip,
            pattern_id: pid,
            pattern_name: pn,
            decrease_left: dl,
            decrease_right: dr,
            decrease_count: dc,
        });
    }

    // SLEEVE
    for row in 0..calc.sleeve_height_rows {
        let mut action: Option<String> = None;
        let mut detail: Option<String> = None;
        let mut dl = false;
        let mut dr = false;
        let mut dc = 0;
        if calc.sleeve_increase_rows.contains(&row) {
            action = Some("increase".into());
            detail = Some("прибавить по 1 п.".into());
        }
        let (ip, pid, pn) = has_pattern_at(row, "sleeve");
        rows.push(GarmentRowInfo {
            row: row + 1,
            part_code: "sleeve".into(),
            stitches: calc.sleeve_top_stitches,
            action,
            action_detail: detail,
            is_pattern_row: ip,
            pattern_id: pid,
            pattern_name: pn,
            decrease_left: dl,
            decrease_right: dr,
            decrease_count: dc,
        });
    }

    rows.sort_by_key(|r| (r.part_code.clone(), r.row));
    Ok(rows)
}

#[command]
pub async fn get_garment_row_info(
    project_id: i64,
    row: i32,
    part_code: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Option<GarmentRowInfo>, String> {
    let all_rows = get_garment_row_instructions(project_id, pool).await?;
    Ok(all_rows
        .into_iter()
        .find(|r| r.row == row && r.part_code == part_code))
}

/// Получить диапазон рядов для детали
#[command]
pub async fn get_garment_part_row_range(
    project_id: i64,
    part_code: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<GarmentRowRange, String> {
    let calc = calculate_raglan_pattern_internal(project_id, pool.inner()).await?;

    let end_row = match part_code.as_str() {
        "back" => calc.total_rows,
        "front" => calc.total_rows,
        "sleeve" => calc.sleeve_height_rows,
        _ => calc.total_rows,
    };

    Ok(GarmentRowRange {
        start_row: 1,
        end_row,
        part_code,
    })
}

/// Сохранить текущий прогресс вязания изделия
#[command]
pub async fn save_garment_progress(
    project_id: i64,
    current_row: i32,
    part_code: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    let progress_json = serde_json::json!({
        "current_row": current_row,
        "part_code": part_code,
        "timestamp": chrono::Local::now().to_rfc3339()
    });

    sqlx::query(
        "INSERT INTO calculations (project_id, calculation_log) VALUES (?, ?)
         ON CONFLICT(project_id) DO UPDATE SET calculation_log = excluded.calculation_log",
    )
    .bind(project_id)
    .bind(&progress_json.to_string())
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save garment progress: {}", e))?;

    Ok(())
}

/// Загрузить прогресс вязания изделия
#[command]
pub async fn load_garment_progress(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Option<serde_json::Value>, String> {
    let log: Option<String> =
        sqlx::query_scalar("SELECT calculation_log FROM calculations WHERE project_id = ?")
            .bind(project_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Failed to load garment progress: {}", e))?;

    Ok(log.and_then(|s| serde_json::from_str(&s).ok()))
}

/// Recalculate garment from manually moved nodes (reverse: nodes → stitches)
#[command]
pub async fn recalculate_blueprint_from_nodes(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<RaglanCalculation, String> {
    // 1. Load measurements
    let measurements = get_raglan_measurements_internal(project_id, pool.inner()).await?;
    let pool_clone = pool.clone();
    // 2. Load manually moved nodes
    let custom_nodes = get_custom_blueprint_nodes(project_id, pool).await?;

    // 3. If there are manual nodes, recalculate from them
    if custom_nodes.iter().any(|n| n.was_manually_moved) {
        let result = recalculate_from_nodes(&custom_nodes, &measurements);

        // Save the merged result back
        let nodes_json = serde_json::json!({ "nodes": &result.nodes });
        let log =
            serde_json::to_string(&nodes_json).map_err(|e| format!("Serialize failed: {}", e))?;

        sqlx::query(
            "INSERT INTO calculations (project_id, calculation_log) VALUES (?, ?)
             ON CONFLICT(project_id) DO UPDATE SET calculation_log = excluded.calculation_log",
        )
        .bind(project_id)
        .bind(&log)
        .execute(pool_clone.inner())
        .await
        .map_err(|e| format!("Failed to save recalculated nodes: {}", e))?;

        Ok(result)
    } else {
        // No manual nodes — just return standard calculation
        calculate_raglan_pattern_internal(project_id, &pool_clone.inner()).await
    }
}

// ===== НОВЫЕ КОМАНДЫ С ПОДДЕРЖКОЙ ООП =====

/// Получить тип рукава проекта
#[command]
pub async fn get_project_sleeve_type(
    project_id: i64,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<String, String> {
    let sleeve_type: Option<String> = sqlx::query_scalar(
        "SELECT sleeve_type FROM projects WHERE id = ?"
    )
    .bind(project_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch sleeve type: {}", e))?;
    
    Ok(sleeve_type.unwrap_or_else(|| "raglan".to_string()))
}

/// Сохранить тип рукава проекта
#[command]
pub async fn save_project_sleeve_type(
    project_id: i64,
    sleeve_type: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE projects SET sleeve_type = ? WHERE id = ?"
    )
    .bind(&sleeve_type)
    .bind(project_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save sleeve type: {}", e))?;
    Ok(())
}

/// Конвертировать Vec<DecreaseGroup> → (rows, counts) для фронтенда
fn decrease_groups_to_rows(groups: &[DecreaseGroup]) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();
    let mut current_row = 0;
    
    for group in groups {
        for _ in 0..group.repeat_count {
            current_row += group.every_n_rows;
            rows.push(current_row);
            counts.push(group.stitches);
        }
    }
    
    (rows, counts)
}

/// Unified calculate command — поддерживает и raglan, и set_in
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
        BlueprintCalculation::Raglan(r) => {
            Ok(serde_json::json!({
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
            }))
        }
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
            }))
        }
    }
}
