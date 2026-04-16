use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use super::traits::Calculation;

/// One group of decreases (используется в втачном рукаве и горловине)
#[derive(Debug, Serialize, Deserialize, Clone, Default, FromRow)]
pub struct DecreaseGroup {
    pub stitches: i32,
    pub every_n_rows: i32,
    pub repeat_count: i32,
}

/// One step of waist decrease/increase: "decrease N stitches after M rows"
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DecreaseStep {
    pub stitches: i32,
    pub row_delta: i32,
}

/// Measurement set for ALL calculations (Raglan & Set-In)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMeasurements {
    pub og: f64,                     // обхват груди (см)
    pub dr: f64,                     // длина рукава (см)
    pub oz: f64,                     // обхват запястья (см)
    #[serde(rename = "or")]
    pub or_val: f64,                 // обхват руки (см)
    pub di: f64,                     // длина изделия (см)
    pub glg: f64,                    // глубина горловины (см)
    pub oh: f64,                     // обхват головы (= шея в формулах)
    pub ease: f64,                   // прибавка на свободу (см)
    pub gauge_stitches_per_cm: f64,  // плотность: петель в 1 см
    pub gauge_rows_per_cm: f64,      // плотность: рядов в 1 см
    
    // === Новые мерки для Втачного рукава ===
    #[serde(default = "default_shoulder_height")]
    pub shoulder_height: f64,        // высота плеча (см), обычно 5-6
    #[serde(default = "default_shoulder_length")]
    pub shoulder_length: f64,        // длина плеча (см)

    // === Мерки для приталенного силуэта ===
    #[serde(default = "default_waist_circ")]
    pub waist_circumference: f64,    // обхват талии (см)
    #[serde(default = "default_hip_circ")]
    pub hip_circumference: f64,      // обхват бёдер (см)
    #[serde(default = "default_back_len")]
    pub back_len: f64,               // длина до талии по спинке (см)
    #[serde(default = "default_hip_len")]
    pub hip_len: f64,                // длина до линии бёдер (см)
}

fn default_shoulder_height() -> f64 { 5.5 }
fn default_shoulder_length() -> f64 { 13.0 }
fn default_waist_circ() -> f64 { 70.0 }
fn default_hip_circ() -> f64 { 100.0 }
fn default_back_len() -> f64 { 40.0 }
fn default_hip_len() -> f64 { 20.0 }

/// Full calculation result (RAGLAN)
#[derive(Debug, Serialize, Deserialize)]
pub struct RaglanCalculation {
    // === ОСНОВНЫЕ РАЗМЕРЫ ===
    pub back_width_stitches: i32,
    pub front_width_stitches: i32,
    pub neck_width_stitches: i32,
    pub sleeve_top_stitches: i32,
    pub sleeve_cuff_stitches: i32,
    pub total_rows: i32,
    pub raglan_start_row_front: i32,
    pub raglan_start_row_back: i32,
    pub raglan_end_row: i32,
    pub sleeve_height_rows: i32,
    pub sleeve_increase_rows: Vec<i32>,
    pub total_decreases: i32,
    pub neck_decrease_counts: Vec<i32>,
    pub neck_decrease_rows: Vec<i32>,
    pub decrease_shoulder_cuts: i32,
    pub viewbox_width: i32,
    pub viewbox_height: i32,
    pub sleeve_shoulder_cut_rows: i32,
    pub sleeve_slope_start_x: f64,
    pub sleeve_slope_end_x: f64,
    pub sleeve_cap_offset: f64,
    pub sleeve_width_stitches: f64,
    pub back_decrease_rows: Vec<i32>,
    pub back_decrease_counts: Vec<i32>,
    pub front_decrease_rows: Vec<i32>,
    pub front_decrease_counts: Vec<i32>,
    pub neck_depth_rows: i32,
    pub nodes: Vec<BlueprintNodePosition>,
    pub sleeve_raglan_rows_back: Vec<i32>,
    pub sleeve_raglan_rows_front: Vec<i32>,
    pub neck_rem: f64,
    pub blueprint_stitch_data: Vec<BlueprintCoord>,  // x в петлях
    pub blueprint_row_data: Vec<BlueprintCoord>,     // y в рядах
}

