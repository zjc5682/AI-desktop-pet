<template>
  <div class="settings-shell">
    <aside class="settings-sidebar">
      <div class="brand-block">
        <p class="brand-kicker">{{ t('sidebarKicker') }}</p>
        <h1>{{ t('sidebarTitle') }}</h1>
        <p class="brand-copy">
          {{ t('sidebarCopy') }}
        </p>
      </div>

      <div class="sidebar-runtime-card">
        <span class="status-label">{{ activeSectionMeta.label }}</span>
        <strong>{{ activeSectionMeta.note }}</strong>
        <p class="sidebar-runtime-copy">{{ heroCopyText }}</p>
      </div>

      <nav class="section-nav">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="['section-tab', { active: activeSection === section.id }]"
          @click="activeSection = section.id"
        >
          <span class="section-tab-label">{{ section.label }}</span>
          <span class="section-tab-note">{{ section.note }}</span>
        </button>
      </nav>

      <div class="sidebar-runtime-grid">
        <article
          v-for="entry in sidebarSummaryEntries"
          :key="entry.label"
          class="sidebar-mini-card"
        >
          <span class="status-label">{{ entry.label }}</span>
          <strong>{{ entry.value }}</strong>
        </article>
      </div>
    </aside>

    <main class="settings-content">
      <header class="hero-card">
        <div class="hero-main">
          <p class="hero-kicker">{{ t('heroKicker') }}</p>
          <h2>{{ t('heroTitle') }}</h2>
          <p class="hero-copy">
            {{ heroCopyText }}
          </p>
          <div class="hero-chip-row">
            <span class="hero-chip">{{ t('chatProvider') }} · {{ chatProviderLabel }}</span>
            <span class="hero-chip">{{ t('stt') }} · {{ sttProviderLabel }}</span>
            <span class="hero-chip">{{ t('tts') }} · {{ ttsProviderLabel }}</span>
            <span class="hero-chip">{{ t('visionBackend') }} · {{ visionBackendLabel }}</span>
          </div>
        </div>
        <div class="hero-side">
          <div class="language-switch">
            <span class="language-label">{{ t('languageLabel') }}</span>
            <div class="language-toggle">
              <button
                v-for="option in languageOptions"
                :key="option.id"
                :class="['language-chip', { active: currentLocale === option.id }]"
                @click="setUiLanguage(option.id)"
              >
                {{ t(option.labelKey) }}
              </button>
            </div>
          </div>

          <div class="hero-route-grid">
            <article
              v-for="entry in heroSignalEntries"
              :key="entry.label"
              class="hero-route-card"
            >
              <span class="status-label">{{ entry.label }}</span>
              <strong>{{ entry.value }}</strong>
            </article>
          </div>

          <div class="status-grid">
            <div class="status-pill">
              <span class="status-label">{{ t('statusChat') }}</span>
              <strong>{{ settings.enableChat ? t('statusEnabled') : t('statusDisabled') }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('statusVoice') }}</span>
              <strong>{{ companionSettings.voiceEnabled ? t('statusArmed') : t('statusOff') }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('statusCamera') }}</span>
              <strong>{{ companionSettings.cameraEnabled ? t('statusArmed') : t('statusOff') }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('statusMemory') }}</span>
              <strong>{{ heroMemoryStatusLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('statusGpu') }}</span>
              <strong>{{ heroGpuStatusLabel }}</strong>
            </div>
          </div>
        </div>
      </header>

      <section v-if="activeSection === 'overview'" class="panel-grid">
        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('overviewDesktopTitle') }}</h3>
              <p>{{ t('overviewDesktopCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableChatWindow') }}</span>
            <label class="switch">
              <input v-model="settings.enableChat" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('showBubbleMessages') }}</span>
            <label class="switch">
              <input v-model="settings.showMessages" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('alwaysOnTop') }}</span>
            <label class="switch">
              <input v-model="settings.alwaysOnTop" type="checkbox" @change="updateAlwaysOnTop">
              <span class="slider"></span>
            </label>
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('overviewRuntimeTitle') }}</h3>
              <p>{{ t('overviewRuntimeCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableInternetSearch') }}</span>
            <label class="switch">
              <input v-model="companionSettings.searchEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('safeMode') }}</span>
            <label class="switch">
              <input v-model="companionSettings.safeModeEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="active-character">{{ t('activeCharacterId') }}</label>
            <input
              id="active-character"
              v-model.trim="companionSettings.activeCharacterId"
              class="setting-text-input"
              type="text"
            >
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('overviewIdleTitle') }}</h3>
              <p>{{ t('overviewIdleCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableIdleDetection') }}</span>
            <label class="switch">
              <input v-model="settings.idleDetection" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div v-if="settings.idleDetection" class="setting-row">
            <span>{{ t('idleTimeSeconds') }}</span>
            <input
              v-model.number="settings.idleTime"
              class="setting-input"
              min="5"
              max="300"
              type="number"
            >
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('overviewCameraTitle') }}</h3>
              <p>{{ t('overviewCameraCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableCamera') }}</span>
            <label class="switch">
              <input v-model="companionSettings.cameraEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('faceDetection') }}</span>
            <label class="switch">
              <input v-model="companionSettings.faceDetectionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('expressionRecognition') }}</span>
            <label class="switch">
              <input v-model="companionSettings.expressionRecognitionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="expression-model-path">{{ t('expressionModelPath') }}</label>
            <input
              id="expression-model-path"
              v-model.trim="companionSettings.expressionModelPath"
              class="setting-text-input"
              type="text"
            >
          </div>

          <p class="setting-help">
            {{ t('expressionModelHelp') }}
          </p>

          <div class="setting-row">
            <span>{{ t('gazeTracking') }}</span>
            <label class="switch">
              <input v-model="companionSettings.gazeTrackingEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('gestureRecognition') }}</span>
            <label class="switch">
              <input v-model="companionSettings.gestureRecognitionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <button class="btn btn-primary" @click="activeSection = 'vision'">
            {{ t('openVisionPanel') }}
          </button>
        </article>
      </section>

      <section v-if="activeSection === 'chat'" class="panel-grid">
        <article class="settings-card wide-card">
          <div class="card-head">
            <div>
              <h3>{{ t('chatTransportTitle') }}</h3>
              <p>{{ t('chatTransportCopy') }}</p>
            </div>
          </div>

          <div class="field-grid">
            <div class="setting-field">
              <label class="field-label" for="chat-backend-url">{{ t('websocketUrl') }}</label>
              <input
                id="chat-backend-url"
                v-model.trim="companionSettings.chatBackendUrl"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="chat-provider">{{ t('chatProvider') }}</label>
              <select
                id="chat-provider"
                v-model="companionSettings.defaultChatProvider"
                class="setting-select"
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="zhipu">Zhipu AI</option>
                <option value="qwen_local">{{ t('localQwenProvider') }}</option>
              </select>
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'ollama'"
              class="setting-field"
            >
              <label class="field-label" for="ollama-url">{{ t('ollamaUrl') }}</label>
              <input
                id="ollama-url"
                v-model.trim="companionSettings.ollamaUrl"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'ollama'"
              class="setting-field"
            >
              <label class="field-label" for="ollama-model">{{ t('ollamaModel') }}</label>
              <input
                id="ollama-model"
                v-model.trim="companionSettings.ollamaModel"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'openai'"
              class="setting-field"
            >
              <label class="field-label" for="openai-base-url">{{ t('openAiBaseUrl') }}</label>
              <input
                id="openai-base-url"
                v-model.trim="companionSettings.openaiBaseUrl"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'openai'"
              class="setting-field"
            >
              <label class="field-label" for="openai-model">{{ t('openAiModel') }}</label>
              <input
                id="openai-model"
                v-model.trim="companionSettings.openaiModel"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'openai'"
              class="setting-field wide-field"
            >
              <label class="field-label" for="openai-api-key">{{ t('openAiApiKey') }}</label>
              <input
                id="openai-api-key"
                v-model.trim="companionSettings.openaiApiKey"
                class="setting-text-input"
                type="password"
                :placeholder="t('apiKeyPlaceholder')"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'zhipu'"
              class="setting-field"
            >
              <label class="field-label" for="zhipu-base-url">{{ t('zhipuBaseUrl') }}</label>
              <input
                id="zhipu-base-url"
                v-model.trim="companionSettings.zhipuBaseUrl"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'zhipu'"
              class="setting-field"
            >
              <label class="field-label" for="zhipu-model">{{ t('zhipuModel') }}</label>
              <input
                id="zhipu-model"
                v-model.trim="companionSettings.zhipuModel"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'zhipu'"
              class="setting-field wide-field"
            >
              <label class="field-label" for="zhipu-api-key">{{ t('zhipuApiKey') }}</label>
              <input
                id="zhipu-api-key"
                v-model.trim="companionSettings.zhipuApiKey"
                class="setting-text-input"
                type="password"
                :placeholder="t('apiKeyPlaceholder')"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'qwen_local'"
              class="setting-field wide-field"
            >
              <label class="field-label" for="qwen-local-model-path">{{ t('qwenLocalModelPath') }}</label>
              <input
                id="qwen-local-model-path"
                v-model.trim="companionSettings.qwenLocalModelPath"
                class="setting-text-input"
                type="text"
              >
            </div>
          </div>

          <div class="field-grid compact-grid">
            <div class="setting-field">
              <label class="field-label" for="temperature">{{ t('temperature') }}</label>
              <input
                id="temperature"
                v-model.number="companionSettings.chatTemperature"
                class="setting-input wide-input"
                min="0"
                max="2"
                step="0.1"
                type="number"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="max-tokens">{{ t('maxTokens') }}</label>
              <input
                id="max-tokens"
                v-model.number="companionSettings.chatMaxTokens"
                class="setting-input wide-input"
                min="64"
                max="8192"
                step="64"
                type="number"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'qwen_local'"
              class="setting-field"
            >
              <label class="field-label" for="qwen-local-context-size">{{ t('qwenLocalContextSize') }}</label>
              <input
                id="qwen-local-context-size"
                v-model.number="companionSettings.qwenLocalContextSize"
                class="setting-input wide-input"
                min="1024"
                max="32768"
                step="256"
                type="number"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'qwen_local'"
              class="setting-field"
            >
              <label class="field-label" for="qwen-local-threads">{{ t('qwenLocalThreads') }}</label>
              <input
                id="qwen-local-threads"
                v-model.number="companionSettings.qwenLocalThreads"
                class="setting-input wide-input"
                min="1"
                max="64"
                step="1"
                type="number"
              >
            </div>

            <div
              v-if="companionSettings.defaultChatProvider === 'qwen_local'"
              class="setting-field"
            >
              <label class="field-label" for="qwen-local-gpu-layers">{{ t('qwenLocalGpuLayers') }}</label>
              <input
                id="qwen-local-gpu-layers"
                v-model.number="companionSettings.qwenLocalGpuLayers"
                class="setting-input wide-input"
                min="0"
                max="200"
                step="1"
                type="number"
              >
            </div>
          </div>

          <p class="setting-help">
            {{ t('chatHelp') }}
          </p>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('searchRoutingTitle') }}</h3>
              <p>{{ t('searchRoutingCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableInternetSearch') }}</span>
            <label class="switch">
              <input v-model="companionSettings.searchEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="field-grid compact-grid">
            <div class="setting-field">
              <label class="field-label" for="search-provider">{{ t('searchProviderLabel') }}</label>
              <select
                id="search-provider"
                v-model="companionSettings.searchProvider"
                class="setting-select"
              >
                <option value="duckduckgo">DuckDuckGo</option>
              </select>
            </div>

            <div class="setting-field">
              <label class="field-label" for="search-max-results">{{ t('searchMaxResults') }}</label>
              <input
                id="search-max-results"
                v-model.number="companionSettings.searchMaxResults"
                class="setting-input wide-input"
                min="1"
                max="10"
                step="1"
                type="number"
              >
            </div>
          </div>

          <p class="setting-help">
            {{ t('searchHelp') }}
          </p>
        </article>
      </section>

      <section v-if="activeSection === 'voice'" class="panel-grid">
        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('voiceInteractionTitle') }}</h3>
              <p>{{ t('voiceInteractionCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableVoiceInteraction') }}</span>
            <label class="switch">
              <input v-model="companionSettings.voiceEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('wakeWordEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.wakeWordEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="wake-word">{{ t('wakeWord') }}</label>
            <input
              id="wake-word"
              v-model.trim="companionSettings.wakeWord"
              class="setting-text-input"
              type="text"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('fullDuplexMode') }}</span>
            <label class="switch">
              <input v-model="companionSettings.fullDuplexVoiceEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('allowInterruption') }}</span>
            <label class="switch">
              <input v-model="companionSettings.allowVoiceInterrupt" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('autoStartMicrophone') }}</span>
            <label class="switch">
              <input v-model="companionSettings.autoStartMicrophone" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('voiceEmotionSync') }}</span>
            <label class="switch">
              <input v-model="companionSettings.voiceEmotionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>
        </article>

        <article class="settings-card wide-card capability-card">
          <div class="card-head">
            <div>
              <h3>{{ t('voiceProvidersTitle') }}</h3>
              <p>{{ t('voiceProvidersCopy') }}</p>
            </div>
          </div>

          <div class="hero-route-grid capability-grid">
            <article class="hero-route-card capability-tile">
              <span class="status-label">{{ t('stt') }}</span>
              <strong>{{ sttProviderLabel }}</strong>
              <p class="capability-copy">{{ t('speechLanguage') }} · {{ companionSettings.speechLanguage }}</p>
            </article>
            <article class="hero-route-card capability-tile">
              <span class="status-label">{{ t('tts') }}</span>
              <strong>{{ ttsProviderLabel }}</strong>
              <p class="capability-copy">{{ t('ttsVoice') }} · {{ companionSettings.ttsVoice || t('notYet') }}</p>
            </article>
            <article class="hero-route-card capability-tile">
              <span class="status-label">{{ t('voiceEmotionProvider') }}</span>
              <strong>{{ voiceEmotionProviderLabel }}</strong>
              <p class="capability-copy">{{ companionSettings.voiceEmotionEnabled ? t('statusEnabled') : t('statusDisabled') }}</p>
            </article>
            <article class="hero-route-card capability-tile">
              <span class="status-label">{{ t('voiceSessionStatus') }}</span>
              <strong>{{ voiceModeSummaryLabel }}</strong>
              <p class="capability-copy">{{ companionSettings.allowVoiceInterrupt ? t('allowInterruption') : t('statusOff') }}</p>
            </article>
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('voiceProvidersTitle') }}</h3>
              <p>{{ t('voiceProvidersCopy') }}</p>
            </div>
          </div>

          <div class="setting-field">
            <label class="field-label" for="vad-provider">{{ t('vad') }}</label>
            <select id="vad-provider" v-model="companionSettings.vadProvider" class="setting-select">
              <option value="silero-vad">silero-vad</option>
              <option value="energy">{{ t('energyFallback') }}</option>
            </select>
          </div>

          <div class="setting-field">
            <label class="field-label" for="stt-provider">{{ t('stt') }}</label>
            <select id="stt-provider" v-model="companionSettings.sttProvider" class="setting-select">
              <option value="faster-whisper">faster-whisper</option>
              <option value="whisper">Whisper</option>
              <option value="vibevoice-asr">VibeVoice-ASR</option>
            </select>
          </div>

          <div
            v-if="companionSettings.sttProvider === 'faster-whisper'"
            class="setting-field wide-field"
          >
            <label class="field-label" for="stt-model-path">{{ t('sttModelPath') }}</label>
            <input
              id="stt-model-path"
              v-model.trim="companionSettings.sttModelPath"
              class="setting-text-input"
              :placeholder="t('localModelPathPlaceholder')"
              type="text"
            >
            <p class="setting-help">
              {{ t('sttModelPathHelp') }}
            </p>
          </div>

          <div
            v-if="companionSettings.sttProvider === 'faster-whisper'"
            class="setting-field"
          >
            <label class="field-label" for="stt-model-size">{{ t('sttModelSize') }}</label>
            <select
              id="stt-model-size"
              v-model="companionSettings.sttModelSize"
              class="setting-select"
            >
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large-v3">large-v3</option>
            </select>
            <p class="setting-help">
              {{ t('sttModelSizeHelp') }}
            </p>
          </div>

          <div class="setting-field">
            <label class="field-label" for="tts-provider">{{ t('tts') }}</label>
            <select
              id="tts-provider"
              v-model="companionSettings.defaultTtsProvider"
              class="setting-select"
            >
              <option value="edge-tts">Edge-TTS</option>
              <option value="system-tts">System TTS</option>
              <option value="piper">Piper</option>
              <option value="vibevoice-realtime">VibeVoice-Realtime</option>
              <option value="gpt-sovits">GPT-SoVITS</option>
            </select>
          </div>

          <div class="field-grid compact-grid">
            <div class="setting-field">
              <label class="field-label" for="speech-language">{{ t('speechLanguage') }}</label>
              <input
                id="speech-language"
                v-model.trim="companionSettings.speechLanguage"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="tts-voice">{{ t('ttsVoice') }}</label>
              <input
                id="tts-voice"
                v-model.trim="companionSettings.ttsVoice"
                class="setting-text-input"
                type="text"
              >
              <p
                v-if="companionSettings.defaultTtsProvider === 'vibevoice-realtime'"
                class="setting-help"
              >
                {{ t('vibeVoiceVoiceHelp') }}
              </p>
              <p
                v-if="['edge-tts', 'system-tts', 'piper'].includes(companionSettings.defaultTtsProvider)"
                class="setting-help"
              >
                {{ t('offlineTtsFallbackHelp') }}
              </p>
            </div>
          </div>

          <div class="setting-field">
            <label class="field-label" for="audio-backend">{{ t('audioCaptureBackend') }}</label>
            <select
              id="audio-backend"
              v-model="companionSettings.audioCaptureBackend"
              class="setting-select"
              disabled
            >
              <option value="rust">{{ t('rustPlanned') }}</option>
            </select>
          </div>

          <div class="setting-field">
            <label class="field-label" for="voice-emotion-provider">{{ t('voiceEmotionProvider') }}</label>
            <select
              id="voice-emotion-provider"
              v-model="companionSettings.voiceEmotionProvider"
              class="setting-select"
            >
              <option value="wav2vec2">Wav2Vec2 / transformers</option>
              <option value="none">{{ t('disabled') }}</option>
            </select>
          </div>

          <div class="setting-field">
            <label class="field-label" for="voice-emotion-model-path">{{ t('voiceEmotionModelPath') }}</label>
            <input
              id="voice-emotion-model-path"
              v-model.trim="companionSettings.voiceEmotionModelPath"
              class="setting-text-input"
              :placeholder="t('localModelPathPlaceholder')"
              type="text"
            >
          </div>
        </article>

        <article class="settings-card wide-card">
          <div class="card-head">
            <div>
              <h3>{{ t('providerEndpointsTitle') }}</h3>
              <p>{{ t('providerEndpointsCopy') }}</p>
            </div>
          </div>

          <div class="field-grid">
            <div class="setting-field">
              <label class="field-label" for="vibevoice-asr-url">{{ t('vibeVoiceAsrUrl') }}</label>
              <input
                id="vibevoice-asr-url"
                v-model.trim="companionSettings.vibeVoiceAsrUrl"
                class="setting-text-input"
                placeholder="http://127.0.0.1:port/asr"
                type="text"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="vibevoice-tts-url">{{ t('vibeVoiceTtsUrl') }}</label>
              <input
                id="vibevoice-tts-url"
                v-model.trim="companionSettings.vibeVoiceTtsUrl"
                class="setting-text-input"
                :placeholder="t('vibeVoiceRealtimeUrlPlaceholder')"
                type="text"
              >
              <p class="setting-help">
                {{ t('vibeVoiceRealtimeHelp') }}
              </p>
            </div>

            <div class="setting-field">
              <label class="field-label" for="gpt-sovits-url">{{ t('gptSovitsUrl') }}</label>
              <input
                id="gpt-sovits-url"
                v-model.trim="companionSettings.gptSovitsUrl"
                class="setting-text-input"
                placeholder="http://127.0.0.1:port/tts"
                type="text"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="gpt-sovits-ref">{{ t('gptSovitsReferenceAudio') }}</label>
              <input
                id="gpt-sovits-ref"
                v-model.trim="companionSettings.gptSovitsReferenceAudio"
                class="setting-text-input"
                :placeholder="t('absoluteReferenceAudioPath')"
                type="text"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="gpt-sovits-prompt">{{ t('gptSovitsPromptText') }}</label>
              <input
                id="gpt-sovits-prompt"
                v-model.trim="companionSettings.gptSovitsPromptText"
                class="setting-text-input"
                type="text"
              >
            </div>

            <div class="setting-field">
              <label class="field-label" for="gpt-sovits-prompt-language">{{ t('gptSovitsPromptLanguage') }}</label>
              <input
                id="gpt-sovits-prompt-language"
                v-model.trim="companionSettings.gptSovitsPromptLanguage"
                class="setting-text-input"
                type="text"
              >
            </div>
          </div>
        </article>

        <article class="settings-card wide-card">
          <div class="card-head">
            <div>
              <h3>{{ t('voiceDiagnosticsTitle') }}</h3>
              <p>{{ t('voiceDiagnosticsCopy') }}</p>
            </div>

            <button
              class="btn btn-secondary"
              :disabled="probeStatus === 'probing'"
              @click="probeVoiceRuntime"
            >
              {{ probeStatus === 'probing' ? t('probingButton') : t('probeRuntimeButton') }}
            </button>
          </div>

          <div class="status-grid diagnostics-grid">
            <div class="status-pill">
              <span class="status-label">{{ t('probe') }}</span>
              <strong>{{ probeStatusLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('voiceSessionStatus') }}</span>
              <strong>{{ voiceSessionStatusLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('lastProbe') }}</span>
              <strong>{{ formatProbeTime(lastProbeAt) }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('activeCaptureBackend') }}</span>
              <strong>{{ activeCaptureBackendLabel }}</strong>
            </div>
          </div>

          <div class="field-grid diagnostics-panel">
            <article
              v-for="entry in voiceDiagnosticEntries"
              :key="entry.key"
              class="diagnostic-card"
            >
              <p class="diagnostic-label">{{ entry.label }}</p>
              <h4 :class="['diagnostic-title', { unavailable: entry.available === false }]">
                {{ entry.resolved }}
              </h4>
              <p class="diagnostic-copy">
                {{ entry.reason || (entry.available ? t('diagnosticReady') : t('diagnosticNotReady')) }}
              </p>
              <p v-if="entry.target" class="diagnostic-target">
                {{ entry.target }}
              </p>
              <ul v-if="entry.details.length" class="diagnostic-details">
                <li v-for="detail in entry.details" :key="detail">{{ detail }}</li>
              </ul>
            </article>
          </div>

          <div v-if="probeErrorMessage || localizedProviderIssues.length" class="diagnostic-issues">
            <p v-if="probeErrorMessage" class="diagnostic-error">
              {{ localizeRuntimeText(probeErrorMessage) }}
            </p>
            <ul v-if="localizedProviderIssues.length" class="diagnostic-list">
              <li v-for="issue in localizedProviderIssues" :key="issue">{{ issue }}</li>
            </ul>
          </div>
        </article>
      </section>

      <section v-if="activeSection === 'vision'" class="panel-grid">
        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('visionPipelineTitle') }}</h3>
              <p>{{ t('visionPipelineCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableCamera') }}</span>
            <label class="switch">
              <input v-model="companionSettings.cameraEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="vision-backend">{{ t('visionBackend') }}</label>
            <select
              id="vision-backend"
              v-model="companionSettings.visionBackend"
              class="setting-select"
            >
              <option value="mediapipe-opencv">{{ t('mediapipeOpenCv') }}</option>
              <option value="opencv">{{ t('openCvOnly') }}</option>
            </select>
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('perceptionFeaturesTitle') }}</h3>
              <p>{{ t('perceptionFeaturesCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('faceDetection') }}</span>
            <label class="switch">
              <input v-model="companionSettings.faceDetectionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('expressionRecognition') }}</span>
            <label class="switch">
              <input v-model="companionSettings.expressionRecognitionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('gazeTracking') }}</span>
            <label class="switch">
              <input v-model="companionSettings.gazeTrackingEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('gestureRecognition') }}</span>
            <label class="switch">
              <input v-model="companionSettings.gestureRecognitionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('previewEmpathyTitle') }}</h3>
              <p>{{ t('previewEmpathyCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('empathySync') }}</span>
            <label class="switch">
              <input v-model="companionSettings.empathySyncEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>
        </article>
      </section>

      <section v-if="activeSection === 'call'" class="panel-grid">
        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('callSurfaceTitle') }}</h3>
              <p>{{ t('callSurfaceCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableVideoCallMode') }}</span>
            <label class="switch">
              <input v-model="companionSettings.videoCallEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="virtual-background-mode">{{ t('virtualBackground') }}</label>
            <select
              id="virtual-background-mode"
              v-model="companionSettings.virtualBackgroundMode"
              class="setting-select"
            >
              <option value="none">{{ t('none') }}</option>
              <option value="blur">{{ t('blur') }}</option>
              <option value="image">{{ t('image') }}</option>
            </select>
          </div>

          <div class="setting-field">
            <label class="field-label" for="virtual-background-image">{{ t('backgroundImage') }}</label>
            <input
              id="virtual-background-image"
              v-model.trim="companionSettings.virtualBackgroundImage"
              class="setting-text-input"
              :placeholder="t('absoluteFilePathOrUrl')"
              type="text"
            >
          </div>

          <p class="setting-help">
            {{ t('callHelp') }}
          </p>
        </article>
      </section>

      <section v-if="activeSection === 'care'" class="panel-grid">
        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('proactiveServiceTitle') }}</h3>
              <p>{{ t('proactiveServiceCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableProactiveService') }}</span>
            <label class="switch">
              <input v-model="companionSettings.proactiveEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('lateNightSleepReminder') }}</span>
            <label class="switch">
              <input v-model="companionSettings.sleepReminderEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('awayDetectionReminder') }}</span>
            <label class="switch">
              <input v-model="companionSettings.awayDetectionEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('awayReminderDelayMinutes') }}</span>
            <input
              v-model.number="companionSettings.awayReminderMinutes"
              class="setting-input"
              min="1"
              max="180"
              type="number"
            >
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('memoryRemindersTitle') }}</h3>
              <p>{{ t('memoryRemindersCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('enableMemoryReminders') }}</span>
            <label class="switch">
              <input v-model="companionSettings.memoryReminderEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <p class="setting-help">
            {{ t('memoryHelp') }}
          </p>
        </article>
      </section>

      <section v-if="activeSection === 'desktop'" class="panel-grid">
        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('desktopClipboardTitle') }}</h3>
              <p>{{ t('desktopClipboardCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('clipboardWatcherEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.clipboardWatcherEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('clipboardCodeInsightsEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.clipboardCodeInsightsEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('clipboardLinkSummaryEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.clipboardLinkSummaryEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('clipboardErrorAnalysisEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.clipboardErrorAnalysisEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('clipboardPollingIntervalMs') }}</span>
            <input
              v-model.number="companionSettings.clipboardPollingIntervalMs"
              class="setting-input"
              min="1000"
              max="10000"
              step="250"
              type="number"
            >
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('desktopOrganizerTitle') }}</h3>
              <p>{{ t('desktopOrganizerCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('desktopOrganizerEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.desktopOrganizerEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="desktop-organizer-path">{{ t('desktopOrganizerPath') }}</label>
            <input
              id="desktop-organizer-path"
              v-model.trim="companionSettings.desktopOrganizerPath"
              class="setting-text-input"
              :placeholder="t('absoluteFilePathOrUrl')"
              type="text"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('desktopOrganizerAutoFolders') }}</span>
            <label class="switch">
              <input v-model="companionSettings.desktopOrganizerAutoFolders" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <button class="btn btn-secondary" @click="runOrganizerNow">
            {{ t('organizeNow') }}
          </button>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('batchRenameTitle') }}</h3>
              <p>{{ t('batchRenameCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('batchRenameEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.batchRenameEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-field">
            <label class="field-label" for="batch-rename-directory">{{ t('batchRenameDirectory') }}</label>
            <input
              id="batch-rename-directory"
              v-model.trim="companionSettings.batchRenameDirectory"
              class="setting-text-input"
              :placeholder="t('absoluteFilePathOrUrl')"
              type="text"
            >
          </div>

          <div class="setting-field">
            <label class="field-label" for="batch-rename-pattern">{{ t('batchRenamePattern') }}</label>
            <input
              id="batch-rename-pattern"
              v-model.trim="companionSettings.batchRenamePattern"
              class="setting-text-input"
              type="text"
            >
          </div>

          <button class="btn btn-secondary" @click="runBatchRenameNow">
            {{ t('renameNow') }}
          </button>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('focusModeTitle') }}</h3>
              <p>{{ t('focusModeCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('pomodoroEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.pomodoroEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('pomodoroWorkMinutes') }}</span>
            <input
              v-model.number="companionSettings.pomodoroWorkMinutes"
              class="setting-input"
              min="5"
              max="180"
              type="number"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('pomodoroBreakMinutes') }}</span>
            <input
              v-model.number="companionSettings.pomodoroBreakMinutes"
              class="setting-input"
              min="1"
              max="60"
              type="number"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('focusQuietModeEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.focusQuietModeEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('hardwareMonitorTitle') }}</h3>
              <p>{{ t('hardwareMonitorCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('hardwareMonitoringEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.hardwareMonitoringEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('cpuUsageAlertThreshold') }}</span>
            <input
              v-model.number="companionSettings.cpuUsageAlertThreshold"
              class="setting-input"
              min="50"
              max="100"
              type="number"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('memoryUsageAlertThreshold') }}</span>
            <input
              v-model.number="companionSettings.memoryUsageAlertThreshold"
              class="setting-input"
              min="50"
              max="100"
              type="number"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('cpuTemperatureAlertThreshold') }}</span>
            <input
              v-model.number="companionSettings.cpuTemperatureAlertThreshold"
              class="setting-input"
              min="50"
              max="120"
              type="number"
            >
          </div>

          <div class="setting-row">
            <span>{{ t('batteryLowThreshold') }}</span>
            <input
              v-model.number="companionSettings.batteryLowThreshold"
              class="setting-input"
              min="5"
              max="80"
              type="number"
            >
          </div>

          <div class="status-grid diagnostics-grid">
            <div class="status-pill">
              <span class="status-label">{{ t('currentCpuTemperature') }}</span>
              <strong>{{ currentCpuTemperatureLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('currentGpuTemperature') }}</span>
              <strong>{{ currentGpuTemperatureLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('currentMemoryUsage') }}</span>
              <strong>{{ currentMemoryUsageLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('currentBatteryLevel') }}</span>
              <strong>{{ currentBatteryLabel }}</strong>
            </div>
          </div>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('memoryRuntimeTitle') }}</h3>
              <p>{{ t('memoryRuntimeCopy') }}</p>
            </div>
          </div>

          <div class="status-grid diagnostics-grid">
            <div class="status-pill">
              <span class="status-label">{{ t('memoryRuntimeMode') }}</span>
              <strong>{{ memoryRuntimeModeLabel }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('memoryRuntimeEngine') }}</span>
              <strong>{{ memoryRuntimeStatus?.dbEngine || t('notYet') }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('memoryRuntimeVectorIndex') }}</span>
              <strong>{{ memoryRuntimeStatus?.vectorIndex || t('notYet') }}</strong>
            </div>
            <div class="status-pill">
              <span class="status-label">{{ t('memoryRuntimeCounts') }}</span>
              <strong>{{ memoryRuntimeCountsLabel }}</strong>
            </div>
          </div>

          <p v-if="memoryRuntimeStatus?.dbPath" class="setting-help">
            {{ t('memoryRuntimePath') }}: {{ memoryRuntimeStatus.dbPath }}
          </p>
          <p v-if="memoryRuntimeStatus?.error" class="diagnostic-error">
            {{ t('memoryRuntimeError') }}: {{ localizeRuntimeText(memoryRuntimeStatus.error) }}
          </p>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('desktopAffinityTitle') }}</h3>
              <p>{{ t('desktopAffinityCopy') }}</p>
            </div>
          </div>

          <div class="setting-row">
            <span>{{ t('affectionSystemEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.affectionSystemEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('emotionStateEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.emotionStateEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <span>{{ t('userProfileEnabled') }}</span>
            <label class="switch">
              <input v-model="companionSettings.userProfileEnabled" type="checkbox">
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-help" v-if="relationshipState">
            {{
              `Affection ${relationshipState.affection} | ${relationshipState.level} | ${relationshipState.mood}`
            }}
          </div>

          <button class="btn btn-secondary" @click="syncRelationshipNow">
            {{ t('syncRelationshipNow') }}
          </button>
        </article>

        <article class="settings-card">
          <div class="card-head">
            <div>
              <h3>{{ t('shortcutTitle') }}</h3>
              <p>{{ t('shortcutCopy') }}</p>
            </div>
          </div>

          <div class="setting-field">
            <label class="field-label" for="boss-key-shortcut">{{ t('bossKeyShortcut') }}</label>
            <input
              id="boss-key-shortcut"
              v-model.trim="companionSettings.bossKeyShortcut"
              class="setting-text-input"
              type="text"
            >
          </div>

          <div class="setting-field">
            <label class="field-label" for="voice-record-shortcut">{{ t('voiceRecordShortcut') }}</label>
            <input
              id="voice-record-shortcut"
              v-model.trim="companionSettings.voiceRecordShortcut"
              class="setting-text-input"
              type="text"
            >
          </div>

          <div class="setting-field">
            <label class="field-label" for="screenshot-shortcut">{{ t('screenshotTranslateShortcut') }}</label>
            <input
              id="screenshot-shortcut"
              v-model.trim="companionSettings.screenshotTranslateShortcut"
              class="setting-text-input"
              type="text"
            >
          </div>
        </article>

        <article v-if="desktopActionStatus || desktopActionError" class="settings-card wide-card">
          <div class="card-head">
            <div>
              <h3>{{ t('sectionDesktopLabel') }}</h3>
              <p>{{ t('sectionDesktopNote') }}</p>
            </div>
          </div>

          <p v-if="desktopActionStatus" class="setting-help">{{ desktopActionStatus }}</p>
          <p v-if="desktopActionError" class="diagnostic-error">
            {{ localizeRuntimeText(desktopActionError) }}
          </p>
        </article>
      </section>

      <section v-if="activeSection === 'stage'" class="panel-grid">
        <article class="settings-card wide-card">
          <div class="card-head">
            <div>
              <h3>{{ t('stageLibraryTitle') }}</h3>
              <p>{{ t('stageLibraryCopy') }}</p>
            </div>
          </div>

          <div class="model-list">
            <div
              class="model-item"
              :class="{ active: store.useDefaultModel }"
              @click="selectDefaultModel"
            >
              <div class="model-info">
                <span class="model-name">{{ t('defaultModel') }}</span>
                <span v-if="store.useDefaultModel" class="model-status">{{ t('inUse') }}</span>
              </div>
              <button class="btn-small" @click.stop="selectDefaultModel">
                {{ store.useDefaultModel ? t('selected') : t('select') }}
              </button>
            </div>

            <div
              v-for="model in store.models"
              :key="model"
              class="model-item"
              :class="{ active: store.currentModel === model && !store.useDefaultModel }"
            >
              <div class="model-info">
                <span class="model-name">{{ model }}</span>
                <span
                  v-if="store.currentModel === model && !store.useDefaultModel"
                  class="model-status"
                >
                  {{ t('inUse') }}
                </span>
              </div>
              <div class="model-actions">
                <button class="btn-small" @click="selectModel(model)">{{ t('select') }}</button>
                <button class="btn-small btn-danger" @click="deleteModel(model)">{{ t('delete') }}</button>
              </div>
            </div>
          </div>

          <button class="btn btn-primary" @click="uploadNewModel">
            {{ t('uploadModel') }}
          </button>
        </article>

        <article
          v-if="!store.useDefaultModel && (store.motions.length > 0 || store.expressions.length > 0)"
          class="settings-card"
        >
          <div class="card-head">
            <div>
              <h3>{{ t('motionPreviewTitle') }}</h3>
              <p>{{ t('motionPreviewCopy') }}</p>
            </div>
          </div>

          <div class="button-grid">
            <div v-for="(motion, index) in store.motions" :key="index" class="motion-item">
              <button class="btn btn-motion" @click="playMotion(motion.group, motion.file)">
                {{ motion.file || motion.group }}
              </button>
            </div>
          </div>
        </article>

        <article
          v-if="!store.useDefaultModel && store.expressions.length > 0"
          class="settings-card"
        >
          <div class="card-head">
            <div>
              <h3>{{ t('expressionPreviewTitle') }}</h3>
              <p>{{ t('expressionPreviewCopy') }}</p>
            </div>
          </div>

          <div class="button-grid">
            <button
              v-for="(exp, index) in store.expressions"
              :key="index"
              class="btn btn-expression"
              @click="playExpression(exp)"
            >
              {{ exp }}
            </button>
          </div>
        </article>
      </section>

      <footer class="action-bar">
        <p class="action-copy">
          {{ t('saveCopy') }}
        </p>
        <button class="btn btn-save" @click="saveSettings">{{ t('saveSettings') }}</button>
      </footer>
    </main>
  </div>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { StageModelSelection } from '@table-pet/stage';
import type { UiLanguage } from '@table-pet/shared';
import type { BackendMemoryRuntimeStatus } from '@table-pet/memory';
import {
  SETTINGS_EN_TEXT,
  SETTINGS_LOCALE_TEXT,
  type SettingsLocaleKey,
} from './i18n/settingsLocale';
import {
  localizeRuntimeText as localizeRuntimeMessage,
  normalizeUiLanguage,
} from './i18n/runtimeLocale';
import { useCompanionConfigStore } from './stores/companionConfig';
import { useCompanionSettingsStore } from './stores/companionSettings';
import { useDesktopServicesStore } from './stores/desktopServices';
import { getDesktopCompanionRuntime } from './companion/runtime';
import { useLive2DStore } from './stores/live2d';
import { useVoiceStore } from './stores/voice';
import { emitRuntimeEvent } from './utils/runtimeEvents';

type SettingsSection =
  | 'overview'
  | 'chat'
  | 'voice'
  | 'vision'
  | 'call'
  | 'care'
  | 'desktop'
  | 'stage';

const activeSection = ref<SettingsSection>('overview');
const store = useLive2DStore();
const runtime = getDesktopCompanionRuntime();
const companionConfigStore = useCompanionConfigStore();
const settingsStore = useCompanionSettingsStore();
const desktopServicesStore = useDesktopServicesStore();
const voiceStore = useVoiceStore();
const { settings } = storeToRefs(settingsStore);
const { settings: companionSettings } = storeToRefs(companionConfigStore);
const { relationshipState, lastSystemMetrics } = storeToRefs(desktopServicesStore);
const {
  status: voiceStatus,
  activeCaptureBackend,
  providerDiagnostics,
  providerIssues,
  probeStatus,
  probeErrorMessage,
  lastProbeAt,
} = storeToRefs(voiceStore);
const hasAutoProbedVoice = ref(false);
const desktopActionStatus = ref('');
const desktopActionError = ref('');
const memoryRuntimeStatus = ref<BackendMemoryRuntimeStatus | null>(null);
let runtimeRefreshTimer: number | null = null;
const languageOptions: Array<{
  id: UiLanguage;
  labelKey: SettingsLocaleKey;
}> = [
  { id: 'en', labelKey: 'languageEnglish' },
  { id: 'zh-CN', labelKey: 'languageChinese' },
];
const currentLocale = computed<UiLanguage>(() =>
  normalizeUiLanguage(companionSettings.value.uiLanguage),
);

function t(
  key: SettingsLocaleKey,
  params?: Record<string, string | number>,
): string {
  let text =
    SETTINGS_LOCALE_TEXT[currentLocale.value][key] ?? SETTINGS_EN_TEXT[key];

  if (!params) {
    return text;
  }

  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value));
  }

  return text;
}

