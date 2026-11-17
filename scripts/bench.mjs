import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createDefaultConfig } from "../dist/assets/core/model.js";
import { resolveSearch } from "../dist/assets/core/resolve.js";

const root = resolve(import.meta.dirname, "..");
const sampleCount = Number(process.env.POROS_BENCH_SAMPLES ?? 7);
const chromiumExecutable = process.env.CHROMIUM_PATH ?? "chromium";
const productionMode = process.argv.includes("--production");
const productionUrl = process.env.POROS_PRODUCTION_URL ?? "https://pseudofractal.github.io/Poros/";
if (!Number.isInteger(sampleCount) || sampleCount < 1) {
  throw new Error("POROS_BENCH_SAMPLES must be a positive integer.");
}
const engineWithFilters = {
  id: "benchmark-arxiv",
  name: "Benchmark arXiv",
  aliases: ["bench"],
  urlTemplate: "https://arxiv.org/search/?searchtype=all&query=all:{query}",
  delimiter: "|",
  queryFields: [
    { key: "category", label: "Category", required: false, urlFragment: "+AND+cat:{value}" },
    { key: "author", label: "Author", required: false, urlFragment: "+AND+au:%22{value}%22" },
    { key: "title", label: "Title", required: false, urlFragment: "+AND+ti:%22{value}%22" },
  ],
  source: "custom",
};
const config = createDefaultConfig();
config.customEngines.push(engineWithFilters);

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index];
}

function summarize(values, unit) {
  return {
    median: Number(percentile(values, 0.5).toFixed(2)),
    p95: Number(percentile(values, 0.95).toFixed(2)),
    unit,
  };
}

function benchmarkResolver(name, query, iterationsPerSample = 5_000) {
  for (let iteration = 0; iteration < 2_000; iteration += 1) resolveSearch(query, config);

  const durations = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const start = performance.now();
    for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) {
      const result = resolveSearch(query, config);
      if (!result.ok) throw new Error(`Resolver benchmark failed: ${result.error.kind}`);
    }
    durations.push(((performance.now() - start) * 1_000) / iterationsPerSample);
  }

  return { name, ...summarize(durations, "µs/search") };
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local port.");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function waitForServer(url, processHandle) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error("Poros benchmark server exited before it was ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Poros benchmark server did not become ready at ${url}.`);
}

async function openChromiumPage(pageUrl, profilePath) {
  const debugPort = await reservePort();
  const browserProcess = spawn(chromiumExecutable, [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "about:blank",
  ], { stdio: "ignore" });
  let socket;
  let closeRemoteBrowser;

  try {
    const debuggerUrl = `http://127.0.0.1:${debugPort}`;
    let debuggerInfo;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (browserProcess.exitCode !== null) throw new Error("Chromium exited before its debugger was ready.");
      try {
        const response = await fetch(`${debuggerUrl}/json/version`);
        if (response.ok) {
          debuggerInfo = await response.json();
          break;
        }
      } catch {
        await delay(50);
      }
    }
    if (!debuggerInfo) throw new Error("Chromium's debugging endpoint did not become ready.");

    const targetResponse = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error(`Chromium could not open the benchmark page (HTTP ${targetResponse.status}).`);
    const target = await targetResponse.json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });

    const pendingCommands = new Map();
    let nextCommandId = 0;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = pendingCommands.get(message.id);
      if (!pending) return;
      pendingCommands.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });

    const sendCommand = (method, params = {}) => {
      const id = ++nextCommandId;
      return new Promise((resolveCommand, rejectCommand) => {
        pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand });
        socket.send(JSON.stringify({ id, method, params }));
      });
    };
    closeRemoteBrowser = () => sendCommand("Browser.close");

    await sendCommand("Page.enable");
    await sendCommand("Runtime.enable");
    const navigation = await sendCommand("Page.navigate", { url: pageUrl });
    if (navigation.errorText) throw new Error(navigation.errorText);

    for (let attempt = 0; attempt < 1_500; attempt += 1) {
      const evaluation = await sendCommand("Runtime.evaluate", {
        expression: 'document.querySelector("#benchmark-result")?.textContent ?? "pending"',
        returnByValue: true,
      });
      const resultText = evaluation.result?.value;
      if (resultText && resultText !== "pending") return JSON.parse(resultText);
      await delay(20);
    }
    throw new Error(`Chromium timed out waiting for the ${new URL(pageUrl).searchParams.get("scenario")} page to render.`);
  } finally {
    if (closeRemoteBrowser) {
      await Promise.race([closeRemoteBrowser().catch(() => undefined), delay(1_000)]);
    }
    socket?.close();
    await stopProcess(browserProcess);
  }
}

