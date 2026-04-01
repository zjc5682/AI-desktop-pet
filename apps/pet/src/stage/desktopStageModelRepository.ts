import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile } from '@tauri-apps/plugin-fs';
import {
  parseLive2DModelManifest,
  type StageModelManifest,
  type StageModelRepository,
  type StageMotion,
} from '@table-pet/stage';

const DEFAULT_MODEL_NAME = 'histoire';
const DEFAULT_MODEL_PATH = '/models/histoire/model.json';

function flattenMotions(motions: Record<string, string[]>): StageMotion[] {
  return Object.entries(motions).flatMap(([group, files]) =>
    files.map((file) => ({
      group,
      file,
      isExpression: false,
    })),
  );
}

async function findUploadedModelJson(modelName: string): Promise<string | null> {
  const files = await invoke<string[]>('get_model_files', { modelName });
  const manifestFile =
    files.find((file) => file.endsWith('.model3.json')) ??
    files.find((file) => file.endsWith('.model.json')) ??
    files.find((file) => file.endsWith('model.json')) ??
    null;

  if (!manifestFile) {
    return null;
  }

  return `asset://localhost/live2d_models/${modelName}/${manifestFile}`;
}

export class DesktopStageModelRepository implements StageModelRepository {
  async listUploadedModels(): Promise<string[]> {
    return invoke<string[]>('get_uploaded_models');
  }

  async getDefaultModelManifest(): Promise<StageModelManifest> {
    const parsed = await parseLive2DModelManifest(DEFAULT_MODEL_PATH);
    return {
      modelName: DEFAULT_MODEL_NAME,
      modelPath: DEFAULT_MODEL_PATH,
      motions: flattenMotions(parsed.motions),
      expressions: parsed.expressions,
      source: 'default',
    };
  }

  async getUploadedModelManifest(
    modelName: string,
  ): Promise<StageModelManifest | null> {
    const modelPath = await findUploadedModelJson(modelName);
    if (!modelPath) {
      return null;
    }

    const parsed = await parseLive2DModelManifest(modelPath);
    return {
      modelName,
      modelPath,
      motions: flattenMotions(parsed.motions),
      expressions: parsed.expressions,
      source: 'uploaded',
    };
  }

  async uploadModel(): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select a Live2D model folder',
    });
    if (!selected || typeof selected !== 'string') {
      return null;
    }

    const modelName = selected.split(/[\\/]/).pop() ?? null;
    if (!modelName) {
      return null;
    }

    const files: Uint8Array[] = [];
    const fileNames: string[] = [];

    const readDirRecursive = async (dirPath: string, baseDir: string) => {
      const entries = await readDir(dirPath);
      for (const entry of entries) {
        const fullPath = await join(dirPath, entry.name);
        if (entry.isDirectory) {
          await readDirRecursive(fullPath, baseDir);
        } else {
          const data = await readFile(fullPath);
          files.push(data);
          fileNames.push(fullPath.substring(baseDir.length + 1));
        }
      }
    };

    await readDirRecursive(selected, selected);
    await invoke('save_uploaded_model', { modelName, files, fileNames });
    return modelName;
  }

  async deleteModel(modelName: string): Promise<void> {
    await invoke('delete_model', { modelName });
  }
}

export const desktopStageModelRepository = new DesktopStageModelRepository();