function setUiLanguage(locale: UiLanguage) {
  companionSettings.value.uiLanguage = locale;
}

function localizeRuntimeText(message: string): string {
  return localizeRuntimeMessage(currentLocale.value, message);

  if (!message || currentLocale.value !== 'zh-CN') {
    return message;
  }

  const replacements: Array<[string, string]> = [
    ['Voice runtime probe failed.', '语音运行时探测失败。'],
    ['Voice websocket disconnected.', '语音 WebSocket 已断开。'],
    ['Unable to start voice session.', '无法启动语音会话。'],
    ['Not ready yet.', '尚未就绪。'],
    ['Ready', '可用'],
    ['Error', '错误'],
    ['Connection refused', '连接被拒绝'],
    ['timed out', '超时'],
    ['unavailable', '不可用'],
    ['available', '可用'],
    ['missing', '缺失'],
    ['disabled', '已禁用'],
  ];

  return replacements.reduce(
    (text, [pattern, replacement]) => text.split(pattern).join(replacement),
    message,
  );
}

const sections = computed<Array<{ id: SettingsSection; label: string; note: string }>>(() => [
  {
    id: 'overview',
    label: t('sectionOverviewLabel'),
    note: t('sectionOverviewNote'),
  },
  { id: 'chat', label: t('sectionChatLabel'), note: t('sectionChatNote') },
  { id: 'voice', label: t('sectionVoiceLabel'), note: t('sectionVoiceNote') },
  {
    id: 'vision',
    label: t('sectionVisionLabel'),
    note: t('sectionVisionNote'),
  },
  { id: 'call', label: t('sectionCallLabel'), note: t('sectionCallNote') },
  { id: 'care', label: t('sectionCareLabel'), note: t('sectionCareNote') },
  {
    id: 'desktop',
    label: t('sectionDesktopLabel'),
    note: t('sectionDesktopNote'),
  },
  {
    id: 'stage',
    label: t('sectionStageLabel'),
    note: t('sectionStageNote'),
  },
]);

