use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

use arboard::Clipboard;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use battery::units::ratio::percent;
use image::{imageops, DynamicImage, ImageOutputFormat, RgbaImage};
use reqwest::blocking::Client;
use scraper::{Html, Selector};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use sysinfo::{Components, System};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterySnapshot {
    pub percentage: f32,
    pub is_charging: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub cpu_usage_percent: f32,
    pub memory_usage_percent: f32,
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub cpu_temperature_c: Option<f32>,
    pub gpu_temperature_c: Option<f32>,
    pub battery: Option<BatterySnapshot>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizedFile {
    pub from: String,
    pub to: String,
    pub category: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeDirectoryResponse {
    pub root: String,
    pub moved_count: usize,
    pub moved: Vec<OrganizedFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeDirectoryRequest {
    pub path: Option<String>,
    pub create_folders: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedFile {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRenameResponse {
    pub root: String,
    pub renamed_count: usize,
    pub renamed: Vec<RenamedFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebpagePreview {
    pub url: String,
    pub title: String,
    pub excerpt: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotCaptureResult {
    pub image_base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct VirtualDesktopBounds {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRenameRequest {
    pub directory: String,
    pub pattern: String,
}

fn canonical_dir(path: &Path) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    fs::canonicalize(path).map_err(|error| error.to_string())
}

fn normalize_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn compute_virtual_desktop_bounds(screens: &[Screen]) -> Result<VirtualDesktopBounds, String> {
    if screens.is_empty() {
        return Err("No screen was found.".to_string());
    }

    let mut left = i32::MAX;
    let mut top = i32::MAX;
    let mut right = i32::MIN;
    let mut bottom = i32::MIN;

    for screen in screens {
        let info = screen.display_info;
        left = left.min(info.x);
        top = top.min(info.y);
        right = right.max(info.x.saturating_add(info.width as i32));
        bottom = bottom.max(info.y.saturating_add(info.height as i32));
    }

    if right <= left || bottom <= top {
        return Err("The virtual desktop bounds are invalid.".to_string());
    }

    Ok(VirtualDesktopBounds {
        left,
        top,
        width: right.saturating_sub(left) as u32,
        height: bottom.saturating_sub(top) as u32,
    })
}

pub fn get_virtual_desktop_bounds() -> Result<VirtualDesktopBounds, String> {
    let screens = Screen::all().map_err(|error| error.to_string())?;
    compute_virtual_desktop_bounds(&screens)
}

fn parse_temperature_values(output: &str) -> Vec<f32> {
    output
        .lines()
        .flat_map(|line| line.split(','))
        .filter_map(|chunk| chunk.trim().parse::<f32>().ok())
        .filter(|value| value.is_finite() && *value > 0.0 && *value < 200.0)
        .collect()
}

fn read_command_output(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return None;
    }

    Some(stdout)
}

fn detect_gpu_temperature_from_nvidia_smi() -> Option<f32> {
    let output = read_command_output(
        "nvidia-smi",
        &[
            "--query-gpu=temperature.gpu",
            "--format=csv,noheader,nounits",
        ],
    )?;

    parse_temperature_values(&output)
        .into_iter()
        .reduce(f32::max)
}

fn detect_gpu_temperature_from_monitor_namespace(namespace: &str) -> Option<f32> {
    let script = format!(
        concat!(
            "$ErrorActionPreference='Stop'; ",
            "$values = Get-CimInstance -Namespace '{namespace}' -ClassName Sensor | ",
            "Where-Object {{ $_.SensorType -eq 'Temperature' -and ",
            "(($_.Name -as [string]) -match 'GPU|Graphics|VRAM|Video') }} | ",
            "Select-Object -ExpandProperty Value; ",
            "if ($values) {{ $values | ForEach-Object {{ [string]$_ }} }}"
        ),
        namespace = namespace,
    );
    let output = read_command_output(
        "powershell.exe",
        &[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ],
    )?;

    parse_temperature_values(&output)
        .into_iter()
        .reduce(f32::max)
}

fn detect_gpu_temperature_from_components(components: &Components) -> Option<f32> {
    components
        .iter()
        .filter(|component| {
            let label = component.label().to_ascii_lowercase();
            label.contains("gpu")
                || label.contains("graphics")
                || label.contains("video")
                || label.contains("vram")
        })
        .map(|component| component.temperature())
        .filter(|temperature| temperature.is_finite() && *temperature > 0.0)
        .reduce(f32::max)
}

fn detect_gpu_temperature_c(components: &Components) -> Option<f32> {
    detect_gpu_temperature_from_nvidia_smi()
        .or_else(|| detect_gpu_temperature_from_monitor_namespace("root/LibreHardwareMonitor"))
        .or_else(|| detect_gpu_temperature_from_monitor_namespace("root/OpenHardwareMonitor"))
        .or_else(|| detect_gpu_temperature_from_components(components))
}

pub fn toggle_main_window_visibility_impl(app: &tauri::AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window was not found.".to_string())?;
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    if visible {
        window.hide().map_err(|error| error.to_string())?;
        return Ok(false);
    }

    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok(true)
}

fn resolve_target_root(
    app: &tauri::AppHandle,
    maybe_path: Option<String>,
) -> Result<PathBuf, String> {
    let requested = maybe_path.unwrap_or_default();
    let trimmed = requested.trim();
    if trimmed.is_empty() {
        let desktop_dir = app.path().desktop_dir().map_err(|error| error.to_string())?;
        return canonical_dir(&desktop_dir);
    }

    canonical_dir(Path::new(trimmed))
}

fn extension_category(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "psd" => "Images",
        "doc" | "docx" | "pdf" | "txt" | "md" | "ppt" | "pptx" | "xls" | "xlsx" | "csv" => {
            "Documents"
        }
        "zip" | "rar" | "7z" | "tar" | "gz" => "Archives",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" => "Audio",
        "mp4" | "mkv" | "mov" | "avi" | "webm" => "Video",
        "exe" | "msi" | "bat" | "lnk" => "Apps",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "java" | "cpp" | "c" | "go" | "json"
        | "yaml" | "yml" | "toml" => "Code",
        _ => "Other",
    }
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("file")
        .to_string()
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value))
        .unwrap_or_default()
}

fn available_target_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = file_stem(path);
    let extension = file_extension(path);

    for index in 1..10_000 {
        let candidate = parent.join(format!("{stem}-{index}{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!("{stem}-overflow{extension}"))
}

fn today_stamp() -> String {
    #[allow(deprecated)]
    let now = std::time::SystemTime::now();
    let datetime: chrono::DateTime<chrono::Local> = now.into();
    datetime.format("%Y%m%d").to_string()
}

fn rename_with_pattern(pattern: &str, path: &Path, index: usize) -> String {
    let stem = file_stem(path);
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("");
    pattern
        .replace("{index}", &format!("{:03}", index + 1))
        .replace("{stem}", &stem)
        .replace("{ext}", extension)
        .replace("{date}", &today_stamp())
}

#[tauri::command]
pub fn read_clipboard_text() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.get_text().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_system_metrics() -> Result<SystemMetrics, String> {
    let mut system = System::new_all();
    system.refresh_memory();
    system.refresh_cpu();
    thread::sleep(Duration::from_millis(120));
    system.refresh_cpu();
    system.refresh_memory();

    let total_memory = system.total_memory().saturating_mul(1024);
    let used_memory = system.used_memory().saturating_mul(1024);
    let memory_usage_percent = if total_memory == 0 {
        0.0
    } else {
        (used_memory as f64 / total_memory as f64 * 100.0) as f32
    };

    let mut components = Components::new_with_refreshed_list();
    components.refresh_list();
    let cpu_temperature_c = components
        .iter()
        .map(|component| component.temperature())
        .find(|temperature| temperature.is_finite() && *temperature > 0.0);
    let gpu_temperature_c = detect_gpu_temperature_c(&components);

    let battery = battery::Manager::new()
        .ok()
        .and_then(|manager| manager.batteries().ok())
        .and_then(|mut batteries| batteries.next())
        .and_then(|entry| entry.ok())
        .map(|battery| BatterySnapshot {
            percentage: battery.state_of_charge().get::<percent>() as f32,
            is_charging: matches!(battery.state(), battery::State::Charging | battery::State::Full),
        });

    Ok(SystemMetrics {
        cpu_usage_percent: system.global_cpu_info().cpu_usage(),
        memory_usage_percent,
        total_memory_bytes: total_memory,
        used_memory_bytes: used_memory,
        cpu_temperature_c,
        gpu_temperature_c,
        battery,
    })
}

#[tauri::command]
pub fn organize_directory(
    app: tauri::AppHandle,
    request: OrganizeDirectoryRequest,
) -> Result<OrganizeDirectoryResponse, String> {
    let root = resolve_target_root(&app, request.path)?;
    let create_folders = request.create_folders.unwrap_or(true);
    let mut moved = Vec::new();

    let entries = fs::read_dir(&root).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let category = extension_category(&path);
        if category == "Other" {
            continue;
        }

        let category_dir = root.join(category);
        if create_folders {
            fs::create_dir_all(&category_dir).map_err(|error| error.to_string())?;
        }

        let target = available_target_path(&category_dir.join(
            path.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("file"),
        ));
        fs::rename(&path, &target).map_err(|error| error.to_string())?;
        moved.push(OrganizedFile {
            from: path.display().to_string(),
            to: target.display().to_string(),
            category: category.to_string(),
        });
    }

    Ok(OrganizeDirectoryResponse {
        root: root.display().to_string(),
        moved_count: moved.len(),
        moved,
    })
}

#[tauri::command]
pub fn batch_rename_files(request: BatchRenameRequest) -> Result<BatchRenameResponse, String> {
    let root = canonical_dir(Path::new(request.directory.trim()))?;
    let pattern = request.pattern.trim();
    if pattern.is_empty() {
        return Err("Rename pattern cannot be empty.".to_string());
    }

    let mut files: Vec<PathBuf> = fs::read_dir(&root)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .filter(|path| path.is_file())
        .collect();
    files.sort();

    let mut renamed = Vec::new();
    for (index, path) in files.iter().enumerate() {
        let extension = file_extension(path);
        let next_name = format!("{}{}", rename_with_pattern(pattern, path, index), extension);
        let target = available_target_path(&root.join(next_name));
        if &target == path {
            continue;
        }

        fs::rename(path, &target).map_err(|error| error.to_string())?;
        renamed.push(RenamedFile {
            from: path.display().to_string(),
            to: target.display().to_string(),
        });
    }

    Ok(BatchRenameResponse {
        root: root.display().to_string(),
        renamed_count: renamed.len(),
        renamed,
    })
}

#[tauri::command]
pub fn toggle_main_window_visibility(app: tauri::AppHandle) -> Result<bool, String> {
    toggle_main_window_visibility_impl(&app)
}

#[tauri::command]
pub fn capture_primary_screen(
    app: tauri::AppHandle,
    hide_main_window: Option<bool>,
    region: Option<ScreenshotRegion>,
) -> Result<ScreenshotCaptureResult, String> {
    let should_hide_main_window = hide_main_window.unwrap_or(false);
    let main_window = app.get_webview_window("main");
    let was_visible = if should_hide_main_window {
        if let Some(window) = &main_window {
            let visible = window.is_visible().map_err(|error| error.to_string())?;
            if visible {
                window.hide().map_err(|error| error.to_string())?;
                thread::sleep(Duration::from_millis(120));
            }
            visible
        } else {
            false
        }
    } else {
        false
    };

    let capture_result = (|| {
        let screens = Screen::all().map_err(|error| error.to_string())?;
        let bounds = compute_virtual_desktop_bounds(&screens)?;
        let (capture_left, capture_top, capture_width, capture_height) = if let Some(region) = region {
            let requested_left = region.x.max(bounds.left);
            let requested_top = region.y.max(bounds.top);
            let requested_right = region
                .x
                .saturating_add(region.width as i32)
                .min(bounds.left.saturating_add(bounds.width as i32));
            let requested_bottom = region
                .y
                .saturating_add(region.height as i32)
                .min(bounds.top.saturating_add(bounds.height as i32));

            if requested_right <= requested_left || requested_bottom <= requested_top {
                return Err("Screenshot selection is outside the screen bounds.".to_string());
            }

            (
                requested_left,
                requested_top,
                requested_right.saturating_sub(requested_left) as u32,
                requested_bottom.saturating_sub(requested_top) as u32,
            )
        } else {
            (bounds.left, bounds.top, bounds.width, bounds.height)
        };

        let capture_right = capture_left.saturating_add(capture_width as i32);
        let capture_bottom = capture_top.saturating_add(capture_height as i32);
        let mut merged = RgbaImage::new(capture_width, capture_height);

        for screen in screens {
            let info = screen.display_info;
            let screen_left = info.x;
            let screen_top = info.y;
            let screen_right = info.x.saturating_add(info.width as i32);
            let screen_bottom = info.y.saturating_add(info.height as i32);

            let intersection_left = capture_left.max(screen_left);
            let intersection_top = capture_top.max(screen_top);
            let intersection_right = capture_right.min(screen_right);
            let intersection_bottom = capture_bottom.min(screen_bottom);

            if intersection_right <= intersection_left || intersection_bottom <= intersection_top {
                continue;
            }

            let source_x = intersection_left.saturating_sub(screen_left);
            let source_y = intersection_top.saturating_sub(screen_top);
            let source_width = intersection_right.saturating_sub(intersection_left) as u32;
            let source_height = intersection_bottom.saturating_sub(intersection_top) as u32;

            let partial = screen
                .capture_area(source_x, source_y, source_width, source_height)
                .map_err(|error| error.to_string())?;

            let dest_x = intersection_left.saturating_sub(capture_left) as i64;
            let dest_y = intersection_top.saturating_sub(capture_top) as i64;
            imageops::overlay(&mut merged, &partial, dest_x, dest_y);
        }

        let dynamic = DynamicImage::ImageRgba8(merged);
        let mut cursor = Cursor::new(Vec::<u8>::new());
        dynamic
            .write_to(&mut cursor, ImageOutputFormat::Png)
            .map_err(|error| error.to_string())?;
        Ok(ScreenshotCaptureResult {
            image_base64: STANDARD.encode(cursor.into_inner()),
            mime_type: "image/png".to_string(),
            width: capture_width,
            height: capture_height,
        })
    })();

    if should_hide_main_window && was_visible {
        if let Some(window) = main_window {
            let _ = window.show();
        }
    }

    capture_result
}

#[tauri::command]
pub fn fetch_webpage_preview(url: String) -> Result<WebpagePreview, String> {
    let trimmed_url = url.trim();
    if trimmed_url.is_empty() {
        return Err("URL cannot be empty.".to_string());
    }

    let client = Client::builder()
        .user_agent("TablePet/0.1")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(trimmed_url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| error.to_string())?;
    let html = response.text().map_err(|error| error.to_string())?;
    let document = Html::parse_document(&html);

    let title_selector = Selector::parse("title").map_err(|error| error.to_string())?;
    let body_selector = Selector::parse("body").map_err(|error| error.to_string())?;
    let paragraph_selector = Selector::parse("p").map_err(|error| error.to_string())?;
    let meta_selector =
        Selector::parse(r#"meta[name="description"]"#).map_err(|error| error.to_string())?;

    let title = document
        .select(&title_selector)
        .next()
        .map(|node| normalize_text(&node.text().collect::<Vec<_>>().join(" ")))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| trimmed_url.to_string());

    let excerpt = document
        .select(&meta_selector)
        .next()
        .and_then(|node| node.value().attr("content"))
        .map(normalize_text)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            document
                .select(&paragraph_selector)
                .map(|node| normalize_text(&node.text().collect::<Vec<_>>().join(" ")))
                .find(|value| value.len() > 40)
        })
        .unwrap_or_default();

    let body_text = {
        let paragraphs: Vec<String> = document
            .select(&paragraph_selector)
            .map(|node| normalize_text(&node.text().collect::<Vec<_>>().join(" ")))
            .filter(|value| value.len() > 20)
            .take(12)
            .collect();
        if paragraphs.is_empty() {
            document
                .select(&body_selector)
                .next()
                .map(|node| normalize_text(&node.text().collect::<Vec<_>>().join(" ")))
                .unwrap_or_default()
        } else {
            paragraphs.join("\n")
        }
    };

    let content = if body_text.len() > 3000 {
        body_text.chars().take(3000).collect::<String>()
    } else {
        body_text
    };

    Ok(WebpagePreview {
        url: trimmed_url.to_string(),
        title,
        excerpt,
        content,
    })
}
