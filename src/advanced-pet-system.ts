export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 9;
export const DEFAULT_IDLE_SLOWDOWN = 6;
const DRAG_THRESHOLD_PX = 4;

export type Frame = {
  columnIndex: number;
  frameDurationMs: number;
  rowIndex: number;
};

export type ChainMode = "idleFallback" | "loop" | "once";

export type ChainConfig = string[] | { mode?: ChainMode; sequence?: string[] };

export type StateConfig = {
  chainMode?: ChainMode;
  chainPlayback?: ChainMode;
  durationMs?: number;
  frameCount?: number;
  frameDurationMs?: number;
  frames?: number;
  lastFrameDurationMs?: number;
  row?: number;
  rowIndex?: number;
  slowdown?: number;
};

export type EventConfig = {
  dragDown?: string;
  dragLeft?: string;
  dragRight?: string;
  dragUp?: string;
  hover?: string;
};

export type AnimationConfig = {
  autoDetectFrames?: boolean;
  chainMode?: ChainMode;
  chainPlayback?: ChainMode;
  chains?: Record<string, ChainConfig>;
  events?: EventConfig;
  idleSlowdown?: number;
  loopActiveChains?: boolean;
  states?: Record<string, StateConfig>;
};

export type PetManifest = {
  animation?: AnimationConfig;
  sequences?: AnimationConfig;
};

export type NormalizedAnimationConfig = Omit<AnimationConfig, "chains" | "events" | "states"> & {
  chains: Record<string, ChainConfig>;
  events: Required<EventConfig>;
  states: Record<string, StateConfig>;
};

export type PlaybackPlan = {
  frames: Frame[];
  loopStartIndex: number | null;
};

export type BuildPlaybackPlanInput = {
  animationConfig?: AnimationConfig | null;
  detectedFrameCounts?: number[] | null;
  prefersReducedMotion?: boolean;
  state?: string | null;
};

export type PointerEventInput = {
  currentDragState?: string | null;
  deltaX: number;
  deltaY: number;
  events?: EventConfig | null;
};

type CodexActivityItem =
  | {
      commandActions?: Array<{ type?: string }>;
      status?: string;
      type?: string;
    }
  | null
  | undefined;

export const DEFAULT_STATES: Readonly<Record<string, Frame[]>> = Object.freeze({
  failed: frames(5, 8, 140, 240),
  idle: frames(0, 8, 140, 320),
  jumping: frames(4, 8, 140, 280),
  review: frames(8, 6, 150, 280),
  running: frames(7, 6, 120, 220),
  "running-left": frames(2, 8, 120, 220),
  "running-right": frames(1, 8, 120, 220),
  waiting: frames(6, 6, 150, 260),
  waving: frames(3, 4, 140, 280),
});

export const DEFAULT_CHAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  failed: Object.freeze(["failed", "waiting"]),
  jumping: Object.freeze(["jumping", "waving"]),
  review: Object.freeze(["review", "waving"]),
  waiting: Object.freeze(["waiting", "waving"]),
});

export const DEFAULT_EVENTS: Readonly<Required<EventConfig>> = Object.freeze({
  dragDown: "jumping",
  dragLeft: "running-left",
  dragRight: "running-right",
  dragUp: "waving",
  hover: "jumping",
});

export const ACTIVITY_STATE_NAMES = Object.freeze([
  "thinking",
  "editing",
  "edited",
  "running-command",
  "ran-command",
  "reading",
  "read",
  "listing",
  "listed",
  "searching",
  "searched",
  "searching-web",
  "searched-web",
  "calling-tool",
  "called-tool",
] as const);

export type ActivityPetState = (typeof ACTIVITY_STATE_NAMES)[number];

export function normalizeAnimationConfig(manifest: PetManifest | null | undefined): NormalizedAnimationConfig {
  const source = manifest?.animation ?? manifest?.sequences ?? {};
  return {
    ...source,
    chains: source.chains ?? {},
    events: { ...DEFAULT_EVENTS, ...(source.events ?? {}) },
    states: source.states ?? {},
  };
}