function formatChatProviderLabel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'zhipu':
      return 'Zhipu AI';
    case 'qwen_local':
      return t('localQwenProvider');
    default:
      return 'Ollama';
  }
}

function formatTtsProviderLabel(provider: string): string {
  switch (provider) {
    case 'system-tts':
      return 'System TTS';
    case 'piper':
      return 'Piper';
    case 'vibevoice-realtime':
      return 'VibeVoice-Realtime';
    case 'gpt-sovits':
      return 'GPT-SoVITS';
    default:
      return 'Edge-TTS';
  }
}

function formatVisionBackendLabel(backend: string): string {
  return backend === 'opencv' ? t('openCvOnly') : t('mediapipeOpenCv');
}

const safeProviderIssues = computed(() =>
  Array.isArray(providerIssues.value) ? providerIssues.value : [],
);
const localizedProviderIssues = computed(() =>
  safeProviderIssues.value.map((issue) => localizeRuntimeText(issue)),
);
const safeProviderDiagnostics = computed(() => providerDiagnostics.value ?? {});

function buildDiagnosticDetails(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) {
    return [];
  }

  const details: string[] = [];
  const configUrl =
    typeof metadata.configUrl === 'string' ? metadata.configUrl.trim() : '';
  const defaultVoice =
    typeof metadata.defaultVoice === 'string' ? metadata.defaultVoice.trim() : '';
  const voices = Array.isArray(metadata.voices)
    ? metadata.voices
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];

  if (defaultVoice) {
    details.push(`${t('diagnosticDefaultVoice')}: ${defaultVoice}`);
  }

  if (voices.length) {
    const preview = voices.slice(0, 6);
    const suffix = voices.length > preview.length ? ' ...' : '';
    details.push(`${t('diagnosticVoicePresets')}: ${preview.join(', ')}${suffix}`);
  }

  if (configUrl) {
    details.push(`${t('diagnosticConfigUrl')}: ${configUrl}`);
  }

  return details;
}

