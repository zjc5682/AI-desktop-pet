import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  loadCompanionSettings,
  saveCompanionSettings,
  type CompanionSettings,
} from '@table-pet/shared';

export const useCompanionConfigStore = defineStore('companionConfig', () => {
  const settings = ref<CompanionSettings>(loadCompanionSettings());

  function load() {
    settings.value = loadCompanionSettings();
    return settings.value;
  }

  function applySettings(next: Partial<CompanionSettings>) {
    settings.value = {
      ...settings.value,
      ...next,
    };
    return settings.value;
  }

  function save(next?: Partial<CompanionSettings>) {
    settings.value = saveCompanionSettings(next ?? settings.value);
    return settings.value;
  }

  return {
    settings,
    load,
    applySettings,
    save,
  };
});