// 🔹 Вспомогательная структура для координат
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlueprintCoord {
    pub node_name: String,
    pub part_code: String,
    pub value: f64,  // петли (для stitch) или ряды (для row)
}

impl Calculation for RaglanCalculation {
    fn nodes(&self) -> &Vec<BlueprintNodePosition> { &self.nodes }
    fn nodes_mut(&mut self) -> &mut Vec<BlueprintNodePosition> { &mut self.nodes }
    fn viewbox_width(&self) -> i32 { self.viewbox_width }
    fn viewbox_height(&self) -> i32 { self.viewbox_height }
    fn neck_width_stitches(&self) -> i32 { self.neck_width_stitches }
    fn neck_depth_rows(&self) -> i32 { self.neck_depth_rows }
    fn sleeve_cuff_stitches(&self) -> i32 { self.sleeve_cuff_stitches }
    fn sleeve_top_stitches(&self) -> i32 { self.sleeve_top_stitches }
    fn total_rows(&self) -> i32 { self.total_rows }
    fn as_raglan(&self) -> Option<&RaglanCalculation> { Some(self) }
    fn blueprint_stitch_data(&self) -> &Vec<BlueprintCoord> {
        &self.blueprint_stitch_data
    }
    fn blueprint_row_data(&self) -> &Vec<BlueprintCoord> {
        &self.blueprint_row_data
    }
    
}

/// Full calculation result (SET-IN SLEEVE)
#[derive(Debug, Serialize, Deserialize)]
pub struct SetInSleeveCalculation {
    // === ТЕЛО (Ширина/Высота) ===
    pub hem_width_stitches: i32,       // Низ изделия
    pub underarm_width_stitches: i32,  // Подмышка (после убавок проймы)
    pub armhole_height_rows: i32,      // Высота проймы
    pub total_garment_rows: i32,       // Общая высота изделия
    pub viewbox_width: i32,
    pub viewbox_height: i32,
    pub nodes: Vec<BlueprintNodePosition>,

    // === ПРОЙМА (Убавки) ===
    pub armhole_decreases: Vec<DecreaseGroup>, // 4 группы убавок проймы

    // === ГОРЛОВИНА ===
    pub neck_width_stitches: i32,
    pub neck_depth_rows: i32,
    pub neck_decreases_rows_back: Vec<DecreaseGroup>, // Убавки горловины спинки
    pub neck_decreases_rows_front: Vec<DecreaseGroup>, // Убавки горловины переда
    pub rem_back: i32,
    pub rem_front: i32,

    // === ПЛЕЧО ===
    pub shoulder_slope_height_rows: i32,   // Высота скоса плеча в рядах
    pub start_shoulder_slope_row: i32,     // Ряд начала скоса плеча
    pub shoulder_decrease_stitches: i32,   // Петли на убавку
    pub shoulder_decrease_times: i32,      // Кол-во раз
    pub shoulder_decreases: Vec<DecreaseGroup>,

    // === РУКАВ ===
    pub sleeve_cuff_stitches: i32,         // Манжета
    pub sleeve_widest_stitches: i32,       // Самая широщая часть (подмышка)
    pub sleeve_cap_height_rows: i32,       // Высота оката
    pub sleeve_cap_decreases: Vec<DecreaseGroup>, // Убавки оката
    pub sleeve_body_rows: i32,             // Длина рукава до оката

    // === ТАЛИЯ (приталенный силуэт) ===
    pub waist_decreases: Vec<DecreaseStep>,  // Убавки от бёдер до талии
    pub waist_increases: Vec<DecreaseStep>,  // Прибавки от талии до груди
    pub waist_start_row: i32,                // Ряд начала убавок (от подола)
    pub waist_end_row: i32,                  // Ряд конца убавок (талия)
    pub waist_point_row: i32,                // Ряд линии талии

