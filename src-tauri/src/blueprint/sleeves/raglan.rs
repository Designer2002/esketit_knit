// Реглан — скат рукава от горловины

use super::super::types::*;
use super::super::traits::*;

pub struct RaglanSleeve;

impl SleeveType for RaglanSleeve {
    fn sleeve_type_id(&self) -> &str {
        "raglan"
    }
    
    fn calculate_sleeve(
        &self,
        m: &ProjectMeasurements,
        dec_shoulder_st: i32,
    ) -> SleeveDimensions {
        let p = m.gauge_stitches_per_cm;
        let r = m.gauge_rows_per_cm;
        
        let sleeve_width = ((m.or_val + m.ease) * p).round() as i32;
        let start_raglan = sleeve_width - dec_shoulder_st * 2;
        let sleeve_cap = ((m.oh / 6.0) * p).round() as i32;
        let sleeve_length = (m.dr * r).round() as i32;
        let sleeve_cut = sleeve_length - (m.dr * r - dec_shoulder_st as f64 * r).round() as i32;
        let cuff = ((m.oz * p).round() as i32).max(10);
        
        let total_inc = (start_raglan - cuff).max(0) / 2;
        let inc_rows = gen_sleeve_increases(total_inc, sleeve_length);
        
        let cap_offset = if total_inc > 0 { (total_inc as f64 * 0.3).min(sleeve_cap as f64 * 0.15) } else { 0.0 };
        let slope_start = sleeve_center_x() - sleeve_cap as f64 / 2.0;
        let slope_end = sleeve_center_x() - cuff as f64 / 2.0;
        
        SleeveDimensions {
            cuff_stitches: cuff,
            top_stitches: sleeve_cap,
            height_rows: sleeve_length,
            shoulder_cut_rows: sleeve_cut,
            increase_rows: inc_rows,
            cap_offset,
            slope_start_x: slope_start,
            slope_end_x: slope_end,
        }
    }
    
    fn generate_left_nodes(
        &self,
        _m: &ProjectMeasurements,
        calc: &RaglanCalculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        let padding = 40.0;
        let cuff_y = dims.height_rows as f64 + padding;
        let cut_y = dims.shoulder_cut_rows as f64 + padding;
        let base_y = padding;
        let slope_drop = dims.cap_offset.max(6.0);
        
        let half_cuff = dims.cuff_stitches as f64 / 2.0;
        let half_top = dims.top_stitches as f64 / 2.0;
        let half_cut = calc.decrease_shoulder_cuts as f64 / 2.0;
        
        vec![
            BlueprintNodePosition { node_name: "sleeve_cuff_left".into(), x: cx - half_cuff, y: cuff_y, part_code: "sleeve_left".into(), was_manually_moved: false },
            BlueprintNodePosition { node_name: "sleeve_cuff_right".into(), x: cx + half_cuff, y: cuff_y, part_code: "sleeve_left".into(), was_manually_moved: false },
            BlueprintNodePosition { node_name: "sleeve_underarm_left".into(), x: cx - half_cut, y: cut_y, part_code: "sleeve_left".into(), was_manually_moved: false },
            BlueprintNodePosition { node_name: "sleeve_underarm_right".into(), x: cx + half_cut, y: cut_y, part_code: "sleeve_left".into(), was_manually_moved: false },
            BlueprintNodePosition { node_name: "sleeve_top_left".into(), x: cx - half_top, y: base_y, part_code: "sleeve_left".into(), was_manually_moved: false },
            BlueprintNodePosition { node_name: "sleeve_top_right".into(), x: cx + half_top, y: base_y + slope_drop, part_code: "sleeve_left".into(), was_manually_moved: false },
        ]
    }
    
    fn generate_right_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &RaglanCalculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        let nodes = self.generate_left_nodes(m, calc, dims, cx);
        // Mirror X for right sleeve
        nodes.into_iter().map(|n| BlueprintNodePosition {
            node_name: n.node_name.replace("sleeve_left", "sleeve_right"),
            part_code: "sleeve_right".into(),
            ..n
        }).collect()
    }
    
    fn front_decrease_rows(&self, calc: &RaglanCalculation) -> Vec<i32> {
        calc.sleeve_raglan_rows_front.clone()
    }
    
    fn back_decrease_rows(&self, calc: &RaglanCalculation) -> Vec<i32> {
        calc.sleeve_raglan_rows_back.clone()
    }
}

fn sleeve_center_x() -> f64 { 200.0 }

fn gen_sleeve_increases(total: i32, height: i32) -> Vec<i32> {
    let mut rows = Vec::new();
    if total <= 0 || height <= 0 { return rows; }
    let interval = ((height as f64 / total as f64) * 0.7).round().max(4.0) as i32;
    for i in 0..total {
        rows.push(((i + 1) * interval).min(height - 2));
    }
    rows
}
