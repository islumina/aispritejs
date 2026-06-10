// aispritejs — graph compiler. Validates every cross-reference the type system
// cannot (animation existence, transition targets, operator/kind compatibility,
// positive durations) and normalises the graph into a precomputed runtime form:
// per-state cumulative frame timings and per-state transition candidate lists
// sorted by (priority desc, declared-order asc). All allocation happens here,
// once, so `update()` stays allocation-free.

import { InvalidGraphError } from "./errors.js";
import type { InputStore } from "./inputs.js";
import type { SpriteGraph } from "./types.js";

/** A compiled condition: a closure that reads the live store and returns a boolean. */
export type ConditionFn = (store: InputStore) => boolean;

export interface CompiledTransition {
  readonly from: string;
  readonly to: string;
  readonly priority: number;
  /** Declared index — the deterministic tie-break when priorities are equal. */
  readonly order: number;
  /** AND-ed at runtime; empty means "matches unconditionally". */
  readonly conditions: readonly ConditionFn[];
  /** Trigger input names this transition consumes when taken. */
  readonly triggers: readonly string[];
}

export interface CompiledState {
  readonly name: string;
  readonly animation: string;
  readonly loop: boolean;
  readonly speed: number;
  readonly onEnd: string | undefined;
  readonly frameKeys: readonly string[];
  /** `cumulative[i]` = summed duration of frames `0..i`; last entry === `total`. */
  readonly cumulative: readonly number[];
  readonly total: number;
}

export interface CompiledGraph {
  readonly initial: string;
  readonly states: ReadonlyMap<string, CompiledState>;
  readonly candidatesByState: ReadonlyMap<string, readonly CompiledTransition[]>;
}

const DEFAULT_FRAME_DURATION = 100;

/** @internal */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function compileGraph(graph: SpriteGraph): CompiledGraph {
  const stateEntries = Object.entries(graph.states);
  if (stateEntries.length === 0) {
    throw new InvalidGraphError("states must declare at least one state");
  }

  // Inputs: types are enforced by TS, but a graph loaded from untyped JSON can
  // still carry a bad `type` or a `default` whose typeof mismatches the kind.
  // Validate so a bad input fails here, not silently in the store.
  for (const [name, def] of Object.entries(graph.inputs)) {
    if (def.type !== "number" && def.type !== "boolean" && def.type !== "trigger") {
      throw new InvalidGraphError(
        `input "${name}" has unknown type "${(def as { type: string }).type}"`,
      );
    }
    // Validate `default` typeof matches the declared kind (schema constraint in
    // code). A wrong-typed default would be adopted unvalidated and silently
    // misevaluate conditions (e.g. "5" === 5 is false for Equals).
    const rawDef = def as { type: string; default?: unknown };
    if (rawDef.default !== undefined) {
      if (def.type === "number" && typeof rawDef.default !== "number") {
        throw new InvalidGraphError(
          `input "${name}" default must be a number (declared type "number"), got ${typeof rawDef.default}`,
        );
      }
      if (def.type === "boolean" && typeof rawDef.default !== "boolean") {
        throw new InvalidGraphError(
          `input "${name}" default must be a boolean (declared type "boolean"), got ${typeof rawDef.default}`,
        );
      }
    }
  }

  const defaultDuration = graph.defaultFrameDuration ?? DEFAULT_FRAME_DURATION;
  if (!Number.isFinite(defaultDuration) || defaultDuration <= 0) {
    throw new InvalidGraphError(
      `defaultFrameDuration must be a finite number > 0, got ${defaultDuration}`,
    );
  }

  if (graph.frames) {
    for (const [key, timing] of Object.entries(graph.frames)) {
      if (!isObject(timing as unknown)) {
        throw new InvalidGraphError(`frame "${key}" timing must be an object`);
      }
      if (
        timing.duration !== undefined &&
        (!Number.isFinite(timing.duration) || timing.duration <= 0)
      ) {
        throw new InvalidGraphError(
          `frame "${key}" duration must be a finite number > 0, got ${timing.duration}`,
        );
      }
    }
  }

  const initial = graph.initial ?? stateEntries[0]![0];
  if (!Object.hasOwn(graph.states, initial)) {
    throw new InvalidGraphError(`initial state "${initial}" is not declared`);
  }

  // --- compile states -----------------------------------------------------
  const states = new Map<string, CompiledState>();
  for (const [name, st] of stateEntries) {
    const frameKeys = graph.animations[st.animation];
    if (frameKeys === undefined || !Object.hasOwn(graph.animations, st.animation)) {
      throw new InvalidGraphError(`state "${name}" references unknown animation "${st.animation}"`);
    }
    if (frameKeys.length === 0) {
      throw new InvalidGraphError(`animation "${st.animation}" (state "${name}") has no frames`);
    }
    const speed = st.speed ?? 1;
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new InvalidGraphError(
        `state "${name}" speed must be a finite number > 0, got ${speed}`,
      );
    }
    const loop = st.loop === true;
    if (loop && st.onEnd !== undefined) {
      throw new InvalidGraphError(
        `state "${name}" loops, so onEnd "${st.onEnd}" would never fire; set loop:false or drop onEnd`,
      );
    }
    if (st.onEnd !== undefined && !Object.hasOwn(graph.states, st.onEnd)) {
      throw new InvalidGraphError(`state "${name}" onEnd target "${st.onEnd}" is not declared`);
    }

    const cumulative: number[] = [];
    let running = 0;
    for (const key of frameKeys) {
      running += graph.frames?.[key]?.duration ?? defaultDuration;
      cumulative.push(running);
    }

    states.set(name, {
      name,
      animation: st.animation,
      loop,
      speed,
      onEnd: st.onEnd,
      frameKeys,
      cumulative,
      total: running,
    });
  }

  // --- compile transitions ------------------------------------------------
  const compiled: CompiledTransition[] = [];
  graph.transitions.forEach((t, order) => {
    if (!isObject(t as unknown)) {
      throw new InvalidGraphError(`transition #${order} must be an object`);
    }
    if (t.when !== undefined && !Array.isArray(t.when)) {
      throw new InvalidGraphError(`transition #${order} "when" must be an array`);
    }
    if (t.from !== "*" && !Object.hasOwn(graph.states, t.from)) {
      throw new InvalidGraphError(`transition #${order} from "${t.from}" is not a declared state`);
    }
    if (!Object.hasOwn(graph.states, t.to)) {
      throw new InvalidGraphError(`transition #${order} to "${t.to}" is not a declared state`);
    }

    const conditions: ConditionFn[] = [];
    const triggers: string[] = [];
    for (const c of t.when ?? []) {
      const def = graph.inputs[c.input];
      if (def === undefined || !Object.hasOwn(graph.inputs, c.input)) {
        throw new InvalidGraphError(
          `transition #${order} condition references unknown input "${c.input}"`,
        );
      }
      compileCondition(order, c.input, c.op, c.value, def.type, conditions, triggers);
    }

    compiled.push({
      from: t.from,
      to: t.to,
      priority: t.priority ?? 0,
      order,
      conditions,
      triggers,
    });
  });

  // --- group candidates per state (own + Any-State), sorted ---------------
  const candidatesByState = new Map<string, readonly CompiledTransition[]>();
  for (const [name] of stateEntries) {
    const list = compiled.filter((t) => t.from === name || t.from === "*");
    // Stable by construction (declared order), but make the tie-break explicit.
    list.sort((a, b) => b.priority - a.priority || a.order - b.order);
    candidatesByState.set(name, list);
  }

  return { initial, states, candidatesByState };
}