async function stopProcess(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;

  let timeout;
  const processClosed = new Promise((resolveClose) => processHandle.once("close", resolveClose));
  processHandle.kill("SIGTERM");
  const closedInTime = await Promise.race([
    processClosed.then(() => true),
    new Promise((resolveTimeout) => { timeout = setTimeout(() => resolveTimeout(false), 1_500); }),
  ]);
  clearTimeout(timeout);
  if (!closedInTime) {
    processHandle.kill("SIGKILL");
    await processClosed;
  }
}

async function benchmarkPageLoad(baseUrl, scenario) {
  const appReadyDurations = [];
  const durations = [];
  const transferBytes = [];
  const heapBytes = [];
  let resourceCount = 0;
  let engineCardCount = 0;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const profilePath = await mkdtemp(join(tmpdir(), "poros-bench-profile-"));
    try {
      const metrics = await openChromiumPage(harnessUrl(baseUrl, scenario), profilePath);
      if (metrics.error) throw new Error(metrics.error);
      appReadyDurations.push(metrics.appReadyMs);
      const primaryPaintMs = metrics.firstContentfulPaintMs ?? metrics.loadEventMs;
      durations.push(primaryPaintMs);
      transferBytes.push(metrics.transferredBytes);
      if (metrics.usedJsHeapBytes !== null) heapBytes.push(metrics.usedJsHeapBytes);
      resourceCount = metrics.resourceCount;
      engineCardCount = metrics.engineCardCount;
    } finally {
      await rm(profilePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }

  return {
    scenario,
    appReady: summarize(appReadyDurations, "ms"),
    firstPaint: summarize(durations, "ms"),
    transferredBytes: summarize(transferBytes, "bytes"),
    resourceCount,
    engineCardCount,
    ...(heapBytes.length ? { usedJsHeap: summarize(heapBytes, "bytes") } : {}),
  };
}

async function measureAssetPayload(paths) {
  const contents = await Promise.all(paths.map((path) => readFile(join(root, "dist", path))));
  return {
    rawBytes: contents.reduce((total, content) => total + content.byteLength, 0),
    gzipBytes: contents.reduce((total, content) => total + gzipSync(content).byteLength, 0),
    brotliBytes: contents.reduce((total, content) => total + brotliCompressSync(content).byteLength, 0),
  };
}

async function measureStartupPayloads() {
  return {
    home: await measureAssetPayload([
      "index.html",
      "styles.css",
      "static/logo.svg",
      "assets/main.js",
    ]),
    settings: await measureAssetPayload([
      "index.html",
      "styles.css",
      "settings.css",
      "assets/main.js",
      "assets/ui/settings.js",
      "assets/core/config.js",
      "assets/core/model.js",
    ]),
  };
}

async function main() {
  const chromiumVersionResult = spawnSync(chromiumExecutable, ["--version"], { encoding: "utf8" });
  if (chromiumVersionResult.error || chromiumVersionResult.status !== 0) {
    throw new Error(`Could not run Chromium from “${chromiumExecutable}”. Set CHROMIUM_PATH to its executable.`);
  }
  const chromiumVersion = chromiumVersionResult.stdout.trim();

  let server;
  let baseUrl = productionUrl;
  if (!productionMode) {
    const port = await reservePort();
    server = spawn(process.execPath, ["scripts/dev-server.mjs"], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    });
    baseUrl = `http://127.0.0.1:${port}/`;
  }

  try {
    if (server) {
      await waitForServer(baseUrl, server);
    } else {
      const harnessResponse = await fetch(harnessUrl(baseUrl, "home"));
      if (!harnessResponse.ok) {
        throw new Error(`Production benchmark harness returned HTTP ${harnessResponse.status}. Deploy the current app build before running this benchmark.`);
      }
    }
    const browser = [];
    for (const scenario of ["home", "settings"]) browser.push(await benchmarkPageLoad(baseUrl, scenario));

    const resolver = productionMode ? [] : [
        benchmarkResolver("default engine", "an example search without a bang"),
        benchmarkResolver("bang with three filters", "!bench transformer|cs.CL|Yoshua Bengio|language model"),
        benchmarkResolver("bang with skipped optional filter", "!bench transformer|xxx|Yoshua Bengio|language model"),
      ];

    const report = {
      generatedAt: new Date().toISOString(),
      runtime: process.version,
      platform: `${platform()} ${arch()}`,
      cpu: cpus()[0]?.model ?? "unknown",
      chromium: chromiumVersion,
      target: productionMode ? baseUrl : "local-loopback",
      productionMode,
      samplesPerPage: sampleCount,
      browser,
      resolver,
      ...(!productionMode ? { startupPayload: await measureStartupPayloads() } : {}),
    };
    const baselineFileName = productionMode ? "production-baseline.json" : "baseline.json";
    const baselinePath = join(root, "benchmarks", baselineFileName);
    if (process.argv.includes("--update-baseline")) {
      await writeFile(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Updated ${baselinePath}`);
    } else {
      try {
        const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
        report.comparison = compareToBaseline(report, baseline);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        report.comparison = "No baseline yet. Run npm run bench:baseline to save this environment's reference run.";
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (server) await stopProcess(server);
  }
}

function harnessUrl(baseUrl, scenario) {
  const appBase = new URL(baseUrl);
  if (!appBase.pathname.endsWith("/")) appBase.pathname += "/";
  const page = new URL("benchmarks/browser-harness.html", appBase);
  page.searchParams.set("scenario", scenario);
  return page.href;
}

function compareToBaseline(current, baseline) {
  const comparisons = [];
  for (const page of current.browser) {
    const previousPage = baseline.browser.find((item) => item.scenario === page.scenario);
    if (!previousPage) continue;
    if (page.appReady && previousPage.appReady) {
      comparisons.push({
        name: `${page.scenario} app ready`,
        baseline: previousPage.appReady.median,
        current: page.appReady.median,
        changePercent: percentChange(page.appReady.median, previousPage.appReady.median),
        unit: page.appReady.unit,
      });
    }
    comparisons.push({
      name: `${page.scenario} first paint`,
      baseline: previousPage.firstPaint.median,
      current: page.firstPaint.median,
      changePercent: percentChange(page.firstPaint.median, previousPage.firstPaint.median),
      unit: page.firstPaint.unit,
    });
    comparisons.push({
      name: `${page.scenario} transferred bytes`,
      baseline: previousPage.transferredBytes.median,
      current: page.transferredBytes.median,
      changePercent: percentChange(page.transferredBytes.median, previousPage.transferredBytes.median),
      unit: page.transferredBytes.unit,
    });
    const currentPayload = current.startupPayload?.[page.scenario];
    const previousPayload = baseline.startupPayload?.[page.scenario];
    if (currentPayload && previousPayload) {
      for (const encoding of ["gzipBytes", "brotliBytes"]) {
        comparisons.push({
          name: `${page.scenario} ${encoding.replace("Bytes", "")}`,
          baseline: previousPayload[encoding],
          current: currentPayload[encoding],
          changePercent: percentChange(currentPayload[encoding], previousPayload[encoding]),
          unit: "bytes",
        });
      }
    }
    if (page.usedJsHeap && previousPage.usedJsHeap) {
      comparisons.push({
        name: `${page.scenario} JavaScript heap`,
        baseline: previousPage.usedJsHeap.median,
        current: page.usedJsHeap.median,
        changePercent: percentChange(page.usedJsHeap.median, previousPage.usedJsHeap.median),
        unit: page.usedJsHeap.unit,
      });
    }
  }
  for (const scenario of current.resolver) {
    const previousScenario = baseline.resolver.find((item) => item.name === scenario.name);
    if (!previousScenario) continue;
    comparisons.push({
      name: `${scenario.name} resolver`,
      baseline: previousScenario.median,
      current: scenario.median,
      changePercent: percentChange(scenario.median, previousScenario.median),
      unit: scenario.unit,
    });
  }
  return {
    baselineGeneratedAt: baseline.generatedAt,
    sameEnvironment: ["runtime", "platform", "cpu", "chromium", "target", "productionMode"].every((key) => current[key] === baseline[key]),
    metrics: comparisons,
  };
}

function percentChange(current, baseline) {
  if (baseline === 0) return null;
  return Number((((current - baseline) / baseline) * 100).toFixed(1));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
