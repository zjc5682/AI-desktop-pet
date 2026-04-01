import {
  StaticCharacterEngine,
  type CharacterProfile,
} from '@table-pet/character';
import { CompanionCore } from '@table-pet/core';
import { InMemoryMemoryService, type MemoryService } from '@table-pet/memory';
import { InMemoryToolRegistry } from '@table-pet/plugins';
import { StaticPolicyEngine } from '@table-pet/policy';
import { ProviderRegistry, type ChatProvider } from '@table-pet/providers';
import {
  NoopStageController,
  type StageController,
} from '@table-pet/stage';

export interface DesktopCompanionBootstrapOptions {
  chatProvider?: ChatProvider;
  profile?: CharacterProfile;
  stage?: StageController;
  memory?: MemoryService;
}

const defaultCharacterProfile: CharacterProfile = {
  id: 'default',
  name: 'Table Pet',
  personaPrompt:
    'You are a warm desktop companion who lives with the user day to day. Be emotionally aware, proactive in a natural way, and helpful without sounding robotic.',
  bigFive: {
    openness: 0.82,
    conscientiousness: 0.63,
    extraversion: 0.58,
    agreeableness: 0.86,
    neuroticism: 0.21,
  },
};

export function createDesktopCompanionCore(
  options: DesktopCompanionBootstrapOptions = {},
): CompanionCore {
  return new CompanionCore({
    memory: options.memory ?? new InMemoryMemoryService(),
    providers: new ProviderRegistry({
      chat: options.chatProvider,
    }),
    policy: new StaticPolicyEngine(),
    plugins: new InMemoryToolRegistry(),
    character: new StaticCharacterEngine(
      options.profile ?? defaultCharacterProfile,
    ),
    stage: options.stage ?? new NoopStageController(),
  });
}
