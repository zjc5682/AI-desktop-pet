import type { UiLanguage } from '@table-pet/shared';

export const SETTINGS_EN_TEXT = {
  sidebarKicker: 'Desktop Companion',
  sidebarTitle: 'Control Center',
  sidebarCopy:
    'Tune realtime chat, voice wake-up, camera perception, and stage behavior from one place.',
  sectionOverviewLabel: 'Overview',
  sectionOverviewNote: 'Desktop behavior',
  sectionChatLabel: 'Chat',
  sectionChatNote: 'Transport and models',
  sectionVoiceLabel: 'Voice',
  sectionVoiceNote: 'Wake word and duplex',
  sectionVisionLabel: 'Vision',
  sectionVisionNote: 'Camera perception',
  sectionCallLabel: 'Call',
  sectionCallNote: 'Video surface config',
  sectionCareLabel: 'Care',
  sectionCareNote: 'Proactive reminders',
  sectionStageLabel: 'Stage',
  sectionStageNote: 'Models and previews',
  heroKicker: 'AIRI-style operating panel',
  heroTitle: 'Companion runtime settings',
  heroCopy:
    'This page now carries the structure for chat, full-duplex voice, and camera perception.',
  languageLabel: 'Language',
  languageEnglish: 'English',
  languageChinese: '中文',
  statusChat: 'Chat',
  statusVoice: 'Voice',
  statusCamera: 'Camera',
  statusMemory: 'Memory',
  statusGpu: 'GPU',
  statusEnabled: 'Enabled',
  statusDisabled: 'Disabled',
  statusArmed: 'Armed',
  statusOff: 'Off',
  statusBackend: 'Backend',
  statusFallback: 'Fallback',
  statusUnknown: 'Unknown',
  overviewDesktopTitle: 'Desktop behavior',
  overviewDesktopCopy: 'Core visibility and stage messaging.',
  enableChatWindow: 'Enable chat window',
  showBubbleMessages: 'Show bubble messages',
  alwaysOnTop: 'Always on top',
  overviewRuntimeTitle: 'Runtime policy',
  overviewRuntimeCopy: 'High-level capability toggles before deeper provider wiring.',
  enableInternetSearch: 'Enable internet search',
  safeMode: 'Safe mode',
  activeCharacterId: 'Active character id',
  overviewIdleTitle: 'Idle and sleep',
  overviewIdleCopy: 'Pet-side behavior while waiting and after inactivity.',
  enableIdleDetection: 'Enable idle detection',
  idleTimeSeconds: 'Idle time (seconds)',
  overviewCameraTitle: 'Camera quick controls',
  overviewCameraCopy:
    'Shortcut toggles for perception features without leaving overview.',
  enableCamera: 'Enable camera',
  faceDetection: 'Face detection',
  expressionRecognition: 'Expression recognition',
  expressionModelPath: 'Expression model path',
  expressionModelHelp:
    'If an ONNX FERPlus-style model exists at this path, the backend will use it first and fall back to heuristics when unavailable.',
  gazeTracking: 'Gaze tracking',
  gestureRecognition: 'Gesture recognition',
  openVisionPanel: 'Open vision panel',
  chatTransportTitle: 'Chat transport',
  chatTransportCopy: 'Runtime websocket and model provider routing.',
  websocketUrl: 'WebSocket URL',
  chatProvider: 'Chat provider',
  localQwenPlaceholder: 'Local Qwen (placeholder)',
  localQwenProvider: 'Local Qwen',
  ollamaUrl: 'Ollama URL',
  ollamaModel: 'Ollama model',
  openAiBaseUrl: 'OpenAI base URL',
  openAiApiKey: 'OpenAI API key',
  openAiModel: 'OpenAI model',
  zhipuBaseUrl: 'Zhipu base URL',
  zhipuApiKey: 'Zhipu API key',
  zhipuModel: 'Zhipu model',
  qwenLocalModelPath: 'Qwen local model path',
  qwenLocalContextSize: 'Qwen context size',
  qwenLocalThreads: 'Qwen threads',
  qwenLocalGpuLayers: 'Qwen GPU layers',
  apiKeyPlaceholder: 'Paste your API key',
  temperature: 'Temperature',
  maxTokens: 'Max tokens',
  searchRoutingTitle: 'Search augmentation',
  searchRoutingCopy:
    'Authorize current-info lookups and inject DuckDuckGo results into the chat prompt when needed.',
  searchProviderLabel: 'Search provider',
  searchMaxResults: 'Search max results',
  searchHelp:
    'When enabled, the backend can augment time-sensitive questions with DuckDuckGo results before sending them to the model.',
  chatHelp:
    'The backend now routes Ollama, local Qwen, OpenAI, and Zhipu per request. Local Qwen still requires a valid GGUF model and llama-cpp-python.',
  voiceInteractionTitle: 'Voice interaction',
  voiceInteractionCopy: 'Wake word, auto listen, and interruption behavior.',
  enableVoiceInteraction: 'Enable voice interaction',
  wakeWordEnabled: 'Wake word enabled',
  wakeWord: 'Wake word',
  fullDuplexMode: 'Full-duplex mode',
  allowInterruption: 'Allow interruption',
  autoStartMicrophone: 'Auto-start microphone',
  voiceEmotionSync: 'Voice emotion sync',
  voiceProvidersTitle: 'Voice providers',
  voiceProvidersCopy:
    'Current runtime supports optional Silero VAD, Whisper or VibeVoice ASR, and Edge-TTS or HTTP TTS providers.',
  vad: 'VAD',
  energyFallback: 'energy fallback',
  stt: 'STT',
  tts: 'TTS',
  speechLanguage: 'Speech language',
  ttsVoice: 'TTS voice',
  audioCaptureBackend: 'Audio capture backend',
  rustPlanned: 'Rust Native',
  webAudio: 'Web Audio',
  voiceEmotionProvider: 'Voice emotion provider',
  disabled: 'Disabled',
  voiceEmotionModelPath: 'Voice emotion model path',
  localModelPathPlaceholder: 'Local model path or cached model id',
  providerEndpointsTitle: 'Provider endpoints',
  providerEndpointsCopy:
    'Optional HTTP endpoints for VibeVoice and GPT-SoVITS runtime adapters.',
  vibeVoiceAsrUrl: 'VibeVoice ASR URL',
  vibeVoiceTtsUrl: 'VibeVoice TTS URL',
  vibeVoiceRealtimeUrlPlaceholder: 'http://127.0.0.1:3000 or ws://127.0.0.1:3000/stream',
  vibeVoiceRealtimeHelp:
    'For the official VibeVoice realtime demo, you can fill in the root HTTP address or the /stream websocket address. The runtime will normalize it automatically.',
  vibeVoiceVoiceHelp:
    'When TTS provider is VibeVoice-Realtime, the TTS voice field is treated as the VibeVoice voice preset key, for example en-Carter_man.',
  gptSovitsUrl: 'GPT-SoVITS URL',
  gptSovitsReferenceAudio: 'GPT-SoVITS reference audio',
  absoluteReferenceAudioPath: 'Absolute reference audio path',
  gptSovitsPromptText: 'GPT-SoVITS prompt text',
  gptSovitsPromptLanguage: 'GPT-SoVITS prompt language',
  voiceDiagnosticsTitle: 'Voice runtime diagnostics',
  voiceDiagnosticsCopy:
    'Probe backend voice providers without starting microphone capture.',
  probingButton: 'Probing...',
  probeRuntimeButton: 'Probe runtime',
  probe: 'Probe',
  lastProbe: 'Last probe',
  notYet: 'Not yet',
  diagnosticReady: 'Ready',
  diagnosticNotReady: 'Not ready yet.',
  diagnosticCapture: 'Capture',
  diagnosticCaptureActive: 'Using the currently active runtime capture backend.',
  diagnosticCaptureConfigured: 'Using the configured capture backend until runtime starts.',
  diagnosticVAD: 'VAD',
  diagnosticSTT: 'STT',
  diagnosticTTS: 'TTS',
  diagnosticVoiceEmotion: 'Voice emotion',
  diagnosticDefaultVoice: 'Default voice',
  diagnosticVoicePresets: 'Voice presets',
  diagnosticConfigUrl: 'Config URL',
  voiceSessionStatus: 'Session',
  activeCaptureBackend: 'Capture backend',
  voiceStatusIdle: 'Idle',
  voiceStatusConnecting: 'Connecting',
  voiceStatusListening: 'Listening',
  voiceStatusProcessing: 'Processing',
  voiceStatusSpeaking: 'Speaking',
  voiceStatusError: 'Error',
  probeStatusIdle: 'Idle',
  probeStatusProbing: 'Probing',
  probeStatusReady: 'Ready',
  probeStatusError: 'Error',
  visionPipelineTitle: 'Camera pipeline',
  visionPipelineCopy: 'Live perception for face, expression, and gaze.',
  visionBackend: 'Vision backend',
  mediapipeOpenCv: 'MediaPipe + OpenCV',
  openCvOnly: 'OpenCV only',
  perceptionFeaturesTitle: 'Perception features',
  perceptionFeaturesCopy:
    'Feature flags for the next camera/runtime migration step.',
  previewEmpathyTitle: 'Preview and empathy',
  previewEmpathyCopy:
    'Overlay camera preview and Live2D emotion syncing controls.',
  cameraPreviewOverlay: 'Camera preview overlay',
  previewPosition: 'Preview position',
  bottomLeft: 'Bottom left',
  bottomRight: 'Bottom right',
  topLeft: 'Top left',
  topRight: 'Top right',
  empathySync: 'Empathy sync',
  callSurfaceTitle: 'Video call surface',
  callSurfaceCopy:
    'Persist camera-call preferences ahead of the dedicated call window.',
  enableVideoCallMode: 'Enable video call mode',
  virtualBackground: 'Virtual background',
  none: 'None',
  blur: 'Blur',
  image: 'Image',
  backgroundImage: 'Background image',
  absoluteFilePathOrUrl: 'Absolute file path or URL',
  callHelp:
    'These values are persisted now. The dedicated video-call window and virtual background renderer are still pending runtime wiring.',
  proactiveServiceTitle: 'Proactive service',
  proactiveServiceCopy:
    'Time-based and away-from-seat reminders from the desktop companion.',
  enableProactiveService: 'Enable proactive service',
  lateNightSleepReminder: 'Late-night sleep reminder',
  awayDetectionReminder: 'Away detection reminder',
  awayReminderDelayMinutes: 'Away reminder delay (minutes)',
  memoryRemindersTitle: 'Memory reminders',
  memoryRemindersCopy:
    'Use remembered future events from local memory as reminder triggers.',
  enableMemoryReminders: 'Enable memory reminders',
  memoryHelp:
    'Chat text mentioning dates and reminder keywords can already be turned into local reminder facts for same-day prompts.',
  stageLibraryTitle: 'Stage model library',
  stageLibraryCopy:
    'Switch between the built-in model and uploaded Live2D packages.',
  defaultModel: 'Default model',
  inUse: 'In use',
  selected: 'Selected',
  select: 'Select',
  delete: 'Delete',
  uploadModel: 'Upload model',
  motionPreviewTitle: 'Motion preview',
  motionPreviewCopy: 'Preview imported motions before saving and closing.',
  expressionPreviewTitle: 'Expression preview',
  expressionPreviewCopy: 'Preview imported expressions on the current stage.',
  sectionDesktopLabel: 'Desktop',
  sectionDesktopNote: 'Clipboard and system',
  desktopClipboardTitle: 'Clipboard assistant',
  desktopClipboardCopy:
    'Watch copied code, links, and errors from the hidden desktop service window.',
  clipboardWatcherEnabled: 'Clipboard watcher',
  clipboardCodeInsightsEnabled: 'Code explain',
  clipboardLinkSummaryEnabled: 'Link summary',
  clipboardErrorAnalysisEnabled: 'Error analysis',
  clipboardPollingIntervalMs: 'Clipboard polling (ms)',
  desktopOrganizerTitle: 'File tools',
  desktopOrganizerCopy:
    'Manual desktop organization and batch rename for the current migration step.',
  desktopOrganizerEnabled: 'Enable organizer',
  desktopOrganizerPath: 'Organizer root path',
  desktopOrganizerAutoFolders: 'Create type folders automatically',
  organizeNow: 'Organize now',
  organizeResultPrefix: 'Organizer result',
  batchRenameTitle: 'Batch rename',
  batchRenameCopy:
    'Rename files with placeholders like {date}, {index}, {stem}, and {ext}.',
  batchRenameEnabled: 'Enable batch rename',
  batchRenameDirectory: 'Batch rename directory',
  batchRenamePattern: 'Rename pattern',
  renameNow: 'Rename now',
  renameResultPrefix: 'Rename result',
  focusModeTitle: 'Focus mode',
  focusModeCopy: 'Run pomodoro timing and quiet-mode behavior from the background window.',
  pomodoroEnabled: 'Enable pomodoro',
  pomodoroWorkMinutes: 'Work minutes',
  pomodoroBreakMinutes: 'Break minutes',
  focusQuietModeEnabled: 'Quiet mode during focus',
  hardwareMonitorTitle: 'Hardware monitor',
  hardwareMonitorCopy: 'Watch CPU, memory, temperature, and battery from the desktop layer.',
  hardwareMonitoringEnabled: 'Enable hardware monitoring',
  cpuUsageAlertThreshold: 'CPU alert threshold (%)',
  memoryUsageAlertThreshold: 'Memory alert threshold (%)',
  cpuTemperatureAlertThreshold: 'CPU temperature threshold (°C)',
  batteryLowThreshold: 'Battery low threshold (%)',
  currentCpuTemperature: 'Current CPU',
  currentGpuTemperature: 'Current GPU',
  currentMemoryUsage: 'Current memory',
  currentBatteryLevel: 'Current battery',
  memoryRuntimeTitle: 'Memory runtime',
  memoryRuntimeCopy:
    'Show whether runtime memory is using the DuckDB/LanceDB backend or the local fallback path.',
  memoryRuntimeMode: 'Mode',
  memoryRuntimeEngine: 'Engine',
  memoryRuntimePath: 'Database path',
  memoryRuntimeVectorIndex: 'Vector index',
  memoryRuntimeCounts: 'Counts',
  memoryRuntimeError: 'Last error',
  memoryRuntimeCountsFormat: 'Turns {turns} | Facts {facts} | Chunks {chunks}',
  desktopAffinityTitle: 'Relationship and profile',
  desktopAffinityCopy:
    'Persist preference facts and relationship state from chat and background activity.',
  affectionSystemEnabled: 'Affection system',
  emotionStateEnabled: 'Emotion state machine',
  userProfileEnabled: 'User profile extraction',
  syncRelationshipNow: 'Sync relationship now',
  shortcutTitle: 'Shortcut plan',
  shortcutCopy:
    'Shortcut fields are stored now and will be wired to real global registration next.',
  bossKeyShortcut: 'Boss key shortcut',
  voiceRecordShortcut: 'Voice record shortcut',
  screenshotTranslateShortcut: 'Screenshot shortcut',
  saveCopy:
    'Save applies desktop settings immediately and persists provider, voice, and camera configuration for the next runtime steps.',
  saveSettings: 'Save settings',
  confirmDeleteModel: 'Delete model "{model}"?',
} as const;

