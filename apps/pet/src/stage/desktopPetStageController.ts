import type {
  LipSyncFrame,
  Live2DModelConfig,
  StageController,
  StageLookTarget,
  StageMode,
  StageMood,
} from '@table-pet/stage';

export interface DesktopPetStageCanvasApi {
  playMotion(name: string, index?: number): Promise<void> | void;
  playExpression(name: string): Promise<void> | void;
  setLookTarget(target: StageLookTarget): void;
  syncLipSync(frame: LipSyncFrame): void;
}

export class DesktopPetStageController implements StageController {
  private canvasApi: DesktopPetStageCanvasApi | null = null;
  private mode: StageMode = 'desktop';
  private mood: StageMood = 'idle';
  private model: Live2DModelConfig | null = null;
  private pendingLookTarget: StageLookTarget | null = null;

  attachCanvas(api: DesktopPetStageCanvasApi): void {
    this.canvasApi = api;

    if (this.pendingLookTarget) {
      this.canvasApi.setLookTarget(this.pendingLookTarget);
    }
  }

  detachCanvas(): void {
    this.canvasApi = null;
  }

  async setModel(model: Live2DModelConfig): Promise<void> {
    this.model = model;
  }

  async setExpression(name: string): Promise<void> {
    await this.canvasApi?.playExpression(name);
  }

  async playMotion(name: string): Promise<void> {
    await this.canvasApi?.playMotion(name);
  }

  async setMood(mood: StageMood): Promise<void> {
    this.mood = mood;
  }

  lookAt(target: StageLookTarget): void {
    this.pendingLookTarget = target;
    this.canvasApi?.setLookTarget(target);
  }

  syncLipSync(frame: LipSyncFrame): void {
    this.canvasApi?.syncLipSync(frame);
  }

  async switchMode(mode: StageMode): Promise<void> {
    this.mode = mode;
  }

  getMode(): StageMode {
    return this.mode;
  }

  getMood(): StageMood {
    return this.mood;
  }

  getModel(): Live2DModelConfig | null {
    return this.model;
  }
}

export const desktopPetStageController = new DesktopPetStageController();