const voiceDiagnosticEntries = computed(() => {
  const diagnostics = safeProviderDiagnostics.value;

  return [
    {
      key: 'capture',
      label: t('diagnosticCapture'),
      resolved: activeCaptureBackend.value || companionSettings.value.audioCaptureBackend,
      available: companionSettings.value.voiceEnabled,
      reason:
        activeCaptureBackend.value
          ? t('diagnosticCaptureActive')
          : t('diagnosticCaptureConfigured'),
      target: '',
      details: [],
    },
    {
      key: 'vad',
      label: t('diagnosticVAD'),
      resolved: diagnostics.vad?.resolved || companionSettings.value.vadProvider,
      available: diagnostics.vad?.available,
      reason: localizeRuntimeMessage(currentLocale.value, diagnostics.vad?.reason || ''),
      target: diagnostics.vad?.target || '',
      details: buildDiagnosticDetails(diagnostics.vad?.metadata),
    },
    {
      key: 'stt',
      label: t('diagnosticSTT'),
      resolved: diagnostics.stt?.resolved || companionSettings.value.sttProvider,
      available: diagnostics.stt?.available,
      reason: localizeRuntimeMessage(currentLocale.value, diagnostics.stt?.reason || ''),
      target: diagnostics.stt?.target || '',
      details: buildDiagnosticDetails(diagnostics.stt?.metadata),
    },
    {
      key: 'tts',
      label: t('diagnosticTTS'),
      resolved:
        diagnostics.tts?.resolved || companionSettings.value.defaultTtsProvider,
      available: diagnostics.tts?.available,
      reason: localizeRuntimeMessage(currentLocale.value, diagnostics.tts?.reason || ''),
      target: diagnostics.tts?.target || '',
      details: buildDiagnosticDetails(diagnostics.tts?.metadata),
    },
    {
      key: 'voice-emotion',
      label: t('diagnosticVoiceEmotion'),
      resolved:
        diagnostics.voiceEmotion?.resolved ||
        companionSettings.value.voiceEmotionProvider,
      available: diagnostics.voiceEmotion?.available,
      reason: localizeRuntimeMessage(
        currentLocale.value,
        diagnostics.voiceEmotion?.reason || '',
      ),
      target: diagnostics.voiceEmotion?.target || '',
      details: buildDiagnosticDetails(diagnostics.voiceEmotion?.metadata),
    },
  ];
});

