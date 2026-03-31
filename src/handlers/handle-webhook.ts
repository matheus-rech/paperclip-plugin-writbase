import type {
  PluginConfig,
  SyncMapping,
  WritBaseWebhookPayload,
  PaperclipIssue,
} from "../types.js";
import { verifyWebhookSignature, type WebhookHeaders } from "../hmac.js";
import { writBaseTaskToPaperclipData } from "../field-mapping.js";
import {
  isOwnEcho,
  isDuplicate,
  isInCooldown,
  setCooldown,
} from "../sync-engine.js";

interface StateClient {
  get(scope: Record<string, string>): Promise<string | null>;
  set(scope: Record<string, string>, value: string): Promise<void>;
}

interface IssuesClient {
  create(input: {
    companyId: string;
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
  }): Promise<PaperclipIssue>;
  update(
    issueId: string,
    patch: Record<string, unknown>,
    companyId: string,
  ): Promise<PaperclipIssue>;
}

interface WebhookContext {
  config: PluginConfig;
  state: StateClient;
  issues: IssuesClient;
  ownKeyId: string;
  webhookSecret: string;
  logger: { info(msg: string, meta?: unknown): void; warn(msg: string, meta?: unknown): void };
}

function mappingByTaskScope(taskId: string) {
  return { scopeKind: "instance", stateKey: `task-mapping:${taskId}` };
}

function mappingByIssueScope(issueId: string) {
  return { scopeKind: "issue", scopeId: issueId, stateKey: "sync-mapping" };
}

async function getMappingByTask(
  state: StateClient,
  taskId: string,
): Promise<SyncMapping | null> {
  const raw = await state.get(mappingByTaskScope(taskId));
  return raw ? (JSON.parse(raw) as SyncMapping) : null;
}

async function setMappingBoth(
  state: StateClient,
  mapping: SyncMapping,
): Promise<void> {
  const json = JSON.stringify(mapping);
  await state.set(mappingByTaskScope(mapping.writbaseTaskId), json);
  await state.set(mappingByIssueScope(mapping.paperclipIssueId), json);
}

/**
 * Handle an incoming WritBase webhook.
 * Returns true if processed, false if rejected.
 */
export async function handleWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  ctx: WebhookContext,
): Promise<boolean> {
  const { config, state, issues, ownKeyId, webhookSecret, logger } = ctx;

  // 1. Verify HMAC signature
  const valid = await verifyWebhookSignature(rawBody, headers, webhookSecret);
  if (!valid) {
    logger.warn("Webhook signature verification failed");
    return false;
  }

  // 2. Parse payload
  const payload = JSON.parse(rawBody) as WritBaseWebhookPayload;

  // 3. Check sync direction
  if (config.syncDirection === "push") return true;

  // 4. Dedup via msgId
  const msgId = headers["webhook-id"];
  if (isDuplicate(msgId)) return true;

  // 5. Echo suppression
  if (isOwnEcho(payload.data.actor.id, ownKeyId)) return true;

  const taskId = payload.data.task_id;

  // 6. Cooldown check
  if (isInCooldown(taskId)) return true;

  // 7. Process by event type
  const mapping = await getMappingByTask(state, taskId);

  if (!mapping) {
    // New task — create Paperclip issue
    if (
      payload.type === "task.created" ||
      payload.type === "task.updated"
    ) {
      const issueData = writBaseTaskToPaperclipData({
        id: taskId,
        description: getFieldValue(payload, "description", "New task"),
        notes: getFieldValue(payload, "notes", null),
        status: payload.data.status,
        priority: getFieldValue(payload, "priority", "medium"),
        due_date: getFieldValue(payload, "due_date", null),
        is_archived: false,
      } as any);

      const issue = await issues.create({
        companyId: config.companyId,
        title: issueData.title,
        description: issueData.description,
        status: issueData.status,
        priority: issueData.priority,
      });

      const newMapping: SyncMapping = {
        paperclipIssueId: issue.id,
        writbaseTaskId: taskId,
        writbaseVersion: payload.data.version,
        lastSyncedAt: new Date().toISOString(),
        syncDirection: "from_writbase",
      };
      await setMappingBoth(state, newMapping);
      setCooldown(issue.id);

      logger.info("Created Paperclip issue from WritBase task", {
        taskId,
        issueId: issue.id,
      });
    }
  } else {
    // Existing mapping — update Paperclip issue
    if (payload.data.version <= mapping.writbaseVersion) {
      // Stale or duplicate
      return true;
    }

    const patch: Record<string, unknown> = {};
    const changes = payload.data.changes;

    if (changes.status) {
      const { writBaseStatusToPaperclip } = await import(
        "../field-mapping.js"
      );
      patch.status = writBaseStatusToPaperclip(
        changes.status.new as any,
      );
    }
    if (changes.priority) {
      patch.priority = changes.priority.new;
    }
    if (changes.description) {
      const { extractTitle } = await import("../field-mapping.js");
      patch.title = extractTitle(changes.description.new as string);
    }

    if (Object.keys(patch).length > 0) {
      await issues.update(
        mapping.paperclipIssueId,
        patch,
        config.companyId,
      );
    }

    mapping.writbaseVersion = payload.data.version;
    mapping.lastSyncedAt = new Date().toISOString();
    mapping.syncDirection = "from_writbase";
    await setMappingBoth(state, mapping);
    setCooldown(mapping.paperclipIssueId);

    logger.info("Updated Paperclip issue from WritBase webhook", {
      taskId,
      issueId: mapping.paperclipIssueId,
      event: payload.type,
    });
  }

  return true;
}

function getFieldValue(
  payload: WritBaseWebhookPayload,
  field: string,
  defaultValue: any,
): any {
  const change = payload.data.changes[field];
  return change ? change.new : defaultValue;
}
