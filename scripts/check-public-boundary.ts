import { execFileSync } from "node:child_process";
import fs from "node:fs";

const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenFile = /(^|\/)(\.env|data|uploads|backups|import-reports)(\/|$)|\.(sqlite|sqlite3|db|zip)$|yard-tracker-(complete|followup|browser-data).*export/i;
const contentRules: Array<[string, RegExp]> = [
  ["a private home-directory path", /\/Users\/(?!your-mac-account(?:\/|$))[^/\s]+\//],
  ["a non-example email address", /\b[A-Z0-9._%+-]+@(?!example\.(?:com|test)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["a private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["a GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["an AWS access key", /\bAKIA[A-Z0-9]{16}\b/],
  ["a populated secret assignment", /\b(?:SMTP_PASSWORD|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)=[^\s#][^\r\n]*/],
];

const findings: string[] = [];
for (const file of candidates) {
  if (forbiddenFile.test(file)) findings.push(`${file}: private runtime/export path must not be published`);
  if (file === "scripts/check-public-boundary.ts" || file.endsWith("lock.yaml") || file.endsWith("package-lock.json")) continue;
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  const bytes = fs.readFileSync(file);
  if (bytes.includes(0)) continue;
  const content = bytes.toString("utf8");
  for (const [description, pattern] of contentRules) {
    if (pattern.test(content)) findings.push(`${file}: contains ${description}`);
  }
}

if (findings.length) {
  console.error("Public-boundary check failed:\n" + findings.map((finding) => `- ${finding}`).join("\n"));
  process.exit(1);
}

console.log(`Public-boundary check passed for ${candidates.length} publishable files.`);
