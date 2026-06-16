import { describe, test, expect } from "bun:test";
import { renderTemplate, buildFilename } from "../../src/core/output-template";
import type { InfoDict } from "../../src/core/types";

const INFO: InfoDict = {
  id: "abc123",
  title: "Test Video - Special Edition",
  ext: "mp4",
  uploader: "TestChannel",
  uploader_id: "UC12345",
  duration: 300,
  view_count: 1000000,
  upload_date: "20240115",
};

describe("renderTemplate", () => {
  test("renders basic title and id", () => {
    const result = renderTemplate("%(title)s [%(id)s].%(ext)s", INFO);
    expect(result).toBe("Test Video - Special Edition [abc123].mp4");
  });

  test("renders numeric fields", () => {
    const result = renderTemplate("%(duration)d seconds", INFO);
    expect(result).toBe("300 seconds");
  });

  test("handles missing fields", () => {
    const result = renderTemplate("%(channel)s - %(title)s", INFO);
    expect(result).toContain("NA");
    expect(result).toContain("Test Video");
  });

  test("renders uploader", () => {
    const result = renderTemplate("%(uploader)s - %(title)s", INFO);
    expect(result).toBe("TestChannel - Test Video - Special Edition");
  });
});

describe("buildFilename", () => {
  test("sanitizes illegal characters", () => {
    const infoWithBadTitle: InfoDict = {
      ...INFO,
      title: 'Video: "Test" <Special>',
    };
    const result = buildFilename("%(title)s.%(ext)s", infoWithBadTitle);
    expect(result).not.toContain(":");
    expect(result).not.toContain('"');
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  test("produces valid filename", () => {
    const result = buildFilename("%(title)s [%(id)s].%(ext)s", INFO);
    expect(result).toBe("Test Video - Special Edition [abc123].mp4");
  });
});
