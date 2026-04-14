use super::types::*;

/// Trait for a garment part that can calculate its dimensions and nodes
pub trait GarmentPart {
    fn width_at_row(&self, row: i32, total_rows: i32) -> i32;
    fn generate_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &dyn Calculation,
        part_code: &str,
        cx: f64,
        hem_y: f64,
    ) -> Vec<BlueprintNodePosition>;
}

/// Trait for sleeve type calculations
pub trait SleeveType: Send + Sync {
    fn sleeve_type_id(&self) -> &str;

    fn calculate_sleeve(&self, m: &ProjectMeasurements, dec_shoulder_st: i32) -> SleeveDimensions;
    
    fn generate_left_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &dyn Calculation,
        dims: &SleeveDimensions,  // принимаем энум
        cx: f64,
    ) -> Vec<BlueprintNodePosition>;
    
    fn generate_right_nodes(
        &self,
        m: &ProjectMeasurements,
        calc: &dyn Calculation,
        dims: &SleeveDimensions,
        cx: f64,
    ) -> Vec<BlueprintNodePosition>;

    fn front_decrease_rows(&self, calc: &dyn Calculation) -> Vec<i32>;
    fn back_decrease_rows(&self, calc: &dyn Calculation) -> Vec<i32>;

    // === НОВЫЕ МЕТОДЫ ДЛЯ ВТАЧНОГО РУКАВА ===
    fn armhole_decreases(&self) -> Vec<DecreaseGroup> { vec![] }
    fn sleeve_cap_decreases(&self) -> Vec<DecreaseGroup> { vec![] }
    fn shoulder_decreases(&self) -> Vec<DecreaseGroup> { vec![] }
    fn neck_decreases_back(&self, m: &ProjectMeasurements) -> (Vec<DecreaseGroup>, i32) { (vec![], 0) }
    fn neck_decreases_front(&self, m: &ProjectMeasurements) -> (Vec<DecreaseGroup>, i32) { (vec![], 0) }

    // Промежуточные расчеты технолога
    fn proyma_info(&self) -> (i32, i32, i32, i32) { (0, 0, 0, 0) } // cap_height, proyma_h, hem_half, after_proyma
}

/// Common trait for both Raglan and Set-In calculations
pub trait Calculation {
    /// Get all nodes (for SVG rendering)
    fn nodes(&self) -> &Vec<BlueprintNodePosition>;
    
    /// Get mutable reference to nodes
    fn nodes_mut(&mut self) -> &mut Vec<BlueprintNodePosition>;
    
    /// Get viewbox width
    fn viewbox_width(&self) -> i32;
    
    /// Get viewbox height
    fn viewbox_height(&self) -> i32;
    
    /// Get neck width in stitches
    fn neck_width_stitches(&self) -> i32;
    
    /// Get neck depth in rows
    fn neck_depth_rows(&self) -> i32;
    
    /// Get sleeve cuff width in stitches
    fn sleeve_cuff_stitches(&self) -> i32;
    
    /// Get sleeve top/widest width in stitches
    fn sleeve_top_stitches(&self) -> i32;
    
    /// Get total garment rows
    fn total_rows(&self) -> i32;
    
    /// Downcast to RaglanCalculation (returns None if SetIn)
    fn as_raglan(&self) -> Option<&RaglanCalculation> { None }
    
    /// Downcast to SetInSleeveCalculation (returns None if Raglan)
    fn as_set_in(&self) -> Option<&SetInSleeveCalculation> { None }
}