export type SettingsLocaleKey = keyof typeof SETTINGS_EN_TEXT;

export const SETTINGS_ZH_TEXT: Partial<Record<SettingsLocaleKey, string>> = {
  sidebarKicker: '桌面伴侣',
  sidebarTitle: '控制中心',
  sidebarCopy: '在一个页面里统一调整实时聊天、语音唤醒、摄像头感知和舞台行为。',
  sectionOverviewLabel: '总览',
  sectionOverviewNote: '桌面行为',
  sectionChatLabel: '聊天',
  sectionChatNote: '传输与模型',
  sectionVoiceLabel: '语音',
  sectionVoiceNote: '唤醒词与双工',
  sectionVisionLabel: '视觉',
  sectionVisionNote: '摄像头感知',
  sectionCallLabel: '通话',
  sectionCallNote: '视频界面配置',
  sectionCareLabel: '关怀',
  sectionCareNote: '主动提醒',
  sectionStageLabel: '舞台',
  sectionStageNote: '模型与预览',
  heroKicker: 'AIRI 风格操作面板',
  heroTitle: '桌宠运行时设置',
  heroCopy: '这个页面已经承载了聊天、全双工语音和摄像头感知的运行配置。',
  languageLabel: '界面语言',
  languageChinese: '中文',
  statusChat: '聊天',
  statusVoice: '语音',
  statusCamera: '摄像头',
  statusMemory: '记忆',
  statusGpu: 'GPU',
  statusEnabled: '已启用',
  statusDisabled: '已关闭',
  statusArmed: '待命中',
  statusOff: '关闭',
  statusBackend: '后端',
  statusFallback: '回退',
  statusUnknown: '未知',
  overviewDesktopTitle: '桌面行为',
  overviewDesktopCopy: '控制基础可见性和舞台消息展示。',
  enableChatWindow: '启用聊天窗口',
  showBubbleMessages: '显示气泡消息',
  alwaysOnTop: '窗口置顶',
  overviewRuntimeTitle: '运行策略',
  overviewRuntimeCopy: '在更深的 Provider 接线之前先控制高层能力开关。',
  enableInternetSearch: '启用联网搜索',
  safeMode: '安全模式',
  activeCharacterId: '当前角色 ID',
  overviewIdleTitle: '空闲与休眠',
  overviewIdleCopy: '桌宠等待和长时间无操作时的行为。',
  enableIdleDetection: '启用空闲检测',
  idleTimeSeconds: '空闲时长（秒）',
  overviewCameraTitle: '摄像头快捷控制',
  overviewCameraCopy: '不离开总览也能快速切换感知功能。',
  enableCamera: '启用摄像头',
  faceDetection: '人脸检测',
  expressionRecognition: '表情识别',
  expressionModelPath: '表情模型路径',
  expressionModelHelp: '如果这个路径下存在 ONNX FERPlus 类模型，后端会优先使用模型；不可用时再回退到规则识别。',
  gazeTracking: '视线跟踪',
  gestureRecognition: '手势识别',
  openVisionPanel: '打开视觉面板',
  chatTransportTitle: '聊天传输',
  chatTransportCopy: '运行时 WebSocket 和模型 Provider 路由。',
  websocketUrl: 'WebSocket 地址',
  chatProvider: '聊天 Provider',
  localQwenPlaceholder: '本地 Qwen（占位）',
  localQwenProvider: '本地 Qwen',
  ollamaUrl: 'Ollama 地址',
  ollamaModel: 'Ollama 模型',
  openAiBaseUrl: 'OpenAI 基础地址',
  openAiApiKey: 'OpenAI API Key',
  openAiModel: 'OpenAI 模型',
  zhipuBaseUrl: '智谱基础地址',
  zhipuApiKey: '智谱 API Key',
  zhipuModel: '智谱模型',
  qwenLocalModelPath: '本地 Qwen 模型路径',
  qwenLocalContextSize: 'Qwen 上下文大小',
  qwenLocalThreads: 'Qwen 线程数',
  qwenLocalGpuLayers: 'Qwen GPU 层数',
  apiKeyPlaceholder: '粘贴你的 API Key',
  temperature: '温度',
  maxTokens: '最大 Token 数',
  searchRoutingTitle: '联网搜索增强',
  searchRoutingCopy: '在需要实时信息时授权 DuckDuckGo 搜索，并把搜索结果注入聊天提示词。',
  searchProviderLabel: '搜索提供方',
  searchMaxResults: '搜索结果数量',
  searchHelp: '开启后，后端会在检测到时效性问题时先搜索，再把结果和问题一起发给模型。',
  chatHelp:
    '后端现在已经支持按请求切换 Ollama、本地 Qwen、OpenAI 和智谱。本地 Qwen 仍需要有效的 GGUF 模型和 llama-cpp-python。',
  voiceInteractionTitle: '语音交互',
  voiceInteractionCopy: '控制唤醒词、自动收听和打断行为。',
  enableVoiceInteraction: '启用语音交互',
  wakeWordEnabled: '启用唤醒词',
  wakeWord: '唤醒词',
  fullDuplexMode: '全双工模式',
  allowInterruption: '允许打断',
  autoStartMicrophone: '自动启动麦克风',
  voiceEmotionSync: '语音情绪同步',
  voiceProvidersTitle: '语音 Provider',
  voiceProvidersCopy:
    '当前运行时支持可选的 Silero VAD、Whisper 或 VibeVoice ASR，以及 Edge-TTS 或 HTTP TTS Provider。',
  energyFallback: '能量回退',
  speechLanguage: '语音语言',
  ttsVoice: 'TTS 音色',
  audioCaptureBackend: '音频采集后端',
  rustPlanned: 'Rust 原生',
  voiceEmotionProvider: '语音情绪 Provider',
  disabled: '禁用',
  voiceEmotionModelPath: '语音情绪模型路径',
  localModelPathPlaceholder: '本地模型路径或缓存模型 ID',
  providerEndpointsTitle: 'Provider 端点',
  providerEndpointsCopy: 'VibeVoice 和 GPT-SoVITS 运行时适配器可选的 HTTP 端点。',
  vibeVoiceAsrUrl: 'VibeVoice ASR 地址',
  vibeVoiceTtsUrl: 'VibeVoice TTS 地址',
  gptSovitsUrl: 'GPT-SoVITS 地址',
  gptSovitsReferenceAudio: 'GPT-SoVITS 参考音频',
  absoluteReferenceAudioPath: '参考音频绝对路径',
  gptSovitsPromptText: 'GPT-SoVITS 提示文本',
  gptSovitsPromptLanguage: 'GPT-SoVITS 提示语言',
  voiceDiagnosticsTitle: '语音运行时诊断',
  voiceDiagnosticsCopy: '无需启动麦克风采集即可探测后端语音 Provider。',
  probingButton: '探测中...',
  probeRuntimeButton: '探测运行时',
  probe: '探测',
  lastProbe: '上次探测',
  notYet: '尚未探测',
  diagnosticReady: '可用',
  diagnosticNotReady: '尚未就绪。',
  diagnosticVoiceEmotion: '语音情绪',
  probeStatusIdle: '空闲',
  probeStatusProbing: '探测中',
  probeStatusReady: '就绪',
  probeStatusError: '错误',
  visionPipelineTitle: '摄像头链路',
  visionPipelineCopy: '面向人脸、表情和视线的实时感知。',
  visionBackend: '视觉后端',
  openCvOnly: '仅 OpenCV',
  perceptionFeaturesTitle: '感知功能',
  perceptionFeaturesCopy: '为下一阶段的摄像头运行时迁移控制功能开关。',
  previewEmpathyTitle: '预览与共情',
  previewEmpathyCopy: '控制摄像头预览叠加和 Live2D 情绪同步。',
  cameraPreviewOverlay: '摄像头预览叠加',
  previewPosition: '预览位置',
  bottomLeft: '左下角',
  bottomRight: '右下角',
  topLeft: '左上角',
  topRight: '右上角',
  empathySync: '共情同步',
  callSurfaceTitle: '视频通话界面',
  callSurfaceCopy: '在独立通话窗口接线前，先持久化视频通话偏好。',
  enableVideoCallMode: '启用视频通话模式',
  virtualBackground: '虚拟背景',
  none: '无',
  blur: '模糊',
  image: '图片',
  backgroundImage: '背景图片',
  absoluteFilePathOrUrl: '绝对文件路径或 URL',
  callHelp: '这些值现在会被持久化。独立视频通话窗口和虚拟背景渲染器仍在后续接线中。',
  proactiveServiceTitle: '主动服务',
  proactiveServiceCopy: '桌面伴侣基于时间和离座状态发出的提醒。',
  enableProactiveService: '启用主动服务',
  lateNightSleepReminder: '深夜睡眠提醒',
  awayDetectionReminder: '离座提醒',
  awayReminderDelayMinutes: '离座提醒延迟（分钟）',
  memoryRemindersTitle: '记忆提醒',
  memoryRemindersCopy: '把本地记忆里的未来事件作为提醒触发器。',
  enableMemoryReminders: '启用记忆提醒',
  memoryHelp: '聊天文本里提到的日期和提醒关键词，已经可以转成本地提醒事实，用于当天提示。',
  stageLibraryTitle: '舞台模型库',
  stageLibraryCopy: '在内置模型和导入的 Live2D 包之间切换。',
  defaultModel: '默认模型',
  inUse: '使用中',
  selected: '已选择',
  select: '选择',
  delete: '删除',
  uploadModel: '上传模型',
  motionPreviewTitle: '动作预览',
  motionPreviewCopy: '保存并关闭前，先预览导入的动作。',
  expressionPreviewTitle: '表情预览',
  expressionPreviewCopy: '在当前舞台上预览导入的表情。',
  saveCopy: '保存会立即应用桌面设置，并持久化后续运行步骤需要的 Provider、语音和摄像头配置。',
  saveSettings: '保存设置',
  confirmDeleteModel: '删除模型“{model}”？',
};

