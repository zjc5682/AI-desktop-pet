import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StageModelSelection, StageMotion } from '@table-pet/stage';
import { desktopStageModelRepository } from '../stage/desktopStageModelRepository';

export const useLive2DStore = defineStore('live2d', () => {
  const models = ref<string[]>([]);
  const currentModel = ref<string | null>(null);
  const activeModelPath = ref('/models/histoire/model.json');
  const motions = ref<StageMotion[]>([]);
  const expressions = ref<string[]>([]);
  const useDefaultModel = ref(true);

  async function loadModels() {
    models.value = await desktopStageModelRepository.listUploadedModels();
  }

  async function selectDefaultModel() {
    const manifest = await desktopStageModelRepository.getDefaultModelManifest();
    useDefaultModel.value = true;
    currentModel.value = null;
    activeModelPath.value = manifest.modelPath;
    motions.value = manifest.motions;
    expressions.value = manifest.expressions;
  }

  async function selectModel(modelName: string) {
    const manifest =
      await desktopStageModelRepository.getUploadedModelManifest(modelName);
    if (!manifest) {
      await selectDefaultModel();
      return;
    }

    useDefaultModel.value = false;
    currentModel.value = modelName;
    activeModelPath.value = manifest.modelPath;
    motions.value = manifest.motions;
    expressions.value = manifest.expressions;
  }

  async function applySelection(selection: StageModelSelection) {
    if (selection.useDefaultModel || !selection.selectedModel) {
      await selectDefaultModel();
      return;
    }

    const exists = models.value.includes(selection.selectedModel);
    if (!exists) {
      await selectDefaultModel();
      return;
    }

    await selectModel(selection.selectedModel);
  }

  async function initialize(selection?: StageModelSelection) {
    await loadModels();
    await applySelection(
      selection ?? {
        useDefaultModel: true,
        selectedModel: null,
      },
    );
  }

  async function uploadModel() {
    const modelName = await desktopStageModelRepository.uploadModel();
    await loadModels();
    return modelName;
  }

  async function deleteModel(modelName: string) {
    await desktopStageModelRepository.deleteModel(modelName);
    await loadModels();

    if (currentModel.value === modelName) {
      await selectDefaultModel();
    }
  }

  function getDefaultModelUrl() {
    return '/models/histoire/model.json';
  }

  return {
    models,
    currentModel,
    activeModelPath,
    motions,
    expressions,
    useDefaultModel,
    loadModels,
    initialize,
    applySelection,
    uploadModel,
    selectModel,
    selectDefaultModel,
    deleteModel,
    getDefaultModelUrl,
  };
});
