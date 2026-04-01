import type { ModelConfig } from '@table-pet/shared';

export interface HitArea {
  x: [number, number];
  y: [number, number];
}

export interface Live2DModelConfig extends ModelConfig {
  idleMotion?: string;
  manifestPath?: string;
  scale?: number;
  hitAreas?: {
    head?: HitArea;
    body?: HitArea;
    hand?: HitArea;
  };
}

export type StageMode = 'desktop' | 'focus' | 'game' | 'call' | 'sleep';
export type StageMood = 'idle' | 'happy' | 'sleepy' | 'focused' | 'excited';

export interface StageLookTarget {
  x: number;
  y: number;
}

export interface LipSyncFrame {
  energy: number;
  phoneme?: string;
}

export interface StageController {
  setModel(model: Live2DModelConfig): Promise<void>;
  setExpression(name: string): Promise<void>;
  playMotion(name: string): Promise<void>;
  setMood(mood: StageMood): Promise<void>;
  lookAt(target: StageLookTarget): void;
  syncLipSync(frame: LipSyncFrame): void;
  switchMode(mode: StageMode): Promise<void>;
}

export interface StageMotion {
  group: string;
  file: string;
  isExpression?: boolean;
}

export interface StageModelManifest {
  modelName: string;
  modelPath: string;
  motions: StageMotion[];
  expressions: string[];
  source: 'default' | 'uploaded';
}

export interface StageModelSelection {
  useDefaultModel: boolean;
  selectedModel: string | null;
}

export interface StageModelRepository {
  listUploadedModels(): Promise<string[]>;
  getDefaultModelManifest(): Promise<StageModelManifest>;
  getUploadedModelManifest(modelName: string): Promise<StageModelManifest | null>;
  uploadModel(): Promise<string | null>;
  deleteModel(modelName: string): Promise<void>;
}

export interface ParsedStageManifest {
  motions: Record<string, string[]>;
  expressions: string[];
}

export async function parseLive2DModelManifest(
  modelUrl: string,
): Promise<ParsedStageManifest> {
  const response = await fetch(modelUrl);
  const modelData = await response.json();
  const motions: Record<string, string[]> = {};
  const expressions: string[] = [];

  if (modelData.FileReferences?.Motions) {
    for (const [group, motionArray] of Object.entries(modelData.FileReferences.Motions)) {
      if (Array.isArray(motionArray)) {
        motions[group] = motionArray.map((item: any) => item.File);
      }
    }
  } else if (modelData.motions) {
    for (const [group, motionArray] of Object.entries(modelData.motions)) {
      if (Array.isArray(motionArray)) {
        motions[group] = motionArray.map((item: any) => item.file);
      }
    }
  }

  if (modelData.FileReferences?.Expressions) {
    for (const expression of modelData.FileReferences.Expressions) {
      if (expression.Name) {
        expressions.push(expression.Name);
      }
    }
  } else if (modelData.expressions) {
    for (const expression of modelData.expressions) {
      if (expression.name) {
        expressions.push(expression.name);
      }
    }
  }

  return { motions, expressions };
}

export class NoopStageController implements StageController {
  async setModel(_model: Live2DModelConfig): Promise<void> {}

  async setExpression(_name: string): Promise<void> {}

  async playMotion(_name: string): Promise<void> {}

  async setMood(_mood: StageMood): Promise<void> {}

  lookAt(_target: StageLookTarget): void {}

  syncLipSync(_frame: LipSyncFrame): void {}

  async switchMode(_mode: StageMode): Promise<void> {}
}
