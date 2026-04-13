use super::types::*;

/// Trait for a garment part that can calculate its dimensions and nodes
pub trait GarmentPart {
    fn width_at_row(&self, row: i32, total_rows: i32) -> i32;
    fn generate_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &RaglanCalculation,
        part_code: &str,
        cx: f64,
        hem_y: f64,
    ) -> Vec<BlueprintNodePosition>;
}

/// Trait for sleeve type calculations
pub trait SleeveType: Send + Sync {
    fn sleeve_type_id(&self) -> &str;

    fn calculate_sleeve(
        &self,
        m: &ProjectMeasurements,
        dec_shoulder_st: i32,
    ) -> SleeveDimensions;

    fn generate_left_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &RaglanCalculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition>;

    fn generate_right_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &RaglanCalculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition>;

    fn front_decrease_rows(&self, calc: &RaglanCalculation) -> Vec<i32>;
    fn back_decrease_rows(&self, calc: &RaglanCalculation) -> Vec<i32>;

    // === НОВЫЕ МЕТОДЫ ДЛЯ ВТАЧНОГО РУКАВА ===
    fn armhole_decreases(&self) -> Vec<DecreaseGroup> { vec![] }
    fn sleeve_cap_decreases(&self) -> Vec<DecreaseGroup> { vec![] }
    fn shoulder_decreases(&self) -> Vec<DecreaseGroup> { vec![] }
    fn neck_decreases_back(&self, m: &ProjectMeasurements) -> (Vec<DecreaseGroup>, i32) { (vec![], 0) }
    fn neck_decreases_front(&self, m: &ProjectMeasurements) -> (Vec<DecreaseGroup>, i32) { (vec![], 0) }

    // Промежуточные расчеты технолога
    fn proyma_info(&self) -> (i32, i32, i32, i32) { (0, 0, 0, 0) } // cap_height, proyma_h, hem_half, after_proyma
}

/// Sleeve dimensions calculated from measurements
#[derive(Debug, Clone, Default)]
pub struct SleeveDimensions {
    pub cuff_stitches: i32,
    pub top_stitches: i32,
    pub height_rows: i32,
    pub shoulder_cut_rows: i32,
    pub increase_rows: Vec<i32>,
    pub cap_offset: f64,
    pub slope_start_x: f64,
    pub slope_end_x: f64,
}
