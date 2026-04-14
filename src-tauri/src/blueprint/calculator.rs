// crate::calculator/blueprint.rs
use super::parts::{build_decrease_pts, build_neck_pts, build_shoulder_pts};
use super::sleeves::*;
use super::traits::*;
use super::types::*;
use sqlx::Row;
use sqlx::SqlitePool;

/// Main blueprint calculator that composes garment parts
pub struct BlueprintCalculator {
    pub sleeve: Box<dyn SleeveType>,
}

impl BlueprintCalculator {
    pub fn new(sleeve_type: &str) -> Self {
        let sleeve: Box<dyn SleeveType> = match sleeve_type {
            "set_in" => Box::new(SetInSleeve), // ← без .new(), структура без состояния
            _ => Box::new(RaglanSleeve),
        };
        Self { sleeve }
    }

    /// Full calculation for a project
    pub async fn calculate(
        &self,
        project_id: i64,
        pool: &SqlitePool,
    ) -> Result<BlueprintCalculation, String> {
        let m = load_measurements(project_id, pool).await?;
        self.calculate_from_measurements(&m)
    }

    /// Calculate from measurements directly
    pub fn calculate_from_measurements(
        &self,
        m: &ProjectMeasurements,
    ) -> Result<BlueprintCalculation, String> {
        match self.sleeve.sleeve_type_id() {
            "set_in" => self.calculate_set_in(m),
            _ => self.calculate_raglan(m),
        }
    }

