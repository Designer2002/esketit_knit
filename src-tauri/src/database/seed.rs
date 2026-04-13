//! Seed data for blueprint templates and nodes (raglan pattern)
//! Called after migrations complete.

use sqlx::SqlitePool;

const SVG_BACK: &str = r##"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_width} {viewbox_height}">
  <path d="M {back_left_hem_x} {back_left_hem_y}
           L {back_left_underarm_x} {back_left_underarm_y}
           L {back_left_raglan_x} {back_left_raglan_y}
           L {back_left_shoulder_x} {back_left_shoulder_y}
           L {back_neck_left_x} {back_neck_left_y}
           Q {back_neck_center_x} {back_neck_center_y} {back_neck_right_x} {back_neck_right_y}
           L {back_right_shoulder_x} {back_right_shoulder_y}
           L {back_right_raglan_x} {back_right_raglan_y}
           L {back_right_underarm_x} {back_right_underarm_y}
           L {back_right_hem_x} {back_right_hem_y}
           Z"
        fill="none" stroke="#2196F3" stroke-width="2"/>
</svg>"##;

const SVG_FRONT: &str = r##"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_width} {viewbox_height}">
  <path d="M {front_left_hem_x} {front_left_hem_y}
           L {front_left_underarm_x} {front_left_underarm_y}
           L {front_left_raglan_x} {front_left_raglan_y}
           L {front_left_shoulder_x} {front_left_shoulder_y}
           L {front_neck_left_x} {front_neck_left_y}
           Q {front_neck_center_x} {front_neck_center_y} {front_neck_right_x} {front_neck_right_y}
           L {front_neck_right_x} {front_neck_right_y}
           L {front_right_shoulder_x} {front_right_shoulder_y}
           L {front_right_raglan_x} {front_right_raglan_y}
           L {front_right_underarm_x} {front_right_underarm_y}
           L {front_right_hem_x} {front_right_hem_y}
           Z"
        fill="none" stroke="#2196F3" stroke-width="2"/>
</svg>"##;

const SVG_SLEEVE: &str = r##"<?xml version="1.0" encoding="UTF-8"?> 
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_width} {viewbox_height}"> 
  <path d="M {cuff_l_x} {cuff_l_y} 
           L {underarm_l_x} {underarm_l_y} 
           L {underarm_l_inner_x} {underarm_l_y} 
           L {top_l_x} {top_l_y} 
           L {top_r_x} {top_r_y} 
           L {underarm_r_inner_x} {underarm_r_y} 
           L {underarm_r_x} {underarm_r_y} 
           L {cuff_r_x} {cuff_r_y} 
           Z" 
       fill="none" stroke="#2196F3" stroke-width="2"/> 
</svg>"##;

pub async fn seed_blueprints(pool: &SqlitePool) -> Result<(), String> {
    // Список всех типов, для которых нужны выкройки
    let types_to_seed = vec![
        "Реглан прямой силуэт",
        "Втачной рукав прямой силуэт",
        "Реглан приталенный",
        "Втачной приталенный",
    ];

    for type_name in types_to_seed {
        let type_id: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM garment_types WHERE name = ? LIMIT 1"
        )
        .bind(type_name)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to find garment type '{}': {}", type_name, e))?;

        if let Some(type_id) = type_id {
            // Определяем префикс для названий
            let prefix = if type_name.contains("Втачной") { "Втачной" } else { "Реглан" };
            let fit = if type_name.contains("приталенный") { "притал." } else { "прямой" };
            
            // Создаем чертежи
            seed_blueprint_for_type(pool, type_id, &format!("Спинка {} ({})", prefix, fit), "back", SVG_BACK, &format!("Спинка ({}, {})", prefix, fit)).await?;
            seed_blueprint_for_type(pool, type_id, &format!("Перед {} ({})", prefix, fit), "front", SVG_FRONT, &format!("Перед ({}, {})", prefix, fit)).await?;
            seed_blueprint_for_type(pool, type_id, &format!("Рукав {} ({})", prefix, fit), "sleeve", SVG_SLEEVE, &format!("Рукав ({}, {})", prefix, fit)).await?;
        }
    }

    Ok(())
}

async fn seed_blueprint_for_type(
    pool: &SqlitePool,
    garment_type_id: i64,
    name: &str,
    part_code: &str,
    svg: &str,
    desc: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR IGNORE INTO blueprints (garment_type_id, name, part_code, svg_template, description) VALUES (?, ?, ?, ?, ?)"
    ).bind(garment_type_id).bind(name).bind(part_code).bind(svg).bind(desc)
    .execute(pool).await.map_err(|e| format!("Seed blueprint '{}': {}", name, e))?;
    Ok(())
}

// Node seeding — done per garment type
async fn seed_nodes_for_type(
    pool: &SqlitePool,
    garment_type_id: i64,
    part_code: &str,
    nodes: &[(&str, f64, f64, i64, i64, &str, &str)],
) -> Result<(), String> {
    let bp_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM blueprints WHERE garment_type_id = ? AND part_code = ?"
    ).bind(garment_type_id).bind(part_code)
    .fetch_optional(pool).await.map_err(|e| format!("Find blueprint: {}", e))?;

    let bp_id = match bp_id {
        Some(id) => id,
        None => return Ok(()),
    };

    for (name, x, y, m, r, tip, cfg) in nodes {
        sqlx::query(
            "INSERT OR IGNORE INTO blueprint_nodes (blueprint_id, node_name, x, y, is_movable, is_required, tooltip, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(bp_id).bind(*name).bind(*x).bind(*y).bind(*m).bind(*r).bind(*tip).bind(*cfg)
        .execute(pool).await.map_err(|e| format!("Node {} for {}: {}", name, part_code, e))?;
    }
    Ok(())
}

