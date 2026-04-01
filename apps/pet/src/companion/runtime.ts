import {
  DesktopPetWebSocketChatClient,
  WebSocketChatProvider,
} from '@table-pet/providers';
import { BackendMemoryService, PersistentMemoryService } from '@table-pet/memory';
import { loadCompanionSettings } from '@table-pet/shared';
import { createDesktopCompanionCore } from './createDesktopCompanionCore';
import { desktopPetStageController } from '../stage/desktopPetStageController';

const chatClient = new DesktopPetWebSocketChatClient();
const memory = new BackendMemoryService(
  () => loadCompanionSettings().chatBackendUrl,
  new PersistentMemoryService(),
);
const core = createDesktopCompanionCore({
  chatProvider: new WebSocketChatProvider(chatClient),
  memory,
  stage: desktopPetStageController,
});

export function getDesktopCompanionRuntime() {
  return {
    chatClient,
    core,
    memory,
    stage: desktopPetStageController,
  };
}
