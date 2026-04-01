use std::collections::VecDeque;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

const DEFAULT_CHUNK_MILLIS: u32 = 32;
const MIN_CHUNK_MILLIS: u32 = 20;
const MAX_CHUNK_MILLIS: u32 = 200;
const CAPTURE_BACKEND: &str = "rust-cpal";
const VOICE_CAPTURE_CHUNK_EVENT: &str = "voice-capture-chunk";
const VOICE_CAPTURE_ERROR_EVENT: &str = "voice-capture-error";

#[derive(Default)]
pub struct VoiceCaptureState {
    capture: Mutex<Option<ActiveVoiceCapture>>,
}

struct ActiveVoiceCapture {
    stop_tx: mpsc::Sender<()>,
    thread: thread::JoinHandle<()>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCaptureConfig {
    pub chunk_millis: Option<u32>,
    pub preferred_device: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCaptureSessionInfo {
    pub capture_backend: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub chunk_millis: u32,
    pub device_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureChunkPayload {
    pcm_base64: String,
    sample_rate: u32,
    channels: u16,
    capture_backend: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCaptureErrorPayload {
    message: String,
}

struct CaptureAccumulator {
    input_channels: usize,
    sample_rate: u32,
    chunk_frames: usize,
    mono_buffer: VecDeque<i16>,
}

impl CaptureAccumulator {
    fn new(input_channels: u16, sample_rate: u32, chunk_millis: u32) -> Self {
        let channels = usize::from(input_channels.max(1));
        let frames = ((sample_rate as u64 * chunk_millis as u64) / 1000).max(1) as usize;

        Self {
            input_channels: channels,
            sample_rate,
            chunk_frames: frames,
            mono_buffer: VecDeque::with_capacity(frames * 2),
        }
    }

    fn push_f32(&mut self, input: &[f32]) -> Vec<VoiceCaptureChunkPayload> {
        self.push_frames(input, |sample| float_to_pcm16(*sample))
    }

    fn push_i16(&mut self, input: &[i16]) -> Vec<VoiceCaptureChunkPayload> {
        self.push_frames(input, |sample| *sample)
    }

    fn push_u16(&mut self, input: &[u16]) -> Vec<VoiceCaptureChunkPayload> {
        self.push_frames(input, |sample| {
            let centered = i32::from(*sample) - 32768;
            centered.clamp(i32::from(i16::MIN), i32::from(i16::MAX)) as i16
        })
    }

    fn push_frames<T>(
        &mut self,
        input: &[T],
        map_sample: impl Fn(&T) -> i16,
    ) -> Vec<VoiceCaptureChunkPayload> {
        if self.input_channels == 0 {
            return Vec::new();
        }

        for frame in input.chunks(self.input_channels) {
            if frame.is_empty() {
                continue;
            }

            let mut mixed = 0f32;
            for sample in frame {
                mixed += f32::from(map_sample(sample)) / 32768.0;
            }
            mixed /= frame.len() as f32;
            self.mono_buffer.push_back(float_to_pcm16(mixed));
        }

        self.drain_chunks()
    }

    fn drain_chunks(&mut self) -> Vec<VoiceCaptureChunkPayload> {
        let mut payloads = Vec::new();

        while self.mono_buffer.len() >= self.chunk_frames {
            let mut bytes = Vec::with_capacity(self.chunk_frames * 2);
            for _ in 0..self.chunk_frames {
                if let Some(sample) = self.mono_buffer.pop_front() {
                    bytes.extend_from_slice(&sample.to_le_bytes());
                }
            }

            payloads.push(VoiceCaptureChunkPayload {
                pcm_base64: BASE64_STANDARD.encode(bytes),
                sample_rate: self.sample_rate,
                channels: 1,
                capture_backend: CAPTURE_BACKEND.to_string(),
            });
        }

        payloads
    }
}

fn float_to_pcm16(sample: f32) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    if clamped < 0.0 {
        (clamped * 32768.0) as i16
    } else {
        (clamped * 32767.0) as i16
    }
}

fn emit_capture_error(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit(
        VOICE_CAPTURE_ERROR_EVENT,
        VoiceCaptureErrorPayload {
            message: message.into(),
        },
    );
}

fn emit_chunk_payloads(app: &AppHandle, payloads: Vec<VoiceCaptureChunkPayload>) {
    for payload in payloads {
        let _ = app.emit(VOICE_CAPTURE_CHUNK_EVENT, payload);
    }
}

fn with_accumulator(
    accumulator: &Arc<Mutex<CaptureAccumulator>>,
    build_payloads: impl FnOnce(&mut CaptureAccumulator) -> Vec<VoiceCaptureChunkPayload>,
) -> Vec<VoiceCaptureChunkPayload> {
    match accumulator.lock() {
        Ok(mut guard) => build_payloads(&mut guard),
        Err(_) => Vec::new(),
    }
}

fn build_input_stream(
    app: AppHandle,
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    accumulator: Arc<Mutex<CaptureAccumulator>>,
) -> Result<cpal::Stream, String> {
    let error_app = app.clone();
    let error_callback = move |error: cpal::StreamError| {
        emit_capture_error(&error_app, format!("Native voice capture failed: {error}"));
    };

    match sample_format {
        cpal::SampleFormat::F32 => {
            let app_handle = app.clone();
            let accumulator_ref = accumulator.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[f32], _info| {
                        let payloads =
                            with_accumulator(&accumulator_ref, |state| state.push_f32(data));
                        emit_chunk_payloads(&app_handle, payloads);
                    },
                    error_callback,
                    None,
                )
                .map_err(|error| error.to_string())
        }
        cpal::SampleFormat::I16 => {
            let app_handle = app.clone();
            let accumulator_ref = accumulator.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[i16], _info| {
                        let payloads =
                            with_accumulator(&accumulator_ref, |state| state.push_i16(data));
                        emit_chunk_payloads(&app_handle, payloads);
                    },
                    error_callback,
                    None,
                )
                .map_err(|error| error.to_string())
        }
        cpal::SampleFormat::U16 => {
            let app_handle = app.clone();
            let accumulator_ref = accumulator.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[u16], _info| {
                        let payloads =
                            with_accumulator(&accumulator_ref, |state| state.push_u16(data));
                        emit_chunk_payloads(&app_handle, payloads);
                    },
                    error_callback,
                    None,
                )
                .map_err(|error| error.to_string())
        }
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn normalize_capture_config(config: Option<VoiceCaptureConfig>) -> VoiceCaptureConfig {
    let chunk_millis = config
        .as_ref()
        .and_then(|item| item.chunk_millis)
        .unwrap_or(DEFAULT_CHUNK_MILLIS)
        .clamp(MIN_CHUNK_MILLIS, MAX_CHUNK_MILLIS);

    VoiceCaptureConfig {
        chunk_millis: Some(chunk_millis),
        preferred_device: config
            .and_then(|item| item.preferred_device)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    }
}

fn resolve_input_device(
    host: &cpal::Host,
    preferred_device: Option<&str>,
) -> Result<cpal::Device, String> {
    if let Some(preferred) = preferred_device {
        let preferred_lower = preferred.to_lowercase();
        let devices = host.input_devices().map_err(|error| error.to_string())?;
        for device in devices {
            let Ok(name) = device.name() else {
                continue;
            };
            let normalized_name = name.to_lowercase();
            if normalized_name == preferred_lower || normalized_name.contains(&preferred_lower) {
                return Ok(device);
            }
        }
    }

    host.default_input_device()
        .ok_or_else(|| "No input microphone device is available.".to_string())
}

fn resolve_buffer_size(
    supported_config: &cpal::SupportedStreamConfig,
    target_chunk_millis: u32,
) -> cpal::BufferSize {
    let target_frames =
        ((supported_config.sample_rate().0 as u64 * target_chunk_millis as u64) / 1000).max(128)
            as u32;

    match supported_config.buffer_size() {
        cpal::SupportedBufferSize::Range { min, max } => {
            cpal::BufferSize::Fixed(target_frames.clamp(*min, *max))
        }
        _ => cpal::BufferSize::Default,
    }
}

fn build_capture_session(
    app: AppHandle,
    config: VoiceCaptureConfig,
) -> Result<(cpal::Stream, VoiceCaptureSessionInfo), String> {
    let chunk_millis = config.chunk_millis.unwrap_or(DEFAULT_CHUNK_MILLIS);
    let host = cpal::default_host();
    let device = resolve_input_device(&host, config.preferred_device.as_deref())?;
    let device_name = device
        .name()
        .unwrap_or_else(|_| "default-input".to_string());
    let supported_config = device.default_input_config().map_err(|error| error.to_string())?;
    let sample_format = supported_config.sample_format();
    let stream_config = cpal::StreamConfig {
        channels: supported_config.channels(),
        sample_rate: supported_config.sample_rate(),
        buffer_size: resolve_buffer_size(&supported_config, chunk_millis),
    };
    let accumulator = Arc::new(Mutex::new(CaptureAccumulator::new(
        stream_config.channels,
        stream_config.sample_rate.0,
        chunk_millis,
    )));

    let stream = build_input_stream(
        app,
        &device,
        &stream_config,
        sample_format,
        accumulator,
    )?;
    stream.play().map_err(|error| error.to_string())?;

    Ok((
        stream,
        VoiceCaptureSessionInfo {
            capture_backend: CAPTURE_BACKEND.to_string(),
            sample_rate: stream_config.sample_rate.0,
            channels: 1,
            chunk_millis,
            device_name,
        },
    ))
}

fn stop_active_capture(state: &VoiceCaptureState) -> Result<(), String> {
    let active_capture = match state.capture.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => return Err("Voice capture state is unavailable.".to_string()),
    };

    if let Some(active) = active_capture {
        let _ = active.stop_tx.send(());
        let _ = active.thread.join();
    }

    Ok(())
}

#[tauri::command]
pub fn start_voice_capture(
    app: AppHandle,
    state: State<'_, VoiceCaptureState>,
    config: Option<VoiceCaptureConfig>,
) -> Result<VoiceCaptureSessionInfo, String> {
    stop_active_capture(state.inner())?;

    let normalized_config = normalize_capture_config(config);
    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<VoiceCaptureSessionInfo, String>>(1);
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app_handle = app.clone();

    let capture_thread = thread::Builder::new()
        .name("table-pet-voice-capture".to_string())
        .spawn(move || match build_capture_session(app_handle.clone(), normalized_config) {
            Ok((stream, session_info)) => {
                let _ = ready_tx.send(Ok(session_info));
                let _ = stop_rx.recv();
                drop(stream);
            }
            Err(error) => {
                let _ = ready_tx.send(Err(error));
            }
        })
        .map_err(|error| error.to_string())?;

    let session_info = ready_rx
        .recv()
        .map_err(|_| "Native voice capture failed to initialize.".to_string())??;

    match state.inner().capture.lock() {
        Ok(mut guard) => {
            *guard = Some(ActiveVoiceCapture {
                stop_tx,
                thread: capture_thread,
            });
        }
        Err(_) => {
            let _ = stop_tx.send(());
            let _ = capture_thread.join();
            return Err("Voice capture state is unavailable.".to_string());
        }
    }

    Ok(session_info)
}

#[tauri::command]
pub fn stop_voice_capture(state: State<'_, VoiceCaptureState>) -> Result<(), String> {
    stop_active_capture(state.inner())
}
