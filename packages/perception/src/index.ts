export interface ImageRef {
  mimeType: string;
  data: Uint8Array;
}

export interface VideoFrameRef {
  width: number;
  height: number;
  timestamp: number;
  data?: Uint8Array;
}

export interface FaceState {
  detected: boolean;
  yaw?: number;
  pitch?: number;
  roll?: number;
  expression?:
    | 'happy'
    | 'tired'
    | 'focused'
    | 'surprised'
    | 'neutral'
    | 'sad'
    | 'angry';
  expressionConfidence?: number;
  confidence?: number;
  faceCenterX?: number;
  faceCenterY?: number;
  gazeX?: number;
  gazeY?: number;
  eyeContact?: boolean;
  eyeContactConfidence?: number;
}

export interface GestureState {
  name: 'wave' | 'thumbs_up' | 'point' | 'peace' | 'ok' | 'open_palm' | 'unknown';
  confidence: number;
}

export interface ScreenScene {
  kind: 'battle' | 'menu' | 'death' | 'victory' | 'dialogue' | 'unknown';
  confidence: number;
}

export interface VoiceEmotion {
  label: 'calm' | 'happy' | 'angry' | 'sad' | 'excited' | 'unknown';
  confidence: number;
}

export interface VadState {
  active: boolean;
  startedAt?: number;
  endedAt?: number;
}

export interface CaptureTarget {
  source: 'screen' | 'window' | 'game';
  targetId?: string;
  fps?: number;
}

export interface VisionService {
  startCamera(): Promise<void>;
  stopCamera(): Promise<void>;
  detectFace(frame: VideoFrameRef): Promise<FaceState | null>;
  detectGesture(frame: VideoFrameRef): Promise<GestureState[]>;
}

export interface ScreenService {
  startCapture(target: CaptureTarget): Promise<void>;
  stopCapture(): Promise<void>;
  classifyScene(frame: ImageRef): Promise<ScreenScene>;
}

export interface AudioPerceptionService {
  startMic(): Promise<void>;
  stopMic(): Promise<void>;
  detectVad(frame: Float32Array): VadState;
  detectEmotion(audio: Float32Array): Promise<VoiceEmotion>;
}
