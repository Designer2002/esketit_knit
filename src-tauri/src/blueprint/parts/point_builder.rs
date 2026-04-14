// Функции построения точек для втачного рукава
// Следуют паттерну из черновика techno_draft

use crate::blueprint::{BlueprintNodePosition, DecreaseGroup};


/// Строит точки для убавок/прибавок от начальной точки
/// start_x, start_y — начальная точка
/// going_right — true: x растёт (правая сторона), false: x уменьшается (левая)
/// direction_up — true: y уменьшается (вверх), false: y растёт (вниз)
pub fn build_decrease_pts(
    start_x: f64,
    start_y: f64,
    decreases: &[DecreaseGroup],
    sx: f64,
    sy: f64,
    going_right: bool,
    direction_up: bool,
) -> Vec<(f64, f64)> {
    let mut pts = Vec::new();
    let mut cx = start_x;
    let mut cy = start_y;
    
    for dg in decreases {
        for _ in 0..dg.repeat_count {
            let dx = dg.stitches as f64 * sx;
            let dy = dg.every_n_rows as f64 * sy;
            
            if going_right {
                cx += dx;
            } else {
                cx -= dx;
            }
            
            if direction_up {
                cy -= dy;
            } else {
                cy += dy;
            }
            
            pts.push((cx, cy));
        }
    }
    
    pts
}

/// Строит точки горловины от плеча к центру
/// rem_rows — остаток рядов (прямой участок перед убавками)
pub fn build_neck_pts(
    start_x: f64,
    start_y: f64,
    decreases: &[DecreaseGroup],
    rem_rows: i32,
    sx: f64,
    sy: f64,
    going_right: bool,
) -> Vec<(f64, f64)> {
    let mut pts = Vec::new();
    let mut cx = start_x;
    let mut cy = start_y;
    
    // Сначала прямой участок (rem_rows)
    cy += rem_rows as f64 * sy;
    pts.push((cx, cy));
    
    // Потом убавки горловины (в обратном порядке - от центра к плечу)
    for dg in decreases.iter().rev() {
        for _ in 0..dg.repeat_count {
            let dx = dg.stitches as f64 * sx;
            let dy = dg.every_n_rows as f64 * sy;
            
            if going_right {
                cx -= dx;
            } else {
                cx += dx;
            }
            cy += dy; // горловина идёт вниз от центра к плечу
            
            pts.push((cx, cy));
        }
    }
    
    pts
}

/// Строит точки скоса плеча
pub fn build_shoulder_pts(
    start_x: f64,
    start_y: f64,
    decreases: &[DecreaseGroup],
    sx: f64,
    sy: f64,
    going_right: bool,
) -> Vec<(f64, f64)> {
    let mut pts = Vec::new();
    let mut cx = start_x;
    let mut cy = start_y;
    
    for dg in decreases {
        for _ in 0..dg.repeat_count {
            let dx = dg.stitches as f64 * sx;
            let dy = dg.every_n_rows as f64 * sy;
            
            if going_right {
                cx += dx;
            } else {
                cx -= dx;
            }
            cy -= dy; // плечо идёт вверх
            
            pts.push((cx, cy));
        }
    }
    
    pts
}

/// Конвертирует точки в узлы для BlueprintCalculation
pub fn pts_to_nodes(
    pts: &[(f64, f64)],
    prefix: &str,
    part_code: &str,
    start_idx: usize,
) -> Vec<BlueprintNodePosition> {
    pts.iter()
        .enumerate()
        .map(|(i, (x, y))| BlueprintNodePosition {
            node_name: format!("{}_{}", prefix, start_idx + i),
            x: *x,
            y: *y,
            part_code: part_code.to_string(),
            was_manually_moved: false,
        })
        .collect()
}
