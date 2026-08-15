/**
 * The io barrel — serialization, validation, and the File System
 * Access layer with its fallback.
 *
 * Note: `./drafts.ts` (IndexedDB draft snapshots) is deliberately NOT
 * part of this barrel and does not import the serializer — a draft is not a
 * file.
 */

export { serializeModel, type SerializeOptions } from "./serialize";
export { deserializeModel } from "./deserialize";
export {
  FileValidationError,
  SUPPORTED_MAJOR_VERSION,
  validateArchLabFile,
  type ValidationIssue,
} from "./validate";
export {
  deriveFileName,
  downloadTextFile,
  getCurrentFileHandle,
  getLastSavedText,
  pickFileViaInput,
  pickOpenHandle,
  pickSaveHandle,
  setCurrentFileHandle,
  setLastSavedText,
  supportsOpenPicker,
  supportsSavePicker,
  writeTextToHandle,
  type FilePickerAcceptType,
} from "./file-access";
