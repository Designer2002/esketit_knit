-- Таблица 1: Категория Одежды
CREATE TABLE garment_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    body_region TEXT NOT NULL,
    has_symmetry INTEGER DEFAULT 1,
    default_unit TEXT DEFAULT 'cm'
);

-- Таблица 2: Шаблоны Частей
CREATE TABLE part_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    part_name TEXT NOT NULL,
    is_optional INTEGER DEFAULT 0,
    is_paired INTEGER DEFAULT 0,
    default_order INTEGER DEFAULT 0,
    parent_part_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES garment_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_part_id) REFERENCES part_templates(id) ON DELETE SET NULL,
    UNIQUE(category_id, part_code)
);

-- Таблица 3: Соединения Частей
CREATE TABLE part_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    from_part TEXT NOT NULL,
    to_part TEXT NOT NULL,
    connection_type TEXT NOT NULL,
    edge_match TEXT,
    FOREIGN KEY (category_id) REFERENCES garment_categories(id) ON DELETE CASCADE
);

-- Таблица 4: Правила Построения
CREATE TABLE construction_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    formula TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (category_id) REFERENCES garment_categories(id) ON DELETE CASCADE
);

-- Таблица 5: Типы Изделия
CREATE TABLE garment_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    base_measurements TEXT NOT NULL,
    included_parts TEXT NOT NULL,
    default_config TEXT,
    construction_formulas TEXT,
    FOREIGN KEY (category_id) REFERENCES garment_categories(id) ON DELETE CASCADE
);

-- Таблица 6: Проекты
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    garment_type_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    modified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    file_path TEXT,
    preview_image BLOB,
    is_archived INTEGER DEFAULT 0,
    FOREIGN KEY (garment_type_id) REFERENCES garment_types(id) ON DELETE RESTRICT
);

-- Таблица 7: Детали Проекта
CREATE TABLE project_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    instance_name TEXT,
    width_stitches INTEGER NOT NULL,
    height_rows INTEGER NOT NULL,
    stitch_data TEXT,
    modifications TEXT,
    sync_with TEXT,
    sync_enabled INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, part_code)
);

-- Таблица 8: Особенности Деталей
CREATE TABLE part_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_part_id INTEGER NOT NULL,
    feature_type TEXT NOT NULL,
    position_x INTEGER NOT NULL,
    position_y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    config TEXT,
    FOREIGN KEY (project_part_id) REFERENCES project_parts(id) ON DELETE CASCADE
);

-- Таблица 9: Пряжа
CREATE TABLE yarns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    material_type TEXT NOT NULL,
    thickness_m REAL,
    color_hex TEXT NOT NULL,
    color_name TEXT,
    texture_type TEXT NOT NULL,
    render_roughness REAL DEFAULT 0.8,
    in_library INTEGER DEFAULT 1,
    user_defined INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Таблица 10: Пряжа Проекта
CREATE TABLE projects_yarns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    yarn_id INTEGER NOT NULL,
    quantity_grams REAL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (yarn_id) REFERENCES yarns(id) ON DELETE RESTRICT,
    UNIQUE(project_id, yarn_id)
);

-- Таблица 11: Узоры
CREATE TABLE patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    pattern_data TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    preview_image BLOB,
    is_global INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    source TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, width, height)
);

-- Таблица 12: Узоры Проекта
CREATE TABLE projects_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    pattern_id INTEGER NOT NULL,
    assigned_to_part TEXT NOT NULL,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    repeat_x INTEGER DEFAULT 1,
    repeat_y INTEGER DEFAULT 1,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE RESTRICT,
    UNIQUE(project_id, pattern_id, assigned_to_part)
);

-- Таблица 13: Конвертации
CREATE TABLE conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    source_image_path TEXT,
    source_image_thumbnail BLOB,
    source_width INTEGER,
    source_height INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Таблица 14: Типы Мерок
CREATE TABLE measurement_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT DEFAULT 'cm',
    group_name TEXT,
    is_mandatory INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0
);

