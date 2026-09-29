// aispritejs — named error classes. Named errors instead of bare throws let
// callers branch on failure mode (e.g. distinguish a typo'd input from a
// post-dispose call) and keep stack traces meaningful.

/**
 * Thrown by `setInput` / `fireTrigger` / `update` / `reset` after the animator
 * has been disposed.
 *
 * @public
 */
export class SpriteAnimatorDisposedError extends Error {
  constructor() {
    super("aispritejs: animator has been disposed; this operation is not allowed");
    this.name = "SpriteAnimatorDisposedError";
  }
}

/**
 * Thrown by `createSpriteAnimator` when the graph fails validation — the graph
 * or one of its blocks has the wrong shape, a state/transition/condition
 * identifier is not a string, a state references a missing animation, a
 * transition points at an unknown state or has a non-integer priority, a
 * condition uses an operator the input kind does not support, a duration is
 * non-positive, and so on. Fail-fast: an invalid graph never produces a
 * half-built animator.
 *
 * @public
 */
export class InvalidGraphError extends Error {
  constructor(message: string) {
    super(`aispritejs: invalid graph — ${message}`);
    this.name = "InvalidGraphError";
  }
}

/**
 * Thrown by `setInput` / `fireTrigger` when the named input is not declared in
 * the graph's `inputs` block.
 *
 * @public
 */
export class UnknownInputError extends Error {
  readonly input: string;
  constructor(input: string) {
    super(`aispritejs: unknown input "${input}"; declare it in the graph's inputs block`);
    this.name = "UnknownInputError";
    this.input = input;
  }
}

/**
 * Thrown when an input is used against its kind — `setInput` with the wrong
 * value type, `setInput` on a Trigger, or `fireTrigger` on a non-Trigger.
 *
 * @public
 */
export class InputTypeError extends Error {
  readonly input: string;
  constructor(input: string, message: string) {
    super(`aispritejs: input "${input}" — ${message}`);
    this.name = "InputTypeError";
    this.input = input;
  }
}
