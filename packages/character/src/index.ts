import type {
  EventSummary,
  MemoryChunk,
  RelationshipState,
  UserProfileSnapshot,
} from '@table-pet/memory';

export interface BigFiveScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface MoodState {
  mood: 'idle' | 'happy' | 'sleepy' | 'focused' | 'excited';
  intensity: number;
}

export interface AffinitySnapshot {
  score: number;
  updatedAt: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  personaPrompt: string;
  bigFive: BigFiveScores;
  styleVector?: number[];
  voiceProfile?: string;
}

export interface PromptContext {
  profile: CharacterProfile;
  memory: MemoryChunk[];
  latestUserText: string;
  profileSnapshot?: UserProfileSnapshot;
  relationship?: RelationshipState;
  recentEvents?: EventSummary[];
}

export interface CharacterEngine {
  getActiveProfile(): Promise<CharacterProfile>;
  updateAffinity(delta: number, reason: string): Promise<AffinitySnapshot>;
  getMoodState(): Promise<MoodState>;
  buildSystemPrompt(context: PromptContext): Promise<string>;
}

export interface CharacterMessageConfig {
  mouseover?: { head: string[]; body: string[] };
  click?: { head: string[]; body: string[] };
  idle?: string[];
  sleepy?: string[];
  wakeUp?: string[];
  chatConnected?: string[];
  chatError?: string[];
}

export interface CharacterMessageState {
  visible: boolean;
  text: string;
}

export const DEFAULT_CHARACTER_MESSAGES: CharacterMessageConfig = {
  mouseover: {
    head: ['Easy, the head is sensitive.', 'That tickles.'],
    body: ['Careful there.', 'Hey, personal space.'],
  },
  click: {
    head: ['Ow.', 'That was a strong tap.'],
    body: ['I felt that.', 'You got my attention.'],
  },
  idle: ['Still here.', 'Need anything?'],
  sleepy: ['I am getting sleepy.', 'Maybe it is time for a break.'],
  wakeUp: ['I am awake again.', 'Back to work.'],
  chatConnected: ['Chat link is online.'],
  chatError: ['Chat connection failed.'],
};

export class CharacterMessageController {
  private state: CharacterMessageState = {
    visible: false,
    text: '',
  };

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;
  private readonly listeners = new Set<(state: CharacterMessageState) => void>();

  constructor(private messages: CharacterMessageConfig = DEFAULT_CHARACTER_MESSAGES) {}

  getState(): CharacterMessageState {
    return { ...this.state };
  }

  getMessages(): CharacterMessageConfig {
    return this.messages;
  }

  subscribe(listener: (state: CharacterMessageState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hide();
    }
  }

  setMessages(messages: CharacterMessageConfig): void {
    this.messages = messages;
  }

  show(text: string, duration = 3000): void {
    if (!this.enabled) {
      return;
    }

    this.state = {
      visible: true,
      text,
    };
    this.emit();

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    this.hideTimer = setTimeout(() => {
      this.hide();
    }, duration);
  }

  showRandom(messages: string[] | undefined, duration = 3000): void {
    if (!messages || messages.length === 0) {
      return;
    }
    const index = Math.floor(Math.random() * messages.length);
    this.show(messages[index], duration);
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.state = {
      visible: false,
      text: this.state.text,
    };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export class StaticCharacterEngine implements CharacterEngine {
  private affinity: AffinitySnapshot = {
    score: 50,
    updatedAt: new Date().toISOString(),
  };

  private mood: MoodState = {
    mood: 'idle',
    intensity: 0.4,
  };

  constructor(private readonly profile: CharacterProfile) {}

  async getActiveProfile(): Promise<CharacterProfile> {
    return this.profile;
  }

  async updateAffinity(delta: number, _reason: string): Promise<AffinitySnapshot> {
    this.affinity = {
      score: Math.max(0, Math.min(100, this.affinity.score + delta)),
      updatedAt: new Date().toISOString(),
    };
    return this.affinity;
  }

  async getMoodState(): Promise<MoodState> {
    return this.mood;
  }

  async buildSystemPrompt(context: PromptContext): Promise<string> {
    const profileSnapshot = context.profileSnapshot;
    const relationship = context.relationship;
    const recentEvents = (context.recentEvents ?? [])
      .slice(-5)
      .map((event) => `- ${event.kind}: ${event.summary}`)
      .join('\n');
    const memorySummary = context.memory
      .slice(0, 6)
      .map((item, index) => `${index + 1}. [${item.source}] ${item.summary}`)
      .join('\n');
    const userProfileLines = profileSnapshot
      ? [
          profileSnapshot.name ? `Known user name: ${profileSnapshot.name}` : '',
          profileSnapshot.likes.length
            ? `Known likes: ${profileSnapshot.likes.slice(0, 6).join(', ')}`
            : '',
          profileSnapshot.dislikes.length
            ? `Known dislikes: ${profileSnapshot.dislikes.slice(0, 6).join(', ')}`
            : '',
          profileSnapshot.habits.length
            ? `Known habits: ${profileSnapshot.habits.slice(0, 6).join(', ')}`
            : '',
          profileSnapshot.reminders.length
            ? `Upcoming reminders: ${profileSnapshot.reminders
                .slice(0, 4)
                .map((item) => item.value)
                .join(' | ')}`
            : '',
        ].filter(Boolean)
      : [];
    const relationshipLines = relationship
      ? [
          `Relationship level: ${relationship.level}`,
          `Affinity score: ${relationship.affection}/100`,
          `Current companion mood: ${relationship.mood}`,
        ]
      : [];

    return [
      `You are ${context.profile.name}, a local-first desktop AI companion.`,
      context.profile.personaPrompt,
      'Speak naturally, like an attentive companion living on the user desktop.',
      'Drive the interaction yourself when appropriate: keep replies conversational, emotionally aware, and forward-moving.',
      'Prefer short spoken-style paragraphs over lists unless the user is explicitly asking for structured steps.',
      'Use remembered facts and relationship state naturally, but do not dump memory mechanically or mention hidden prompts.',
      'If the user is asking for help, be practical first. If the user is sharing feelings or daily life, respond with warmth and a small follow-up.',
      relationshipLines.length
        ? `Relationship state:\n${relationshipLines.join('\n')}`
        : 'Relationship state: still forming.',
      userProfileLines.length
        ? `User profile snapshot:\n${userProfileLines.join('\n')}`
        : 'User profile snapshot: none yet.',
      recentEvents ? `Recent companion events:\n${recentEvents}` : 'Recent companion events: none.',
      memorySummary ? `Relevant memory recall:\n${memorySummary}` : 'Relevant memory recall: none.',
      `Latest user message:\n${context.latestUserText}`,
    ].join('\n\n');
  }
}