function compileCondition(
  order: number,
  input: string,
  op: string,
  value: number | boolean | undefined,
  kind: "number" | "boolean" | "trigger",
  out: ConditionFn[],
  triggers: string[],
): void {
  switch (op) {
    case "Trigger": {
      if (kind !== "trigger") {
        throw new InvalidGraphError(
          `transition #${order}: op Trigger requires a trigger input, but "${input}" is ${kind}`,
        );
      }
      if (value !== undefined) {
        throw new InvalidGraphError(
          `transition #${order}: Trigger condition on "${input}" must not carry a value`,
        );
      }
      out.push((s) => s.isPending(input));
      triggers.push(input);
      return;
    }
    case "GreaterThan":
    case "LessThan": {
      if (kind !== "number") {
        throw new InvalidGraphError(
          `transition #${order}: op ${op} requires a number input, but "${input}" is ${kind}`,
        );
      }
      if (typeof value !== "number") {
        throw new InvalidGraphError(
          `transition #${order}: op ${op} on "${input}" needs a numeric value`,
        );
      }
      const v = value;
      out.push(
        op === "GreaterThan" ? (s) => s.readNumber(input) > v : (s) => s.readNumber(input) < v,
      );
      return;
    }
    case "Equals":
    case "NotEquals": {
      if (kind === "trigger") {
        throw new InvalidGraphError(
          `transition #${order}: op ${op} cannot apply to trigger input "${input}"`,
        );
      }
      if (kind === "number") {
        if (typeof value !== "number") {
          throw new InvalidGraphError(
            `transition #${order}: op ${op} on number input "${input}" needs a numeric value`,
          );
        }
        const v = value;
        out.push(
          op === "Equals" ? (s) => s.readNumber(input) === v : (s) => s.readNumber(input) !== v,
        );
        return;
      }
      // kind === "boolean"
      if (typeof value !== "boolean") {
        throw new InvalidGraphError(
          `transition #${order}: op ${op} on boolean input "${input}" needs a boolean value`,
        );
      }
      const v = value;
      out.push(
        op === "Equals" ? (s) => s.readBoolean(input) === v : (s) => s.readBoolean(input) !== v,
      );
      return;
    }
    default:
      throw new InvalidGraphError(`transition #${order}: unknown operator "${op}"`);
  }
}
