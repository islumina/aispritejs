export {
  InputTypeError,
  InvalidGraphError,
  SpriteAnimatorDisposedError,
  UnknownInputError,
} from "./errors.js";
export { createSpriteAnimator } from "./machine.js";

export type {
  BooleanInputDef,
  CompleteHandler,
  ConditionOp,
  FrameTiming,
  InputDef,
  ListenerOptions,
  NumberInputDef,
  SpriteAnimator,
  SpriteGraph,
  StateChangeHandler,
  StateDef,
  TransitionCondition,
  TransitionDef,
  TriggerInputDef,
  Unsubscribe,
} from "./types.js";