const voiceSessionStatusLabel = computed(() => {
  switch (voiceStatus.value) {
    case 'connecting':
      return t('voiceStatusConnecting');
    case 'listening':
      return t('voiceStatusListening');
    case 'processing':
      return t('voiceStatusProcessing');
    case 'speaking':
      return t('voiceStatusSpeaking');
    case 'error':
      return t('voiceStatusError');
    default:
      return t('voiceStatusIdle');
  }
});

const activeCaptureBackendLabel = computed(() =>
  activeCaptureBackend.value || companionSettings.value.audioCaptureBackend || t('notYet'),
);

const probeStatusLabel = computed(() => {
  switch (probeStatus.value) {
    case 'probing':
      return t('probeStatusProbing');
    case 'ready':
      return t('probeStatusReady');
    case 'error':
      return t('probeStatusError');
    default:
      return t('probeStatusIdle');
  }
});

function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(0)}%`
    : t('notYet');
}

function formatTemperature(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(0)}°C`
    : t('notYet');
}

const memoryRuntimeModeLabel = computed(() => {
  const status = memoryRuntimeStatus.value;
  if (!status) {
    return t('notYet');
  }

  if (status.mode === 'backend' && status.backendAvailable) {
    return t('statusBackend');
  }

  if (status.mode === 'fallback') {
    return t('statusFallback');
  }

  return t('statusUnknown');
});

