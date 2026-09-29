// aispritejs — the input store. Holds Number / Boolean values and Trigger
// pending flags with O(1) lookup. All declared inputs are seeded at
// construction so reads are total (the compiler guarantees every condition
// references a declared input of the matching kind, so the non-null reads
// below are sound).

import { InputTypeError, UnknownInputError } from "./errors.js";
import type { InputDef } from "./types.js";

export interface InputStore {
  /** Set a Number/Boolean input. Throws on unknown name or kind mismatch. */
  setInput(name: string, value: number | boolean): void;
  /** Mark a Trigger pending. Throws on unknown name or non-Trigger. */
  fireTrigger(name: string): void;
  /** Read a Number input (caller guarantees `name` is a declared Number). */
  readNumber(name: string): number;
  /** Read a Boolean input (caller guarantees `name` is a declared Boolean). */
  readBoolean(name: string): boolean;
  /** Whether a Trigger is currently pending. */
  isPending(name: string): boolean;
  /** Consume (reset) a pending Trigger after a transition takes it. */
  consume(name: string): void;
  /** Restore every input to its declared default and clear all triggers. */
  reset(): void;
}

type Kind = "number" | "boolean" | "trigger";

export function createInputStore(inputs: Readonly<Record<string, InputDef>>): InputStore {
  const kinds = new Map<string, Kind>();
  const numberDefaults = new Map<string, number>();
  const booleanDefaults = new Map<string, boolean>();
  const numbers = new Map<string, number>();
  const booleans = new Map<string, boolean>();
  const triggers = new Map<string, boolean>();

  for (const [name, def] of Object.entries(inputs)) {
    kinds.set(name, def.type);
    if (def.type === "number") {
      const d = def.default ?? 0;
      numberDefaults.set(name, d);
      numbers.set(name, d);
    } else if (def.type === "boolean") {
      const d = def.default ?? false;
      booleanDefaults.set(name, d);
      booleans.set(name, d);
    } else {
      triggers.set(name, false);
    }
  }

  function setInput(name: string, value: number | boolean): void {
    const kind = kinds.get(name);
    if (kind === undefined) throw new UnknownInputError(name);
    if (kind === "trigger") {
      throw new InputTypeError(name, "is a Trigger; use fireTrigger()");
    }
    if (kind === "number") {
      if (typeof value !== "number") {
        throw new InputTypeError(name, `expects a number, received ${typeof value}`);
      }
      if (Number.isNaN(value)) {
        throw new InputTypeError(name, "cannot be set to NaN");
      }
      numbers.set(name, value);
      return;
    }
    // kind === "boolean"
    if (typeof value !== "boolean") {
      throw new InputTypeError(name, `expects a boolean, received ${typeof value}`);
    }
    booleans.set(name, value);
  }

  function fireTrigger(name: string): void {
    const kind = kinds.get(name);
    if (kind === undefined) throw new UnknownInputError(name);
    if (kind !== "trigger") {
      throw new InputTypeError(name, "is not a Trigger; use setInput()");
    }
    triggers.set(name, true);
  }

  // `!` is sound: every declared input is seeded at construction and the
  // compiler validates that conditions only read declared inputs of the
  // matching kind, so these reads always hit a present entry.
  return {
    setInput,
    fireTrigger,
    readNumber: (name) => numbers.get(name)!,
    readBoolean: (name) => booleans.get(name)!,
    isPending: (name) => triggers.get(name) === true,
    consume: (name) => {
      triggers.set(name, false);
    },
    reset: () => {
      for (const [name, d] of numberDefaults) numbers.set(name, d);
      for (const [name, d] of booleanDefaults) booleans.set(name, d);
      for (const name of triggers.keys()) triggers.set(name, false);
    },
  };
}