    /// Raglan calculation — теперь без параметра dims, считаем внутри
    fn calculate_raglan(&self, m: &ProjectMeasurements) -> Result<BlueprintCalculation, String> {
        let p = m.gauge_stitches_per_cm;
        let r = m.gauge_rows_per_cm;

        // === БАЗОВЫЕ РАСЧЁТЫ ИЗДЕЛИЯ ===
        let half_chest = (m.og / 2.0) + m.ease;
        let hem_stitches = (half_chest * p).round() as i32;
        let hem_rows = (half_chest * r).round() as i32;
        let garment_length = (m.di * r).round() as i32;

        // Armhole
        let raglan_line = (half_chest / 3.0) + 7.0;
        let raglan_rows = (raglan_line * r).round() as i32;
        let armhole_row = hem_rows - raglan_rows;

        let mut shoulder_cuts = 2.0;
        if m.og > 100.0 && m.og <= 120.0 {
            shoulder_cuts += 0.5;
        }
        if m.og > 120.0 {
            shoulder_cuts += 1.0;
        }
        let dec_shoulder = (shoulder_cuts * p).round() as i32;

        // Neckline
        let neck_back = (m.oh / 3.0) - 1.0;
        let neck_front = m.oh / 3.0;
        let neck_back_st = (neck_back * p).round() as i32;
        let neck_front_st = (neck_front * p).round() as i32;

        // Decreases
        let dec_back = ((hem_stitches - dec_shoulder * 2) - neck_back_st) / 2;
        let dec_front = ((hem_stitches - dec_shoulder * 2) - neck_front_st) / 2;
        let (back_rows, back_counts) =
            gen_raglan_decreases(armhole_row + 2, garment_length - 2, dec_back, r);
        let (front_rows, front_counts) =
            gen_raglan_decreases(armhole_row + 2, garment_length - 2, dec_front, r);

        // Neckline decreases
        let neck_depth = (m.glg * r).round() as i32;
        let (neck_rows, neck_counts) = gen_u_neckline_decreases(neck_front_st, neck_depth);
        let neck_decreases_rows_back = rows_counts_to_groups(&neck_rows, &neck_counts);
        let neck_decreases_rows_front = neck_decreases_rows_back.clone();

        let half_neck_front_st = ((m.oh / 2.0 / 2.0) * p).round() as i32;
        let rem = (neck_depth - half_neck_front_st).max(0) as f64;


        // === РУКАВ: вызываем полиморфный метод ===
        let dims = self.sleeve.calculate_sleeve(m, dec_shoulder);

        // Viewbox — вычисляем на основе реальных данных из dims
        let viewbox_w = match &dims {
            SleeveDimensions::Raglan(r) => (hem_stitches * 2 + r.top_stitches * 2 + 100) as i32,
            SleeveDimensions::SetIn(s) => {
                (hem_stitches * 2 + s.base.middle_stitches * 2 + 100) as i32
            }
        };
        let viewbox_h = (garment_length.max(dims.height_rows()) + 50) as i32;

        // Generate nodes
        let mut nodes = Vec::new();
        let hem_y = viewbox_h as f64 - 20.0;
        let sx = 1.0;
        let sy = 1.0;

        // === BACK ===
        let bcx = (viewbox_w * 3 / 4) as f64;
        let half_w = hem_stitches as f64 / 2.0;
        let underarm_y = hem_y - (garment_length - armhole_row) as f64;
        let left_hem_x = bcx - half_w;
        let right_hem_x = bcx + half_w;
        let left_underarm_x = left_hem_x + dec_shoulder as f64;
        let right_underarm_x = right_hem_x - dec_shoulder as f64;
        let shoulder_y = underarm_y;

        // Convert to DecreaseGroups
        let back_shoulder_decreases: Vec<DecreaseGroup> = back_rows
            .iter()
            .zip(&back_counts)
            .map(|(&row, &count)| DecreaseGroup {
                stitches: count,
                every_n_rows: if row > 0 { 2 } else { 1 },
                repeat_count: 1,
            })
            .collect();
        let front_shoulder_decreases: Vec<DecreaseGroup> = front_rows
            .iter()
            .zip(&front_counts)
            .map(|(&row, &count)| DecreaseGroup {
                stitches: count,
                every_n_rows: if row > 0 { 2 } else { 1 },
                repeat_count: 1,
            })
            .collect();

        let shoulder_pts_left = build_shoulder_pts(
            left_underarm_x,
            shoulder_y,
            &back_shoulder_decreases,
            sx,
            sy,
            true,
        );
        let shoulder_pts_right = build_shoulder_pts(
            right_underarm_x,
            shoulder_y,
            &back_shoulder_decreases,
            sx,
            sy,
            false,
        );

        let neck_start_left = shoulder_pts_left
            .last()
            .copied()
            .unwrap_or((left_underarm_x, shoulder_y));
        let neck_start_right = shoulder_pts_right
            .last()
            .copied()
            .unwrap_or((right_underarm_x, shoulder_y));

        let neck_pts_left = build_neck_pts(
            neck_start_left.0,
            neck_start_left.1,
            &neck_decreases_rows_back,
            0,
            sx,
            sy,
            false,
        );
        let neck_pts_right = build_neck_pts(
            neck_start_right.0,
            neck_start_right.1,
            &neck_decreases_rows_back,
            0,
            sx,
            sy,
            true,
        );

        let front_neck_y = neck_start_right.1;
        let front_neck_x_left = neck_pts_left.first().unwrap().0;
        let front_neck_x_right = neck_pts_right.first().unwrap().0;

        // Back nodes
        nodes.extend([
            bp("back_neck_left", front_neck_x_left, front_neck_y, "back"),
            bp("back_neck_right", front_neck_x_right, front_neck_y, "back"),
            bp("back_left_hem", left_hem_x, hem_y, "back"),
            bp("back_right_hem", right_hem_x, hem_y, "back"),
            bp("back_left_cut", left_hem_x, underarm_y, "back"),
            bp("back_right_cut", right_hem_x, underarm_y, "back"),
            bp("back_left_underarm", left_underarm_x, underarm_y, "back"),
            bp("back_right_underarm", right_underarm_x, underarm_y, "back"),
        ]);

        for (x, y) in &shoulder_pts_left {
            nodes.push(bp(&format!("back_left_shoulder_{:.0}", y), *x, *y, "back"));
        }
        for (x, y) in &shoulder_pts_right {
            nodes.push(bp(&format!("back_right_shoulder_{:.0}", y), *x, *y, "back"));
        }
        for (x, y) in &neck_pts_left {
            nodes.push(bp(&format!("back_left_neck_{:.0}", y), *x, *y, "back"));
        }
        for (x, y) in &neck_pts_right {
            nodes.push(bp(&format!("back_right_neck_{:.0}", y), *x, *y, "back"));
        }

        // === FRONT ===
        let fcx = (viewbox_w / 4) as f64;
        let front_left_hem_x = fcx - half_w;
        let front_right_hem_x = fcx + half_w;
        let front_left_underarm_x = front_left_hem_x + dec_shoulder as f64;
        let front_right_underarm_x = front_right_hem_x - dec_shoulder as f64;

        let front_shoulder_pts_left = build_shoulder_pts(
            front_left_underarm_x,
            underarm_y,
            &front_shoulder_decreases,
            sx,
            sy,
            true,
        );
        let front_shoulder_pts_right = build_shoulder_pts(
            front_right_underarm_x,
            underarm_y,
            &front_shoulder_decreases,
            sx,
            sy,
            false,
        );

        let front_neck_start_left = front_shoulder_pts_left
            .last()
            .copied()
            .unwrap_or((front_left_underarm_x, underarm_y));
        let front_neck_start_right = front_shoulder_pts_right
            .last()
            .copied()
            .unwrap_or((front_right_underarm_x, underarm_y));

        let front_neck_pts_left = build_neck_pts(
            front_neck_start_left.0,
            front_neck_start_left.1,
            &neck_decreases_rows_front,
            rem.round() as i32,
            sx,
            sy,
            false,
        );
        let front_neck_pts_right = build_neck_pts(
            front_neck_start_right.0,
            front_neck_start_right.1,
            &neck_decreases_rows_front,
            rem.round() as i32,
            sx,
            sy,
            true,
        );

        let front_neck_y = front_neck_pts_left.first().unwrap().1;
        let front_neck_x_left = front_neck_pts_left.first().unwrap().0;
        let front_neck_x_right = front_neck_pts_right.first().unwrap().0;

        nodes.extend([
            bp("front_left_hem", front_left_hem_x, hem_y, "front"),
            bp("front_right_hem", front_right_hem_x, hem_y, "front"),
            bp("front_left_cut", front_left_hem_x, underarm_y, "front"),
            bp("front_right_cut", front_right_hem_x, underarm_y, "front"),
            bp(
                "front_left_underarm",
                front_left_underarm_x,
                underarm_y,
                "front",
            ),
            bp(
                "front_right_underarm",
                front_right_underarm_x,
                underarm_y,
                "front",
            ),
        ]);

        for (x, y) in &front_shoulder_pts_left {
            nodes.push(bp(
                &format!("front_left_shoulder_{:.0}", y),
                *x,
                *y,
                "front",
            ));
        }
        for (x, y) in &front_shoulder_pts_right {
            nodes.push(bp(
                &format!("front_right_shoulder_{:.0}", y),
                *x,
                *y,
                "front",
            ));
        }
        nodes.extend([
            bp("front_neck_left", front_neck_x_left, front_neck_y, "front"),
            bp(
                "front_neck_right",
                front_neck_x_right,
                front_neck_y,
                "front",
            ),
        ]);
        for (x, y) in &front_neck_pts_left {
            nodes.push(bp(&format!("front_left_neck_{:.0}", y), *x, *y, "front"));
        }
        for (x, y) in &front_neck_pts_right {
            nodes.push(bp(&format!("front_right_neck_{:.0}", y), *x, *y, "front"));
        }

        // Neck centers
        let front_shoulder_y = front_shoulder_pts_left
            .last()
            .map(|p| p.1)
            .unwrap_or(front_neck_y);
        nodes.push(bp(
            "front_neck_center",
            fcx,
            front_shoulder_y + neck_depth as f64,
            "front",
        ));
        let back_shoulder_y = shoulder_pts_left
            .last()
            .map(|p| p.1)
            .unwrap_or(front_neck_y);
        nodes.push(bp(
            "back_neck_center",
            bcx,
            back_shoulder_y + (neck_depth as f64 * 0.25),
            "back",
        ));
        

        // === SLEEVES ===
        let sleeve_cx = (viewbox_w / 2) as f64;
        let sleeve_raglan_back = gen_sleeve_raglan_rows(&dims, true);
        let sleeve_raglan_front = gen_sleeve_raglan_rows(&dims, false);

        // Создаём RaglanCalculation ОДИН раз
        let raglan_calc = RaglanCalculation {
            back_width_stitches: hem_stitches,
            front_width_stitches: hem_stitches,
            neck_width_stitches: neck_back_st,
            sleeve_top_stitches: dims.top_stitches(),
            sleeve_cuff_stitches: dims.cuff_stitches(),
            total_rows: garment_length,
            raglan_start_row_front: armhole_row,
            raglan_start_row_back: armhole_row,
            raglan_end_row: garment_length - 2,
            sleeve_height_rows: dims.height_rows(),
            sleeve_increase_rows: dims.increase_rows().clone(),
            total_decreases: dec_back,
            neck_decrease_counts: neck_counts.clone(),
            neck_decrease_rows: neck_rows.clone(),
            decrease_shoulder_cuts: dec_shoulder,
            viewbox_width: viewbox_w,
            viewbox_height: viewbox_h,
            sleeve_shoulder_cut_rows: dims.shoulder_cut_rows(),
            sleeve_slope_start_x: dims.as_raglan().unwrap().slope_start_x(),
            sleeve_slope_end_x: dims.as_raglan().unwrap().slope_end_x(),
            sleeve_cap_offset: dims.cap_offset(),
            sleeve_width_stitches: ((m.or_val + m.ease) * p).round(),
            back_decrease_rows: back_rows.clone(),
            back_decrease_counts: back_counts.clone(),
            front_decrease_rows: front_rows.clone(),
            front_decrease_counts: front_counts.clone(),
            neck_depth_rows: neck_depth,
            nodes: vec![],
            sleeve_raglan_rows_back: sleeve_raglan_back.clone(),
            sleeve_raglan_rows_front: sleeve_raglan_front.clone(),
            neck_rem: rem
        };

        // Вызываем генерацию нод для рукава
        nodes.extend(
            self.sleeve
                .generate_left_nodes(m, &raglan_calc, &dims, sleeve_cx),
        );
        nodes.extend(
            self.sleeve
                .generate_right_nodes(m, &raglan_calc, &dims, sleeve_cx),
        );

        Ok(BlueprintCalculation::Raglan(RaglanCalculation {
            nodes,
            sleeve_raglan_rows_back: sleeve_raglan_back,
            sleeve_raglan_rows_front: sleeve_raglan_front,
            ..raglan_calc
        }))
    }