const memoryRuntimeCountsLabel = computed(() => {
  const status = memoryRuntimeStatus.value;
  if (!status || typeof status.turnCount !== 'number') {
    return t('notYet');
  }

  return t('memoryRuntimeCountsFormat', {
    turns: status.turnCount,
    facts: status.factCount ?? 0,
    chunks: status.chunkCount ?? 0,
  });
});

const chatProviderLabel = computed(() =>
  formatChatProviderLabel(companionSettings.value.defaultChatProvider),
);
const sttProviderLabel = computed(() => companionSettings.value.sttProvider || t('notYet'));
const ttsProviderLabel = computed(() =>
  formatTtsProviderLabel(companionSettings.value.defaultTtsProvider),
);
const visionBackendLabel = computed(() =>
  formatVisionBackendLabel(companionSettings.value.visionBackend),
);
const voiceEmotionProviderLabel = computed(() =>
  companionSettings.value.voiceEmotionProvider === 'none'
    ? t('disabled')
    : companionSettings.value.voiceEmotionProvider || t('notYet'),
);
const voiceModeSummaryLabel = computed(() =>
  companionSettings.value.fullDuplexVoiceEnabled
    ? `${voiceSessionStatusLabel.value} · ${currentLocale.value === 'zh-CN' ? '全双工' : 'duplex'}`
    : voiceSessionStatusLabel.value,
);
const activeSectionMeta = computed(
  () =>
    sections.value.find((section) => section.id === activeSection.value) ??
    {
      id: 'overview' as const,
      label: t('sectionOverviewLabel'),
      note: t('sectionOverviewNote'),
    },
);
const heroCopyText = computed(() => {
  switch (activeSection.value) {
    case 'chat':
      return `${t('chatTransportCopy')} ${t('searchRoutingCopy')}`;
    case 'voice':
      return `${t('voiceInteractionCopy')} ${t('providerEndpointsCopy')}`;
    case 'vision':
      return `${t('visionPipelineCopy')} ${t('previewEmpathyCopy')}`;
    case 'call':
      return t('callSurfaceCopy');
    case 'care':
      return `${t('proactiveServiceCopy')} ${t('memoryRemindersCopy')}`;
    case 'desktop':
      return `${t('desktopClipboardCopy')} ${t('hardwareMonitorCopy')}`;
    case 'stage':
      return `${t('stageLibraryCopy')} ${t('expressionPreviewCopy')}`;
    default:
      return t('heroCopy');
  }
});

