import type { PluginConfig } from "../types.js";
import { WritBaseClient } from "../writbase-client.js";

const AGENT_KEY_RE = /^wb_[0-9a-f-]{36}_[0-9a-f]{64}$/;

interface StateClient {
  get(scope: Record<string, string>): Promise<string | null>;
  set(scope: Record<string, string>, value: string): Promise<void>;
}

interface InitContext {
  config: PluginConfig;
  state: StateClient;
  logger: { info(msg: string, meta?: unknown): void; warn(msg: string, meta?: unknown): void };
}

interface InitResult {
  client: WritBaseClient;
  ownKeyId: string;
  webhookSecret: string | null;
}

function extractKeyId(agentKey: string): string {
  // wb_<uuid>_<secret> → extract the uuid
  const parts = agentKey.split("_");
  // parts: ["wb", "<uuid-part1>", ..., "<secret>"]
  // UUID is 36 chars with dashes: 8-4-4-4-12
  // The key format is wb_<36-char-uuid>_<64-hex-secret>
  return agentKey.slice(3, 39);
}

export async function initialize(ctx: InitContext): Promise<InitResult> {
  const { config, state, logger } = ctx;

  // 1. Validate agent key format
  if (!AGENT_KEY_RE.test(config.agentKey)) {
    throw new Error(
      "Invalid agent key format. Expected: wb_<uuid>_<64-hex-secret>",
    );
  }

  const ownKeyId = extractKeyId(config.agentKey);
  const client = new WritBaseClient(config.writbaseUrl, config.agentKey);

  // 2. Verify connectivity and manager role
  const info = await client.getInfo();
  logger.info("Connected to WritBase", { info });

  const role = (info as { role?: string }).role;
  if (role !== "manager") {
    throw new Error(
      `Agent key has role "${role}" but "manager" is required for webhook subscriptions`,
    );
  }

  // 3. Department validation
  if (config.department) {
    // Probe to verify department exists
    await client.getTasks({
      project: config.project,
      department: config.department,
      limit: 1,
    });
    logger.info("Department validated", { department: config.department });
  }

  // 4. Webhook subscription (if pull or bidirectional)
  let webhookSecret: string | null = null;

  if (config.syncDirection !== "push") {
    const stateScope = { scopeKind: "instance", stateKey: "webhook-secret" };
    const subIdScope = {
      scopeKind: "instance",
      stateKey: "webhook-subscription-id",
    };

    // Check for stored secret
    const storedSecret = await state.get(stateScope);
    const storedSubId = await state.get(subIdScope);

    if (storedSecret && storedSubId) {
      // Verify subscription still exists
      const result = (await client.subscribe({ action: "list" })) as {
        subscriptions?: Array<{ id: string }>;
      };
      const exists = result.subscriptions?.some(
        (s) => s.id === storedSubId,
      );

      if (exists) {
        logger.info("Reusing existing webhook subscription", {
          id: storedSubId,
        });
        webhookSecret = storedSecret;
      } else {
        logger.warn("Stored subscription not found, recreating");
      }
    }

    if (!webhookSecret) {
      // Delete any stale subscriptions
      if (storedSubId) {
        try {
          await client.subscribe({
            action: "delete",
            subscription_id: storedSubId,
          });
        } catch {
          // May already be deleted
        }
      }

      // Create new subscription
      // Note: the webhook URL is injected by Paperclip's plugin host
      // For now we store a placeholder — the actual URL comes from the host
      const sub = (await client.subscribe({
        action: "create",
        project: config.project,
        url: "https://placeholder.paperclip.internal/webhook/writbase-task-event",
        event_types: [
          "task.created",
          "task.updated",
          "task.completed",
          "task.failed",
        ],
      })) as { subscription?: { id: string; secret: string } };

      if (sub.subscription) {
        webhookSecret = sub.subscription.secret;
        await state.set(stateScope, webhookSecret);
        await state.set(subIdScope, sub.subscription.id);
        logger.info("Created webhook subscription", {
          id: sub.subscription.id,
        });
      }
    }
  }

  return { client, ownKeyId, webhookSecret };
}