-- Таблица 15: Связь Типов Изделий с Мерками
CREATE TABLE garment_type_measurements (
    garment_type_id INTEGER NOT NULL,
    measurement_type_id INTEGER NOT NULL,
    is_mandatory INTEGER DEFAULT 0,
    default_formula TEXT,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (garment_type_id, measurement_type_id),
    FOREIGN KEY (garment_type_id) REFERENCES garment_types(id) ON DELETE CASCADE,
    FOREIGN KEY (measurement_type_id) REFERENCES measurement_types(id) ON DELETE CASCADE
);

-- Таблица 16: Мерки Проекта
CREATE TABLE project_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    measurement_type_id INTEGER NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    is_manual INTEGER DEFAULT 1,
    note TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (measurement_type_id) REFERENCES measurement_types(id) ON DELETE RESTRICT,
    UNIQUE(project_id, measurement_type_id)
);

-- Таблица 17: Петельные Пробы
CREATE TABLE gauge_swatches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    yarn_id INTEGER NOT NULL,
    stitches_per_10cm REAL NOT NULL,
    rows_per_10cm REAL NOT NULL,
    needle_size REAL,
    is_user_defined INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (yarn_id) REFERENCES yarns(id) ON DELETE RESTRICT
);

-- Таблица 18: Расчёты Проекта
CREATE TABLE calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    total_stitches INTEGER,
    total_rows INTEGER,
    total_yarn_grams REAL,
    total_time_minutes INTEGER,
    difficulty_level INTEGER DEFAULT 1,
    calculation_log TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Таблица 19: Запросы к ИИ
CREATE TABLE ai_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    request_type TEXT NOT NULL,
    request_text TEXT,
    request_image BLOB,
    response_data TEXT,
    generated_pattern_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_successful INTEGER DEFAULT 1,
    ai_model TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (generated_pattern_id) REFERENCES patterns(id) ON DELETE SET NULL
);

-- Таблица 20: Настройки Машины
CREATE TABLE machine_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    machine_model TEXT DEFAULT 'Silver Reed SK840',
    tension INTEGER DEFAULT 5,
    row_counter_direction TEXT DEFAULT 'up',
    esp32_ip TEXT,
    esp32_port INTEGER DEFAULT 80,
    connection_type TEXT DEFAULT 'http',
    auth_token TEXT,
    needle_calibration TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Таблица 21: Недавние Проекты
CREATE TABLE recent_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    last_opened TEXT DEFAULT CURRENT_TIMESTAMP,
    open_count INTEGER DEFAULT 1,
    pin_to_top INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Создание индексов для ускорения поиска
CREATE INDEX idx_part_templates_category ON part_templates(category_id);
CREATE INDEX idx_garment_types_category ON garment_types(category_id);
CREATE INDEX idx_projects_garment_type ON projects(garment_type_id);
CREATE INDEX idx_project_parts_project ON project_parts(project_id);
CREATE INDEX idx_part_features_project_part ON part_features(project_part_id);
CREATE INDEX idx_projects_yarns_project ON projects_yarns(project_id);
CREATE INDEX idx_projects_yarns_yarn ON projects_yarns(yarn_id);
CREATE INDEX idx_projects_patterns_project ON projects_patterns(project_id);
CREATE INDEX idx_projects_patterns_pattern ON projects_patterns(pattern_id);
CREATE INDEX idx_conversions_project ON conversions(project_id);
CREATE INDEX idx_project_measurements_project ON project_measurements(project_id);
CREATE INDEX idx_project_measurements_type ON project_measurements(measurement_type_id);
CREATE INDEX idx_gauge_swatches_project ON gauge_swatches(project_id);
CREATE INDEX idx_gauge_swatches_yarn ON gauge_swatches(yarn_id);
CREATE INDEX idx_ai_requests_project ON ai_requests(project_id);
CREATE INDEX idx_ai_requests_pattern ON ai_requests(generated_pattern_id);
CREATE INDEX idx_machine_settings_project ON machine_settings(project_id);
CREATE INDEX idx_recent_projects_project ON recent_projects(project_id);