const heroGpuStatusLabel = computed(() =>
  formatTemperature(lastSystemMetrics.value?.gpuTemperatureC),
);
const heroMemoryStatusLabel = computed(() => memoryRuntimeModeLabel.value);
const currentCpuTemperatureLabel = computed(() =>
  formatTemperature(lastSystemMetrics.value?.cpuTemperatureC),
);
const currentGpuTemperatureLabel = computed(() =>
  formatTemperature(lastSystemMetrics.value?.gpuTemperatureC),
);
const currentMemoryUsageLabel = computed(() =>
  formatPercent(lastSystemMetrics.value?.memoryUsagePercent),
);
const currentBatteryLabel = computed(() => {
  const battery = lastSystemMetrics.value?.battery;
  if (!battery) {
    return t('notYet');
  }

  return `${battery.percentage.toFixed(0)}%${battery.isCharging ? ' • AC' : ''}`;
});
const heroSignalEntries = computed(() => [
  {
    label: t('chatProvider'),
    value: chatProviderLabel.value,
  },
  {
    label: t('voiceSessionStatus'),
    value: voiceSessionStatusLabel.value,
  },
  {
    label: t('activeCaptureBackend'),
    value: activeCaptureBackendLabel.value,
  },
  {
    label: t('memoryRuntimeEngine'),
    value: memoryRuntimeStatus.value?.dbEngine || t('notYet'),
  },
]);
const sidebarSummaryEntries = computed(() => [
  {
    label: t('statusChat'),
    value: chatProviderLabel.value,
  },
  {
    label: t('statusVoice'),
    value: voiceSessionStatusLabel.value,
  },
  {
    label: t('statusMemory'),
    value: heroMemoryStatusLabel.value,
  },
  {
    label: t('statusGpu'),
    value: heroGpuStatusLabel.value,
  },
]);

async function refreshRuntimeStatus() {
  try {
    await desktopServicesStore.tick();
  } catch (error) {
    console.warn('Failed to refresh desktop runtime metrics.', error);
  }

  const runtimeMemory = runtime.memory as {
    getRuntimeStatus?: () => Promise<BackendMemoryRuntimeStatus>;
  };
  if (typeof runtimeMemory.getRuntimeStatus !== 'function') {
    memoryRuntimeStatus.value = {
      mode: 'fallback',
      backendAvailable: false,
      dbEngine: 'local-storage',
      vectorIndex: 'disabled',
      lancedbAvailable: false,
      error: 'Memory runtime diagnostics are unavailable.',
    };
    return;
  }

  try {
    memoryRuntimeStatus.value = await runtimeMemory.getRuntimeStatus();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Memory runtime diagnostics are unavailable.';
    memoryRuntimeStatus.value = {
      mode: 'fallback',
      backendAvailable: false,
      dbEngine: 'local-storage',
      vectorIndex: 'disabled',
      lancedbAvailable: false,
      error: message,
    };
  }
}

async function uploadNewModel() {
  try {
    const modelName = await store.uploadModel();
    if (modelName) {
      await selectModel(modelName);
    }
  } catch (error) {
    console.error('Failed to upload model:', error);
  }
}

async function selectModel(modelName: string) {
  await store.selectModel(modelName);
  settingsStore.applySettings({
    useDefaultModel: false,
    selectedModel: modelName,
  });
}

async function selectDefaultModel() {
  await store.selectDefaultModel();
  settingsStore.applySettings({
    useDefaultModel: true,
    selectedModel: null,
  });
}

async function deleteModel(modelName: string) {
  if (confirm(t('confirmDeleteModel', { model: modelName }))) {
    await store.deleteModel(modelName);
    if (settings.value.selectedModel === modelName) {
      settingsStore.applySettings({
        useDefaultModel: true,
        selectedModel: null,
      });
    }
  }
}

async function playMotion(group: string, _file: string) {
  await emitRuntimeEvent('stage-preview-motion', group);
}

async function playExpression(name: string) {
  await emitRuntimeEvent('stage-preview-expression', name);
}

const updateAlwaysOnTop = async () => {
  try {
    const tauriWindow = getCurrentWindow();
    await tauriWindow.setAlwaysOnTop(settings.value.alwaysOnTop);
  } catch (error) {
    console.error('Failed to update always-on-top:', error);
  }
};

const formatProbeTime = (value: number) => {
  if (!value) {
    return t('notYet');
  }

  return new Date(value).toLocaleString(
    currentLocale.value === 'zh-CN' ? 'zh-CN' : 'en-US',
  );
};

const probeVoiceRuntime = async () => {
  try {
    await voiceStore.probeProviders(companionSettings.value);
  } catch (error) {
    console.error('Voice runtime probe failed:', error);
  }
};

const runOrganizerNow = async () => {
  desktopActionError.value = '';
  desktopActionStatus.value = '';
  try {
    const result = await desktopServicesStore.runDesktopOrganizerNow(
      companionSettings.value.desktopOrganizerPath,
      companionSettings.value.desktopOrganizerAutoFolders,
    );
    desktopActionStatus.value = `${t('organizeResultPrefix')}: ${result.movedCount}`;
  } catch (error) {
    desktopActionError.value =
      error instanceof Error ? error.message : 'Unable to organize files.';
  }
};

const runBatchRenameNow = async () => {
  desktopActionError.value = '';
  desktopActionStatus.value = '';
  try {
    const result = await desktopServicesStore.runBatchRenameNow(
      companionSettings.value.batchRenameDirectory,
      companionSettings.value.batchRenamePattern,
    );
    desktopActionStatus.value = `${t('renameResultPrefix')}: ${result.renamedCount}`;
  } catch (error) {
    desktopActionError.value =
      error instanceof Error ? error.message : 'Unable to rename files.';
  }
};

const syncRelationshipNow = async () => {
  desktopActionError.value = '';
  desktopActionStatus.value = '';
  try {
    await desktopServicesStore.syncRelationshipState();
    if (relationshipState.value) {
      desktopActionStatus.value = `Affection ${relationshipState.value.affection} | ${relationshipState.value.level} | ${relationshipState.value.mood}`;
    } else {
      desktopActionStatus.value = t('syncRelationshipNow');
    }
  } catch (error) {
    desktopActionError.value =
      error instanceof Error ? error.message : 'Unable to sync relationship state.';
  }
};

const saveSettings = async () => {
  const nextSettings = settingsStore.save();
  const nextCompanionSettings = companionConfigStore.save();
  await emitRuntimeEvent('settings-changed', nextSettings);
  await emitRuntimeEvent('companion-settings-changed', nextCompanionSettings);
  const currentWindow = getCurrentWindow();
  await currentWindow.close();
};

onMounted(async () => {
  settingsStore.load();
  companionConfigStore.load();

  const selection: StageModelSelection = {
    useDefaultModel: settings.value.useDefaultModel,
    selectedModel: settings.value.selectedModel,
  };

  await store.initialize(selection);
  await refreshRuntimeStatus();
  runtimeRefreshTimer = window.setInterval(() => {
    void refreshRuntimeStatus();
  }, 12000);
});

onUnmounted(() => {
  if (runtimeRefreshTimer !== null) {
    window.clearInterval(runtimeRefreshTimer);
    runtimeRefreshTimer = null;
  }
});

watch(
  activeSection,
  (section) => {
    if (section === 'desktop') {
      void refreshRuntimeStatus();
    }

    if (section !== 'voice' || hasAutoProbedVoice.value) {
      return;
    }

    hasAutoProbedVoice.value = true;
    void probeVoiceRuntime();
  },
);
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:global(body) {
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background:
    radial-gradient(circle at top left, rgba(255, 186, 73, 0.18), transparent 32%),
    radial-gradient(circle at bottom right, rgba(40, 114, 255, 0.14), transparent 34%),
    linear-gradient(180deg, #f7f3ea 0%, #eef4ff 100%);
}

.settings-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  color: #172033;
}

