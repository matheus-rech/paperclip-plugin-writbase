export const manifest = {
  id: "paperclip-plugin-writbase",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "WritBase Connector",
  description:
    "Bidirectional sync between Paperclip issues and WritBase tasks",
  categories: ["connector"] as const,
  capabilities: ["http.outbound"],

  instanceConfigSchema: {
    type: "object" as const,
    properties: {
      writbaseUrl: {
        type: "string" as const,
        title: "WritBase URL",
        description:
          "Supabase Edge Function base URL (e.g. https://your-project.supabase.co/functions/v1/mcp-server)",
        format: "uri",
      },
      agentKey: {
        type: "string" as const,
        title: "Agent Key",
        description:
          "WritBase agent key (wb_<key_id>_<secret>). Must have manager role for webhook subscriptions.",
        format: "secret-ref",
      },
      project: {
        type: "string" as const,
        title: "WritBase Project",
        description: "WritBase project slug to sync with",
      },
      department: {
        type: "string" as const,
        title: "WritBase Department",
        description:
          "WritBase department slug (required if workspace enforces department scoping)",
      },
      companyId: {
        type: "string" as const,
        title: "Paperclip Company ID",
        description:
          "Paperclip company ID for issue creation and listing",
      },
      syncDirection: {
        type: "string" as const,
        title: "Sync Direction",
        enum: ["pull", "push", "bidirectional"],
        default: "bidirectional",
        description:
          "pull = WritBase→Paperclip only, push = Paperclip→WritBase only, bidirectional = both",
      },
    },
    required: ["writbaseUrl", "agentKey", "project", "companyId"],
  },

  webhooks: [
    {
      endpointKey: "writbase-task-event",
      displayName: "WritBase Task Events",
      description:
        "Receives webhook events from WritBase (task.created, task.updated, task.completed, task.failed)",
    },
  ],

  jobs: [
    {
      jobKey: "full-sync",
      displayName: "Full Sync Reconciliation",
      description:
        "Periodic full sync to catch missed webhook events",
      schedule: "*/15 * * * *",
    },
  ],
};

export default manifest;
