// Горловина — зависит от типа выреза (U/V) и обхвата головы

use super::super::types::*;

pub struct NecklinePart {
    pub width_stitches: i32,
    pub depth_rows: i32,
    pub decrease_rows: Vec<i32>,
    pub decrease_counts: Vec<i32>,
}

impl NecklinePart {
    pub fn new_u_shaped(m: &ProjectMeasurements, r: f64, p: f64, neck_st_front: i32) -> Self {
        let depth = (m.glg * r).round() as i32;
        let (rows, counts) = gen_u_neckline_decreases(neck_st_front, depth);
        Self {
            width_stitches: neck_st_front,
            depth_rows: depth,
            decrease_rows: rows,
            decrease_counts: counts,
        }
    }
    
    pub fn new_v_shaped(m: &ProjectMeasurements, r: f64, p: f64, neck_st_front: i32) -> Self {
        let depth = (m.glg * r).round() as i32;
        let (rows, counts) = gen_v_neckline_decreases(neck_st_front, depth);
        Self {
            width_stitches: neck_st_front,
            depth_rows: depth,
            decrease_rows: rows,
            decrease_counts: counts,
        }
    }
    
    /// Generate neckline nodes for front
    pub fn front_nodes(
        &self,
        cx: f64,
        hem_y: f64,
        total_rows: i32,
    ) -> Vec<BlueprintNodePosition> {
        let half_w = self.width_stitches as f64 / 2.0;
        let neck_y_shoulder = hem_y - (total_rows - self.depth_rows) as f64;
        vec![
            BlueprintNodePosition {
                node_name: "front_neck_left".into(),
                x: cx - half_w,
                y: neck_y_shoulder,
                part_code: "front".into(),
            },
            BlueprintNodePosition {
                node_name: "front_neck_right".into(),
                x: cx + half_w,
                y: neck_y_shoulder,
                part_code: "front".into(),
            },
            BlueprintNodePosition {
                node_name: "front_neck_center".into(),
                x: cx,
                y: hem_y - (total_rows) as f64,
                part_code: "front".into(),
            },
        ]
    }
}

fn gen_u_neckline_decreases(neck_w: i32, neck_depth: i32) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();
    if neck_w <= 0 || neck_depth <= 1 { return (rows, counts); }
    
    let center_close = (neck_w as f64 * 0.25).round() as i32;
    let center_close = center_close.max(1);
    rows.push(0);
    counts.push(center_close);
    
    let remaining = neck_w - center_close;
    if remaining <= 0 { return (rows, counts); }
    
    let avail = neck_depth.max(1);
    for i in 0..remaining {
        let progress = i as f64 / remaining as f64;
        let row_offset = avail as f64 * progress.powi(2);
        let row = row_offset.round() as i32;
        if row > neck_depth { break; }
        rows.push(row);
        counts.push(1);
    }
    (rows, counts)
}

fn gen_v_neckline_decreases(neck_w: i32, neck_depth: i32) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();
    if neck_w <= 0 || neck_depth <= 1 { return (rows, counts); }
    
    // V-neck: linear decreases from center
    let per_side = (neck_w / 2).max(1);
    let interval = (neck_depth as f64 / per_side as f64).round().max(1.0) as i32;
    
    for i in 0..per_side {
        let row = ((i + 1) * interval).min(neck_depth);
        rows.push(row);
        counts.push(1);
    }
    (rows, counts)
}
