// ── WritBase types (mirrored from WritBase source) ──

export type WritBaseStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled"
  | "failed";

export type WritBasePriority = "low" | "medium" | "high" | "critical";

export interface WritBaseTask {
  id: string;
  project_id: string;
  department_id: string | null;
  priority: WritBasePriority;
  description: string;
  notes: string | null;
  due_date: string | null;
  status: WritBaseStatus;
  version: number;
  created_at: string;
  updated_at: string;
  created_by_type: string;
  created_by_id: string;
  updated_by_type: string;
  updated_by_id: string;
  source: string;
  is_archived: boolean;
  session_id: string | null;
  blocked_by?: string[];
  department?: string | null;
}

export interface WritBaseWebhookPayload {
  type: string;
  timestamp: string;
  data: {
    task_id: string;
    project_id: string;
    version: number;
    status: WritBaseStatus;
    changes: Record<string, { old: unknown; new: unknown }>;
    actor: {
      type: string | null;
      id: string | null;
    };
  };
}

// ── Paperclip types (subset used by this plugin) ──

export type PaperclipStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

export type PaperclipPriority = "low" | "medium" | "high" | "critical";

export interface PaperclipIssue {
  id: string;
  companyId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  status: PaperclipStatus;
  priority: PaperclipPriority;
  hiddenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Sync mapping ──

export interface SyncMapping {
  paperclipIssueId: string;
  writbaseTaskId: string;
  writbaseVersion: number;
  lastSyncedAt: string;
  syncDirection: "from_paperclip" | "from_writbase";
}

// ── Plugin config ──

export interface PluginConfig {
  writbaseUrl: string;
  agentKey: string;
  project: string;
  department?: string;
  companyId: string;
  syncDirection: "pull" | "push" | "bidirectional";
}

// ── JSON-RPC wire protocol ──

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

// ── WritBase client params ──

export interface GetTasksParams {
  project: string;
  department?: string;
  status?: WritBaseStatus;
  updated_after?: string;
  limit?: number;
  cursor?: string;
}

export interface AddTaskParams {
  project: string;
  department?: string;
  description: string;
  notes?: string;
  priority?: WritBasePriority;
  status?: WritBaseStatus;
  due_date?: string;
}

export interface UpdateTaskParams {
  task_id: string;
  version: number;
  description?: string;
  notes?: string;
  priority?: WritBasePriority;
  status?: WritBaseStatus;
  due_date?: string;
  is_archived?: boolean;
}

export interface SubscribeParams {
  action: "create" | "list" | "delete";
  project?: string;
  url?: string;
  event_types?: string[];
  subscription_id?: string;
}

// ── WritBase error types ──

export class WritBaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WritBaseError";
  }
}

export class VersionConflictError extends WritBaseError {
  public currentVersion: number;

  constructor(currentVersion: number) {
    super("Version conflict", "version_conflict", { currentVersion });
    this.name = "VersionConflictError";
    this.currentVersion = currentVersion;
  }
}
