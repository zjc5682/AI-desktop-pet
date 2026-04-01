import type { AudioChunk } from '@table-pet/providers';

export interface TranscriptDelta {
  text: string;
  isFinal?: boolean;
}

export interface AssistantAudioDelta {
  chunk: AudioChunk;
  done?: boolean;
}

export interface RealtimeSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  pushMicFrame(frame: Float32Array): void;
  onPartialTranscript(callback: (delta: TranscriptDelta) => void): void;
  onAssistantAudio(callback: (delta: AssistantAudioDelta) => void): void;
  interruptAssistant(): Promise<void>;
}

export class NoopRealtimeSession implements RealtimeSession {
  start(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  pushMicFrame(_frame: Float32Array): void {}

  onPartialTranscript(_callback: (delta: TranscriptDelta) => void): void {}

  onAssistantAudio(_callback: (delta: AssistantAudioDelta) => void): void {}

  interruptAssistant(): Promise<void> {
    return Promise.resolve();
  }
}
