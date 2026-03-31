import { describe, it, expect, vi, beforeEach } from "vitest";
import { WritBaseClient } from "../src/writbase-client.js";
import { WritBaseError, VersionConflictError } from "../src/types.js";

const BASE_URL = "https://test.supabase.co/functions/v1/mcp-server";
const AGENT_KEY = "wb_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_" + "a".repeat(64);

function mockFetch(result: unknown, isError = false) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError,
      },
    }),
  });
}

describe("WritBaseClient", () => {
  let client: WritBaseClient;

  beforeEach(() => {
    client = new WritBaseClient(BASE_URL, AGENT_KEY);
  });

  it("sends correct JSON-RPC request", async () => {
    const fetch = mockFetch({ version: "0.2.0" });
    vi.stubGlobal("fetch", fetch);

    await client.getInfo();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/mcp`);
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe(`Bearer ${AGENT_KEY}`);

    const body = JSON.parse(init.body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("info");
  });

  it("parses successful response", async () => {
    vi.stubGlobal("fetch", mockFetch({ tasks: [], next_cursor: null }));

    const result = await client.getTasks({ project: "test" });
    expect(result.tasks).toEqual([]);
  });

  it("throws VersionConflictError", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { code: "version_conflict", message: "Version mismatch", current_version: 5 },
        true,
      ),
    );

    await expect(
      client.updateTask({ task_id: "t1", version: 3 }),
    ).rejects.toThrow(VersionConflictError);
  });

  it("throws WritBaseError on tool error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ code: "task_not_found", message: "Not found" }, true),
    );

    await expect(
      client.updateTask({ task_id: "t1", version: 1 }),
    ).rejects.toThrow(WritBaseError);
  });

  it("throws on rate limit (429)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "retry-after": "30" }),
      }),
    );

    try {
      await client.getInfo();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(WritBaseError);
      expect((err as WritBaseError).code).toBe("rate_limited");
    }
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
      }),
    );

    await expect(client.getInfo()).rejects.toThrow(WritBaseError);
  });
});
