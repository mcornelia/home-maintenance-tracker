import os from "node:os";
import path from "node:path";

export interface DataPaths {
  root: string;
  database: string;
  uploads: string;
  backups: string;
  importReports: string;
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function assertSafeTestDataRoot(dataRoot: string, testRoot: string | undefined): void {
  if (dataRoot === ":memory:") return;

  if (!testRoot) {
    throw new Error("YARD_TRACKER_TEST_ROOT is required when tests use a filesystem database");
  }

  if (!isInside(testRoot, dataRoot)) {
    throw new Error("Refusing to run tests outside YARD_TRACKER_TEST_ROOT");
  }
}

export function resolveDataPaths(environment = process.env): DataPaths {
  const isTest = environment.NODE_ENV === "test";
  const configured = environment.YARD_TRACKER_DATA_DIR;
  const root = configured
    ? configured === ":memory:"
      ? configured
      : path.resolve(configured)
    : path.resolve(process.cwd(), "data");

  if (isTest) {
    assertSafeTestDataRoot(root, environment.YARD_TRACKER_TEST_ROOT);
  }

  if (root === ":memory:") {
    return {
      root,
      database: root,
      uploads: path.join(os.tmpdir(), "yard-tracker-memory-uploads"),
      backups: path.join(os.tmpdir(), "yard-tracker-memory-backups"),
      importReports: path.join(os.tmpdir(), "yard-tracker-memory-import-reports"),
    };
  }

  return {
    root,
    database: path.join(root, "yard-tracker.sqlite"),
    uploads: path.join(root, "uploads"),
    backups: path.join(root, "backups"),
    importReports: path.join(root, "import-reports"),
  };
}
