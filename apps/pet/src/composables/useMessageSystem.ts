import {
  CharacterMessageController,
  DEFAULT_CHARACTER_MESSAGES,
  type CharacterMessageConfig,
} from '@table-pet/character';
import { onUnmounted, ref } from 'vue';

interface MessageSystemOptions {
  enabled?: boolean;
  messages?: CharacterMessageConfig;
}

export function useMessageSystem(options: MessageSystemOptions = {}) {
  const controller = new CharacterMessageController(
    options.messages ?? DEFAULT_CHARACTER_MESSAGES,
  );
  const initialState = controller.getState();
  let currentMessages = controller.getMessages();
  const showMessage = ref(initialState.visible);
  const messageText = ref(initialState.text);

  controller.setEnabled(options.enabled ?? true);

  const unsubscribe = controller.subscribe((state) => {
    showMessage.value = state.visible;
    messageText.value = state.text;
  });

  onUnmounted(() => {
    unsubscribe();
    controller.hide();
  });

  const setMessages = (messages: CharacterMessageConfig) => {
    controller.setMessages(messages);
    currentMessages = controller.getMessages();
  };

  return {
    showMessage,
    messageText,
    get messages() {
      return currentMessages;
    },
    show: controller.show.bind(controller),
    showRandom: controller.showRandom.bind(controller),
    hide: controller.hide.bind(controller),
    setEnabled: controller.setEnabled.bind(controller),
    setMessages,
  };
}
