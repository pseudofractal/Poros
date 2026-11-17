import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const requestedPath = pathname.startsWith("/assets/") ? `/dist${pathname}` : pathname;
  const relativePath = requestedPath === "/" ? "index.html" : decodeURIComponent(requestedPath).replace(/^\/+/, "");
  const filePath = normalize(join(root, relativePath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    await access(filePath);
    response.writeHead(200, { "content-type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(Number(process.env.PORT ?? 4175), "127.0.0.1", () => {
  process.stdout.write(`Poros dev server at http://127.0.0.1:${process.env.PORT ?? 4175}\n`);
});
