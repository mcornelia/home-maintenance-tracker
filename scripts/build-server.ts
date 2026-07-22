import { build } from "esbuild";

await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist/index.js",
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  sourcemap: true,
  target: "node22",
  logLevel: "info",
});
