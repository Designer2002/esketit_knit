// crate::sleeve/types/set_in.rs
use crate::blueprint::{BaseSleeveDimensions, BlueprintNodePosition, DecreaseGroup, ProjectMeasurements, SetInSleeveDimensions, SleeveDimensions};
use super::super::traits::*;

/// Set-in (втачной) рукав — реализация по формулам технолога
pub struct SetInSleeve;

impl SetInSleeve {
    // === Формулы технолога для втачного рукава ===

    /// Самая широкая часть рукава (подмышка) в см
    fn calc_widest_sleeve_cm(chest: i32) -> i32 {
        chest / 2 / 3 + 2
    }

    /// Высота оката в см
    fn calc_cap_height_cm(chest: i32) -> i32 {
        chest / 2 / 4 + 3
    }

    /// Глубина проймы в см
    fn calc_armhole_depth_cm(chest: i32) -> i32 {
        chest / 2 / 3 + 5
    }

    /// Ширина проймы (убавки) в см
    fn calc_proyma_width_cm(chest: i32) -> i32 {
        let hem_half = chest / 2 / 2 + 2;
        let after_proyma = chest / 2 / 3 + 3;
        (hem_half - after_proyma).max(0)
    }

    /// Посадка по окату (доля от ширины)
    fn calc_cap_ease(widest_st: i32) -> f64 {
        (widest_st as f64 * 0.05).min(0.1).max(0.03)
    }

    /// Прибавки рукава: от манжеты к widest (линейное распределение)
    fn calc_increase_rows(cuff: i32, widest: i32, body_rows: i32) -> Vec<i32> {
        let total_inc = ((widest - cuff) / 2).max(0);
        if total_inc <= 0 || body_rows <= 0 {
            return vec![];
        }
        // Интервал с коэффициентом 0.7 — как в реглане, но можно настроить
        let interval = ((body_rows as f64 / total_inc as f64) * 0.7).round().max(4.0) as i32;
        (0..total_inc)
            .map(|i| ((i + 1) * interval).min(body_rows - 2))
            .collect()
    }
}

impl SleeveType for SetInSleeve {
    fn sleeve_type_id(&self) -> &str {
        "set_in"
    }

    fn calculate_sleeve(
        &self,
        m: &ProjectMeasurements,
        _dec_shoulder_st: i32, // не используется для втачного
    ) -> SleeveDimensions {
        let p = m.gauge_stitches_per_cm;
        let r = m.gauge_rows_per_cm;

        // === Исходные данные ===
        let chest = m.og as i32;
        let wrist = m.oz as i32;
        let ease = m.ease;

        // === Формулы технолога (в см) ===
        let widest_sleeve_cm = Self::calc_widest_sleeve_cm(chest);
        let cap_height_cm = Self::calc_cap_height_cm(chest);
        let armhole_depth_cm = Self::calc_armhole_depth_cm(chest);
        let proyma_width_cm = Self::calc_proyma_width_cm(chest);

        // === Перевод в петли/ряды ===
        let sleeve_widest_st = (widest_sleeve_cm as f64 * p).round() as i32;
        let cap_height_rows = (cap_height_cm as f64 * r).round() as i32;
        let armhole_depth_rows = (armhole_depth_cm as f64 * r).round() as i32;
        let proyma_width_st = (proyma_width_cm as f64 * p).round() as i32;

        // === Убавки ===
        let armhole_decreases = crate::blueprint::calculate_proyma_decreases(proyma_width_st);
        let cap_decreases = crate::blueprint::calculate_sleeve_cap_decreases(
            sleeve_widest_st,
            cap_height_rows,
        );
        let shoulder_decreases = crate::blueprint::calculate_shoulder_decreases(
            m.shoulder_height,
            (m.shoulder_length as f64 * p).round(),
        );

        // === Базовые параметры ===
        let cuff_st = (wrist as f64 + ease * p).round() as i32;
        let sleeve_body_rows = ((m.dr - cap_height_cm as f64) * r).round() as i32;
        let total_height_rows = sleeve_body_rows + cap_height_rows;

        // === Прибавки (от манжеты к widest) ===
        let increase_rows = Self::calc_increase_rows(cuff_st, sleeve_widest_st, sleeve_body_rows);

        // === Посадка и геометрия оката ===
        let ease_at_cap = Self::calc_cap_ease(sleeve_widest_st);
        
        // Координаты для отрисовки: вычисляем на основе кривой оката
        let cap_curve = generate_cap_curve_points(sleeve_widest_st, cap_height_rows, &cap_decreases);
        let (slope_start_x, slope_end_x) = calc_slope_coords(
            sleeve_widest_st,
            cuff_st,
            cap_height_rows,
            ease_at_cap,
        );

        // === Собираем Base ===
        let base = BaseSleeveDimensions {
            cuff_stitches: cuff_st,
            middle_stitches: sleeve_widest_st,
            height_rows: total_height_rows,
            increase_rows,
        };

        // === Собираем SetIn-специфику ===
        let setin_specific = SetInSleeveDimensions {
            base,
            armhole_depth_rows,
            cap_height_rows,
            ease_at_cap,
            cap_curve,
        };

        SleeveDimensions::SetIn(setin_specific)
    }