SETTINGS_ZH_TEXT.diagnosticCapture = '采集';
SETTINGS_ZH_TEXT.diagnosticCaptureActive =
  '当前显示的是运行时实际正在使用的采集后端。';
SETTINGS_ZH_TEXT.diagnosticCaptureConfigured =
  '当前显示的是配置中的采集后端，运行后会变成实际后端。';
SETTINGS_ZH_TEXT.voiceSessionStatus = '会话';
SETTINGS_ZH_TEXT.activeCaptureBackend = '采集后端';
SETTINGS_ZH_TEXT.diagnosticDefaultVoice = '默认音色';
SETTINGS_ZH_TEXT.diagnosticVoicePresets = '可用预设';
SETTINGS_ZH_TEXT.diagnosticConfigUrl = '配置地址';
SETTINGS_ZH_TEXT.voiceStatusIdle = '空闲';
SETTINGS_ZH_TEXT.voiceStatusConnecting = '连接中';
SETTINGS_ZH_TEXT.voiceStatusListening = '聆听中';
SETTINGS_ZH_TEXT.voiceStatusProcessing = '处理中';
SETTINGS_ZH_TEXT.voiceStatusSpeaking = '播报中';
SETTINGS_ZH_TEXT.voiceStatusError = '错误';

SETTINGS_ZH_TEXT.vibeVoiceRealtimeUrlPlaceholder =
  'http://127.0.0.1:3000 鎴?ws://127.0.0.1:3000/stream';