export function buildPlaybackPlan({
  animationConfig,
  detectedFrameCounts,
  prefersReducedMotion,
  state,
}: BuildPlaybackPlanInput): PlaybackPlan {
  const config = animationConfig ?? {};
  const activeState = state ?? "idle";
  const baseFrames = resolveStateFrames(activeState, config, detectedFrameCounts);

  if (prefersReducedMotion) {
    return {
      frames: [baseFrames[0] ?? DEFAULT_STATES[activeState]?.[0] ?? DEFAULT_STATES.idle[0]],
      loopStartIndex: null,
    };
  }

  const chain = resolveChain(activeState, config);
  if (activeState === "idle") {
    return {
      frames: resolveIdleLoop(chain, config, detectedFrameCounts),
      loopStartIndex: 0,
    };
  }

  const activeFrames = chain
    ? chain.flatMap((chainState) =>
        applyStateSlowdown(resolveStateFrames(chainState, config, detectedFrameCounts), config, chainState),
      )
    : [...baseFrames, ...baseFrames, ...baseFrames];

  const mode = resolveChainMode(activeState, config);
  if (mode === "loop") {
    return { frames: activeFrames, loopStartIndex: 0 };
  }
  if (mode === "once") {
    return { frames: activeFrames, loopStartIndex: null };
  }

  const idleFrames = resolveIdleLoop(resolveChain("idle", config), config, detectedFrameCounts);
  return {
    frames: [...activeFrames, ...idleFrames],
    loopStartIndex: activeFrames.length,
  };
}

export function resolveStateFrames(
  state: string,
  animationConfig: AnimationConfig | null | undefined,
  detectedFrameCounts?: number[] | null,
): Frame[] {
  const stateConfig = animationConfig?.states?.[state];
  const fallback = DEFAULT_STATES[state] ?? DEFAULT_STATES.idle;
  const row = stateConfig?.rowIndex ?? stateConfig?.row ?? fallback[0]?.rowIndex ?? 0;
  const detectedFrames = Array.isArray(detectedFrameCounts) ? detectedFrameCounts[row] : null;
  const frameCount = finiteNumber(stateConfig?.frames)
    ? stateConfig.frames
    : finiteNumber(stateConfig?.frameCount)
      ? stateConfig.frameCount
      : detectedFrames ?? fallback.length;
  const count = clamp(Math.trunc(frameCount), 1, ATLAS_COLUMNS);
  const durationMs = finiteNumber(stateConfig?.durationMs)
    ? stateConfig.durationMs
    : finiteNumber(stateConfig?.frameDurationMs)
      ? stateConfig.frameDurationMs
      : fallback[0]?.frameDurationMs ?? 140;
  const lastFrameDurationMs = finiteNumber(stateConfig?.lastFrameDurationMs)
    ? stateConfig.lastFrameDurationMs
    : fallback.at(-1)?.frameDurationMs ?? durationMs;

  return frames(row, count, durationMs, lastFrameDurationMs);
}

export function resolveChain(state: string, animationConfig: AnimationConfig | null | undefined): string[] | null {
  let chain: ChainConfig | readonly string[] | undefined =
    animationConfig?.chains?.[state] ?? DEFAULT_CHAINS[state];
  if (isChainObject(chain) && Array.isArray(chain.sequence)) {
    chain = chain.sequence;
  }
  return Array.isArray(chain) && chain.length > 0 ? [...chain] : null;
}

export function resolveChainMode(state: string, animationConfig: AnimationConfig | null | undefined): ChainMode {
  const chain = animationConfig?.chains?.[state];
  const mode =
    (isChainObject(chain) ? chain.mode : undefined) ??
    animationConfig?.states?.[state]?.chainMode ??
    animationConfig?.states?.[state]?.chainPlayback ??
    animationConfig?.chainMode ??
    animationConfig?.chainPlayback ??
    animationConfig?.loopActiveChains;

  if (mode === true) {
    return "loop";
  }
  if (mode === "loop" || mode === "once") {
    return mode;
  }
  return "idleFallback";
}

