// Подол — общая часть для всех видов рукавов
// Одинаковая ширина для переда и спинки

use super::super::types::*;

pub struct HemPart {
    pub width_stitches: i32,
    pub is_back: bool,
}

impl HemPart {
    pub fn new(m: &ProjectMeasurements, is_back: bool) -> Self {
        let p = m.gauge_stitches_per_cm;
        let half_chest = (m.og / 2.0) + m.ease;
        let width = (half_chest * p).round() as i32;
        Self { width_stitches: width, is_back }
    }
    
    /// Get Y position of hem in SVG
    pub fn hem_y(viewbox_height: i32) -> f64 {
        viewbox_height as f64 - 20.0
    }
    
    /// Generate left and right hem nodes
    pub fn nodes(
        &self,
        cx: f64,
        hem_y: f64,
        part_code: &str,
    ) -> Vec<BlueprintNodePosition> {
        let half_w = self.width_stitches as f64 / 2.0;
        vec![
            BlueprintNodePosition {
                node_name: if self.is_back { "back_left_hem".into() } else { "front_left_hem".into() },
                x: cx - half_w,
                y: hem_y,
                part_code: part_code.into(),
            },
            BlueprintNodePosition {
                node_name: if self.is_back { "back_right_hem".into() } else { "front_right_hem".into() },
                x: cx + half_w,
                y: hem_y,
                part_code: part_code.into(),
            },
        ]
    }
}