    pub blueprint_stitch_data: Vec<BlueprintCoord>,  // x в петлях
    pub blueprint_row_data: Vec<BlueprintCoord>,     // y в рядах
}

impl Calculation for SetInSleeveCalculation {
    fn nodes(&self) -> &Vec<BlueprintNodePosition> { &self.nodes }
    fn nodes_mut(&mut self) -> &mut Vec<BlueprintNodePosition> { &mut self.nodes }
    fn viewbox_width(&self) -> i32 { self.viewbox_width }
    fn viewbox_height(&self) -> i32 { self.viewbox_height }
    fn neck_width_stitches(&self) -> i32 { self.neck_width_stitches }
    fn neck_depth_rows(&self) -> i32 { self.neck_depth_rows }
    fn sleeve_cuff_stitches(&self) -> i32 { self.sleeve_cuff_stitches }
    fn sleeve_top_stitches(&self) -> i32 { self.sleeve_widest_stitches }
    fn total_rows(&self) -> i32 { self.total_garment_rows }
    fn as_set_in(&self) -> Option<&SetInSleeveCalculation> { Some(self) }
    
    fn blueprint_stitch_data(&self) -> &Vec<BlueprintCoord> {
        &self.blueprint_stitch_data
    }
    
    fn blueprint_row_data(&self) -> &Vec<BlueprintCoord> {
        &self.blueprint_row_data
    }
}

/// Unified calculation result (either Raglan or Set-In)
#[derive(Debug, Serialize, Deserialize)]
pub enum BlueprintCalculation {
    Raglan(RaglanCalculation),
    SetIn(SetInSleeveCalculation),
}

/// Request for saving a blueprint measurement
#[derive(Debug, Deserialize)]
pub struct SaveBlueprintMeasurementRequest {
    pub project_id: i64,
    pub measurement_code: String,
    pub value: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
}

/// Saved measurement row
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintMeasurement {
    pub id: i64,
    pub project_id: i64,
    pub measurement_code: String,
    pub value: f64,
    pub unit: String,
    pub is_default: i64,
    pub note: Option<String>,
}

/// Pattern info for blueprint brush
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct PatternInfo {
    pub id: i64,
    pub name: String,
    pub pattern_type: String,
    pub width: i64,
    pub height: i64,
    pub pattern_data: String,
    pub category: Option<String>,
}

/// Blueprint template
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintTemplate {
    pub id: i64,
    pub garment_type_id: i64,
    pub name: String,
    pub part_code: String,
    pub svg_template: Option<String>,
    pub description: Option<String>,
}

/// Blueprint node
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintNode {
    pub id: i64,
    pub blueprint_id: i64,
    pub node_name: String,
    pub x: f64,
    pub y: f64,
    pub part_code: String,
    pub constraint_type: Option<String>,
    pub constraint_value: Option<f64>,
    pub was_manually_moved: bool,
}

/// Request for saving blueprint nodes
#[derive(Debug, Serialize, Deserialize)]
pub struct SaveBlueprintNodesRequest {
    pub blueprint_id: i64,
    pub nodes: Vec<BlueprintNodePosition>,
}

/// Request for saving a pattern stamp
#[derive(Debug, Serialize, Deserialize)]
pub struct SaveBlueprintPatternStampRequest {
    pub project_id: i64,
    pub part_code: String,
    pub pattern_id: Option<i64>,
    pub position_x: f64,
    pub position_y: f64,
    pub width: i32,
    pub height: i32,
    pub pattern_data: Option<String>,
}

/// Saved pattern stamp
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintPatternStamp {
    pub id: i64,
    pub project_id: i64,
    pub part_code: String,
    pub pattern_id: Option<i64>,
    pub position_x: f64,
    pub position_y: f64,
    pub width: i32,
    pub height: i32,
    pub pattern_data: Option<String>,
    pub custom_color: Option<String>,
    pub is_selected: bool,
    pub z_order: i32,
}