    fn generate_left_nodes(
        &self,
        _m: &ProjectMeasurements,
        _calc: &dyn Calculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        // === Pattern match: достаём set-in специфичные данные ===
        let SleeveDimensions::SetIn(setin) = dims else {
            #[cfg(debug_assertions)]
            panic!(
                "SetInSleeve::generate_left_nodes called with {:?} instead of SetIn",
                std::any::type_name_of_val(dims)
            );
            #[cfg(not(debug_assertions))]
            return vec![];
        };

        let padding = 40.0;
        let cuff_y = setin.base.height_rows as f64 + padding;
        let armhole_y = cuff_y - setin.armhole_depth_rows as f64;
        let cap_top_y = armhole_y - setin.cap_height_rows as f64;

        // Общие поля — через base
        let half_cuff = setin.base.cuff_stitches as f64 / 2.0;
        let half_widest = setin.base.middle_stitches as f64 / 2.0;

        // === Ключевые точки для втачного рукава ===
        // Учитываем посадку по окату: сужаем верх относительно widest
        let cap_ease_px = (setin.base.middle_stitches as f64 * setin.ease_at_cap) / 2.0;
        let half_cap_top = half_widest - cap_ease_px;

        let mut nodes = vec![
            // Манжета
            bp("sleeve_cuff_left", cx - half_cuff, cuff_y, "sleeve_left"),
            bp("sleeve_cuff_right", cx + half_cuff, cuff_y, "sleeve_left"),

            // Подмышки (переход к пройме)
            bp("sleeve_underarm_left", cx - half_widest, armhole_y, "sleeve_left"),
            bp("sleeve_underarm_right", cx + half_widest, armhole_y, "sleeve_left"),

            // Верх оката (с учётом посадки)
            bp("sleeve_top_left", cx - half_cap_top, cap_top_y, "sleeve_left"),
            bp("sleeve_top_right", cx + half_cap_top, cap_top_y, "sleeve_left"),
        ];

        // // === Добавляем точки проймы по armhole_decreases ===
        // nodes.extend(generate_armhole_points(
        //     cx,
        //     armhole_y,
        //     &setin.armhole_decreases,
        //     /*is_left=*/ true,
        // ));

        // === Добавляем точки оката по cap_curve ===
        nodes.extend(generate_cap_points(
            cx,
            cap_top_y,
            &setin.cap_curve,
            /*is_left=*/ true,
        ));

        nodes
    }

    fn generate_right_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &dyn Calculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition> {
        // Зеркалим левый рукав
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
        calc.as_set_in()
            .map(|s| {
                s.sleeve_cap_decreases
                    .iter()
                    .flat_map(|g| std::iter::repeat(g.every_n_rows).take(g.repeat_count as usize))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn back_decrease_rows(&self, calc: &dyn Calculation) -> Vec<i32> {
        calc.as_set_in()
            .map(|s| {
                s.armhole_decreases
                    .iter()
                    .flat_map(|g| std::iter::repeat(g.every_n_rows).take(g.repeat_count as usize))
                    .collect()
            })
            .unwrap_or_default()
    }
}

// === Вспомогательные функции для генерации геометрии ===

/// Генерирует точки кривой оката на основе DecreaseGroup
fn generate_cap_curve_points(
    widest_st: i32,
    cap_height: i32,
    decreases: &[DecreaseGroup],
) -> Vec<(i32, i32)> {
    let mut points = Vec::new();
    let mut x = widest_st / 2; // начинаем с половины ширины
    let mut y = 0; // верх оката

    for group in decreases {
        for _ in 0..group.repeat_count {
            x -= group.stitches;
            y += group.every_n_rows;
            if y <= cap_height {
                points.push((x, y));
            }
        }
    }
    points
}

/// Вычисляет координаты наклона для отрисовки
fn calc_slope_coords(
    widest: i32,
    cuff: i32,
    cap_height: i32,
    ease: f64,
) -> (f64, f64) {
    let widest_f = widest as f64;
    let cuff_f = cuff as f64;
    let ease_px = widest_f * ease;
    
    // Начальная точка склона (переход от widest к окату)
    let start_x = (widest_f / 2.0) - (widest_f / 2.0 - ease_px / 2.0);
    // Конечная точка (переход к манжете)
    let end_x = (widest_f / 2.0) - (cuff_f / 2.0);
    
    (start_x, end_x)
}

/// Генерирует ноды для проймы по группам убавок
fn generate_armhole_points(
    cx: f64,
    armhole_y: f64,
    decreases: &[DecreaseGroup],
    is_left: bool,
) -> Vec<BlueprintNodePosition> {
    let mut points = Vec::new();
    let mut x_offset = 0.0;
    let mut y_offset = 0.0;
    let mut idx = 0;

    for group in decreases {
        for _ in 0..group.repeat_count {
            x_offset += group.stitches as f64;
            y_offset += group.every_n_rows as f64;
            
            let x = if is_left {
                cx - (x_offset)
            } else {
                cx + x_offset
            };
            
            points.push(bp(
                &format!("sleeve_armhole_{}_{}", if is_left { "left" } else { "right" }, idx),
                x,
                armhole_y - y_offset,
                if is_left { "sleeve_left" } else { "sleeve_right" },
            ));
            idx += 1;
        }
    }
    points
}

/// Генерирует ноды для оката по предвычисленной кривой
fn generate_cap_points(
    cx: f64,
    cap_top_y: f64,
    curve: &[(i32, i32)],
    is_left: bool,
) -> Vec<BlueprintNodePosition> {
    curve
        .iter()
        .enumerate()
        .map(|(i, &(x_st, y_rows))| {
            let x = if is_left {
                cx - x_st as f64
            } else {
                cx + x_st as f64
            };
            bp(
                &format!("sleeve_cap_{}_{}", if is_left { "left" } else { "right" }, i),
                x,
                cap_top_y + y_rows as f64,
                if is_left { "sleeve_left" } else { "sleeve_right" },
            )
        })
        .collect()
}

// === Хелпер для создания нод (локальный) ===
fn bp(name: &str, x: f64, y: f64, part: &str) -> BlueprintNodePosition {
    BlueprintNodePosition {
        node_name: name.into(),
        x,
        y,
        part_code: part.into(),
        was_manually_moved: false,
    }
}