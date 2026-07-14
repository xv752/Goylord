import { describe, expect, test } from "bun:test";
import path from "path";
import { resolveContainedPath, sanitizeUploadFilename } from "./upload-security";

describe("sanitizeUploadFilename", () => {
  test("normalizes slash and backslash separated names", () => {
    expect(sanitizeUploadFilename("../../payload.exe")).toBe("payload.exe");
    expect(sanitizeUploadFilename("..\\..\\payload.exe")).toBe("payload.exe");
  });

  test("replaces unsafe characters and rejects dot-only names", () => {
    expect(sanitizeUploadFilename("bad/name';.exe")).toBe("name__.exe");
    expect(sanitizeUploadFilename("..", "upload.bin")).toBe("upload.bin");
    expect(sanitizeUploadFilename(".", "upload.bin")).toBe("upload.bin");
  });

  test("avoids Windows reserved device names", () => {
    expect(sanitizeUploadFilename("CON")).toBe("_CON");
    expect(sanitizeUploadFilename("lpt1.txt")).toBe("_lpt1.txt");
  });
});

describe("resolveContainedPath", () => {
  test("allows paths inside root", () => {
    const root = path.resolve("data/uploads");
    expect(resolveContainedPath(root, "abc", "file.bin")).toBe(path.resolve(root, "abc", "file.bin"));
  });

  test("rejects paths that escape root", () => {
    const root = path.resolve("data/uploads");
    expect(() => resolveContainedPath(root, "..", "outside.bin")).toThrow();
  });
});
