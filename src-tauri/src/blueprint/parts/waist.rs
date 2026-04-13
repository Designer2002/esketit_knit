// Талия — приталивание (пока заглушка, будет расширена)

use super::super::types::*;

pub struct WaistPart {
    pub row_from_hem: i32,
    pub decrease_per_side: i32,
}

impl WaistPart {
    pub fn new(m: &ProjectMeasurements, r: f64) -> Self {
        // Default: waist at ~60% of garment length from hem
        let hem_rows = ((m.og / 2.0 + m.ease) * r).round() as i32;
        Self {
            row_from_hem: (hem_rows as f64 * 0.6).round() as i32,
            decrease_per_side: 2, // default 2 stitches each side
        }
    }
    
    /// Width at waist level
    pub fn width_at_waist(&self, hem_width: i32) -> i32 {
        hem_width - self.decrease_per_side * 2
    }
}
