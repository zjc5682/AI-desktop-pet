import { invoke } from '@tauri-apps/api/core';

export interface BatterySnapshot {
  percentage: number;
  isCharging: boolean;
}

export interface SystemMetrics {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  totalMemoryBytes: number;
  usedMemoryBytes: number;
  cpuTemperatureC?: number | null;
  gpuTemperatureC?: number | null;
  battery?: BatterySnapshot | null;
}

export interface OrganizedFile {
  from: string;
  to: string;
  category: string;
}

export interface OrganizeDirectoryResponse {
  root: string;
  movedCount: number;
  moved: OrganizedFile[];
}

export interface RenamedFile {
  from: string;
  to: string;
}

export interface BatchRenameResponse {
  root: string;
  renamedCount: number;
  renamed: RenamedFile[];
}

export interface WebpagePreview {
  url: string;
  title: string;
  excerpt: string;
  content: string;
}

export interface ScreenshotCaptureResult {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ScreenshotCaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackendServiceStatus {
  running: boolean;
  started: boolean;
  host: string;
  port: number;
  url: string;
  pid?: number | null;
  backendDir: string;
  logPath: string;
  message: string;
}

function ensureDesktopRuntime() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('Desktop commands require the Tauri runtime.');
  }
}

function parseLocalBackendUrl(backendUrl?: string) {
  const raw = backendUrl?.trim() || 'ws://127.0.0.1:8766';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.trim().toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') {
      return null;
    }

    const port = Number(parsed.port || '8766');
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return null;
    }

    return {
      host: '127.0.0.1',
      port,
    };
  } catch {
    return null;
  }
}

export async function readClipboardText(): Promise<string> {
  ensureDesktopRuntime();
  return invoke<string>('read_clipboard_text');
}

export async function writeClipboardText(text: string): Promise<void> {
  ensureDesktopRuntime();
  return invoke<void>('write_clipboard_text', { text });
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  ensureDesktopRuntime();
  return invoke<SystemMetrics>('get_system_metrics');
}

export async function organizeDirectory(request: {
  path?: string;
  createFolders?: boolean;
}): Promise<OrganizeDirectoryResponse> {
  ensureDesktopRuntime();
  return invoke<OrganizeDirectoryResponse>('organize_directory', { request });
}

export async function batchRenameFiles(request: {
  directory: string;
  pattern: string;
}): Promise<BatchRenameResponse> {
  ensureDesktopRuntime();
  return invoke<BatchRenameResponse>('batch_rename_files', { request });
}

export async function toggleMainWindowVisibility(): Promise<boolean> {
  ensureDesktopRuntime();
  return invoke<boolean>('toggle_main_window_visibility');
}

export async function ensureBackendService(options?: {
  backendUrl?: string;
  timeoutMs?: number;
}): Promise<BackendServiceStatus | null> {
  ensureDesktopRuntime();

  const parsed = parseLocalBackendUrl(options?.backendUrl);
  if (!parsed) {
    return null;
  }

  try {
    return await invoke<BackendServiceStatus>('ensure_backend_service', {
      request: {
        host: parsed.host,
        port: parsed.port,
        timeoutMs: options?.timeoutMs ?? 12000,
      },
    });
  } catch (error) {
    console.error('Failed to ensure the local backend service.', error);
    const detail =
      error instanceof Error ? error.message : String(error ?? '').trim();
    throw new Error(
      detail
        ? `Unable to start the local backend service. ${detail}`
        : 'Unable to start the local backend service.',
    );
  }
}

export async function capturePrimaryScreen(options?: {
  hideMainWindow?: boolean;
  region?: ScreenshotCaptureRegion | null;
}): Promise<ScreenshotCaptureResult> {
  ensureDesktopRuntime();
  return invoke<ScreenshotCaptureResult>('capture_primary_screen', {
    hideMainWindow: options?.hideMainWindow ?? false,
    region: options?.region ?? null,
  });
}

export async function fetchWebpagePreview(url: string): Promise<WebpagePreview> {
  ensureDesktopRuntime();
  return invoke<WebpagePreview>('fetch_webpage_preview', { url });
}

export async function updateGlobalShortcuts(bindings: {
  bossKey: string;
  voiceRecord: string;
  screenshotTranslate: string;
}): Promise<string[]> {
  ensureDesktopRuntime();
  return invoke<string[]>('update_global_shortcuts', {
    bindings,
  });
}
