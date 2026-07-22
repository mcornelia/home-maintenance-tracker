import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yard-tracker-tests-"));
const testDataRoot = path.join(testRoot, "data");

process.env.NODE_ENV = "test";
process.env.YARD_TRACKER_TEST_ROOT = testRoot;
process.env.YARD_TRACKER_DATA_DIR = testDataRoot;

afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});