/// Knitting settings for blueprint
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BlueprintKnittingSettings {
    pub id: i64,
    pub project_id: i64,
    pub boundary_mode: String,
    pub empty_row_mode: String,
    pub auto_calculate_nodes: bool,
}

#[derive(Debug, Clone, Default)]
pub struct BaseSleeveDimensions {
    pub cuff_stitches: i32,        // манжета
    pub middle_stitches: i32,      // самая широкая часть (подмышка)
    pub height_rows: i32,          // полная длина
    pub increase_rows: Vec<i32>,   // ряды прибавок до widest

}


#[derive(Debug, Clone)]
pub struct RaglanSleeveDimensions {
    pub base: BaseSleeveDimensions,
    // === Реглан-специфичное ===
    pub top_stitches: i32,              // ширина у горловины
    pub shoulder_cut_rows: i32,         // где начинаются убавки плеча
    pub cap_offset: f64,                // микро-наклон оката
    pub slope_start_x: f64,
    pub slope_end_x: f64,
    pub raglan_line_rows: i32,          // длина реглан-линии в рядах
    pub cuff_stitches: i32,
    pub start_raglan_stitches: i32,
    pub decrease_shoulders_stitches: i32,
}


#[derive(Debug, Clone)]
pub struct SetInSleeveDimensions {
    pub base: BaseSleeveDimensions,
    // === Втачной-специфичное ===
    pub armhole_depth_rows: i32,        // глубина проймы
    pub cap_height_rows: i32,           // высота оката
    pub cap_curve: Vec<(i32, i32)>,     // (row, decrease_count) для формы оката
    pub ease_at_cap: f64,               // посадка по окату

}

#[derive(Debug, Clone)]
pub enum SleeveDimensions {
    Raglan(RaglanSleeveDimensions),
    SetIn(SetInSleeveDimensions),
}

// Удобные геттеры для общих полей
impl SleeveDimensions {
    pub fn base(&self) -> &BaseSleeveDimensions {
        match self {
            Self::Raglan(r) => &r.base,
            Self::SetIn(s) => &s.base,
        }
    }
    
    pub fn cuff_stitches(&self) -> i32 { self.base().cuff_stitches }
    pub fn middle_stitches(&self) -> i32 { self.base().middle_stitches }
    pub fn height_rows(&self) -> i32 { self.base().height_rows }
    pub fn increase_rows(&self) -> &Vec<i32> { &self.base().increase_rows }
     pub fn as_raglan(&self) -> Option<&RaglanSleeveDimensions> {
        if let Self::Raglan(r) = self { Some(r) } else { None }
    }
    
    pub fn as_set_in(&self) -> Option<&SetInSleeveDimensions> {
        if let Self::SetIn(s) = self { Some(s) } else { None }
    }
    // Геттеры с дефолтами для специфичных полей (чтобы не матчить каждый раз)
    pub fn top_stitches(&self) -> i32 {
        match self {
            Self::Raglan(r) => r.top_stitches,
            Self::SetIn(s) => s.base.middle_stitches, // для втачного "топ" = widest
        }
    }
    pub fn shoulder_cut_rows(&self) -> i32 {
        match self {
            Self::Raglan(r) => r.shoulder_cut_rows,
            Self::SetIn(s) => s.armhole_depth_rows,
        }
    }
    pub fn cap_offset(&self) -> f64 {
        match self {
            Self::Raglan(r) => r.cap_offset,
            Self::SetIn(s) => s.ease_at_cap * 10.0, // условный маппинг
        }
    }
}

impl RaglanSleeveDimensions{
    pub fn slope_start_x(&self) -> f64 {self.slope_start_x}
    pub fn slope_end_x(&self) -> f64 {self.slope_end_x}
}