    /// Set-In sleeve calculation
    fn calculate_set_in(&self, m: &ProjectMeasurements) -> Result<BlueprintCalculation, String> {
        let p = m.gauge_stitches_per_cm;
        let r = m.gauge_rows_per_cm;

        // === Формулы технолога ===
        let chest = m.og as i32;
        let wrist = m.oz as i32;
        let ease = m.ease;

        let widest_sleeve_cm = chest / 2 / 3 + 2;
        let cap_height_cm = chest / 2 / 4 + 3;
        let armhole_depth_cm = chest / 2 / 3 + 5;
        let hem_half_cm = chest / 2 / 2 + 2;
        let after_proyma_cm = chest / 2 / 3 + 3;
        let proyma_width_cm = (hem_half_cm - after_proyma_cm).max(0);

        let sleeve_widest_st = (widest_sleeve_cm as f64 * p).round() as i32;
        let cap_height_rows = (cap_height_cm as f64 * r).round() as i32;
        let armhole_depth_rows = (armhole_depth_cm as f64 * r).round() as i32;
        let proyma_width_st = (proyma_width_cm as f64 * p).round() as i32;

        let armhole_decreases = calculate_proyma_decreases(proyma_width_st);
        let cap_decreases = calculate_sleeve_cap_decreases(sleeve_widest_st, cap_height_rows);
        let cuff_st = (wrist as f64 + ease * p).round() as i32;
        let sleeve_body_rows = ((m.dr - cap_height_cm as f64) * r).round() as i32;
        let total_sleeve_height = sleeve_body_rows + cap_height_rows;

        // Shoulder & neck
        let shoulder_slope_height = m.shoulder_height;
        let garment_len_rows = (m.di * r).round() as i32;
        let shoulder_len_st = (m.shoulder_length as f64 * p).round() as i32;
        let shoulder_decreases =
            calculate_shoulder_decreases(shoulder_slope_height, shoulder_len_st as f64);

        let neck_width_st = ((m.oh / 3.0) * p).round() as i32;
        let neck_depth_rows = (m.glg * r).round() as i32;
        let half_neck = (m.oh / 2.0 / 2.0 * p).round() as i32;
        let (neck_rows_back, neck_counts_back) =
            calculate_neckline_decreases(half_neck, (m.glg / 2.0 * r).round() as i32);
        let (neck_rows_front, neck_counts_front) =
            calculate_neckline_decreases(half_neck, neck_depth_rows);
        let neck_decreases_rows_back = rows_counts_to_groups(&neck_rows_back, &neck_counts_back);
        let neck_decreases_rows_front = rows_counts_to_groups(&neck_rows_front, &neck_counts_front);
        let rem_back = ((m.glg / 2.0 * r).round() as i32 - half_neck).max(0);
        let rem_front = (neck_depth_rows - half_neck).max(0);

        // Waist
        let hip_len_rows = (m.hip_len * r).round() as i32;
        let back_len_rows = (m.back_len * r).round() as i32;
        let waist_decreases =
            calculate_waist_decreases(m.hip_circumference, m.waist_circumference, p, hip_len_rows);
        let waist_increases =
            calculate_waist_increases(m.waist_circumference, m.og, p, back_len_rows / 2);

        // === РУКАВ: полиморфный вызов ===
        let dims = self.sleeve.calculate_sleeve(m, 0); // dec_shoulder не используется для set_in

        // Viewbox
        let viewbox_w = 1200;
        let viewbox_h = 900;
        let hem_y = viewbox_h as f64 - 20.0;
        let sx = 1.0;
        let sy = 1.0;

        // === BACK ===
        let bcx = (viewbox_w * 3 / 4) as f64;
        let hem_width = (hem_half_cm as f64 * p * 2.0).round() as i32;
        let underarm_width = (after_proyma_cm as f64 * p * 2.0).round() as i32;
        let half_w = hem_width as f64 / 2.0;
        let underarm_half = underarm_width as f64 / 2.0;
        let armhole_y = hem_y - armhole_depth_rows as f64;
        let shoulder_y = hem_y - garment_len_rows as f64 + (shoulder_slope_height * r) as f64;

        let left_hem_x = bcx - half_w;
        let right_hem_x = bcx + half_w;
        let left_underarm_x = bcx - underarm_half;
        let right_underarm_x = bcx + underarm_half;

        let armhole_pts_left = build_decrease_pts(
            left_underarm_x,
            armhole_y,
            &armhole_decreases,
            sx,
            sy,
            true,
            true,
        );
        let armhole_pts_right = build_decrease_pts(
            right_underarm_x,
            armhole_y,
            &armhole_decreases,
            sx,
            sy,
            false,
            true,
        );

        let shoulder_start_left = armhole_pts_left
            .last()
            .copied()
            .unwrap_or((left_underarm_x, armhole_y));
        let shoulder_start_right = armhole_pts_right
            .last()
            .copied()
            .unwrap_or((right_underarm_x, armhole_y));

        let shoulder_pts_left = build_shoulder_pts(
            shoulder_start_left.0,
            shoulder_start_left.1,
            &shoulder_decreases,
            sx,
            sy,
            true,
        );
        let shoulder_pts_right = build_shoulder_pts(
            shoulder_start_right.0,
            shoulder_start_right.1,
            &shoulder_decreases,
            sx,
            sy,
            false,
        );

        let neck_start_left = shoulder_pts_left
            .last()
            .copied()
            .unwrap_or(shoulder_start_left);
        let neck_start_right = shoulder_pts_right
            .last()
            .copied()
            .unwrap_or(shoulder_start_right);

        let neck_pts_left = build_neck_pts(
            neck_start_left.0,
            neck_start_left.1,
            &neck_decreases_rows_back,
            rem_back,
            sx,
            sy,
            false,
        );
        let neck_pts_right = build_neck_pts(
            neck_start_right.0,
            neck_start_right.1,
            &neck_decreases_rows_back,
            rem_back,
            sx,
            sy,
            true,
        );

        let mut nodes = Vec::new();
        let mut idx = 0;
        macro_rules! push_node {
            ($name:expr, $x:expr, $y:expr, $part:expr) => {{
                nodes.push(bp($name, $x, $y, $part));
                idx += 1;
            }};
        }

        push_node!("back_left_hem", left_hem_x, hem_y, "back");
        push_node!("back_right_hem", right_hem_x, hem_y, "back");
        push_node!("back_left_underarm", left_underarm_x, armhole_y, "back");
        push_node!("back_right_underarm", right_underarm_x, armhole_y, "back");

        for (x, y) in &armhole_pts_left {
            push_node!(&format!("back_left_armhole_{}", idx), *x, *y, "back");
        }
        for (x, y) in &armhole_pts_right {
            push_node!(&format!("back_right_armhole_{}", idx), *x, *y, "back");
        }
        for (x, y) in &shoulder_pts_left {
            push_node!(&format!("back_left_shoulder_{}", idx), *x, *y, "back");
        }
        for (x, y) in &shoulder_pts_right {
            push_node!(&format!("back_right_shoulder_{}", idx), *x, *y, "back");
        }
        for (x, y) in &neck_pts_left {
            push_node!(&format!("back_left_neck_{}", idx), *x, *y, "back");
        }
        for (x, y) in &neck_pts_right {
            push_node!(&format!("back_right_neck_{}", idx), *x, *y, "back");
        }

        // === FRONT ===
        let fcx = (viewbox_w / 4) as f64;
        let flhx = fcx - half_w;
        let frhx = fcx + half_w;
        let flux = fcx - underarm_half;
        let frux = fcx + underarm_half;

        let f_armhole_l =
            build_decrease_pts(flux, armhole_y, &armhole_decreases, sx, sy, true, true);
        let f_armhole_r =
            build_decrease_pts(frux, armhole_y, &armhole_decreases, sx, sy, false, true);
        let f_sh_start_l = f_armhole_l.last().copied().unwrap_or((flux, armhole_y));
        let f_sh_start_r = f_armhole_r.last().copied().unwrap_or((frux, armhole_y));
        let f_sh_l = build_shoulder_pts(
            f_sh_start_l.0,
            f_sh_start_l.1,
            &shoulder_decreases,
            sx,
            sy,
            true,
        );
        let f_sh_r = build_shoulder_pts(
            f_sh_start_r.0,
            f_sh_start_r.1,
            &shoulder_decreases,
            sx,
            sy,
            false,
        );
        let f_nk_start_l = f_sh_l.last().copied().unwrap_or(f_sh_start_l);
        let f_nk_start_r = f_sh_r.last().copied().unwrap_or(f_sh_start_r);
        let f_nk_l = build_neck_pts(
            f_nk_start_l.0,
            f_nk_start_l.1,
            &neck_decreases_rows_front,
            rem_front,
            sx,
            sy,
            false,
        );
        let f_nk_r = build_neck_pts(
            f_nk_start_r.0,
            f_nk_start_r.1,
            &neck_decreases_rows_front,
            rem_front,
            sx,
            sy,
            true,
        );

        push_node!("front_left_hem", flhx, hem_y, "front");
        push_node!("front_right_hem", frhx, hem_y, "front");
        push_node!("front_left_underarm", flux, armhole_y, "front");
        push_node!("front_right_underarm", frux, armhole_y, "front");
        for (x, y) in &f_armhole_l {
            push_node!(&format!("front_left_armhole_{}", idx), *x, *y, "front");
        }
        for (x, y) in &f_armhole_r {
            push_node!(&format!("front_right_armhole_{}", idx), *x, *y, "front");
        }
        for (x, y) in &f_sh_l {
            push_node!(&format!("front_left_shoulder_{}", idx), *x, *y, "front");
        }
        for (x, y) in &f_sh_r {
            push_node!(&format!("front_right_shoulder_{}", idx), *x, *y, "front");
        }
        for (x, y) in &f_nk_l {
            push_node!(&format!("front_left_neck_{}", idx), *x, *y, "front");
        }
        for (x, y) in &f_nk_r {
            push_node!(&format!("front_right_neck_{}", idx), *x, *y, "front");
        }

        // Neck centers
        let f_sh_y = f_sh_l
            .last()
            .map(|p| p.1)
            .unwrap_or(hem_y - garment_len_rows as f64);
        push_node!(
            "front_neck_center",
            fcx,
            f_sh_y + neck_depth_rows as f64,
            "front"
        );
        let b_sh_y = shoulder_pts_left
            .last()
            .map(|p| p.1)
            .unwrap_or(hem_y - garment_len_rows as f64);
        push_node!(
            "back_neck_center",
            bcx,
            b_sh_y + (neck_depth_rows as f64 * 0.25),
            "back"
        );

        // === SLEEVE NODES ===
        let sleeve_cx = (viewbox_w / 2) as f64;

        // Создаём SetInSleeveCalculation
        let setin_calc = SetInSleeveCalculation {
            hem_width_stitches: hem_width,
            underarm_width_stitches: underarm_width,
            armhole_height_rows: armhole_depth_rows,
            armhole_decreases: armhole_decreases.clone(),
            neck_width_stitches: neck_width_st,
            neck_depth_rows,
            shoulder_slope_height_rows: (shoulder_slope_height * r).round() as i32,
            start_shoulder_slope_row: garment_len_rows - (shoulder_slope_height * r).round() as i32,
            shoulder_decrease_stitches: (shoulder_len_st as f64
                / (shoulder_slope_height / 2.0).round().max(1.0) as f64)
                .round() as i32,
            shoulder_decrease_times: (shoulder_slope_height / 2.0).round() as i32,
            sleeve_cuff_stitches: cuff_st,
            sleeve_widest_stitches: sleeve_widest_st,
            sleeve_cap_height_rows: cap_height_rows,
            sleeve_cap_decreases: cap_decreases.clone(),
            sleeve_body_rows: sleeve_body_rows.max(10),
            total_garment_rows: garment_len_rows,
            viewbox_width: viewbox_w,
            viewbox_height: viewbox_h,
            nodes: vec![],
            neck_decreases_rows_back: neck_decreases_rows_back.clone(),
            neck_decreases_rows_front: neck_decreases_rows_front.clone(),
            rem_back,
            rem_front,
            shoulder_decreases: shoulder_decreases.clone(),
            waist_decreases: waist_decreases.clone(),
            waist_increases: waist_increases.clone(),
            waist_start_row: hip_len_rows,
            waist_end_row: back_len_rows,
            waist_point_row: (m.back_len / 2.0 * r).round() as i32,
        };

        // Генерация нод рукава через полиморфный вызов
        nodes.extend(
            self.sleeve
                .generate_left_nodes(m, &setin_calc, &dims, sleeve_cx),
        );
        nodes.extend(
            self.sleeve
                .generate_right_nodes(m, &setin_calc, &dims, sleeve_cx),
        );

        Ok(BlueprintCalculation::SetIn(SetInSleeveCalculation {
            nodes,
            ..setin_calc
        }))
    }
}

