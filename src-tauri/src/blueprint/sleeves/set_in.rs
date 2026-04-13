// Втачной рукав — ТОЧНЫЕ формулы технолога

use crate::blueprint::calculate_neckline_decreases;
use crate::blueprint::calculate_proyma_decreases;
use crate::blueprint::calculate_shoulder_decreases;
use crate::blueprint::calculate_sleeve_cap_decreases;

use super::super::types::*;
use super::super::traits::*;
use std::sync::Mutex;

pub struct SetInSleeve {
    armhole_decreases_cache: Mutex<Vec<DecreaseGroup>>,
    sleeve_cap_decreases_cache: Mutex<Vec<DecreaseGroup>>,
    shoulder_decreases_cache: Mutex<Vec<DecreaseGroup>>,
    neck_back_cache: Mutex<Vec<DecreaseGroup>>,
    neck_front_cache: Mutex<Vec<DecreaseGroup>>,
    rem_back_cache: Mutex<i32>,
    rem_front_cache: Mutex<i32>,
    proyma_info_cache: Mutex<(i32, i32, i32, i32)>,
}

impl SetInSleeve {
    pub fn new() -> Self {
        Self {
            armhole_decreases_cache: Mutex::new(vec![]),
            sleeve_cap_decreases_cache: Mutex::new(vec![]),
            shoulder_decreases_cache: Mutex::new(vec![]),
            neck_back_cache: Mutex::new(vec![]),
            neck_front_cache: Mutex::new(vec![]),
            rem_back_cache: Mutex::new(0),
            rem_front_cache: Mutex::new(0),
            proyma_info_cache: Mutex::new((0, 0, 0, 0)),
        }
    }
}

impl SleeveType for SetInSleeve {
    fn sleeve_type_id(&self) -> &str { "set_in" }

    fn calculate_sleeve(
        &self,
        m: &ProjectMeasurements,
        _dec_shoulder_st: i32,
    ) -> SleeveDimensions {
        let p = m.gauge_stitches_per_cm;
        let r = m.gauge_rows_per_cm;

        let chest = m.og as i32;
        let wrist = m.oz as i32;
        let arm = m.or_val as i32;
        let ease = m.ease;

        let widest_sleeve_cm = chest / 2 / 3 + 2;
        let sleeve_cap_height_cm = chest / 2 / 4 + 3;
        let proyma_height_cm = chest / 2 / 3 + 5;
        let hem_width_half_cm = chest / 2 / 2 + 2;
        let after_proyma_cm = chest / 2 / 3 + 3;
        let proyma_width_cm = hem_width_half_cm - after_proyma_cm;

        let sleeve_widest_st = (widest_sleeve_cm as f64 * p).round() as i32;
        let sleeve_cap_height_rows = (sleeve_cap_height_cm as f64 * r).round() as i32;
        let proyma_width_st = (proyma_width_cm as f64 * p).round() as i32;

        let armhole_decreases = calculate_proyma_decreases(proyma_width_st);
        let sleeve_cap_decreases = calculate_sleeve_cap_decreases(sleeve_widest_st, sleeve_cap_height_rows);
        let cuff_st = (wrist as f64 + ease * p).round() as i32;
        let sleeve_body_rows = ((m.dr - sleeve_cap_height_cm as f64) * r).round() as i32;

        let shoulder_slope_height = m.shoulder_height;
        let shoulder_len_st = (m.shoulder_length as f64 * p).round() as i32;
        let shoulder_decreases = calculate_shoulder_decreases(shoulder_slope_height, shoulder_len_st as f64);

        let (neck_back, rem_back) = calculate_neckline_decreases(
            (m.oh / 2.0 / 2.0 * p).round() as i32,
            (m.glg / 2.0 * r).round() as i32,
        );
        let (neck_front, rem_front) = calculate_neckline_decreases(
            (m.oh / 2.0 / 2.0 * p).round() as i32,
            (m.glg * r).round() as i32,
        );

        // Кэшируем результаты
        *self.armhole_decreases_cache.lock().unwrap() = armhole_decreases;
        *self.sleeve_cap_decreases_cache.lock().unwrap() = sleeve_cap_decreases;
        *self.shoulder_decreases_cache.lock().unwrap() = shoulder_decreases;
        *self.neck_back_cache.lock().unwrap() = neck_back;
        *self.neck_front_cache.lock().unwrap() = neck_front;
        *self.rem_back_cache.lock().unwrap() = rem_back;
        *self.rem_front_cache.lock().unwrap() = rem_front;
        *self.proyma_info_cache.lock().unwrap() = (
            sleeve_cap_height_rows, proyma_height_cm,
            hem_width_half_cm, after_proyma_cm,
        );

        SleeveDimensions {
            cuff_stitches: cuff_st,
            top_stitches: sleeve_widest_st,
            height_rows: sleeve_body_rows + sleeve_cap_height_rows,
            shoulder_cut_rows: (proyma_height_cm as f64 * r).round() as i32,
            increase_rows: vec![],
            cap_offset: 10.0,
            slope_start_x: 150.0,
            slope_end_x: 100.0,
        }
    }

