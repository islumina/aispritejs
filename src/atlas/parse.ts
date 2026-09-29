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

/** `typeof`, but naming `null` and arrays, for "got <type>" messages. */
function typeName(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

function assertEntry(v: unknown, what: string): void {
  if (!isObject(v)) throw new InvalidAtlasError(`${what} must be an object, got ${typeName(v)}`);
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
 * Structural checks shared by the atlas's own control block (`p` = `""`) and an
 * explicit `control` argument (`p` = `"control."`): object `inputs` / `states`,
 * array `transitions`, and object entries / `when` items, so a malformed block
 * is an {@link InvalidAtlasError} on either path. Semantic checks stay with the
 * compiler ({@link InvalidGraphError}).
 */
function assertControlShape(src: Record<string, unknown>, p: string): void {
  if (!isObject(src.inputs)) throw new InvalidAtlasError(`${p}inputs must be an object`);
  if (!isObject(src.states)) throw new InvalidAtlasError(`${p}states must be an object`);
  if (!Array.isArray(src.transitions)) {
    throw new InvalidAtlasError(`${p}transitions must be an array`);
  }
  for (const [key, val] of Object.entries(src.inputs)) assertEntry(val, `${p}input entry "${key}"`);
  for (const [key, val] of Object.entries(src.states)) assertEntry(val, `${p}state entry "${key}"`);
  src.transitions.forEach((entry: unknown, i) => {
    assertEntry(entry, `${p}transitions[${i}]`);
    // A null/non-object `when` item would otherwise reach the compiler as a
    // malformed condition (sibling of F-5).
    const when = (entry as { when?: unknown }).when;
    if (Array.isArray(when)) {
      when.forEach((cond: unknown, j) => assertEntry(cond, `${p}transitions[${i}].when[${j}]`));
    }
  });
}

/**
 * Parse a (possibly augmented) PixiJS-v8 atlas into a {@link SpriteGraph}.
 *
 * @param atlas - a parsed atlas object: `animations` (required) + optional
 *   `frames`, and — for the augmented shape — `inputs` / `states` / `transitions`.
 * @param control - an explicit {@link SpriteControl} that supplies (or overrides)
 *   the input-driven graph. Required when the atlas has no `aispritejs` control
 *   block or its `states` is foreign (event-driven). When supplied (not
 *   `undefined` / `null`) it gets the same structural checks as an embedded
 *   block, and a wrong-typed `initial` / `defaultFrameDuration` is rejected
 *   rather than dropped.
 * @returns a {@link SpriteGraph} ready for `createSpriteAnimator`.
 * @throws {@link InvalidAtlasError} on a structurally unusable atlas or control.
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
    for (const [key, entry] of Object.entries(frames)) assertEntry(entry, `frame entry "${key}"`);
  }

  let resolved: SpriteControl;
  if (control != null) {
    // Same structural checks as the embedded block, plus typed optional
    // fields: an explicit control is never silently trimmed.
    if (!isObject(control)) throw new InvalidAtlasError("control must be an object");
    assertControlShape(control, "control.");
    if (control.initial !== undefined && typeof control.initial !== "string") {
      throw new InvalidAtlasError("control.initial must be a string");
    }
    if (
      control.defaultFrameDuration !== undefined &&
      typeof control.defaultFrameDuration !== "number"
    ) {
      throw new InvalidAtlasError("control.defaultFrameDuration must be a number");
    }
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
    assertControlShape(atlas, "");
    // Wrong-typed optional fields in the atlas itself are dropped (lenient).
    resolved = {
      inputs: atlas.inputs as Record<string, InputDef>,
      states: atlas.states as Record<string, StateDef>,
      transitions: atlas.transitions as readonly TransitionDef[],
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
