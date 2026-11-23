import { createRacing3dEngine } from './racing3dEngine';
import { createRacing2dFallbackEngine } from './racing2dFallback';
import type {
  RacingCarTelemetry,
  RacingEngineHandle,
  RacingGyroControlState,
} from './racingTypes';

let activeEngine: RacingEngineHandle | null = null;

export function mount(
  container: HTMLElement,
  callbacks?: {
    onTelemetry?: (t: RacingCarTelemetry) => void;
    onFinish?: (s: { position: number; totalTimeMs: number; bestLapMs: number }) => void;
    onContextLost?: () => void;
  }
): void {
  unmount();
  try {
    activeEngine = createRacing3dEngine(container, callbacks || {});
  } catch {
    activeEngine = createRacing2dFallbackEngine(container, callbacks || {});
  }
}

export function setGyroInput(
  input: Partial<RacingGyroControlState>,
  expiresInMs = 950,
  playerSlot?: 1 | 2
): void {
  activeEngine?.setGyroInput(input, expiresInMs, playerSlot ?? input.playerSlot);
}

export function setPlayer2Connected(connected: boolean): void {
  activeEngine?.setPlayer2Connected?.(connected);
}

export function setRemoteKey(keys: {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
  nitro?: boolean;
  handbrake?: boolean;
}): void {
  activeEngine?.setKeyboardState(keys);
}

export function cycleCamera(): string {
  return activeEngine ? activeEngine.cycleCamera() : 'chase';
}

export function resetRace(): void {
  activeEngine?.resetRace();
}

export function setMuted(muted: boolean): void {
  activeEngine?.setMuted(muted);
}

export function triggerHorn(): void {
  activeEngine?.triggerHorn();
}

export function unmount(): void {
  if (activeEngine) {
    activeEngine.destroy();
    activeEngine = null;
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).RiffanRacing3D = {
    mount,
    setGyroInput,
    setPlayer2Connected,
    setRemoteKey,
    cycleCamera,
    resetRace,
    setMuted,
    triggerHorn,
    unmount,
  };
}
