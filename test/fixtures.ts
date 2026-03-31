import type {
  WritBaseTask,
  PaperclipIssue,
  SyncMapping,
  WritBaseWebhookPayload,
} from "../src/types.js";

export const TASK_1: WritBaseTask = {
  id: "00000000-0000-0000-0000-000000000001",
  project_id: "00000000-0000-0000-0000-100000000001",
  department_id: null,
  priority: "medium",
  description: "Fix the login bug\nUsers are getting 500 errors on /login",
  notes: "Happens after session timeout",
  due_date: "2026-04-15T00:00:00Z",
  status: "todo",
  version: 3,
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-30T14:00:00Z",
  created_by_type: "agent",
  created_by_id: "key-001",
  updated_by_type: "agent",
  updated_by_id: "key-001",
  source: "mcp",
  is_archived: false,
  session_id: null,
  blocked_by: [],
};

export const TASK_FAILED: WritBaseTask = {
  ...TASK_1,
  id: "00000000-0000-0000-0000-000000000002",
  status: "failed",
  description: "Deploy v2.0 to production",
  notes: null,
  due_date: null,
};

export const ISSUE_1: PaperclipIssue = {
  id: "issue-001",
  companyId: "company-001",
  title: "Fix the login bug",
  description: "Users are getting 500 errors",
  status: "todo",
  priority: "medium",
  createdAt: "2026-03-01T10:00:00Z",
  updatedAt: "2026-03-30T14:00:00Z",
};

export const ISSUE_BACKLOG: PaperclipIssue = {
  ...ISSUE_1,
  id: "issue-002",
  status: "backlog",
  title: "Investigate memory leak",
};

export const ISSUE_IN_REVIEW: PaperclipIssue = {
  ...ISSUE_1,
  id: "issue-003",
  status: "in_review",
  title: "Add rate limiting",
};

export const MAPPING_1: SyncMapping = {
  paperclipIssueId: "issue-001",
  writbaseTaskId: "00000000-0000-0000-0000-000000000001",
  writbaseVersion: 3,
  lastSyncedAt: "2026-03-30T14:00:00Z",
  syncDirection: "from_paperclip",
};

export const WEBHOOK_PAYLOAD_CREATED: WritBaseWebhookPayload = {
  type: "task.created",
  timestamp: "2026-03-31T10:00:00Z",
  data: {
    task_id: "00000000-0000-0000-0000-000000000003",
    project_id: "00000000-0000-0000-0000-100000000001",
    version: 1,
    status: "todo",
    changes: {},
    actor: { type: "agent", id: "external-key-id" },
  },
};

export const WEBHOOK_PAYLOAD_UPDATED: WritBaseWebhookPayload = {
  type: "task.updated",
  timestamp: "2026-03-31T10:05:00Z",
  data: {
    task_id: "00000000-0000-0000-0000-000000000001",
    project_id: "00000000-0000-0000-0000-100000000001",
    version: 4,
    status: "in_progress",
    changes: {
      status: { old: "todo", new: "in_progress" },
      priority: { old: "medium", new: "high" },
    },
    actor: { type: "agent", id: "external-key-id" },
  },
};

export const OWN_KEY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
export const WEBHOOK_SECRET = "test-webhook-secret-for-hmac-signing";
