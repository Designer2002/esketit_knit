use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).expect("Failed to create app data directory");
    }
    println!("Database path: {:?}", dir.join("eskititknit.sqlite"));
    dir.join("eskititknit.sqlite")
}

pub async fn init_db(app: &AppHandle) -> Result<SqlitePool, String> {
    let db_path = get_db_path(app);

    // Настройки подключения: создаём БД если нет, включаем внешние ключи
    let connect_options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .foreign_keys(true);

    // Создаём пул соединений
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await
        .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;

    // Выполняем миграции (создание таблиц)
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| format!("Migration failed: {}", e))?;

    // Seed blueprint templates and nodes (after migrations, safe from FK issues)
    crate::database::seed::seed_blueprints(&pool).await.map_err(|e| format!("Seed failed: {}", e))?;
    crate::database::seed::seed_nodes(&pool).await.map_err(|e| format!("Seed nodes failed: {}", e))?;

    Ok(pool)
}
