# paperclip-plugin-writbase

Bidirectional sync between [Paperclip](https://github.com/paperclipai/paperclip) issues and [WritBase](https://github.com/Writbase/writbase) tasks.

## Features

- **Event-driven sync** — Paperclip issue events push to WritBase; WritBase webhooks push to Paperclip
- **Periodic reconciliation** — Full sync every 15 minutes catches missed webhook events
- **Conflict resolution** — Version-based optimistic concurrency with automatic retry
- **Echo suppression** — Prevents sync loops via actor ID detection and per-entity cooldowns
- **Configurable direction** — Pull (WritBase→Paperclip), push (Paperclip→WritBase), or bidirectional

## Prerequisites

- Paperclip instance (v2026.318.0+, plugin system required)
- WritBase workspace with a **manager-role** agent key
- Node.js 20+

## Installation

```bash
npm install paperclip-plugin-writbase
```

Then register the plugin in your Paperclip instance.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `writbaseUrl` | Yes | Supabase Edge Function base URL (e.g. `https://your-project.supabase.co/functions/v1/mcp-server`) |
| `agentKey` | Yes | WritBase agent key (`wb_<key_id>_<secret>`). Must have **manager** role. |
| `project` | Yes | WritBase project slug to sync with |
| `companyId` | Yes | Paperclip company ID for issue creation/listing |
| `department` | No | WritBase department slug (required if workspace enforces department scoping) |
| `syncDirection` | No | `pull`, `push`, or `bidirectional` (default: `bidirectional`) |

### Creating a WritBase Agent Key

```bash
npx writbase key create --name paperclip-sync --role manager
```

The key must have `manager` role to register webhook subscriptions.

## Field Mapping

### Status

| WritBase | Paperclip | Notes |
|----------|-----------|-------|
| `todo` | `todo` | |
| `in_progress` | `in_progress` | |
| `blocked` | `blocked` | |
| `done` | `done` | |
| `cancelled` | `cancelled` | |
| `failed` | `cancelled` | Lossy — original status preserved in metadata |

| Paperclip | WritBase | Notes |
|-----------|----------|-------|
| `backlog` | `todo` | Lossy |
| `todo` | `todo` | |
| `in_progress` | `in_progress` | |
| `in_review` | `in_progress` | Lossy |
| `done` | `done` | |
| `blocked` | `blocked` | |
| `cancelled` | `cancelled` | |

### Priority

Direct 1:1 mapping: `low`, `medium`, `high`, `critical`.

### Fields

| WritBase | Paperclip | Direction |
|----------|-----------|-----------|
| `description` (first line) | `title` | Both |
| `description` (remaining) + `notes` | `description` | Both |
| `due_date` | metadata in description | WritBase→Paperclip only |
| `is_archived` | `hiddenAt` | Both |

**Not mapped:** `blocked_by` (DAG deps vs `parentId` hierarchy), assignee fields, `labelIds`, `billingCode`.

## How It Works

### Event-Driven Sync

1. **Paperclip → WritBase**: Plugin subscribes to `issue.created` and `issue.updated` events via `ctx.events.on()`. Events are debounced (500ms) and serialized per entity to prevent version conflicts.

2. **WritBase → Paperclip**: Plugin registers a webhook subscription on WritBase for `task.created`, `task.updated`, `task.completed`, `task.failed` events. Incoming webhooks are verified via Standard Webhooks HMAC-SHA256.

### Reconciliation

A scheduled job runs every 15 minutes to catch events missed by webhooks (WritBase uses fire-and-forget delivery). It pages through all tasks updated since the last run (with a 60-second overlap window) and reconciles any unmapped or out-of-sync items.

### Conflict Resolution

- Every WritBase mutation stores the returned `version` in the sync mapping
- On `version_conflict`, the plugin refetches the current task version and retries (up to 3 times)
- No cross-system timestamp comparison (avoids clock skew issues)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run lint

# Watch mode
npm run dev
```

## License

Apache-2.0