SETTINGS_ZH_TEXT.vibeVoiceRealtimeHelp =
  '濡傛灉浣犱娇鐢ㄧ殑鏄畼鏂?VibeVoice realtime demo锛屽彲浠ュ～鍐欐牴 HTTP 鍦板潃鎴? /stream websocket 鍦板潃锛岃繍琛屾椂浼氳嚜鍔ㄨ浆鎴愬畼鏂瑰崗璁舰寮忋€?';
SETTINGS_ZH_TEXT.vibeVoiceVoiceHelp =
  '褰撻€夋嫨 VibeVoice-Realtime 浣滀负 TTS provider 鏃讹紝鈥淭TS 闊宠壊鈥濆瓧娈靛皢浣滀负 VibeVoice 鐨勯煶鑹查璁捐瘑鍒悕锛屼緥濡?en-Carter_man銆?';

SETTINGS_ZH_TEXT.sectionDesktopLabel = '桌面';
SETTINGS_ZH_TEXT.sectionDesktopNote = '剪贴板与系统';
SETTINGS_ZH_TEXT.desktopClipboardTitle = '剪贴板助手';
SETTINGS_ZH_TEXT.desktopClipboardCopy = '由隐藏后台窗口持续监听代码、链接和报错剪贴板内容。';
SETTINGS_ZH_TEXT.clipboardWatcherEnabled = '启用剪贴板监听';
SETTINGS_ZH_TEXT.clipboardCodeInsightsEnabled = '代码解释';
SETTINGS_ZH_TEXT.clipboardLinkSummaryEnabled = '链接摘要';
SETTINGS_ZH_TEXT.clipboardErrorAnalysisEnabled = '报错分析';
SETTINGS_ZH_TEXT.clipboardPollingIntervalMs = '剪贴板轮询间隔（毫秒）';
SETTINGS_ZH_TEXT.desktopOrganizerTitle = '文件工具';
SETTINGS_ZH_TEXT.desktopOrganizerCopy = '当前迁移阶段先提供手动整理桌面和批量重命名。';
SETTINGS_ZH_TEXT.desktopOrganizerEnabled = '启用整理器';
SETTINGS_ZH_TEXT.desktopOrganizerPath = '整理根目录';
SETTINGS_ZH_TEXT.desktopOrganizerAutoFolders = '自动创建类型文件夹';
SETTINGS_ZH_TEXT.organizeNow = '立即整理';
SETTINGS_ZH_TEXT.organizeResultPrefix = '整理结果';
SETTINGS_ZH_TEXT.batchRenameTitle = '批量重命名';
SETTINGS_ZH_TEXT.batchRenameCopy = '支持 {date}、{index}、{stem}、{ext} 等占位符。';
SETTINGS_ZH_TEXT.batchRenameEnabled = '启用批量重命名';
SETTINGS_ZH_TEXT.batchRenameDirectory = '重命名目录';
SETTINGS_ZH_TEXT.batchRenamePattern = '重命名规则';
SETTINGS_ZH_TEXT.renameNow = '立即重命名';
SETTINGS_ZH_TEXT.renameResultPrefix = '重命名结果';
SETTINGS_ZH_TEXT.focusModeTitle = '专注模式';
SETTINGS_ZH_TEXT.focusModeCopy = '在后台窗口运行番茄钟和安静陪伴逻辑。';
SETTINGS_ZH_TEXT.pomodoroEnabled = '启用番茄钟';
SETTINGS_ZH_TEXT.pomodoroWorkMinutes = '工作分钟数';
SETTINGS_ZH_TEXT.pomodoroBreakMinutes = '休息分钟数';
SETTINGS_ZH_TEXT.focusQuietModeEnabled = '专注时减少打扰';
SETTINGS_ZH_TEXT.hardwareMonitorTitle = '硬件监控';
SETTINGS_ZH_TEXT.hardwareMonitorCopy = '从桌面层监控 CPU、内存、温度和电池。';
SETTINGS_ZH_TEXT.hardwareMonitoringEnabled = '启用硬件监控';
SETTINGS_ZH_TEXT.cpuUsageAlertThreshold = 'CPU 告警阈值（%）';
SETTINGS_ZH_TEXT.memoryUsageAlertThreshold = '内存告警阈值（%）';
SETTINGS_ZH_TEXT.cpuTemperatureAlertThreshold = 'CPU 温度阈值（°C）';
SETTINGS_ZH_TEXT.batteryLowThreshold = '电池低电量阈值（%）';
SETTINGS_ZH_TEXT.currentCpuTemperature = '当前 CPU';
SETTINGS_ZH_TEXT.currentGpuTemperature = '当前 GPU';
SETTINGS_ZH_TEXT.currentMemoryUsage = '当前内存';
SETTINGS_ZH_TEXT.currentBatteryLevel = '当前电池';
SETTINGS_ZH_TEXT.memoryRuntimeTitle = '记忆运行态';
SETTINGS_ZH_TEXT.memoryRuntimeCopy =
  '显示当前运行态记忆到底走 DuckDB/LanceDB 后端，还是回退到本地存储。';
