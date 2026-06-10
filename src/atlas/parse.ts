// aispritejs/atlas — parse a PixiJS-v8-native atlas into a SpriteGraph the core
// can consume. The atlas supplies the universal `animations` / `frames` blocks;
// the input-driven control (`inputs` / `states` / `transitions`) comes either
// from the atlas itself (the augmented shape in the README) or from a separate
// `control` argument.
//
// A foreign, event-driven `states` block (the FSM shape `{ initial, definitions }`
// emitted by other tools) is detected and ignored — `aispritejs` never adopts
// it. The canonical structure is described by `schemas/aispritejs-graph.schema.json`,
// shipped alongside this module; the checks below mirror it (fail-fast, no
// runtime schema-validator dependency).
//
// Pure and zero-dependency: it imports only the core (same package) and returns
// a plain SpriteGraph. `loadAtlas` additionally builds the animator, surfacing
// semantic errors (InvalidGraphError) eagerly.

import { isObject } from "../sprite/compile.js";
import {
  type FrameTiming,
  type InputDef,
  type SpriteAnimator,
  type SpriteGraph,
  type StateDef,
  type TransitionDef,
  createSpriteAnimator,
} from "../sprite/index.js";

/**
 * Thrown when an atlas is structurally unusable — not an object, missing or
 * malformed `animations`, or carrying no `aispritejs` control block (and none
 * supplied separately). Semantic problems (unknown transition targets, etc.)
 * surface later as {@link InvalidGraphError} from the core.
 *
 * @public
 */
export class InvalidAtlasError extends Error {
  constructor(message: string) {
    super(`aispritejs/atlas: ${message}`);
    this.name = "InvalidAtlasError";
  }
}

/**
 * The `aispritejs` input-driven control block — everything in a {@link SpriteGraph}
 * except the universal `animations` / `frames` that come from the atlas. Supply
 * this as the second argument to drive an atlas whose own `states` block is
 * foreign (event-driven) or absent.
 *
 * @public
 */
export interface SpriteControl {
  readonly inputs: Readonly<Record<string, InputDef>>;
  readonly states: Readonly<Record<string, StateDef>>;
  readonly transitions: readonly TransitionDef[];
  readonly initial?: string;
  readonly defaultFrameDuration?: number;
}

/**
 * True for the foreign, event-driven `states` shape `{ initial, definitions }`.
 * Decisive: an `aispritejs` `states` is a flat map whose values are objects, so
 * a *string* `states.initial` only ever appears in the foreign wrapper.
 */
function isForeignStates(states: unknown): boolean {
  return isObject(states) && typeof states.initial === "string" && isObject(states.definitions);
}

function assertAnimations(value: unknown): Record<string, readonly string[]> {
  if (!isObject(value)) {
    throw new InvalidAtlasError("`animations` must be an object of frame-key lists");
  }
  for (const [name, list] of Object.entries(value)) {
    if (!Array.isArray(list) || list.some((k) => typeof k !== "string")) {
      throw new InvalidAtlasError(`animation "${name}" must be an array of frame-key strings`);
    }
  }
  return value as Record<string, readonly string[]>;
}

/**
 * Parse a (possibly augmented) PixiJS-v8 atlas into a {@link SpriteGraph}.
 *
 * @param atlas - a parsed atlas object: `animations` (required) + optional
 *   `frames`, and — for the augmented shape — `inputs` / `states` / `transitions`.
 * @param control - an explicit {@link SpriteControl} that supplies (or overrides)
 *   the input-driven graph. Required when the atlas has no `aispritejs` control
 *   block or its `states` is foreign (event-driven).
 * @returns a {@link SpriteGraph} ready for `createSpriteAnimator`.
 * @throws {@link InvalidAtlasError} on a structurally unusable atlas.
 *
 * @public
 */
