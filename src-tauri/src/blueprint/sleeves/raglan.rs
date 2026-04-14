// crate::sleeve/types/raglan.rs
use crate::blueprint::{BaseSleeveDimensions, BlueprintNodePosition, ProjectMeasurements, RaglanSleeveDimensions, SleeveDimensions};
use super::super::traits::*;

/// Raglan sleeve implementation
pub struct RaglanSleeve;

impl RaglanSleeve {
    /// Helper: calculate raglan-specific shoulder cuts based on chest circumference
    fn calc_shoulder_cuts(og: f64, p: f64) -> i32 {
        let mut shoulder_cuts = 2.0;
        if og > 100.0 && og <= 120.0 {
            shoulder_cuts += 0.5;
        }
        if og > 120.0 {
            shoulder_cuts += 1.0;
        }
        (shoulder_cuts * p).round() as i32
    }

    /// Helper: calculate raglan line position in rows (front)
    fn calc_raglan_line_rows_front(og: f64, r: f64) -> i32 {
        let raglan_line_front = (og / 2.0 / 3.0) + 7.0;
        (raglan_line_front * r).round() as i32
    }
}

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

        // === 1. БАЗОВЫЕ ШИРИНЫ (общие для всех рукавов) ===
        let cuff = ((m.oz * p).round() as i32).max(10);
        let sleeve_width = ((m.or_val + m.ease) * p).round() as i32;
        let top = ((m.oh / 6.0) * p).round() as i32;

        // === 2. ВЫСОТЫ ===
        let height = (m.dr * r).round() as i32;

        // === 3. РЕГЛАН-СПЕЦИФИКА ===
        let decrease_shoulders_stitches = Self::calc_shoulder_cuts(m.og, p);
        let raglan_line_rows_front = Self::calc_raglan_line_rows_front(m.og, r);
        let hem_rows = (m.og / 2.0 * r).round() as i32;
        
        let decrease_shoulders_front_rows = hem_rows - raglan_line_rows_front;
        let start_shoulder_cuts_rows = height - decrease_shoulders_front_rows;
        let start_raglan_stitches = sleeve_width - decrease_shoulders_stitches * 2;
        let sleeve_cuff_stitches = ((m.oz * p).round() as i32).max(10);
        
        let cap_offset = (raglan_line_rows_front as f64 * 0.15).min(12.0);
        let cuff_width = cuff as f64;
        let top_width = start_raglan_stitches as f64;
        let sleeve_slope_start_x = (sleeve_width / 2) as f64 - top_width / 2.0;
        let sleeve_slope_end_x = (sleeve_width / 2) as f64 - cuff_width / 2.0;

        // === 4. ПРИБАВКИ ===
        let total_inc = ((sleeve_width - cuff) / 2).max(0);
        let increase_rows = gen_sleeve_increases(total_inc, height-raglan_line_rows_front);

        // === Собираем структуру с вложенностью ===
        let base = BaseSleeveDimensions {
            cuff_stitches: cuff,
            middle_stitches: sleeve_width,
            height_rows: height,
            increase_rows
        };

        let raglan_specific = RaglanSleeveDimensions {
            base,
            top_stitches: top,
            shoulder_cut_rows: start_shoulder_cuts_rows,
            cap_offset,
            slope_start_x: sleeve_slope_start_x,
            slope_end_x: sleeve_slope_end_x,
            cuff_stitches: sleeve_cuff_stitches,
            raglan_line_rows: raglan_line_rows_front,
            start_raglan_stitches: start_raglan_stitches,
            decrease_shoulders_stitches
        };

        SleeveDimensions::Raglan(raglan_specific)
    }

    fn generate_left_nodes(
        &self,
        _m: &ProjectMeasurements,
        _calc: &dyn Calculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        // === Pattern match: достаём реглан-специфичные данные ===
        let SleeveDimensions::Raglan(raglan) = dims else {
            #[cfg(debug_assertions)]
            panic!(
                "RaglanSleeve::generate_left_nodes called with {:?} instead of Raglan",
                std::any::type_name_of_val(dims)
            );
            #[cfg(not(debug_assertions))]
            return vec![];
        };

        let padding = 40.0;
        let cuff_y = raglan.base.height_rows as f64 + padding;
        let cut_y = raglan.shoulder_cut_rows as f64 + padding;
        let base_y = padding;
        let slope_drop = raglan.cap_offset.max(6.0);

        // Общие поля — через base
        let half_cuff = raglan.base.cuff_stitches as f64 / 2.0;
        let sleeve_widest = raglan.base.middle_stitches as f64;
        
        // Реглан-специфичные поля — напрямую
        let half_top = raglan.top_stitches as f64 / 2.0;
        let start_raglan_stitches = raglan.base.middle_stitches - raglan.decrease_shoulders_stitches * 2;
        let underarm_x_offset = (start_raglan_stitches as f64) / 2.0;

        vec![
            // === Манжета ===
            BlueprintNodePosition {
                node_name: "sleeve_cuff_left".into(),
                x: cx - half_cuff,
                y: cuff_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: "sleeve_cuff_right".into(),
                x: cx + half_cuff,
                y: cuff_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },

            // === Подрезы (макс. ширина) ===
            BlueprintNodePosition {
                node_name: "sleeve_cut_left".into(),
                x: cx - sleeve_widest / 2.0,
                y: cut_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: "sleeve_cut_right".into(),
                x: cx + sleeve_widest / 2.0,
                y: cut_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },

            // === Подмышки (начало реглан-линии) ===
            BlueprintNodePosition {
                node_name: "sleeve_underarm_left".into(),
                x: cx - underarm_x_offset,
                y: cut_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: "sleeve_underarm_right".into(),
                x: cx + underarm_x_offset,
                y: cut_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },

            // === Верх рукава (горловина) ===
            BlueprintNodePosition {
                node_name: "sleeve_top_left".into(),
                x: cx - half_top,
                y: base_y,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },
            BlueprintNodePosition {
                node_name: "sleeve_top_right".into(),
                x: cx + half_top,
                y: base_y + slope_drop,
                part_code: "sleeve_left".into(),
                was_manually_moved: false,
            },
        ]
    }

    fn generate_right_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &dyn Calculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        // Зеркалим левый рукав по оси X
        self.generate_left_nodes(m, calc, dims, cx)
            .into_iter()
            .map(|n| BlueprintNodePosition {
                node_name: n.node_name.replace("sleeve_left", "sleeve_right"),
                part_code: "sleeve_right".into(),
                ..n
            })
            .collect()
    }

    fn front_decrease_rows(&self, calc: &dyn Calculation) -> Vec<i32> {
        calc.as_raglan()
            .map(|r| r.sleeve_raglan_rows_front.clone())
            .unwrap_or_default()
    }

    fn back_decrease_rows(&self, calc: &dyn Calculation) -> Vec<i32> {
        calc.as_raglan()
            .map(|r| r.sleeve_raglan_rows_back.clone())
            .unwrap_or_default()
    }
}

// === Вспомогательная функция (общая, можно вынести в utils) ===
fn gen_sleeve_increases(total: i32, height: i32) -> Vec<i32> {
    let mut rows = Vec::new();
    if total <= 0 || height <= 0 {
        return rows;
    }
    let interval = ((height as f64 / total as f64) * 0.7).round().max(4.0) as i32;
    for i in 0..total {
        rows.push(((i + 1) * interval).min(height - 2));
    }
    rows
}