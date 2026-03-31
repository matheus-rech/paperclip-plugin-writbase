import type {
  PluginConfig,
  SyncMapping,
  WritBaseTask,
  PaperclipIssue,
} from "../types.js";
import type { WritBaseClient } from "../writbase-client.js";
import {
  writBaseTaskToPaperclipData,
  paperclipIssueToWritBaseData,
} from "../field-mapping.js";

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
  list(params: {
    companyId: string;
    limit: number;
    offset: number;
  }): Promise<PaperclipIssue[]>;
  update(
    issueId: string,
    patch: Record<string, unknown>,
    companyId: string,
  ): Promise<PaperclipIssue>;
}

interface JobContext {
  config: PluginConfig;
  client: WritBaseClient;
  state: StateClient;
  issues: IssuesClient;
  logger: { info(msg: string, meta?: unknown): void; warn(msg: string, meta?: unknown): void };
}

const OVERLAP_SECONDS = 60;
const PAGE_SIZE = 50;

function lastRunScope() {
  return { scopeKind: "instance", stateKey: "last-reconciliation" };
}

function taskMappingScope(taskId: string) {
  return { scopeKind: "instance", stateKey: `task-mapping:${taskId}` };
}

function issueMappingScope(issueId: string) {
  return { scopeKind: "issue", scopeId: issueId, stateKey: "sync-mapping" };
}

/**
 * Periodic full-sync reconciliation job.
 * Catches missed webhook events (pg_net is fire-and-forget).
 */
export async function runFullSync(ctx: JobContext): Promise<void> {
  const { config, client, state, issues, logger } = ctx;
  const runStart = new Date().toISOString();

  // Get last run timestamp with overlap window
  const lastRun = await state.get(lastRunScope());
  let updatedAfter: string | undefined;
  if (lastRun) {
    const d = new Date(lastRun);
    d.setSeconds(d.getSeconds() - OVERLAP_SECONDS);
    updatedAfter = d.toISOString();
  }

  // ── WritBase → Paperclip ──
  if (config.syncDirection !== "push") {
    let cursor: string | undefined;
    let totalSynced = 0;

    do {
      const { tasks, next_cursor } = await client.getTasks({
        project: config.project,
        department: config.department,
        updated_after: updatedAfter,
        limit: PAGE_SIZE,
        cursor,
      });

      for (const task of tasks) {
        await reconcileTask(task, ctx);
        totalSynced++;
      }

      cursor = next_cursor;
    } while (cursor);

    if (totalSynced > 0) {
      logger.info("Reconciled WritBase tasks → Paperclip", {
        count: totalSynced,
      });
    }
  }

  // ── Paperclip → WritBase ──
  if (config.syncDirection !== "pull") {
    let offset = 0;
    let totalSynced = 0;

    while (true) {
      const issueList = await issues.list({
        companyId: config.companyId,
        limit: PAGE_SIZE,
        offset,
      });
      if (issueList.length === 0) break;

      for (const issue of issueList) {
        // Only reconcile if updated since last run
        if (updatedAfter && issue.updatedAt < updatedAfter) continue;
        await reconcileIssue(issue, ctx);
        totalSynced++;
      }

      offset += issueList.length;
      if (issueList.length < PAGE_SIZE) break;
    }

    if (totalSynced > 0) {
      logger.info("Reconciled Paperclip issues → WritBase", {
        count: totalSynced,
      });
    }
  }

  // Record run start time as high-water mark
  await state.set(lastRunScope(), runStart);
}

async function reconcileTask(
  task: WritBaseTask,
  ctx: JobContext,
): Promise<void> {
  const { config, state, issues } = ctx;

  const raw = await state.get(taskMappingScope(task.id));
  const mapping: SyncMapping | null = raw ? JSON.parse(raw) : null;

  if (!mapping) {
    // Unmapped task — create Paperclip issue
    const data = writBaseTaskToPaperclipData(task);
    const issue = await issues.create({
      companyId: config.companyId,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
    });

    const newMapping: SyncMapping = {
      paperclipIssueId: issue.id,
      writbaseTaskId: task.id,
      writbaseVersion: task.version,
      lastSyncedAt: new Date().toISOString(),
      syncDirection: "from_writbase",
    };
    const json = JSON.stringify(newMapping);
    await state.set(taskMappingScope(task.id), json);
    await state.set(issueMappingScope(issue.id), json);
  } else if (task.version > mapping.writbaseVersion) {
    // Task has newer version — update Paperclip issue
    const data = writBaseTaskToPaperclipData(task);
    await issues.update(
      mapping.paperclipIssueId,
      {
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
      },
      config.companyId,
    );

    mapping.writbaseVersion = task.version;
    mapping.lastSyncedAt = new Date().toISOString();
    mapping.syncDirection = "from_writbase";
    const json = JSON.stringify(mapping);
    await state.set(taskMappingScope(task.id), json);
    await state.set(issueMappingScope(mapping.paperclipIssueId), json);
  }
}

async function reconcileIssue(
  issue: PaperclipIssue,
  ctx: JobContext,
): Promise<void> {
  const { config, client, state } = ctx;

  const raw = await state.get(issueMappingScope(issue.id));
  const mapping: SyncMapping | null = raw ? JSON.parse(raw) : null;

  if (!mapping) {
    // Unmapped issue — create WritBase task
    const data = paperclipIssueToWritBaseData(issue);
    const task = await client.addTask({
      project: config.project,
      department: config.department,
      ...data,
    });

    const newMapping: SyncMapping = {
      paperclipIssueId: issue.id,
      writbaseTaskId: task.id,
      writbaseVersion: task.version,
      lastSyncedAt: new Date().toISOString(),
      syncDirection: "from_paperclip",
    };
    const json = JSON.stringify(newMapping);
    await state.set(taskMappingScope(task.id), json);
    await state.set(issueMappingScope(issue.id), json);
  }
  // For existing mappings: Paperclip doesn't expose a version number,
  // so we rely on the event-driven sync for updates. Reconciliation
  // only catches unmapped items in the Paperclip→WritBase direction.
}
