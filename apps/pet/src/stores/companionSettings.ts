import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  loadDesktopPetSettings,
  saveDesktopPetSettings,
  type DesktopPetSettings,
} from '@table-pet/shared';

export const useCompanionSettingsStore = defineStore(
  'companionSettings',
  () => {
    const settings = ref<DesktopPetSettings>(loadDesktopPetSettings());

    function load() {
      settings.value = loadDesktopPetSettings();
      return settings.value;
    }

    function applySettings(next: Partial<DesktopPetSettings>) {
      settings.value = {
        ...settings.value,
        ...next,
      };
      return settings.value;
    }

    function save(next?: Partial<DesktopPetSettings>) {
      settings.value = saveDesktopPetSettings(next ?? settings.value);
      return settings.value;
    }

    return {
      settings,
      load,
      applySettings,
      save,
    };
  },
);
