use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[command]
pub fn read_dir(path: &str) -> Result<Vec<DirEntry>, String> {
    let dir_path = Path::new(path);
    
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    
    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }
    
    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut result = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_type = entry.file_type()
            .map_err(|e| format!("Failed to get file type: {}", e))?;
        
        let name = entry.file_name()
            .to_string_lossy()
            .to_string();
        
        let path = entry.path()
            .to_string_lossy()
            .to_string();
        
        result.push(DirEntry {
            name,
            path,
            is_dir: file_type.is_dir(),
        });
    }
    
    Ok(result)
}

#[command]
pub fn read_file_text(path: &str) -> Result<String, String> {
    let file_path = Path::new(path);
    
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    
    let mut file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    Ok(content)
}

#[command]
pub fn copy_file(from: &str, to: &str) -> Result<(), String> {
    let from_path = Path::new(from);
    let to_path = Path::new(to);
    
    if !from_path.exists() {
        return Err(format!("Source file does not exist: {}", from));
    }
    
    if !from_path.is_file() {
        return Err(format!("Source path is not a file: {}", from));
    }
    
    // Создаём директорию назначения, если она не существует
    if let Some(parent) = to_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }
    
    fs::copy(from_path, to_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    
    Ok(())
}

#[command]
pub fn remove_file(path: &str) -> Result<(), String> {
    let file_path = Path::new(path);
    
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    
    if file_path.is_dir() {
        fs::remove_dir_all(file_path)
            .map_err(|e| format!("Failed to remove directory: {}", e))?;
    } else {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    
    Ok(())
}

#[command]
pub fn create_dir(path: &str) -> Result<(), String> {
    fs::create_dir_all(Path::new(path))
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    Ok(())
}

#[command]
pub fn file_exists(path: &str) -> Result<bool, String> {
    Ok(Path::new(path).exists())
}
