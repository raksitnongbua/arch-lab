/**
 * The model checker behind `/validate` — public API.
 *
 * `checkSource` is the whole feature: pure, synchronous, and built entirely
 * on the app's real readers, so "valid here" means "opens everywhere".
 * `Validator` is the page's UI around it.
 */

export { Validator } from "./components/validator";
export {
  CHECK_CHOICES,
  CHECK_FORMAT_LABEL,
  MERMAID_CAVEAT,
  checkSource,
} from "./lib/check";
export type {
  CheckChoice,
  CheckFailed,
  CheckFormat,
  CheckIdle,
  CheckIssue,
  CheckOk,
  CheckResult,
  CheckSummary,
  DiagramSummary,
} from "./lib/check";
export { SAMPLES } from "./content/samples";
export type { ValidateSample } from "./content/samples";
