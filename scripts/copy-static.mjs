import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist/static", { recursive: true });
await mkdir("dist/benchmarks", { recursive: true });
await cp("static", "dist/static", { recursive: true });
await cp("benchmarks/browser-harness.html", "dist/benchmarks/browser-harness.html");
await cp("index.html", "dist/index.html");

await cp("styles.css", "dist/styles.css");
await cp("settings.css", "dist/settings.css");
await cp("manifest.webmanifest", "dist/manifest.webmanifest");
await cp("sw.js", "dist/sw.js");
const html = await readFile("dist/index.html", "utf8");
await writeFile("dist/index.html", html);