    fn armhole_decreases(&self) -> Vec<DecreaseGroup> {
        self.armhole_decreases_cache.lock().unwrap().clone()
    }

    fn sleeve_cap_decreases(&self) -> Vec<DecreaseGroup> {
        self.sleeve_cap_decreases_cache.lock().unwrap().clone()
    }

    fn shoulder_decreases(&self) -> Vec<DecreaseGroup> {
        self.shoulder_decreases_cache.lock().unwrap().clone()
    }

    fn neck_decreases_back(&self, _m: &ProjectMeasurements) -> (Vec<DecreaseGroup>, i32) {
        (self.neck_back_cache.lock().unwrap().clone(), *self.rem_back_cache.lock().unwrap())
    }

    fn neck_decreases_front(&self, _m: &ProjectMeasurements) -> (Vec<DecreaseGroup>, i32) {
        (self.neck_front_cache.lock().unwrap().clone(), *self.rem_front_cache.lock().unwrap())
    }

    fn proyma_info(&self) -> (i32, i32, i32, i32) {
        *self.proyma_info_cache.lock().unwrap()
    }

    fn generate_left_nodes(
        &self,
        _m: &ProjectMeasurements,
        _calc: &RaglanCalculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        let padding = 40.0;
        let cuff_y = dims.height_rows as f64 + padding;
        let cut_y = dims.shoulder_cut_rows as f64 + padding;
        let cap_y = padding;
        let cap_drop = dims.cap_offset.max(10.0);

        let half_cuff = dims.cuff_stitches as f64 / 2.0;
        let half_top = dims.top_stitches as f64 / 2.0;

        vec![
            bp("sleeve_cuff_left", cx - half_cuff, cuff_y, "sleeve_left"),
            bp("sleeve_cuff_right", cx + half_cuff, cuff_y, "sleeve_left"),
            bp("sleeve_underarm_left", cx - half_cuff + 2.0, cut_y, "sleeve_left"),
            bp("sleeve_underarm_right", cx + half_cuff - 2.0, cut_y, "sleeve_left"),
            bp("sleeve_top_left", cx - half_top, cap_y, "sleeve_left"),
            bp("sleeve_top_right", cx + half_top, cap_y + cap_drop, "sleeve_left"),
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
        nodes.into_iter().map(|n| BlueprintNodePosition {
            node_name: n.node_name.replace("sleeve_left", "sleeve_right"),
            part_code: "sleeve_right".into(),
            ..n
        }).collect()
    }

    fn front_decrease_rows(&self, _calc: &RaglanCalculation) -> Vec<i32> { vec![] }
    fn back_decrease_rows(&self, _calc: &RaglanCalculation) -> Vec<i32> { vec![] }
}

fn bp(name: &str, x: f64, y: f64, part: &str) -> BlueprintNodePosition {
    BlueprintNodePosition {
        node_name: name.into(), x, y, part_code: part.into(), was_manually_moved: false,
    }
}
