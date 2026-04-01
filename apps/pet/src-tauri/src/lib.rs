use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

mod audio_capture;
mod audio_playback;
mod commands;
mod desktop_services;
mod shortcut_manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(audio_capture::VoiceCaptureState::default())
        .manage(audio_playback::VoicePlaybackState::default())
        .manage(desktop_services::BackendServiceState::default())
        .manage(shortcut_manager::ShortcutRegistry::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(shortcut_manager::init_plugin())
        .invoke_handler(tauri::generate_handler![
            greet,
            audio_capture::start_voice_capture,
            audio_capture::stop_voice_capture,
            audio_playback::queue_voice_playback_chunk,
            audio_playback::finish_voice_playback,
            audio_playback::stop_voice_playback,
            commands::save_uploaded_model,
            commands::get_uploaded_models,
            commands::delete_model,
            commands::get_model_files,
            desktop_services::read_clipboard_text,
            desktop_services::write_clipboard_text,
            desktop_services::get_system_metrics,
            desktop_services::organize_directory,
            desktop_services::batch_rename_files,
            desktop_services::toggle_main_window_visibility,
            desktop_services::ensure_backend_service,
            desktop_services::capture_primary_screen,
            desktop_services::fetch_webpage_preview,
            shortcut_manager::update_global_shortcuts
        ])
        .setup(|app| {
            if let Some(window) = app.webview_windows().get("main") {
                window.set_decorations(true).unwrap();
                window.set_always_on_top(true).unwrap();

                #[cfg(target_os = "windows")]
                {
                    let _ = window.set_shadow(true);
                }
            }

            if app.webview_windows().get("proactive").is_none() {
                let proactive_window = WebviewWindowBuilder::new(
                    app,
                    "proactive",
                    WebviewUrl::App("proactive.html".into()),
                )
                .title("Desktop Pet Proactive Service")
                .inner_size(1.0, 1.0)
                .visible(false)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .skip_taskbar(true)
                .focused(false)
                .build()?;

                let _ = proactive_window.hide();
            }

            if app.webview_windows().get("translate_overlay").is_none() {
                let overlay_window = WebviewWindowBuilder::new(
                    app,
                    "translate_overlay",
                    WebviewUrl::App("translate-overlay.html".into()),
                )
                .title("Screenshot Translation")
                .inner_size(560.0, 420.0)
                .visible(false)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .build()?;

                #[cfg(target_os = "windows")]
                {
                    let _ = overlay_window.set_shadow(true);
                }

                let _ = overlay_window.hide();
            }

            if app.webview_windows().get("capture_selector").is_none() {
                let mut selector_window_builder = WebviewWindowBuilder::new(
                    app,
                    "capture_selector",
                    WebviewUrl::App("capture-selector.html".into()),
                )
                .title("Screenshot Selection")
                .visible(false)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false);

                if let Ok(bounds) = desktop_services::get_virtual_desktop_bounds() {
                    selector_window_builder = selector_window_builder
                        .position(bounds.left as f64, bounds.top as f64)
                        .inner_size(bounds.width as f64, bounds.height as f64);
                } else {
                    selector_window_builder = selector_window_builder.fullscreen(true);
                }

                let selector_window = selector_window_builder.build()?;

                let _ = selector_window.hide();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                println!("Application exited");
            }
        });
}