// === Helper functions (без изменений) ===
fn bp(name: &str, x: f64, y: f64, part: &str) -> BlueprintNodePosition {
    BlueprintNodePosition {
        node_name: name.into(),
        x,
        y,
        part_code: part.into(),
        was_manually_moved: false,
    }
}

async fn load_measurements(
    project_id: i64,
    pool: &SqlitePool,
) -> Result<ProjectMeasurements, String> {
    let rows = sqlx::query(
        "SELECT measurement_code, value FROM project_blueprint_measurements WHERE project_id = ?",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load measurements: {}", e))?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        let code: String = row.get("measurement_code");
        let value: f64 = row.get("value");
        map.insert(code, value);
    }

    let get = |key: &str, default: f64| map.get(key).copied().unwrap_or(default);

    Ok(ProjectMeasurements {
        og: get("og", 94.0),
        dr: get("dr", 60.0),
        oz: get("oz", 16.0),
        or_val: get("or", 32.0),
        di: get("di", 62.0),
        glg: get("glg", 8.0),
        oh: get("oh", 58.0),
        ease: get("ease", 6.0),
        gauge_stitches_per_cm: get("gauge_stitches_per_cm", 2.5),
        gauge_rows_per_cm: get("gauge_rows_per_cm", 3.5),
        shoulder_height: get("shoulder_height", 5.5),
        shoulder_length: get("shoulder_length", 13.0),
        waist_circumference: get("waist_circumference", 70.0),
        hip_circumference: get("hip_circumference", 100.0),
        back_len: get("back_len", 40.0),
        hip_len: get("hip_len", 20.0),
    })
}

