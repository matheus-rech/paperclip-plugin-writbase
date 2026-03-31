import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginConfig, PaperclipIssue } from "./types.js";
import { WritBaseClient } from "./writbase-client.js";
import { initialize } from "./handlers/initialize.js";
import { handleIssueCreated, handleIssueUpdated } from "./handlers/on-event.js";
import { handleWebhook } from "./handlers/handle-webhook.js";
import { runFullSync } from "./handlers/run-job.js";
import type { WebhookHeaders } from "./hmac.js";

const plugin = definePlugin({
  async setup(ctx: any) {
    // Resolve configuration
    const configRaw = await ctx.config.get();
    const agentKey = await ctx.secrets.resolve(configRaw.agentKey);

    const config: PluginConfig = {
      writbaseUrl: configRaw.writbaseUrl,
      agentKey,
      project: configRaw.project,
      department: configRaw.department,
      companyId: configRaw.companyId,
      syncDirection: configRaw.syncDirection ?? "bidirectional",
    };

    // Initialize: verify connectivity, register webhooks
    const { client, ownKeyId, webhookSecret } = await initialize({
      config,
      state: ctx.state,
      logger: ctx.logger,
    });

    // Register event listeners (Paperclip → WritBase)
    const eventCtx = {
      config,
      client,
      state: ctx.state,
      logger: ctx.logger,
    };

    ctx.events.on("issue.created", async (event: any) => {
      const issue = await ctx.issues.get(event.entityId, event.companyId);
      if (issue.companyId !== config.companyId) return;
      await handleIssueCreated(issue as PaperclipIssue, eventCtx);
    });

    ctx.events.on("issue.updated", async (event: any) => {
      const issue = await ctx.issues.get(event.entityId, event.companyId);
      if (issue.companyId !== config.companyId) return;
      await handleIssueUpdated(issue as PaperclipIssue, eventCtx);
    });

    // Register reconciliation job
    ctx.jobs.register("full-sync", async () => {
      await runFullSync({
        config,
        client,
        state: ctx.state,
        issues: ctx.issues,
        logger: ctx.logger,
      });
    });

    ctx.logger.info("WritBase connector initialized", {
      project: config.project,
      syncDirection: config.syncDirection,
      webhookActive: !!webhookSecret,
    });

    // Store webhook context for onWebhook lifecycle method
    (plugin as any)._webhookCtx = {
      config,
      state: ctx.state,
      issues: ctx.issues,
      ownKeyId,
      webhookSecret,
      logger: ctx.logger,
    };
  },

  async onHealth() {
    return { status: "ok" };
  },

  async onWebhook(input: any) {
    if (input.endpointKey !== "writbase-task-event") return;

    const ctx = (plugin as any)._webhookCtx;
    if (!ctx?.webhookSecret) return;

    const headers: WebhookHeaders = {
      "webhook-id": input.headers["webhook-id"] ?? "",
      "webhook-timestamp": input.headers["webhook-timestamp"] ?? "",
      "webhook-signature": input.headers["webhook-signature"] ?? "",
    };

    await handleWebhook(input.rawBody, headers, ctx);
  },

  async onValidateConfig(config: any) {
    if (!config.writbaseUrl) return { ok: false, error: "WritBase URL is required" };
    if (!config.agentKey) return { ok: false, error: "Agent key is required" };
    if (!config.project) return { ok: false, error: "Project is required" };
    if (!config.companyId) return { ok: false, error: "Company ID is required" };
    return { ok: true };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
