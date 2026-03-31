import type {
  JsonRpcResponse,
  GetTasksParams,
  AddTaskParams,
  UpdateTaskParams,
  SubscribeParams,
  WritBaseTask,
} from "./types.js";
import { WritBaseError, VersionConflictError } from "./types.js";

/**
 * Lightweight HTTP client for the WritBase MCP server.
 *
 * Speaks JSON-RPC 2.0 over HTTP POST to the Streamable HTTP endpoint.
 * No MCP Client SDK needed — WritBase MCP is stateless per-request.
 */
export class WritBaseClient {
  private nextId = 1;

  constructor(
    private baseUrl: string,
    private agentKey: string,
  ) {}

  /**
   * Low-level JSON-RPC tool call.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.nextId++;
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${this.agentKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new WritBaseError("Rate limited", "rate_limited", {
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : 60,
        });
      }
      throw new WritBaseError(
        `HTTP ${res.status}: ${res.statusText}`,
        "http_error",
        { status: res.status },
      );
    }

    const json = (await res.json()) as JsonRpcResponse;

    if (json.error) {
      throw new WritBaseError(json.error.message, "rpc_error", {
        code: json.error.code,
      });
    }

    const text = json.result?.content?.[0]?.text;
    if (!text) {
      throw new WritBaseError("Empty response", "empty_response");
    }

    const parsed = JSON.parse(text) as Record<string, unknown>;

    if (json.result?.isError) {
      const code = (parsed.code as string) ?? "unknown";
      if (code === "version_conflict") {
        throw new VersionConflictError(
          (parsed.current_version as number) ?? 0,
        );
      }
      throw new WritBaseError(
        (parsed.message as string) ?? "Tool error",
        code,
        parsed,
      );
    }

    return parsed;
  }

  async getInfo(): Promise<Record<string, unknown>> {
    return (await this.callTool("info", {})) as Record<string, unknown>;
  }

  async getTasks(
    params: GetTasksParams,
  ): Promise<{ tasks: WritBaseTask[]; next_cursor?: string }> {
    const result = (await this.callTool("get_tasks", params)) as {
      tasks: WritBaseTask[];
      next_cursor?: string;
    };
    return result;
  }

  async addTask(params: AddTaskParams): Promise<WritBaseTask> {
    const result = (await this.callTool("add_task", params)) as {
      task: WritBaseTask;
    };
    return result.task;
  }

  async updateTask(params: UpdateTaskParams): Promise<WritBaseTask> {
    const result = (await this.callTool("update_task", params)) as {
      task: WritBaseTask;
    };
    return result.task;
  }

  async subscribe(
    params: SubscribeParams,
  ): Promise<Record<string, unknown>> {
    return (await this.callTool("subscribe", params)) as Record<
      string,
      unknown
    >;
  }
}
