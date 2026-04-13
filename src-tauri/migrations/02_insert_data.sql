
INSERT OR IGNORE INTO garment_categories (code, name, description, body_region, has_symmetry, default_unit) VALUES
('top', 'Верхняя одежда', 'Изделия для верхней части тела: свитера, футболки, кардиганы', 'upper', 1, 'cm'),
('bottom', 'Нижняя одежда', 'Изделия для нижней части тела: брюки, юбки, шорты', 'lower', 1, 'cm'),
('full', 'Комбинезоны', 'Цельные изделия, покрывающие верх и низ', 'full', 1, 'cm'),
('accessory', 'Аксессуары', 'Шапки, шарфы, варежки, носки', 'accessory', 1, 'cm');
-- ('raglan', 'Реглан', 'Изделия с регланной линией: джемперы, худи, свитера с рукавом реглан', 'upper', 1, 'cm');


-- === ТИПЫ ИЗДЕЛИЙ: только Реглан прямой силуэт (категория raglan = 5) ===
-- Размер M по международной таблице (ISO 3635 / EN 13402)
-- Base measurements для women's size M:
--   og (обхват груди) = 94 см
--   osh (обхват шеи) = 38 см
--   oz (обхват запястья) = 16 см
--   or (обхват руки) = 32 см
--   dp (длина плеча) = 13 см
--   glg (глубина горловины переда) = 8 см
--   dr (длина рукава) = 60 см
--   di (длина изделия) = 62 см
--   manz1 (манжета рукава) = 5 см
--   manz2 (обтачка горловины) = 3 см

INSERT OR IGNORE INTO garment_types (category_id, name, base_measurements, included_parts, default_config, construction_formulas) VALUES
(1, 'Реглан прямой силуэт',
 '{"og": 94, "osh": 38, "oz": 16, "or": 32, "dp": 13, "glg": 8, "dr": 60, "di": 62, "manz1": 5, "manz2": 3, "ease_chest": 6, "gauge_stitches_per_cm": 2.5, "gauge_rows_per_cm": 3.5}',
 '["front", "back", "sleeve_left", "sleeve_right"]',
 '{"neck_depth_front": 8, "neck_depth_back": 2.5, "raglan_line_angle": 45, "sleeve_cap_shaping": "curved", "body_shape": "straight", "hem_finish": "ribbed"}',
 '{"front_width": "og / 4 + ease_chest / 4", "back_width": "og / 4 + ease_chest / 4", "sleeve_top_width": "or / 2 + 4", "raglan_decrease_rate": "(og/4 - or/4) / dr", "front_neckline_curve": "glg * 0.6", "back_neckline_curve": "neck_depth_back * 0.5"}'),

(1, 'Втачной рукав прямой силуэт',
 '{"og": 94, "osh": 38, "oz": 16, "or": 32, "dp": 13, "glg": 8, "dr": 60, "di": 62, "manz1": 5, "manz2": 3, "ease_chest": 6, "gauge_stitches_per_cm": 2.5, "gauge_rows_per_cm": 3.5, "armhole_depth": 22}',
 '["front", "back", "sleeve_left", "sleeve_right"]',
 '{"neck_depth_front": 8, "neck_depth_back": 2.5, "armhole_shape": "curved", "sleeve_cap_height": 14, "body_shape": "straight", "hem_finish": "ribbed"}',
 '{"front_width": "og / 4 + ease_chest / 4", "back_width": "og / 4 + ease_chest / 4", "sleeve_top_width": "or / 2 + 4", "armhole_depth": "og / 8 + 10", "sleeve_cap_height": "or / 4 + 6", "front_neckline_curve": "glg * 0.6", "back_neckline_curve": "neck_depth_back * 0.5"}');
