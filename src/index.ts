// Re-exports for consumers
export { manifest } from "./manifest.js";
export type {
  WritBaseTask,
  WritBaseStatus,
  WritBasePriority,
  PaperclipIssue,
  PaperclipStatus,
  PaperclipPriority,
  PluginConfig,
  SyncMapping,
} from "./types.js";
export {
  writBaseStatusToPaperclip,
  paperclipStatusToWritBase,
  writBaseTaskToPaperclipData,
  paperclipIssueToWritBaseData,
} from "./field-mapping.js";