SETTINGS_ZH_TEXT.memoryRuntimeMode = '模式';
SETTINGS_ZH_TEXT.memoryRuntimeEngine = '引擎';
SETTINGS_ZH_TEXT.memoryRuntimePath = '数据库路径';
SETTINGS_ZH_TEXT.memoryRuntimeVectorIndex = '向量索引';
SETTINGS_ZH_TEXT.memoryRuntimeCounts = '数量';
SETTINGS_ZH_TEXT.memoryRuntimeError = '最近错误';
SETTINGS_ZH_TEXT.memoryRuntimeCountsFormat = '消息 {turns} | 事实 {facts} | 分块 {chunks}';
SETTINGS_ZH_TEXT.desktopAffinityTitle = '关系与画像';
SETTINGS_ZH_TEXT.desktopAffinityCopy = '把聊天与后台活动沉淀为偏好事实和关系状态。';
SETTINGS_ZH_TEXT.affectionSystemEnabled = '好感度系统';
SETTINGS_ZH_TEXT.emotionStateEnabled = '情绪状态机';
SETTINGS_ZH_TEXT.userProfileEnabled = '用户画像抽取';
SETTINGS_ZH_TEXT.syncRelationshipNow = '立即同步关系状态';
SETTINGS_ZH_TEXT.shortcutTitle = '快捷键规划';
SETTINGS_ZH_TEXT.shortcutCopy = '本轮先持久化快捷键字段，下一轮再接真实全局注册。';
SETTINGS_ZH_TEXT.bossKeyShortcut = '老板键';
SETTINGS_ZH_TEXT.voiceRecordShortcut = '语音录制快捷键';
SETTINGS_ZH_TEXT.screenshotTranslateShortcut = '截图快捷键';

export const SETTINGS_LOCALE_TEXT: Record<
  UiLanguage,
  Partial<Record<SettingsLocaleKey, string>>
> = {
  en: SETTINGS_EN_TEXT,
  'zh-CN': SETTINGS_ZH_TEXT,
};