.settings-sidebar {
  padding: 28px 22px;
  background: rgba(10, 18, 34, 0.92);
  color: #f7f8fb;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 28px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: auto;
}

.brand-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand-kicker,
.hero-kicker {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.brand-kicker {
  color: #ffcb70;
}

.brand-block h1 {
  font-size: 30px;
  line-height: 1;
}

.brand-copy {
  color: rgba(247, 248, 251, 0.78);
  line-height: 1.6;
  font-size: 14px;
}

.section-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-runtime-card,
.sidebar-mini-card {
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background:
    linear-gradient(160deg, rgba(255, 203, 112, 0.14), rgba(255, 255, 255, 0.04)),
    rgba(255, 255, 255, 0.04);
  padding: 16px;
}

.sidebar-runtime-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-runtime-copy {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(247, 248, 251, 0.7);
}

.sidebar-runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sidebar-mini-card {
  min-height: 94px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-tab {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  padding: 14px 16px;
  border-radius: 18px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-tab:hover,
.section-tab.active {
  transform: translateX(4px);
  border-color: rgba(255, 203, 112, 0.8);
  background: rgba(255, 203, 112, 0.12);
}

.section-tab-label {
  font-size: 15px;
  font-weight: 700;
}

.section-tab-note {
  font-size: 12px;
  color: rgba(247, 248, 251, 0.68);
}

.settings-content {
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hero-card,
.settings-card,
.action-bar {
  border-radius: 24px;
  border: 1px solid rgba(23, 32, 51, 0.08);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 18px 45px rgba(27, 40, 78, 0.08);
  backdrop-filter: blur(10px);
}

.hero-card {
  padding: 24px 26px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
  background:
    radial-gradient(circle at top left, rgba(255, 203, 112, 0.3), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(245, 249, 255, 0.86));
}

.hero-kicker {
  color: #7a4d00;
  margin-bottom: 8px;
}

.hero-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card h2 {
  font-size: 28px;
  margin-bottom: 10px;
}

.hero-copy {
  color: #556178;
  line-height: 1.6;
  max-width: 760px;
}

.hero-chip-row,
.hero-route-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-chip,
.hero-route-card {
  border-radius: 16px;
  border: 1px solid rgba(23, 32, 51, 0.08);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 10px 24px rgba(27, 40, 78, 0.06);
}

.hero-chip {
  padding: 10px 14px;
  color: #284163;
  font-size: 13px;
  font-weight: 700;
}

.hero-route-card {
  min-width: 140px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

.language-switch {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.language-label {
  color: #7a4d00;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.language-toggle {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.language-chip {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(23, 32, 51, 0.12);
  background: rgba(248, 250, 255, 0.96);
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.language-chip:hover {
  transform: translateY(-1px);
}

.language-chip.active {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #2a72ff 0%, #0ec5d7 100%);
  box-shadow: 0 10px 24px rgba(42, 114, 255, 0.22);
}

.status-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.status-pill {
  min-width: 128px;
  padding: 12px 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #fff2ce 0%, #fff9ec 100%);
  border: 1px solid rgba(122, 77, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-label {
  color: #7a4d00;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.settings-card {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wide-card {
  grid-column: 1 / -1;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.card-head h3 {
  font-size: 18px;
  margin-bottom: 6px;
}

.card-head p {
  color: #66748d;
  line-height: 1.5;
}

.capability-grid {
  justify-content: flex-start;
}

.capability-tile {
  min-width: 180px;
  flex: 1 1 180px;
}

.capability-copy {
  color: #66748d;
  font-size: 13px;
  line-height: 1.5;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
}

.setting-row span,
.field-label {
  font-size: 14px;
  color: #243148;
}

.setting-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wide-field {
  grid-column: 1 / -1;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.compact-grid {
  grid-template-columns: repeat(2, minmax(180px, 240px));
}

.setting-text-input,
.setting-select,
.setting-input {
  border: 1px solid rgba(23, 32, 51, 0.12);
  background: rgba(248, 250, 255, 0.92);
  color: #172033;
  border-radius: 14px;
  padding: 11px 13px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.setting-text-input:focus,
.setting-select:focus,
.setting-input:focus {
  border-color: #2a72ff;
  box-shadow: 0 0 0 4px rgba(42, 114, 255, 0.12);
}

.setting-input {
  width: 100px;
}

.wide-input {
  width: 100%;
}

.setting-help {
  color: #66748d;
  line-height: 1.6;
  font-size: 13px;
}

.diagnostics-grid {
  justify-content: flex-start;
}

.diagnostics-panel {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.diagnostic-card {
  border: 1px solid rgba(23, 32, 51, 0.08);
  background: rgba(248, 250, 255, 0.92);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diagnostic-label {
  color: #7a4d00;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.diagnostic-title {
  font-size: 16px;
  color: #172033;
}

.diagnostic-title.unavailable {
  color: #b53333;
}

.diagnostic-copy {
  color: #556178;
  line-height: 1.5;
  font-size: 13px;
}

.diagnostic-target {
  font-size: 12px;
  color: #7a869d;
  word-break: break-all;
}

.diagnostic-details {
  margin: 0;
  padding-left: 18px;
  color: #556178;
  font-size: 12px;
  line-height: 1.5;
}

.diagnostic-issues {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diagnostic-error {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 235, 235, 0.92);
  border: 1px solid rgba(203, 47, 47, 0.18);
  color: #9f2e2e;
}

.diagnostic-list {
  padding-left: 18px;
  color: #556178;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  flex: 0 0 auto;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: #c8d2e2;
  transition: 0.25s ease;
  border-radius: 999px;
}

.slider:before {
  position: absolute;
  content: "";
  width: 22px;
  height: 22px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.25s ease;
  box-shadow: 0 3px 8px rgba(20, 31, 52, 0.18);
}

input:checked + .slider {
  background: linear-gradient(135deg, #2a72ff 0%, #39b1ff 100%);
}

input:checked + .slider:before {
  transform: translateX(24px);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(23, 32, 51, 0.08);
  background: rgba(248, 250, 255, 0.95);
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  cursor: pointer;
}

.model-item:hover,
.model-item.active {
  transform: translateY(-1px);
  border-color: rgba(42, 114, 255, 0.4);
  background: rgba(231, 240, 255, 0.92);
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-name {
  font-weight: 700;
}

.model-status {
  color: #2a72ff;
  font-size: 12px;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: none;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.btn:hover,
.btn-small:hover {
  transform: translateY(-1px);
}

.btn-primary,
.btn-save {
  color: white;
  background: linear-gradient(135deg, #2a72ff 0%, #0ec5d7 100%);
}

.btn-secondary {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 700;
  color: #172033;
  border: 1px solid rgba(23, 32, 51, 0.12);
  background: rgba(248, 250, 255, 0.96);
}

.btn-secondary:disabled {
  cursor: wait;
  opacity: 0.7;
}

.btn-primary {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 700;
}

.btn-save {
  padding: 14px 22px;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 700;
}

.btn-small {
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(23, 32, 51, 0.12);
  background: white;
  font-size: 12px;
  cursor: pointer;
}

.btn-danger {
  color: #cb2f2f;
  border-color: rgba(203, 47, 47, 0.28);
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.btn-motion,
.btn-expression {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(248, 250, 255, 0.95);
  border: 1px solid rgba(23, 32, 51, 0.1);
  font-size: 12px;
  text-align: center;
}

.btn-motion:hover,
.btn-expression:hover {
  border-color: rgba(42, 114, 255, 0.4);
  color: #2a72ff;
}

.action-bar {
  padding: 20px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.action-copy {
  color: #5d6980;
  line-height: 1.6;
  max-width: 720px;
}

@media (max-width: 1080px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .section-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .hero-card,
  .action-bar {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-side,
  .language-switch,
  .language-toggle,
  .status-grid {
    align-items: flex-start;
    justify-content: flex-start;
  }
}

@media (max-width: 900px) {
  .settings-content {
    padding: 16px;
  }

  .card-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-grid,
  .field-grid,
  .sidebar-runtime-grid,
  .compact-grid {
    grid-template-columns: 1fr;
  }

  .action-bar {
    align-items: stretch;
  }

  .hero-route-card,
  .status-pill,
  .sidebar-mini-card {
    min-width: 0;
  }

  .btn-save {
    width: 100%;
  }
}
</style>