export function resolveIdleLoop(
  chain: string[] | null,
  animationConfig: AnimationConfig | null | undefined,
  detectedFrameCounts?: number[] | null,
): Frame[] {
  if (chain) {
    return chain.flatMap((state) =>
      applyStateSlowdown(resolveStateFrames(state, animationConfig, detectedFrameCounts), animationConfig, state),
    );
  }
  return applyStateSlowdown(
    resolveStateFrames("idle", animationConfig, detectedFrameCounts),
    animationConfig,
    "idle",
  );
}

export function applyStateSlowdown(
  stateFrames: Frame[],
  animationConfig: AnimationConfig | null | undefined,
  state: string,
): Frame[] {
  const stateConfig = animationConfig?.states?.[state];
  const slowdown = finiteNumber(stateConfig?.slowdown)
    ? stateConfig.slowdown
    : state === "idle"
      ? animationConfig?.idleSlowdown ?? DEFAULT_IDLE_SLOWDOWN
      : 1;

  if (slowdown === 1) {
    return stateFrames;
  }
  return stateFrames.map((frame) => ({
    ...frame,
    frameDurationMs: frame.frameDurationMs * slowdown,
  }));
}

export function mapPointerEvent({ currentDragState, deltaX, deltaY, events }: PointerEventInput): string | null {
  const mapping = { ...DEFAULT_EVENTS, ...(events ?? {}) };
  if (deltaX >= DRAG_THRESHOLD_PX) {
    return mapping.dragRight;
  }
  if (deltaX <= -DRAG_THRESHOLD_PX) {
    return mapping.dragLeft;
  }
  if (deltaY <= -DRAG_THRESHOLD_PX) {
    return mapping.dragUp;
  }
  if (deltaY >= DRAG_THRESHOLD_PX) {
    return mapping.dragDown;
  }
  return currentDragState ?? null;
}

export function deriveActivityPetState(items: CodexActivityItem[]): ActivityPetState | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === "commandExecution") {
      const action = item.commandActions?.at?.(-1);
      const isRunning = item.status === "inProgress";
      if (action?.type === "read") {
        return isRunning ? "reading" : "read";
      }
      if (action?.type === "listFiles") {
        return isRunning ? "listing" : "listed";
      }
      if (action?.type === "search") {
        return isRunning ? "searching" : "searched";
      }
      return isRunning ? "running-command" : "ran-command";
    }

    if (item?.type === "fileChange") {
      return item.status === "inProgress" ? "editing" : "edited";
    }
    if (item?.type === "mcpToolCall") {
      return item.status === "inProgress" ? "calling-tool" : "called-tool";
    }
    if (item?.type === "webSearch") {
      return item.status === "inProgress" ? "searching-web" : "searched-web";
    }
    if (item?.type === "reasoning") {
      return "thinking";
    }
  }

  return null;
}

export function frameToBackgroundPosition(frame: Frame): string {
  return `${(frame.columnIndex / (ATLAS_COLUMNS - 1)) * 100}% ${(frame.rowIndex / (ATLAS_ROWS - 1)) * 100}%`;
}

export function frames(rowIndex: number, frameCount: number, frameDurationMs: number, lastFrameDurationMs: number): Frame[] {
  return Array.from({ length: frameCount }, (_, columnIndex) => ({
    columnIndex,
    frameDurationMs: columnIndex === frameCount - 1 ? lastFrameDurationMs : frameDurationMs,
    rowIndex,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function isChainObject(value: ChainConfig | readonly string[] | undefined): value is Exclude<ChainConfig, string[]> {
  return value != null && !Array.isArray(value);
}