fn gen_raglan_decreases(start: i32, end: i32, total: i32, r: f64) -> (Vec<i32>, Vec<i32>) {
    let mut rows = Vec::new();
    let mut counts = Vec::new();
    let mut remaining = total;
    let mut current = start;
    let pattern = if r >= 3.5 { [1, 2, 1] } else { [1, 1, 2] };
    let mut pidx = 0;
    while remaining > 0 && current < end {
        let dc = pattern[pidx % 3].min(remaining);
        rows.push(current);
        counts.push(dc);
        remaining -= dc;
        current += 2;
        pidx += 1;
    }
    if remaining > 0 {
        rows.push(end.min(current));
        counts.push(remaining);
    }
    (rows, counts)
}

// === Конвертация DecreaseGroup → (rows, counts) для фронтенда ===
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

// === Горловина U-образная — формула технолога ===
fn gen_u_neckline_decreases(neck_w: i32, neck_depth: i32) -> (Vec<i32>, Vec<i32>) {
    calculate_neckline_decreases(neck_w / 2, neck_depth)
}

// === Убавки реглан-рукава: одинаковый старт, разный финиш ===
fn gen_sleeve_raglan_rows(
    dims: &SleeveDimensions,
    is_front_side: bool, // true = передняя сторона рукава
) -> Vec<i32> {
    let mut rows = Vec::new();

    // === Pattern match для доступа к реглан-специфичным полям ===
    let SleeveDimensions::Raglan(raglan) = dims else {
        return rows;
    };

    // === 🎯 ОДИНАКОВЫЙ СТАРТ для обеих сторон ===
    // Это ряд подреза (уровень подмышки) — абсолютная координата от подола
    let start_row = dims.increase_rows().iter().last().unwrap() + 2;

    // === Количество убавок (одинаковое для обеих сторон) ===
    let total_decreases = (raglan.base.middle_stitches - raglan.top_stitches).max(0) / 2;

    if total_decreases <= 0 {
        return rows;
    }

    // === 🎯 РАЗНАЯ ДЛИНА реглан-линии: перед короче из-за глубокой горловины ===
    // raglan_line_rows — это длина для переда (уже посчитана с учётом glg)
    let front_raglan_len = raglan.raglan_line_rows;

    // Для спинки: горловина мельче → реглан-линия длиннее
    let total_sleeve_increases = (raglan.start_raglan_stitches - dims.cuff_stitches()).max(0) / 2;
    let sleeve_cap_offset = if total_sleeve_increases > 0 {
        (total_sleeve_increases as f64 * 0.3).min(dims.top_stitches() as f64 * 0.15)
    } else {
        0.0
    };
    let back_raglan_len = front_raglan_len as f64 - sleeve_cap_offset;

    let available_rows = if is_front_side {
        front_raglan_len
    } else {
        back_raglan_len.round() as i32
    };

    // === Базовый паттерн: каждые 2 ряда ===
    let interval = 2;

    // === Генерируем ряды убавок ===
    for i in 0..total_decreases {
        let row = start_row + i * interval;
        // Включаем только если укладываемся в доступную длину реглан-линии
        if row <= start_row + available_rows {
            rows.push(row);
        }
    }

    rows
}
// === Убавки проймы (4 группы, формула технолога) ===
pub fn calculate_proyma_decreases(proyma_width: i32) -> Vec<DecreaseGroup> {
    let mut steps = Vec::new();
    let part1 = proyma_width / 4 + proyma_width % 4;
    let part2 = proyma_width / 4;
    let part3 = proyma_width / 4;
    let part4 = proyma_width / 4;

    if part1 > 0 {
        steps.push(DecreaseGroup {
            stitches: part1,
            every_n_rows: 1,
            repeat_count: 1,
        });
    }
    if part2 > 0 {
        let full = part2 / 3;
        let rem = part2 % 3;
        if full > 0 {
            steps.push(DecreaseGroup {
                stitches: 3,
                every_n_rows: 2,
                repeat_count: full,
            });
        }
        if rem > 0 {
            steps.push(DecreaseGroup {
                stitches: rem,
                every_n_rows: 2,
                repeat_count: 1,
            });
        }
    }
    if part3 > 0 {
        let full = part3 / 2;
        let rem = part3 % 2;
        if full > 0 {
            steps.push(DecreaseGroup {
                stitches: 2,
                every_n_rows: 2,
                repeat_count: full,
            });
        }
        if rem > 0 {
            if let Some(l) = steps.last_mut() {
                l.stitches += rem;
            }
        }
    }
    if part4 > 0 {
        let base = part4 / 5;
        let rem = part4 % 5;
        if base > 0 {
            steps.push(DecreaseGroup {
                stitches: base,
                every_n_rows: 4,
                repeat_count: 5,
            });
        }
        if rem > 0 {
            if let Some(l) = steps.last_mut() {
                l.stitches += rem;
            }
        }
    }
    steps
}

