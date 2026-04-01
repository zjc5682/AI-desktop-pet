use std::fs;
use tauri::Manager;
use walkdir::WalkDir;

// 保存上传的模型文件夹（递归复制文件）
#[tauri::command]
pub async fn save_uploaded_model(app: tauri::AppHandle, model_name: String, files: Vec<Vec<u8>>, file_names: Vec<String>) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let model_dir = app_dir.join("live2d_models").join(&model_name);
    fs::create_dir_all(&model_dir).map_err(|e: std::io::Error| e.to_string())?;
    for (idx, data) in files.iter().enumerate() {
        let file_path = model_dir.join(&file_names[idx]);
        fs::write(file_path, data).map_err(|e: std::io::Error| e.to_string())?;
    }
    Ok(())
}

// 获取已上传的模型列表
#[tauri::command]
pub fn get_uploaded_models(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let models_dir = app_dir.join("live2d_models");
    if !models_dir.exists() {
        return Ok(vec![]);
    }
    let entries = fs::read_dir(models_dir).map_err(|e: std::io::Error| e.to_string())?;
    let mut models = vec![];
    for entry in entries {
        if let Ok(entry) = entry {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    models.push(name.to_string());
                }
            }
        }
    }
    Ok(models)
}

// 删除模型
#[tauri::command]
pub fn delete_model(app: tauri::AppHandle, model_name: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let model_dir = app_dir.join("live2d_models").join(model_name);
    fs::remove_dir_all(model_dir).map_err(|e: std::io::Error| e.to_string())?;
    Ok(())
}

// 获取模型目录下的所有文件（相对路径）
#[tauri::command]
pub fn get_model_files(app: tauri::AppHandle, model_name: String) -> Result<Vec<String>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let model_dir = app_dir.join("live2d_models").join(model_name);
    if !model_dir.exists() {
        return Ok(vec![]);
    }
    let mut files = vec![];
    for entry in WalkDir::new(&model_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(rel) = entry.path().strip_prefix(&model_dir).ok() {
                files.push(rel.to_string_lossy().to_string());
            }
        }
    }
    Ok(files)
}
