-- Добавляем приталенные варианты силуэта

-- 1. Реглан приталенный
-- Отличается от прямого только формой тела (талия уже), расчеты реглана те же
INSERT OR IGNORE INTO garment_types (category_id, name, base_measurements, included_parts, default_config, construction_formulas) VALUES
(1, 'Реглан приталенный',
 '{"og": 94, "or": 32, "oz": 16, "dr": 60, "di": 62, "glg": 8, "oh": 58, "ease": 6, "gauge_stitches_per_cm": 2.5, "gauge_rows_per_cm": 3.5, "waist_depth": 40, "waist_ease": 4}',
 '["front", "back", "sleeve_left", "sleeve_right"]',
 '{"body_shape": "fitted", "sleeve_type": "raglan"}',
 '{}');

-- 2. Втачной приталенный
-- Нужны shoulder_height и shoulder_length для расчета оката и проймы
INSERT OR IGNORE INTO garment_types (category_id, name, base_measurements, included_parts, default_config, construction_formulas) VALUES
(1, 'Втачной приталенный',
 '{"og": 94, "or": 32, "oz": 16, "dr": 60, "di": 62, "glg": 8, "oh": 58, "ease": 6, "gauge_stitches_per_cm": 2.5, "gauge_rows_per_cm": 3.5, "shoulder_height": 5.5, "shoulder_length": 13, "waist_depth": 40, "waist_ease": 4}',
 '["front", "back", "sleeve_left", "sleeve_right"]',
 '{"body_shape": "fitted", "sleeve_type": "set_in"}',
 '{}');

-- Обновляем обычный Втачной (если он был создан без shoulder_height)
UPDATE garment_types 
SET base_measurements = '{"og": 94, "or": 32, "oz": 16, "dr": 60, "di": 62, "glg": 8, "oh": 58, "ease": 6, "gauge_stitches_per_cm": 2.5, "gauge_rows_per_cm": 3.5, "shoulder_height": 5.5, "shoulder_length": 13}'
WHERE name = 'Втачной рукав прямой силуэт' AND base_measurements NOT LIKE '%shoulder_height%';