// === Убавки оката рукава (3 части, формула технолога) ===
pub fn calculate_sleeve_cap_decreases(widest: i32, cap_height: i32) -> Vec<DecreaseGroup> {
    let ease = (widest as f64 * 0.05).round() as i32;
    let widest_e = widest + ease;
    let mut steps = Vec::new();

    let third = widest_e / 3;
    let rem = widest_e % 3;
    let p1 = third + if rem > 0 { 1 } else { 0 };
    let p2 = third + if rem > 1 { 1 } else { 0 };
    let p3 = third;

    let h1 = p1 / 2;
    let h2 = p1 / 2 + p1 % 2;

    if h2 > 0 {
        let mut i = h2;
        let mut threes = Vec::new();
        while i >= 3 {
            threes.push(3);
            i -= 3;
        }
        if i > 0 {
            threes.push(i);
        }
        if threes.len() > 1 && threes.last().unwrap() < &3 {
            let v = threes.pop().unwrap();
            *threes.last_mut().unwrap() += v;
        }
        for st in threes {
            steps.push(DecreaseGroup {
                stitches: st,
                every_n_rows: 2,
                repeat_count: 1,
            });
        }
    }
    if h1 > 0 {
        let mut i = h1;
        let mut twos = Vec::new();
        while i >= 2 {
            twos.push(2);
            i -= 2;
        }
        if i > 0 {
            twos.push(i);
        }
        if twos.len() > 1 && twos.last().unwrap() < &2 {
            let v = twos.pop().unwrap();
            *twos.last_mut().unwrap() += v;
        }
        for st in twos {
            steps.push(DecreaseGroup {
                stitches: st,
                every_n_rows: 2,
                repeat_count: 1,
            });
        }
    }
    if p2 > 0 {
        let used: i32 = steps.iter().map(|s| s.every_n_rows * s.repeat_count).sum();
        let remaining = cap_height - used;
        let interval = if p2 > 0 && remaining > 0 {
            (remaining as f64 / p2 as f64).round().max(2.0) as i32
        } else {
            2
        };
        for _ in 0..p2 {
            steps.push(DecreaseGroup {
                stitches: 1,
                every_n_rows: interval,
                repeat_count: 1,
            });
        }
    }
    if p3 > 0 {
        let mut rem = 0;
        let mut p3 = p3;
        while p3 % 3 != 0 {
            p3 -= 1;
            rem += 1;
        }
        let mut i = p3;
        while i >= 3 {
            steps.push(DecreaseGroup {
                stitches: 3,
                every_n_rows: 4,
                repeat_count: 1,
            });
            i -= 3;
        }
        if rem > 0 {
            if let Some(l) = steps.last_mut() {
                l.stitches += rem;
            }
        }
    }
    steps
}

