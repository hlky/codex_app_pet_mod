import assert from "node:assert/strict";
import {
  buildPlaybackPlan,
  deriveActivityPetState,
  mapPointerEvent,
  normalizeAnimationConfig,
  resolveStateFrames,
} from "../src/advanced-pet-system";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("normalizes animation aliases and default events", () => {
  const config = normalizeAnimationConfig({
    sequences: {
      events: {
        hover: "waving",
      },
      states: {
        idle: { row: 8 },
      },
    },
  });

  assert.equal(config.events.hover, "waving");
  assert.equal(config.events.dragLeft, "running-left");
  assert.equal(config.states.idle.row, 8);
});

test("resolves explicit state frames before detected counts", () => {
  const stateFrames = resolveStateFrames(
    "idle",
    {
      states: {
        idle: {
          durationMs: 50,
          frameCount: 3,
          lastFrameDurationMs: 90,
          row: 4,
        },
      },
    },
    [8, 8, 8, 8, 7],
  );

  assert.equal(stateFrames.length, 3);
  assert.equal(stateFrames[0]?.rowIndex, 4);
  assert.equal(stateFrames[0]?.frameDurationMs, 50);
  assert.equal(stateFrames[2]?.frameDurationMs, 90);
});

test("builds idle fallback playback for active chains", () => {
  const plan = buildPlaybackPlan({
    animationConfig: {
      chains: {
        idle: ["idle", "waving"],
        review: ["review", "waving"],
      },
      states: {
        idle: { frameCount: 2, slowdown: 1 },
        review: { frameCount: 1 },
        waving: { frameCount: 1 },
      },
    },
    detectedFrameCounts: null,
    prefersReducedMotion: false,
    state: "review",
  });

  assert.equal(plan.loopStartIndex, 2);
  assert.equal(plan.frames.length, 5);
});

test("maps pointer events through manifest-configured directions", () => {
  assert.equal(
    mapPointerEvent({
      currentDragState: null,
      deltaX: 0,
      deltaY: -8,
      events: { dragUp: "review" },
    }),
    "review",
  );
});

test("derives advanced activity states from Codex items", () => {
  assert.equal(
    deriveActivityPetState([
      {
        status: "inProgress",
        type: "fileChange",
      },
    ]),
    "editing",
  );

  assert.equal(
    deriveActivityPetState([
      {
        commandActions: [{ type: "search" }],
        status: "completed",
        type: "commandExecution",
      },
    ]),
    "searched",
  );
});
