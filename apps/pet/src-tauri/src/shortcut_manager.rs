use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Builder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

use crate::desktop_services::toggle_main_window_visibility_impl;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ShortcutAction {
    BossKey,
    VoiceRecord,
    ScreenshotTranslate,
}

#[derive(Default)]
pub struct ShortcutRegistry {
    mappings: Mutex<HashMap<String, ShortcutAction>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBindings {
    pub boss_key: String,
    pub voice_record: String,
    pub screenshot_translate: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceShortcutPayload {
    phase: &'static str,
}

fn normalize_shortcut(value: &str) -> String {
    value.trim().to_string()
}

fn register_shortcut(
    app: &tauri::AppHandle,
    registry: &mut HashMap<String, ShortcutAction>,
    value: &str,
    action: ShortcutAction,
) -> Result<(), String> {
    let normalized = normalize_shortcut(value);
    if normalized.is_empty() {
        return Ok(());
    }

    let shortcut = normalized
        .parse::<Shortcut>()
        .map_err(|error| format!("Invalid shortcut \"{normalized}\": {error}"))?;
    app.global_shortcut()
        .register(shortcut)
        .map_err(|error| error.to_string())?;
    registry.insert(shortcut.to_string(), action);
    Ok(())
}

fn action_for_shortcut(app: &tauri::AppHandle, shortcut: &Shortcut) -> Option<ShortcutAction> {
    let state = app.state::<ShortcutRegistry>();
    state
        .mappings
        .lock()
        .ok()
        .and_then(|registry| registry.get(&shortcut.to_string()).copied())
}

fn handle_shortcut_event(app: &tauri::AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    let Some(action) = action_for_shortcut(app, shortcut) else {
        return;
    };

    match action {
        ShortcutAction::BossKey => {
            if event.state() == ShortcutState::Pressed {
                let _ = toggle_main_window_visibility_impl(app);
            }
        }
        ShortcutAction::VoiceRecord => {
            let phase = if event.state() == ShortcutState::Pressed {
                "pressed"
            } else {
                "released"
            };
            let _ = app.emit(
                "shortcut-voice-record",
                VoiceShortcutPayload { phase },
            );
        }
        ShortcutAction::ScreenshotTranslate => {
            if event.state() == ShortcutState::Pressed {
                let _ = app.emit("shortcut-screenshot-translate", ());
            }
        }
    }
}

pub fn init_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    Builder::new()
        .with_handler(|app, shortcut, event| {
            handle_shortcut_event(app, shortcut, event);
        })
        .build()
}

#[tauri::command]
pub fn update_global_shortcuts(
    app: tauri::AppHandle,
    state: tauri::State<ShortcutRegistry>,
    bindings: ShortcutBindings,
) -> Result<Vec<String>, String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;

    let mut registry = state
        .mappings
        .lock()
        .map_err(|_| "Unable to lock shortcut registry.".to_string())?;
    registry.clear();

    register_shortcut(&app, &mut registry, &bindings.boss_key, ShortcutAction::BossKey)?;
    register_shortcut(
        &app,
        &mut registry,
        &bindings.voice_record,
        ShortcutAction::VoiceRecord,
    )?;
    register_shortcut(
        &app,
        &mut registry,
        &bindings.screenshot_translate,
        ShortcutAction::ScreenshotTranslate,
    )?;

    Ok(registry.keys().cloned().collect())
}

#[allow(dead_code)]
fn _example_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyX)
}
