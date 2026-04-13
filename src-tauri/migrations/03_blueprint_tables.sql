-- === ТАБЛИЦЫ ДЛЯ СИСТЕМЫ ВЫКРОЕК ===
-- Seed-данные (blueprints, nodes) вставляются программно в Rust (lib.rs :: seed_blueprints)

CREATE TABLE IF NOT EXISTS blueprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garment_type_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    part_code TEXT NOT NULL,
    svg_template TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (garment_type_id) REFERENCES garment_types(id) ON DELETE CASCADE,
    UNIQUE(garment_type_id, part_code)
);

CREATE TABLE IF NOT EXISTS blueprint_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blueprint_id INTEGER NOT NULL,
    node_name TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    is_movable INTEGER DEFAULT 1,
    is_required INTEGER DEFAULT 1,
    tooltip TEXT,
    config TEXT,
    FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE,
    UNIQUE(blueprint_id, node_name)
);

CREATE TABLE IF NOT EXISTS blueprint_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    pattern_id INTEGER,
    position_x REAL NOT NULL,
    position_y REAL NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    is_selected INTEGER DEFAULT 0,
    z_order INTEGER DEFAULT 0,
    pattern_data TEXT,
    custom_color TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_blueprint_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    measurement_code TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT DEFAULT 'cm',
    is_default INTEGER DEFAULT 0,
    note TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, measurement_code)
);

CREATE TABLE IF NOT EXISTS blueprint_knitting_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    boundary_mode TEXT DEFAULT 'pattern_width',
    empty_row_mode TEXT DEFAULT 'skip',
    auto_calculate_nodes INTEGER DEFAULT 1,
    needle_boundary_left INTEGER,
    needle_boundary_right INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blueprints_garment_type ON blueprints(garment_type_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_nodes_blueprint ON blueprint_nodes(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_patterns_project ON blueprint_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_patterns_pattern ON blueprint_patterns(pattern_id);
CREATE INDEX IF NOT EXISTS idx_project_blueprint_measurements_project ON project_blueprint_measurements(project_id);
