import type {
  PluginConfig,
  SyncMapping,
  PaperclipIssue,
  WritBaseTask,
} from "../types.js";
import type { WritBaseClient } from "../writbase-client.js";
import { paperclipIssueToWritBaseData } from "../field-mapping.js";
import {
  isInCooldown,
  setCooldown,
  debounce,
  enqueueForEntity,
  updateWithRetry,
} from "../sync-engine.js";

interface StateClient {
  get(scope: Record<string, string>): Promise<string | null>;
  set(scope: Record<string, string>, value: string): Promise<void>;
}

interface EventContext {
  config: PluginConfig;
  client: WritBaseClient;
  state: StateClient;
  logger: { info(msg: string, meta?: unknown): void; warn(msg: string, meta?: unknown): void };
}

function mappingScope(issueId: string) {
  return { scopeKind: "issue", scopeId: issueId, stateKey: "sync-mapping" };
}

async function getMapping(
  state: StateClient,
  issueId: string,
): Promise<SyncMapping | null> {
  const raw = await state.get(mappingScope(issueId));
  return raw ? (JSON.parse(raw) as SyncMapping) : null;
}

async function setMapping(
  state: StateClient,
  mapping: SyncMapping,
): Promise<void> {
  await state.set(
    mappingScope(mapping.paperclipIssueId),
    JSON.stringify(mapping),
  );
}

/**
 * Handle Paperclip issue.created event → create WritBase task.
 */
export async function handleIssueCreated(
  issue: PaperclipIssue,
  ctx: EventContext,
): Promise<void> {
  const { config, client, state, logger } = ctx;

  if (config.syncDirection === "pull") return;
  if (isInCooldown(issue.id)) return;

  // Check if already mapped (dedup)
  const existing = await getMapping(state, issue.id);
  if (existing) return;

  const taskData = paperclipIssueToWritBaseData(issue);
  const task = await client.addTask({
    project: config.project,
    department: config.department,
    ...taskData,
  });

  const mapping: SyncMapping = {
    paperclipIssueId: issue.id,
    writbaseTaskId: task.id,
    writbaseVersion: task.version,
    lastSyncedAt: new Date().toISOString(),
    syncDirection: "from_paperclip",
  };
  await setMapping(state, mapping);
  setCooldown(task.id);

  logger.info("Created WritBase task from Paperclip issue", {
    issueId: issue.id,
    taskId: task.id,
  });
}

/**
 * Handle Paperclip issue.updated event → update WritBase task.
 * Debounces rapid events and uses per-entity serial queue.
 */
export async function handleIssueUpdated(
  issue: PaperclipIssue,
  ctx: EventContext,
): Promise<void> {
  const { config, client, state, logger } = ctx;

  if (config.syncDirection === "pull") return;
  if (isInCooldown(issue.id)) return;

  debounce(issue.id, () =>
    enqueueForEntity(issue.id, async () => {
      const mapping = await getMapping(state, issue.id);
      if (!mapping) {
        // Unmapped issue — create task
        await handleIssueCreated(issue, ctx);
        return;
      }

      // Check if this is an echo of our own write
      if (mapping.syncDirection === "from_writbase") {
        // Reset direction so future changes sync
        mapping.syncDirection = "from_paperclip";
        await setMapping(state, mapping);
        return;
      }

      const taskData = paperclipIssueToWritBaseData(issue);
      const updated = await updateWithRetry(
        client,
        {
          task_id: mapping.writbaseTaskId,
          version: mapping.writbaseVersion,
          ...taskData,
        },
        config.project,
      );

      mapping.writbaseVersion = updated.version;
      mapping.lastSyncedAt = new Date().toISOString();
      mapping.syncDirection = "from_paperclip";
      await setMapping(state, mapping);
      setCooldown(updated.id);

      logger.info("Updated WritBase task from Paperclip issue", {
        issueId: issue.id,
        taskId: updated.id,
      });
    }),
  );
}
