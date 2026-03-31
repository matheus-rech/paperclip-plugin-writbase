import { describe, it, expect } from "vitest";
import {
  writBaseStatusToPaperclip,
  paperclipStatusToWritBase,
  writBasePriorityToPaperclip,
  paperclipPriorityToWritBase,
  extractTitle,
  buildPaperclipDescription,
  writBaseTaskToPaperclipData,
  paperclipIssueToWritBaseData,
  extractDueDate,
  extractOriginalStatus,
} from "../src/field-mapping.js";
import { TASK_1, TASK_FAILED, ISSUE_1, ISSUE_BACKLOG, ISSUE_IN_REVIEW } from "./fixtures.js";

describe("status mapping", () => {
  it("maps WritBase statuses to Paperclip", () => {
    expect(writBaseStatusToPaperclip("todo")).toBe("todo");
    expect(writBaseStatusToPaperclip("in_progress")).toBe("in_progress");
    expect(writBaseStatusToPaperclip("blocked")).toBe("blocked");
    expect(writBaseStatusToPaperclip("done")).toBe("done");
    expect(writBaseStatusToPaperclip("cancelled")).toBe("cancelled");
    expect(writBaseStatusToPaperclip("failed")).toBe("cancelled"); // lossy
  });

  it("maps Paperclip statuses to WritBase", () => {
    expect(paperclipStatusToWritBase("backlog")).toBe("todo"); // lossy
    expect(paperclipStatusToWritBase("todo")).toBe("todo");
    expect(paperclipStatusToWritBase("in_progress")).toBe("in_progress");
    expect(paperclipStatusToWritBase("in_review")).toBe("in_progress"); // lossy
    expect(paperclipStatusToWritBase("done")).toBe("done");
    expect(paperclipStatusToWritBase("blocked")).toBe("blocked");
    expect(paperclipStatusToWritBase("cancelled")).toBe("cancelled");
  });
});

describe("priority mapping", () => {
  it("passes through 1:1", () => {
    for (const p of ["low", "medium", "high", "critical"] as const) {
      expect(writBasePriorityToPaperclip(p)).toBe(p);
      expect(paperclipPriorityToWritBase(p)).toBe(p);
    }
  });
});

describe("extractTitle", () => {
  it("extracts first line", () => {
    expect(extractTitle("Fix the bug\nMore details")).toBe("Fix the bug");
  });

  it("handles single-line descriptions", () => {
    expect(extractTitle("Simple task")).toBe("Simple task");
  });

  it("truncates long titles", () => {
    const long = "A".repeat(300);
    const title = extractTitle(long);
    expect(title.length).toBe(200);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("buildPaperclipDescription", () => {
  it("includes remaining lines, notes, and metadata", () => {
    const desc = buildPaperclipDescription(TASK_1);
    expect(desc).toContain("Users are getting 500 errors on /login");
    expect(desc).toContain("Happens after session timeout");
    expect(desc).toContain("<!-- writbase:due_date=2026-04-15T00:00:00Z -->");
  });

  it("includes original_status metadata for failed tasks", () => {
    const desc = buildPaperclipDescription(TASK_FAILED);
    expect(desc).toContain("<!-- writbase:original_status=failed -->");
  });

  it("returns null for single-line tasks with no notes or metadata", () => {
    const task = { ...TASK_1, description: "Simple task", notes: null, due_date: null };
    expect(buildPaperclipDescription(task)).toBeNull();
  });
});

describe("writBaseTaskToPaperclipData", () => {
  it("converts task to Paperclip format", () => {
    const data = writBaseTaskToPaperclipData(TASK_1);
    expect(data.title).toBe("Fix the login bug");
    expect(data.status).toBe("todo");
    expect(data.priority).toBe("medium");
    expect(data.description).toContain("Users are getting 500 errors");
  });
});

describe("paperclipIssueToWritBaseData", () => {
  it("converts issue to WritBase format", () => {
    const data = paperclipIssueToWritBaseData(ISSUE_1);
    expect(data.description).toBe("Fix the login bug");
    expect(data.notes).toBe("Users are getting 500 errors");
    expect(data.status).toBe("todo");
    expect(data.priority).toBe("medium");
  });

  it("maps backlog to todo", () => {
    const data = paperclipIssueToWritBaseData(ISSUE_BACKLOG);
    expect(data.status).toBe("todo");
  });

  it("maps in_review to in_progress", () => {
    const data = paperclipIssueToWritBaseData(ISSUE_IN_REVIEW);
    expect(data.status).toBe("in_progress");
  });
});

describe("metadata extraction", () => {
  it("extracts due_date from metadata comment", () => {
    expect(extractDueDate("Some text\n\n<!-- writbase:due_date=2026-04-15T00:00:00Z -->"))
      .toBe("2026-04-15T00:00:00Z");
  });

  it("returns null when no metadata", () => {
    expect(extractDueDate("Just a description")).toBeNull();
    expect(extractDueDate(null)).toBeNull();
  });

  it("extracts original_status from metadata comment", () => {
    expect(extractOriginalStatus("text\n<!-- writbase:original_status=failed -->"))
      .toBe("failed");
  });
});