// === Скос плеча ===
pub fn calculate_shoulder_decreases(
    shoulder_slope_height: f64,
    shoulder_len_stitches: f64,
) -> Vec<DecreaseGroup> {
    let shoulder_decreases_times = (shoulder_slope_height / 2.0).round() as i32;
    let mut steps = Vec::new();
    if shoulder_decreases_times <= 0 {
        return steps;
    }

    let mut decreases_count_stitches = shoulder_len_stitches / shoulder_decreases_times as f64;
    if decreases_count_stitches >= 0.5 {
        decreases_count_stitches += 1.0;
    } else {
        decreases_count_stitches -= 1.0;
    }
    let count_round = decreases_count_stitches.round() as i32;

    let mut divisions = vec![count_round; shoulder_decreases_times as usize];
    if (shoulder_len_stitches.round() as i32) % shoulder_decreases_times > 0 {
        if let Some(last) = divisions.last_mut() {
            *last += 1;
        }
    }
    for i in divisions {
        steps.push(DecreaseGroup {
            stitches: i,
            every_n_rows: 2,
            repeat_count: 1,
        });
    }
    steps
}

// === Конвертация (rows, counts) → Vec<DecreaseGroup> ===
fn rows_counts_to_groups(rows: &[i32], counts: &[i32]) -> Vec<DecreaseGroup> {
    if rows.len() != counts.len() || rows.is_empty() {
        return vec![];
    }

    let mut groups = Vec::new();
    let mut current_group = DecreaseGroup {
        stitches: counts[0],
        every_n_rows: rows[0],
        repeat_count: 1,
    };

    for i in 1..rows.len() {
        let interval = rows[i] - rows[i - 1];
        if interval == current_group.every_n_rows && counts[i] == current_group.stitches {
            // Та же группа - увеличиваем повтор
            current_group.repeat_count += 1;
        } else {
            // Новая группа - сохраняем текущую и создаём новую
            groups.push(current_group.clone());
            current_group = DecreaseGroup {
                stitches: counts[i],
                every_n_rows: interval,
                repeat_count: 1,
            };
        }
    }
    // Добавляем последнюю группу
    groups.push(current_group);

    groups
}

