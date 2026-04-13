// Пройма — место соединения рукава с телом
// Зависит от типа рукава (реглан/втачной)

use super::super::types::*;

pub struct ArmholePart {
    pub row_start: i32,       // ряд начала проймы (от подола)
    pub shoulder_cut: i32,    // ширина подреза в петлях
}

impl ArmholePart {
    pub fn new_raglan(m: &ProjectMeasurements, r: f64) -> Self {
        let half_chest = (m.og / 2.0) + m.ease;
        let raglan_line = (half_chest / 3.0) + 7.0;
        let raglan_rows = (raglan_line * r).round() as i32;
        let hem_rows = (half_chest * r).round() as i32;
        let row_start = hem_rows - raglan_rows;
        
        let mut shoulder_cuts = 2.0;
        if m.og > 100.0 && m.og <= 120.0 { shoulder_cuts += 0.5; }
        if m.og > 120.0 { shoulder_cuts += 1.0; }
        let p = m.gauge_stitches_per_cm;
        
        Self {
            row_start,
            shoulder_cut: (shoulder_cuts * p).round() as i32,
        }
    }
    
    /// Generate underarm and shoulder nodes
    pub fn nodes(
        &self,
        cx: f64,
        hem_y: f64,
        total_rows: i32,
        hem_width: i32,
        part_code: &str,
    ) -> Vec<BlueprintNodePosition> {
        let half_w = hem_width as f64 / 2.0;
        let underarm_y = hem_y - (total_rows - self.row_start) as f64;
        let cut = self.shoulder_cut as f64;
        
        let is_back = part_code == "back";
        vec![
            BlueprintNodePosition {
                node_name: if is_back { "back_left_underarm".into() } else { "front_left_underarm".into() },
                x: cx - half_w,
                y: underarm_y,
                part_code: part_code.into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: if is_back { "back_right_underarm".into() } else { "front_right_underarm".into() },
                x: cx + half_w,
                y: underarm_y,
                part_code: part_code.into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: if is_back { "back_left_shoulder".into() } else { "front_left_shoulder".into() },
                x: cx - half_w + cut,
                y: underarm_y,
                part_code: part_code.into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: if is_back { "back_right_shoulder".into() } else { "front_right_shoulder".into() },
                x: cx + half_w - cut,
                y: underarm_y,
                part_code: part_code.into(),
                was_manually_moved: false,
            },
        ]
    }
}
