import type {
  WritBaseStatus,
  WritBasePriority,
  WritBaseTask,
  PaperclipStatus,
  PaperclipPriority,
  PaperclipIssue,
} from "./types.js";

// ── Status mapping ──

const STATUS_WB_TO_PC: Record<WritBaseStatus, PaperclipStatus> = {
  todo: "todo",
  in_progress: "in_progress",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled",
  failed: "cancelled", // lossy: no Paperclip "failed" state
};

const STATUS_PC_TO_WB: Record<PaperclipStatus, WritBaseStatus> = {
  backlog: "todo", // lossy: Paperclip pre-todo collapses to todo
  todo: "todo",
  in_progress: "in_progress",
  in_review: "in_progress", // lossy: no WritBase review stage
  done: "done",
  blocked: "blocked",
  cancelled: "cancelled",
};

export function writBaseStatusToPaperclip(
  status: WritBaseStatus,
): PaperclipStatus {
  return STATUS_WB_TO_PC[status];
}

export function paperclipStatusToWritBase(
  status: PaperclipStatus,
): WritBaseStatus {
  return STATUS_PC_TO_WB[status];
}

// ── Priority mapping (1:1 passthrough) ──

export function writBasePriorityToPaperclip(
  priority: WritBasePriority,
): PaperclipPriority {
  return priority;
}

export function paperclipPriorityToWritBase(
  priority: PaperclipPriority,
): WritBasePriority {
  return priority;
}

// ── Field mapping: WritBase task → Paperclip issue data ──

const MAX_TITLE_LENGTH = 200;

/**
 * Extract title from WritBase description.
 * Uses the first line, truncated to MAX_TITLE_LENGTH chars.
 */
export function extractTitle(description: string): string {
  const firstLine = description.split("\n")[0]?.trim() ?? description.trim();
  if (firstLine.length <= MAX_TITLE_LENGTH) return firstLine;
  return firstLine.slice(0, MAX_TITLE_LENGTH - 1) + "…";
}

/**
 * Build Paperclip description body from WritBase fields.
 * Includes any remaining lines from description, notes, and due_date metadata.
 */
export function buildPaperclipDescription(task: WritBaseTask): string | null {
  const parts: string[] = [];

  // Remaining lines after the first (title) line
  const lines = task.description.split("\n");
  if (lines.length > 1) {
    parts.push(lines.slice(1).join("\n").trim());
  }

  if (task.notes) {
    parts.push(task.notes);
  }

  if (task.due_date) {
    parts.push(`<!-- writbase:due_date=${task.due_date} -->`);
  }

  if (task.status === "failed") {
    parts.push(`<!-- writbase:original_status=failed -->`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Convert a WritBase task to Paperclip issue creation/update data.
 */
export function writBaseTaskToPaperclipData(task: WritBaseTask) {
  return {
    title: extractTitle(task.description),
    description: buildPaperclipDescription(task),
    status: writBaseStatusToPaperclip(task.status),
    priority: writBasePriorityToPaperclip(task.priority),
  };
}

// ── Field mapping: Paperclip issue → WritBase task data ──

/**
 * Extract due_date from Paperclip description metadata comment.
 */
export function extractDueDate(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(
    /<!-- writbase:due_date=(\S+) -->/,
  );
  return match?.[1] ?? null;
}

/**
 * Extract original status from Paperclip description metadata comment.
 */
export function extractOriginalStatus(
  description: string | null,
): WritBaseStatus | null {
  if (!description) return null;
  const match = description.match(
    /<!-- writbase:original_status=(\w+) -->/,
  );
  return (match?.[1] as WritBaseStatus) ?? null;
}

/**
 * Strip metadata comments from Paperclip description.
 */
function stripMetadata(description: string): string {
  return description
    .replace(/<!-- writbase:\w+=\S+ -->/g, "")
    .trim();
}

/**
 * Convert a Paperclip issue to WritBase task creation/update data.
 */
export function paperclipIssueToWritBaseData(issue: PaperclipIssue) {
  const cleanDescription = issue.description
    ? stripMetadata(issue.description)
    : null;

  return {
    description: issue.title,
    notes: cleanDescription || undefined,
    status: paperclipStatusToWritBase(issue.status),
    priority: paperclipPriorityToWritBase(issue.priority),
    due_date: extractDueDate(issue.description ?? null) || undefined,
  };
}
