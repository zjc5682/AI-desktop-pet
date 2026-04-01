import { onUnmounted, ref } from 'vue';

type MaybeGetter<T> = T | (() => T);

interface IdleDetectionOptions {
  idleDelay?: MaybeGetter<number>;
  sleepDelay?: MaybeGetter<number>;
  enabled?: MaybeGetter<boolean>;
}

function resolveOption<T>(value: MaybeGetter<T> | undefined, fallback: T): T {
  if (typeof value === 'function') {
    return (value as () => T)();
  }
  return value ?? fallback;
}

export function useIdleDetection(
  onIdle?: () => void,
  onSleep?: () => void,
  options: IdleDetectionOptions = {},
) {
  const isSleeping = ref(false);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let sleepTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (sleepTimeout) {
      clearTimeout(sleepTimeout);
      sleepTimeout = null;
    }
  };

  const resetIdleTimer = () => {
    clearTimers();

    if (!resolveOption(options.enabled, true)) {
      isSleeping.value = false;
      return;
    }

    isSleeping.value = false;
    const idleDelay = resolveOption(options.idleDelay, 5000);
    const sleepDelay = resolveOption(options.sleepDelay, 30000);

    idleTimer = setTimeout(() => {
      onIdle?.();

      sleepTimeout = setTimeout(() => {
        isSleeping.value = true;
        onSleep?.();
      }, sleepDelay);
    }, idleDelay);
  };

  const startIdleDetection = () => {
    resetIdleTimer();
  };

  const toggleSleep = () => {
    isSleeping.value = !isSleeping.value;
    if (isSleeping.value) {
      clearTimers();
    } else {
      resetIdleTimer();
    }
  };

  onUnmounted(() => {
    clearTimers();
  });

  return {
    isSleeping,
    startIdleDetection,
    resetIdleTimer,
    toggleSleep,
  };
}
