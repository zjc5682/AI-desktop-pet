use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;
use std::io::Cursor;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use rodio::buffer::SamplesBuffer;
use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const PLAYBACK_BACKEND: &str = "rust-rodio";
const VOICE_PLAYBACK_FINISHED_EVENT: &str = "voice-playback-finished";
const VOICE_PLAYBACK_ERROR_EVENT: &str = "voice-playback-error";
const PLAYBACK_FINISH_POLL_INTERVAL_MS: u64 = 20;

#[derive(Default)]
pub struct VoicePlaybackState {
    playback: Mutex<VoicePlaybackInner>,
}

struct VoicePlaybackInner {
    active: Option<ActiveVoicePlayback>,
    next_token: u64,
}

impl Default for VoicePlaybackInner {
    fn default() -> Self {
        Self {
            active: None,
            next_token: 1,
        }
    }
}

struct ActiveVoicePlayback {
    token: u64,
    command_tx: mpsc::Sender<PlaybackCommand>,
    thread: thread::JoinHandle<()>,
}

enum PlaybackCommand {
    AppendPcm {
        samples: Vec<i16>,
        sample_rate: u32,
        channels: u16,
    },
    AppendEncoded {
        audio_bytes: Vec<u8>,
    },
    Finish,
    Stop,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePlaybackChunkRequest {
    pub audio_base64: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub audio_format: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePlaybackFinishRequest {
    pub token: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePlaybackChunkResponse {
    pub playback_backend: String,
    pub token: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoicePlaybackFinishedPayload {
    token: u64,
    playback_backend: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoicePlaybackErrorPayload {
    token: Option<u64>,
    message: String,
    playback_backend: String,
}

fn emit_playback_finished(app: &AppHandle, token: u64) {
    let _ = app.emit(
        VOICE_PLAYBACK_FINISHED_EVENT,
        VoicePlaybackFinishedPayload {
            token,
            playback_backend: PLAYBACK_BACKEND.to_string(),
        },
    );
}

fn emit_playback_error(app: &AppHandle, token: Option<u64>, message: impl Into<String>) {
    let _ = app.emit(
        VOICE_PLAYBACK_ERROR_EVENT,
        VoicePlaybackErrorPayload {
            token,
            message: message.into(),
            playback_backend: PLAYBACK_BACKEND.to_string(),
        },
    );
}

fn clear_active_if_token_matches(app: &AppHandle, token: u64) {
    let state = app.state::<VoicePlaybackState>();
    let Ok(mut guard) = state.playback.lock() else {
        return;
    };

    let matches = guard
        .active
        .as_ref()
        .map(|active| active.token == token)
        .unwrap_or(false);
    if matches {
        guard.active = None;
    }
}

fn is_pcm16_request(request: &VoicePlaybackChunkRequest) -> bool {
    let audio_format = request
        .audio_format
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if audio_format == "pcm16" {
        return true;
    }

    request
        .mime_type
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .starts_with("audio/pcm")
}

fn decode_audio_bytes(base64_audio: &str) -> Result<Vec<u8>, String> {
    let audio_bytes = BASE64_STANDARD
        .decode(base64_audio.as_bytes())
        .map_err(|error| format!("Invalid playback audio payload: {error}"))?;
    if audio_bytes.is_empty() {
        return Err("Playback audio payload is empty.".to_string());
    }

    Ok(audio_bytes)
}

fn decode_playback_command(request: &VoicePlaybackChunkRequest) -> Result<PlaybackCommand, String> {
    let audio_bytes = decode_audio_bytes(&request.audio_base64)?;
    if !is_pcm16_request(request) {
        return Ok(PlaybackCommand::AppendEncoded { audio_bytes });
    }

    if audio_bytes.len() % 2 != 0 {
        return Err("PCM16 playback payload must contain an even number of bytes.".to_string());
    }

    Ok(PlaybackCommand::AppendPcm {
        samples: audio_bytes
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect(),
        sample_rate: request.sample_rate.max(1),
        channels: request.channels.max(1),
    })
}

fn spawn_playback_thread(app: AppHandle, token: u64) -> Result<ActiveVoicePlayback, String> {
    let (command_tx, command_rx) = mpsc::channel::<PlaybackCommand>();
    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);

    let playback_thread = thread::Builder::new()
        .name("table-pet-voice-playback".to_string())
        .spawn(move || {
            let (stream, handle) = match OutputStream::try_default() {
                Ok(output) => output,
                Err(error) => {
                    let message = format!("Unable to open output audio device: {error}");
                    let _ = ready_tx.send(Err(message.clone()));
                    emit_playback_error(&app, Some(token), message);
                    return;
                }
            };
            let sink = match Sink::try_new(&handle) {
                Ok(sink) => sink,
                Err(error) => {
                    let message = format!("Unable to create native playback sink: {error}");
                    let _ = ready_tx.send(Err(message.clone()));
                    emit_playback_error(&app, Some(token), message);
                    return;
                }
            };
            let _stream = stream;
            if ready_tx.send(Ok(())).is_err() {
                sink.stop();
                return;
            }

            let mut finish_requested = false;
            loop {
                let next_command = if finish_requested {
                    match command_rx.recv_timeout(Duration::from_millis(
                        PLAYBACK_FINISH_POLL_INTERVAL_MS,
                    )) {
                        Ok(command) => Some(command),
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if sink.empty() {
                                emit_playback_finished(&app, token);
                                clear_active_if_token_matches(&app, token);
                                break;
                            }
                            None
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => {
                            clear_active_if_token_matches(&app, token);
                            break;
                        }
                    }
                } else {
                    match command_rx.recv() {
                        Ok(command) => Some(command),
                        Err(_) => {
                            clear_active_if_token_matches(&app, token);
                            break;
                        }
                    }
                };

                let Some(command) = next_command else {
                    continue;
                };

                match command {
                    PlaybackCommand::AppendPcm {
                        samples,
                        sample_rate,
                        channels,
                    } => {
                        sink.append(SamplesBuffer::new(channels, sample_rate, samples));
                    }
                    PlaybackCommand::AppendEncoded { audio_bytes } => {
                        let cursor = Cursor::new(audio_bytes);
                        match Decoder::new(cursor) {
                            Ok(source) => sink.append(source),
                            Err(error) => {
                                emit_playback_error(
                                    &app,
                                    Some(token),
                                    format!("Unable to decode native playback audio: {error}"),
                                );
                                sink.stop();
                                clear_active_if_token_matches(&app, token);
                                break;
                            }
                        }
                    }
                    PlaybackCommand::Finish => {
                        finish_requested = true;
                    }
                    PlaybackCommand::Stop => {
                        sink.stop();
                        break;
                    }
                }
            }
        })
        .map_err(|error| error.to_string())?;

    ready_rx
        .recv()
        .map_err(|_| "Native playback failed to initialize.".to_string())??;

    Ok(ActiveVoicePlayback {
        token,
        command_tx,
        thread: playback_thread,
    })
}

#[tauri::command]
pub fn queue_voice_playback_chunk(
    app: AppHandle,
    state: State<'_, VoicePlaybackState>,
    request: VoicePlaybackChunkRequest,
) -> Result<VoicePlaybackChunkResponse, String> {
    let command = decode_playback_command(&request)?;

    let mut guard = state
        .inner()
        .playback
        .lock()
        .map_err(|_| "Voice playback state is unavailable.".to_string())?;
    if guard.active.is_none() {
        let token = guard.next_token.max(1);
        guard.next_token = token.saturating_add(1);
        guard.active = Some(spawn_playback_thread(app, token)?);
    }

    let active = guard
        .active
        .as_ref()
        .ok_or_else(|| "Voice playback is unavailable.".to_string())?;
    active
        .command_tx
        .send(command)
        .map_err(|_| "Native playback thread is unavailable.".to_string())?;

    Ok(VoicePlaybackChunkResponse {
        playback_backend: PLAYBACK_BACKEND.to_string(),
        token: active.token,
    })
}

#[tauri::command]
pub fn finish_voice_playback(
    state: State<'_, VoicePlaybackState>,
    request: VoicePlaybackFinishRequest,
) -> Result<(), String> {
    let guard = state
        .inner()
        .playback
        .lock()
        .map_err(|_| "Voice playback state is unavailable.".to_string())?;
    let Some(active) = guard.active.as_ref() else {
        return Ok(());
    };
    if active.token != request.token {
        return Ok(());
    }

    active
        .command_tx
        .send(PlaybackCommand::Finish)
        .map_err(|_| "Native playback thread is unavailable.".to_string())
}

#[tauri::command]
pub fn stop_voice_playback(state: State<'_, VoicePlaybackState>) -> Result<(), String> {
    let active = {
        let mut guard = state
        .inner()
        .playback
        .lock()
        .map_err(|_| "Voice playback state is unavailable.".to_string())?;
        let active = guard.active.take();
        guard.next_token = guard.next_token.saturating_add(1);
        active
    };

    if let Some(active) = active {
        let _ = active.command_tx.send(PlaybackCommand::Stop);
        active
            .thread
            .join()
            .map_err(|_| "Native playback thread failed to stop.".to_string())?;
    }

    Ok(())
}
