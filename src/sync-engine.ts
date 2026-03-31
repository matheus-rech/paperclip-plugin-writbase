import type { WritBaseTask, SyncMapping, UpdateTaskParams } from "./types.js";
import { VersionConflictError } from "./types.js";
import type { WritBaseClient } from "./writbase-client.js";

const MAX_RETRIES = 3;

// ── Echo suppression ──

/**
 * Check if a WritBase webhook is an echo of our own write.
 * The webhook payload includes actor.id which is the agent key ID.
 */
export function isOwnEcho(actorId: string | null, ownKeyId: string): boolean {
  return actorId === ownKeyId;
}

// ── Per-entity cooldown ──

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 3_000;

export function isInCooldown(entityId: string): boolean {
  const expiry = cooldowns.get(entityId);
  if (!expiry) return false;
  if (Date.now() < expiry) return true;
  cooldowns.delete(entityId);
  return false;
}

export function setCooldown(entityId: string): void {
  cooldowns.set(entityId, Date.now() + COOLDOWN_MS);
}

// ── Debounce ──

type DebouncedFn = () => Promise<void>;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 500;

export function debounce(entityId: string, fn: DebouncedFn): void {
  const existing = debounceTimers.get(entityId);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    entityId,
    setTimeout(() => {
      debounceTimers.delete(entityId);
      fn().catch(() => {
        /* deferred to next reconciliation */
      });
    }, DEBOUNCE_MS),
  );
}

// ── Dedup via msgId ──

const seenMessages = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1_000;

export function isDuplicate(msgId: string): boolean {
  const seen = seenMessages.get(msgId);
  if (seen && Date.now() - seen < DEDUP_TTL_MS) return true;
  seenMessages.set(msgId, Date.now());
  // Cleanup old entries
  if (seenMessages.size > 1000) {
    const now = Date.now();
    for (const [key, ts] of seenMessages) {
      if (now - ts > DEDUP_TTL_MS) seenMessages.delete(key);
    }
  }
  return false;
}

// ── Per-entity serial queue ──

const entityQueues = new Map<string, Promise<void>>();

export function enqueueForEntity(
  entityId: string,
  fn: () => Promise<void>,
): Promise<void> {
  const prev = entityQueues.get(entityId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run even if previous failed
  entityQueues.set(entityId, next);
  return next;
}

// ── Version-conflict retry ──

/**
 * Retry a WritBase update with version refresh on conflict.
 * On version_conflict, refetches the current task to get the latest version,
 * then retries the update.
 */
export async function updateWithRetry(
  client: WritBaseClient,
  params: UpdateTaskParams,
  project: string,
): Promise<WritBaseTask> {
  let currentParams = { ...params };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await client.updateTask(currentParams);
    } catch (err) {
      if (err instanceof VersionConflictError && attempt < MAX_RETRIES - 1) {
        // Refetch to get current version
        const { tasks } = await client.getTasks({
          project,
          limit: 1,
        });
        const current = tasks.find((t) => t.id === params.task_id);
        if (!current) throw err; // task deleted
        currentParams = { ...currentParams, version: current.version };
      } else {
        throw err;
      }
    }
  }

  throw new Error("Unreachable");
}

// ── Testing helpers ──

export function _clearState(): void {
  cooldowns.clear();
  debounceTimers.clear();
  seenMessages.clear();
  entityQueues.clear();
}