// === Горловина (U-образная) — формула технолога ===
pub fn calculate_neckline_decreases(
    half_neck_width_stitches: i32,
    neck_height_rows: i32,
) -> (Vec<i32>, Vec<i32>) {
    let mut steps: Vec<DecreaseGroup> = Vec::new();

    // Делим на 4 части
    let part4 = half_neck_width_stitches / 4 + half_neck_width_stitches % 4;
    let part2 = half_neck_width_stitches / 4;
    let part3 = half_neck_width_stitches / 4;
    let part1 = half_neck_width_stitches / 4;

    // 1-я группа: закрываем всё за 1 ряд (подрез)
    if part1 > 0 {
        steps.push(DecreaseGroup {
            stitches: part1,
            every_n_rows: 1,
            repeat_count: 1,
        });
    }
    if part2 > 0 {
        let twos = part2 / 2;
        let rem = part2 % 2;
        if twos > 0 {
            steps.push(DecreaseGroup {
                stitches: twos,
                every_n_rows: 2,
                repeat_count: 2,
            });
        }
        if rem > 0 {
            steps.push(DecreaseGroup {
                stitches: rem,
                every_n_rows: 2,
                repeat_count: 1,
            });
        }
    }
    // 2-я группа: делим на тройки, каждые 2 ряда
    if part3 > 0 {
        let full_threes = part3 / 3;
        let rem = part3 % 3;
        if full_threes > 0 {
            steps.push(DecreaseGroup {
                stitches: full_threes,
                every_n_rows: 2,
                repeat_count: 3,
            });
        }
        if rem > 0 {
            steps.push(DecreaseGroup {
                stitches: rem,
                every_n_rows: 2,
                repeat_count: 1,
            });
        }
    }

    if part4 > 0 {
        let fors = part4 / 4;
        if fors > 0 {
            steps.push(DecreaseGroup {
                stitches: fors,
                every_n_rows: 2,
                repeat_count: 4,
            });
        }
    }

    // Конвертируем DecreaseGroup → (rows, counts)
    let mut rows = Vec::new();
    let mut counts = Vec::new();
    let mut current_row = 0;

    for group in &steps {
        for _ in 0..group.repeat_count {
            current_row += group.every_n_rows;
            rows.push(current_row);
            counts.push(group.stitches);
        }
    }

    let rem = (neck_height_rows - half_neck_width_stitches).max(0);

    (rows, counts)
}

// === ТАЛИЯ: распределение убавок/прибавок по рядам ===

/// Распределяет `total_decreases` убавок по `available_rows` рядам
/// с минимальным интервалом `min_interval` между ними.
fn distribute_decreases_with_interval(
    available_rows: i32,
    total_decreases: i32,
    min_interval: i32,
) -> Vec<i32> {
    if total_decreases <= 0 || available_rows < min_interval * total_decreases {
        return vec![min_interval; total_decreases.max(0) as usize];
    }

    let remaining_rows = available_rows - min_interval * total_decreases;
    let extra_per_step = remaining_rows / total_decreases;
    let remainder = remaining_rows % total_decreases;

    let mut intervals = Vec::with_capacity(total_decreases as usize);
    for i in 0..total_decreases {
        let interval = min_interval + extra_per_step + if i < remainder { 1 } else { 0 };
        intervals.push(interval);
    }

    intervals
}

/// Убавки от бёдер до талии
fn calculate_waist_decreases(hip: f64, waist: f64, gauge: f64, rows: i32) -> Vec<DecreaseStep> {
    let hip_st = (hip * gauge).round() as i32;
    let waist_st = (waist * gauge).round() as i32;

    // Убавки с КАЖДОЙ стороны (половина разницы)
    let desired_decreases = (hip_st - waist_st).max(0) / 2;
    if desired_decreases <= 0 {
        return vec![];
    }

    let min_interval = 3;
    let max_possible_decreases = rows / min_interval;
    let total_decreases = desired_decreases.min(max_possible_decreases);

    if total_decreases <= 0 {
        return vec![];
    }

    let intervals = distribute_decreases_with_interval(rows, total_decreases, min_interval);

    intervals
        .into_iter()
        .map(|interval| DecreaseStep {
            stitches: 1,
            row_delta: interval,
        })
        .collect()
}

/// Прибавки от талии до груди
fn calculate_waist_increases(waist: f64, chest: f64, gauge: f64, rows: i32) -> Vec<DecreaseStep> {
    let waist_st = (waist * gauge).round() as i32;
    let chest_st = (chest * gauge).round() as i32;

    // Прибавки с КАЖДОЙ стороны
    let desired_increases = (chest_st - waist_st).max(0) / 2;
    if desired_increases <= 0 {
        return vec![];
    }

    let min_interval = 3;
    let max_possible_increases = rows / min_interval;
    let total_increases = desired_increases.min(max_possible_increases);

    if total_increases <= 0 {
        return vec![];
    }

    let intervals = distribute_decreases_with_interval(rows, total_increases, min_interval);

    intervals
        .into_iter()
        .map(|interval| DecreaseStep {
            stitches: 1,
            row_delta: interval,
        })
        .collect()
}
