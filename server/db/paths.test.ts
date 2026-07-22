import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeTestDataRoot, resolveDataPaths } from "./paths";

describe("test database isolation", () => {
  it("allows in-memory databases", () => {
    expect(() => assertSafeTestDataRoot(":memory:", undefined)).not.toThrow();
  });

  it("allows a data directory inside the test root", () => {
    const testRoot = path.join(os.tmpdir(), "yard-tracker-test-root");
    expect(() => assertSafeTestDataRoot(path.join(testRoot, "case-1"), testRoot)).not.toThrow();
  });

  it("rejects a filesystem database outside the test root", () => {
    const testRoot = path.join(os.tmpdir(), "yard-tracker-test-root");
    expect(() => assertSafeTestDataRoot(path.resolve("data"), testRoot)).toThrow(
      "Refusing to run tests outside YARD_TRACKER_TEST_ROOT",
    );
  });

  it("rejects filesystem tests without an explicit test root", () => {
    expect(() =>
      resolveDataPaths({
        NODE_ENV: "test",
        YARD_TRACKER_DATA_DIR: path.join(os.tmpdir(), "unsafe-yard-tracker-test"),
      }),
    ).toThrow("YARD_TRACKER_TEST_ROOT is required");
  });
});