pub async fn seed_nodes(pool: &SqlitePool) -> Result<(), String> {
    // Common nodes for both types
    let back_nodes: &[(&str, f64, f64, i64, i64, &str, &str)] = &[
        ("back_left_hem", 0.0, 0.0, 0, 1, "Левый нижний угол спинки", r#"{"constraint":"fixed_x"}"#),
        ("back_right_hem", 0.0, 0.0, 0, 1, "Правый нижний угол спинки", r#"{"constraint":"auto"}"#),
        ("back_left_underarm", 0.0, 0.0, 0, 1, "Левая подмышка спинки", r#"{"constraint":"vertical"}"#),
        ("back_right_underarm", 0.0, 0.0, 0, 1, "Правая подмышка спинки", r#"{"constraint":"auto"}"#),
        ("back_left_shoulder", 0.0, 0.0, 1, 1, "Левое плечо (конец реглана)", r#"{"constraint":"shoulder_point"}"#),
        ("back_right_shoulder", 0.0, 0.0, 1, 1, "Правое плечо (конец реглана)", r#"{"constraint":"shoulder_point"}"#),
        ("back_left_raglan", 0.0, 0.0, 1, 1, "Начало реглана слева (спинка)", r#"{"constraint":"raglan_line"}"#),
        ("back_right_raglan", 0.0, 0.0, 1, 1, "Начало реглана справа (спинка)", r#"{"constraint":"raglan_line"}"#),
        ("back_neck_left", 0.0, 0.0, 1, 1, "Левая точка горловины (спинка)", r#"{"constraint":"neck_line"}"#),
        ("back_neck_right", 0.0, 0.0, 1, 1, "Правая точка горловины (спинка)", r#"{"constraint":"neck_line"}"#),
        ("back_neck_center", 0.0, 0.0, 1, 0, "Центр горловины (спинка) - кривая", r#"{"constraint":"curve_control"}"#),
    ];

    let front_nodes: &[(&str, f64, f64, i64, i64, &str, &str)] = &[
        ("front_left_hem", 0.0, 0.0, 0, 1, "Левый нижний угол переда", r#"{"constraint":"fixed_x"}"#),
        ("front_right_hem", 0.0, 0.0, 0, 1, "Правый нижний угол переда", r#"{"constraint":"auto"}"#),
        ("front_left_underarm", 0.0, 0.0, 0, 1, "Левая подмышка переда", r#"{"constraint":"vertical"}"#),
        ("front_right_underarm", 0.0, 0.0, 0, 1, "Правая подмышка переда", r#"{"constraint":"auto"}"#),
        ("front_left_shoulder", 0.0, 0.0, 1, 1, "Левое плечо (конец реглана)", r#"{"constraint":"shoulder_point"}"#),
        ("front_right_shoulder", 0.0, 0.0, 1, 1, "Правое плечо (конец реглана)", r#"{"constraint":"shoulder_point"}"#),
        ("front_left_raglan", 0.0, 0.0, 1, 1, "Начало реглана слева (перед)", r#"{"constraint":"raglan_line"}"#),
        ("front_right_raglan", 0.0, 0.0, 1, 1, "Начало реглана справа (перед)", r#"{"constraint":"raglan_line"}"#),
        ("front_neck_left", 0.0, 0.0, 1, 1, "Левая точка горловины (перед)", r#"{"constraint":"neck_line"}"#),
        ("front_neck_right", 0.0, 0.0, 1, 1, "Правая точка горловины (перед)", r#"{"constraint":"neck_line"}"#),
        ("front_neck_center", 0.0, 0.0, 1, 0, "Центр горловины (перед) - U-образная", r#"{"constraint":"curve_control"}"#),
    ];

    let sleeve_nodes: &[(&str, f64, f64, i64, i64, &str, &str)] = &[
        ("sleeve_cuff_left", 0.0, 0.0, 1, 1, "Левый край манжеты", r#"{"constraint":"cuff_line"}"#),
        ("sleeve_cuff_right", 0.0, 0.0, 1, 1, "Правый край манжеты", r#"{"constraint":"cuff_line"}"#),
        ("sleeve_underarm_left", 0.0, 0.0, 1, 1, "Левая подмышка рукава", r#"{"constraint":"sleeve_slope"}"#),
        ("sleeve_underarm_right", 0.0, 0.0, 1, 1, "Правая подмышка рукава", r#"{"constraint":"sleeve_slope"}"#),
        ("sleeve_top_left", 0.0, 0.0, 1, 1, "Левая вершина рукава", r#"{"constraint":"shoulder_point"}"#),
        ("sleeve_top_right", 0.0, 0.0, 1, 1, "Правая вершина рукава", r#"{"constraint":"shoulder_point"}"#),
    ];

    for gt_name in &["Реглан прямой силуэт", "Втачной рукав прямой силуэт"] {
        let gt_id: Option<i64> = sqlx::query_scalar("SELECT id FROM garment_types WHERE name = ?")
            .bind(*gt_name).fetch_optional(pool).await.map_err(|e| format!("Find {}: {}", gt_name, e))?;
        if let Some(gt_id) = gt_id {
            seed_nodes_for_type(pool, gt_id, "back", back_nodes).await?;
            seed_nodes_for_type(pool, gt_id, "front", front_nodes).await?;
            seed_nodes_for_type(pool, gt_id, "sleeve", sleeve_nodes).await?;
        }
    }

    Ok(())
}
