use tauri::command;
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, FromRow};

// Исходная структура (для внутренней логики, если нужна)
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct GarmentType {
    pub id: i64,
    pub category_id: i64,
    pub name: String,
    pub base_measurements: String,
    pub included_parts: String,
    pub default_config: Option<String>,
    pub construction_formulas: Option<String>,
}

// ✅ Новая структура для ответа с данными категории
#[derive(Debug, Serialize, FromRow)]
pub struct GarmentTypeWithCategory {
    pub id: i64,
    pub category_id: i64,
    
    // Поля из garment_types (используем aliases в запросе)
    #[sqlx(rename = "type_name")]
    pub name: String,
    
    pub base_measurements: String,
    pub included_parts: String,
    pub default_config: Option<String>,
    pub construction_formulas: Option<String>,
    
    // ✅ Поля из garment_categories
    #[sqlx(rename = "category_name")]
    pub category_name: String,
    
    #[sqlx(rename = "category_description")]
    pub category_description: Option<String>,
    
    #[sqlx(rename = "body_region")]
    pub body_region: String,
    
    #[sqlx(rename = "default_unit")]
    pub default_unit: String,
}

#[command]
pub async fn get_garment_types(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<GarmentTypeWithCategory>, String> {
    sqlx::query_as::<_, GarmentTypeWithCategory>(
        r#"
        SELECT 
            gt.id,
            gt.category_id,
            gt.name AS type_name,
            gt.base_measurements,
            gt.included_parts,
            gt.default_config,
            gt.construction_formulas,
            gc.name AS category_name,
            gc.description AS category_description,
            gc.body_region,
            gc.default_unit
        FROM garment_types gt
        INNER JOIN garment_categories gc ON gt.category_id = gc.id
        ORDER BY gc.name, gt.name
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch garment types: {}", e))
}