export function parseAtlas(atlas: unknown, control?: SpriteControl): SpriteGraph {
  if (!isObject(atlas)) {
    throw new InvalidAtlasError("atlas must be an object");
  }

  const animations = assertAnimations(atlas.animations);
  const frames = atlas.frames;
  if (frames !== undefined && !isObject(frames)) {
    throw new InvalidAtlasError("`frames`, if present, must be an object keyed by frame key");
  }
  if (isObject(frames)) {
    for (const [key, entry] of Object.entries(frames)) {
      if (!isObject(entry)) {
        const actualType = entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry;
        throw new InvalidAtlasError(`frame entry "${key}" must be an object, got ${actualType}`);
      }
    }
  }

  let resolved: SpriteControl;
  if (control) {
    resolved = control;
  } else {
    if (isForeignStates(atlas.states)) {
      throw new InvalidAtlasError(
        "atlas `states` is event-driven (has `initial`/`definitions`); pass an aispritejs control block as the second argument",
      );
    }
    if (!isObject(atlas.inputs) || !isObject(atlas.states) || !Array.isArray(atlas.transitions)) {
      throw new InvalidAtlasError(
        "atlas has no aispritejs control block (inputs/states/transitions); pass one as the second argument",
      );
    }
    for (const [key, val] of Object.entries(atlas.inputs)) {
      if (!isObject(val)) {
        const actualType = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
        throw new InvalidAtlasError(`input entry "${key}" must be an object, got ${actualType}`);
      }
    }
    for (const [key, val] of Object.entries(atlas.states)) {
      if (!isObject(val)) {
        const actualType = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
        throw new InvalidAtlasError(`state entry "${key}" must be an object, got ${actualType}`);
      }
    }
    const rawTransitions = atlas.transitions as unknown[];
    for (let i = 0; i < rawTransitions.length; i++) {
      const entry = rawTransitions[i];
      if (!isObject(entry)) {
        const actualType = entry === null ? "null" : Array.isArray(entry) ? "array" : typeof entry;
        throw new InvalidAtlasError(`transitions[${i}] must be an object, got ${actualType}`);
      }
      // Validate each `when` item is an object (sibling of F-5).
      // A null/non-object item here would otherwise cause a bare TypeError at
      // compile.ts when it attempts to destructure `c.input`.
      if (Array.isArray(entry.when)) {
        const rawWhen = entry.when as unknown[];
        for (let j = 0; j < rawWhen.length; j++) {
          const cond = rawWhen[j];
          if (!isObject(cond)) {
            const actualType =
              cond === null ? "null" : Array.isArray(cond) ? "array" : typeof cond;
            throw new InvalidAtlasError(
              `transitions[${i}].when[${j}] must be an object, got ${actualType}`,
            );
          }
        }
      }
    }
    resolved = {
      inputs: atlas.inputs as Record<string, InputDef>,
      states: atlas.states as Record<string, StateDef>,
      transitions: rawTransitions as readonly TransitionDef[],
      ...(typeof atlas.initial === "string" ? { initial: atlas.initial } : {}),
      ...(typeof atlas.defaultFrameDuration === "number"
        ? { defaultFrameDuration: atlas.defaultFrameDuration }
        : {}),
    };
  }

  return {
    animations,
    ...(frames ? { frames: frames as Record<string, FrameTiming> } : {}),
    inputs: resolved.inputs,
    states: resolved.states,
    transitions: resolved.transitions,
    ...(resolved.initial !== undefined ? { initial: resolved.initial } : {}),
    ...(resolved.defaultFrameDuration !== undefined
      ? { defaultFrameDuration: resolved.defaultFrameDuration }
      : {}),
  };
}

/**
 * Parse an atlas and build a {@link SpriteAnimator} in one step — the fail-fast
 * "load" entry. Structural problems throw {@link InvalidAtlasError}; semantic
 * problems throw {@link InvalidGraphError} from the core.
 *
 * @public
 */
export function loadAtlas(atlas: unknown, control?: SpriteControl): SpriteAnimator {
  return createSpriteAnimator(parseAtlas(atlas, control));
}
