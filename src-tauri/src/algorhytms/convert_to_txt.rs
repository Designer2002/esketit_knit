use image::{GenericImageView, ImageBuffer, Luma};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConvertPatternRequest {
    pub image_path: String,
    pub output_path: Option<String>,
    pub mirror_horizontal: Option<bool>,
    pub threshold: Option<u8>,
    pub invert: Option<bool>,             // Инвертировать цвета
    pub pattern_char_dark: Option<char>,  // Символ для темных пикселей
    pub pattern_char_light: Option<char>, // Символ для светлых пикселей
}

#[derive(Debug, Serialize)]
pub struct ConvertPatternResponse {
    pub success: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub pattern_path: Option<String>,
    pub preview_lines: Option<Vec<String>>,
    pub error: Option<String>,
}

#[command]
pub async fn convert_image_to_pattern(
    req: ConvertPatternRequest,
) -> Result<ConvertPatternResponse, String> {
    // Валидация входного пути
    let image_path = Path::new(&req.image_path);
    if !image_path.exists() {
        return Ok(ConvertPatternResponse {
            success: false,
            width: None,
            height: None,
            pattern_path: None,
            preview_lines: None,
            error: Some("Image file not found".to_string()),
        });
    }

    if !image_path.is_file() {
        return Ok(ConvertPatternResponse {
            success: false,
            width: None,
            height: None,
            pattern_path: None,
            preview_lines: None,
            error: Some("Path is not a file".to_string()),
        });
    }

    // Определяем путь для вывода
    let output_path = match req.output_path {
        Some(path) => PathBuf::from(path),
        None => {
            let stem = image_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("pattern");
            PathBuf::from(format!("{}.txt", stem))
        }
    };

    // Создаем директорию для выходного файла, если нужно
    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return Ok(ConvertPatternResponse {
                    success: false,
                    width: None,
                    height: None,
                    pattern_path: None,
                    preview_lines: None,
                    error: Some(format!("Failed to create output directory: {}", e)),
                });
            }
        }
    }

    // Настройки преобразования
    let mirror = req.mirror_horizontal.unwrap_or(false);
    let threshold = req.threshold.unwrap_or(128);
    let invert = req.invert.unwrap_or(false);
    let dark_char = req.pattern_char_dark.unwrap_or('1');
    let light_char = req.pattern_char_light.unwrap_or('0');

    // Запускаем обработку изображения в blocking task
    let image_path_clone = image_path.to_path_buf();
    let output_path_clone = output_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        convert_image_to_pattern_sync(
            &image_path_clone,
            &output_path_clone,
            mirror,
            threshold,
            invert,
            dark_char,
            light_char,
        )
    })
    .await
    .map_err(|e| format!("Task spawn failed: {}", e))?;

    match result {
        Ok((width, height, preview_lines)) => Ok(ConvertPatternResponse {
            success: true,
            width: Some(width),
            height: Some(height),
            pattern_path: Some(output_path.to_string_lossy().to_string()),
            preview_lines: Some(preview_lines),
            error: None,
        }),
        Err(error) => Ok(ConvertPatternResponse {
            success: false,
            width: None,
            height: None,
            pattern_path: None,
            preview_lines: None,
            error: Some(error),
        }),
    }
}

fn convert_image_to_pattern_sync(
    image_path: &Path,
    output_path: &Path,
    mirror_horizontal: bool,
    threshold: u8,
    invert: bool,
    dark_char: char,
    light_char: char,
) -> Result<(u32, u32, Vec<String>), String> {
    // Загружаем изображение
    let img = image::open(image_path).map_err(|e| format!("Failed to open image: {}", e))?;

    // Конвертируем в оттенки серого
    let grayscale = img.to_luma8();
    let (width, height) = grayscale.dimensions();

    // Применяем зеркалирование если нужно
    let processed: ImageBuffer<Luma<u8>, Vec<u8>> = if mirror_horizontal {
        ImageBuffer::from_fn(width, height, |x, y| {
            grayscale.get_pixel(width - 1 - x, y).clone()
        })
    } else {
        grayscale
    };

    // Определяем расширение файла
    let extension = output_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("txt")
        .to_lowercase();

    // Создаём или перезаписываем файл
    let mut file = fs::File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    use std::io::Write;
    // Конвертируем пиксели в символы и записываем
    let mut preview_lines = Vec::new();
    // Если это .swaga файл, записываем заголовок
    if extension == "swaga" {
        //     writeln!(file, "# swaga Pattern File")
        //         .map_err(|e| format!("Failed to write swaga header: {}", e))?;
        //     writeln!(file, "# width={}", width)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# height={}", height)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# threshold={}", threshold)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# mirror_horizontal={}", mirror_horizontal)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# invert={}", invert)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# dark_char={}", dark_char)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# light_char={}", light_char)
        //         .map_err(|e| format!("Failed to write metadata: {}", e))?;
        //     writeln!(file, "# end_header")
        //         .map_err(|e| format!("Failed to write header end: {}", e))?;
        // }

        for y in 0..height {
            let mut line = String::with_capacity(width as usize);

            for x in 0..width {
                let pixel = processed.get_pixel(x, y).0[0];

                // Применяем инверсию если нужно
                let brightness = if invert { 255 - pixel } else { pixel };

                // Определяем символ на основе порога
                let ch = if brightness < threshold {
                    dark_char
                } else {
                    light_char
                };

                line.push(ch);
            }

            // Записываем строку в файл
            writeln!(file, "{}", line)
                .map_err(|e| format!("Failed to write pattern line: {}", e))?;

            preview_lines.push(line);
        }
    }
    Ok((width, height, preview_lines))
}

// Дополнительная функция для получения информации об изображении без конвертации
#[command]
pub async fn get_image_info(image_path: &str) -> Result<serde_json::Value, String> {
    let path = Path::new(image_path);

    if !path.exists() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "File not found"
        }));
    }

    let path_clone = path.to_path_buf();
    let result = tokio::task::spawn_blocking(move || match image::open(&path_clone) {
        Ok(img) => {
            let (width, height) = img.dimensions();
            let format = format!("{:?}", img.color());

            Ok(serde_json::json!({
                "success": true,
                "width": width,
                "height": height,
                "format": format
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("Failed to read image: {}", e)
        })),
    })
    .await
    .map_err(|e| format!("Task spawn failed: {}", e))?;

    result
}

// Функция для пакетной конвертации
#[command]
pub async fn batch_convert_images(
    image_paths: Vec<String>,
    output_dir: String,
    mirror_horizontal: Option<bool>,
    threshold: Option<u8>,
    invert: Option<bool>,
) -> Result<Vec<ConvertPatternResponse>, String> {
    let output_dir_path = Path::new(&output_dir);

    // Создаем выходную директорию если нужно
    if !output_dir_path.exists() {
        fs::create_dir_all(output_dir_path)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let mut results = Vec::new();

    for image_path in image_paths {
        let image_stem = Path::new(&image_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("pattern");

        let output_path = output_dir_path.join(format!("{}.txt", image_stem));

        let request = ConvertPatternRequest {
            image_path,
            output_path: Some(output_path.to_string_lossy().to_string()),
            mirror_horizontal,
            threshold,
            invert,
            pattern_char_dark: None,
            pattern_char_light: None,
        };

        let response = convert_image_to_pattern(request).await?;
        results.push(response);
    }

    Ok(results)
}
