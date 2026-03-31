import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isOwnEcho,
  isInCooldown,
  setCooldown,
  isDuplicate,
  updateWithRetry,
  _clearState,
} from "../src/sync-engine.js";
import { VersionConflictError } from "../src/types.js";
import { TASK_1 } from "./fixtures.js";

beforeEach(() => {
  _clearState();
});

describe("isOwnEcho", () => {
  it("returns true when actor matches own key", () => {
    expect(isOwnEcho("key-001", "key-001")).toBe(true);
  });

  it("returns false for different actor", () => {
    expect(isOwnEcho("key-002", "key-001")).toBe(false);
  });

  it("returns false for null actor", () => {
    expect(isOwnEcho(null, "key-001")).toBe(false);
  });
});

describe("cooldown", () => {
  it("returns false when no cooldown set", () => {
    expect(isInCooldown("entity-1")).toBe(false);
  });

  it("returns true within cooldown window", () => {
    setCooldown("entity-1");
    expect(isInCooldown("entity-1")).toBe(true);
  });
});

describe("isDuplicate", () => {
  it("returns false for first occurrence", () => {
    expect(isDuplicate("msg-1")).toBe(false);
  });

  it("returns true for second occurrence", () => {
    isDuplicate("msg-1");
    expect(isDuplicate("msg-1")).toBe(true);
  });

  it("tracks different messages independently", () => {
    isDuplicate("msg-1");
    expect(isDuplicate("msg-2")).toBe(false);
  });
});

describe("updateWithRetry", () => {
  it("succeeds on first try", async () => {
    const client = {
      updateTask: vi.fn().mockResolvedValue({ ...TASK_1, version: 4 }),
      getTasks: vi.fn(),
    } as any;

    const result = await updateWithRetry(
      client,
      { task_id: TASK_1.id, version: 3 },
      "test-project",
    );

    expect(result.version).toBe(4);
    expect(client.updateTask).toHaveBeenCalledOnce();
  });

  it("retries on version conflict with refreshed version", async () => {
    const client = {
      updateTask: vi
        .fn()
        .mockRejectedValueOnce(new VersionConflictError(5))
        .mockResolvedValueOnce({ ...TASK_1, version: 6 }),
      getTasks: vi.fn().mockResolvedValue({
        tasks: [{ ...TASK_1, version: 5 }],
      }),
    } as any;

    const result = await updateWithRetry(
      client,
      { task_id: TASK_1.id, version: 3 },
      "test-project",
    );

    expect(result.version).toBe(6);
    expect(client.updateTask).toHaveBeenCalledTimes(2);
    expect(client.getTasks).toHaveBeenCalledOnce();
  });

  it("throws after max retries exhausted", async () => {
    const client = {
      updateTask: vi.fn().mockRejectedValue(new VersionConflictError(5)),
      getTasks: vi.fn().mockResolvedValue({
        tasks: [{ ...TASK_1, version: 5 }],
      }),
    } as any;

    await expect(
      updateWithRetry(
        client,
        { task_id: TASK_1.id, version: 3 },
        "test-project",
      ),
    ).rejects.toThrow(VersionConflictError);
  });

  it("throws non-version-conflict errors immediately", async () => {
    const client = {
      updateTask: vi.fn().mockRejectedValue(new Error("Network error")),
      getTasks: vi.fn(),
    } as any;

    await expect(
      updateWithRetry(
        client,
        { task_id: TASK_1.id, version: 3 },
        "test-project",
      ),
    ).rejects.toThrow("Network error");

    expect(client.getTasks).not.toHaveBeenCalled();
  });
});
