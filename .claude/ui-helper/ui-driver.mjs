#!/usr/bin/env node
/**
 * ui-driver.mjs — dependency-free headless-Chrome driver over the Chrome
 * DevTools Protocol (CDP). Used by the per-app `run-<app>` agent skills to
 * drive the homelab web UIs and take screenshots without Playwright/Puppeteer.
 *
 * Usage:  node .claude/ui-helper/ui-driver.mjs [--out <dir>] < commands.txt
 *
 * Commands (one per line, read from stdin; `#` starts a comment line):
 *   nav <url>              navigate and wait for the load event
 *   wait <js-expr>         poll until the JS expression is truthy (30s timeout)
 *   wait text=<needle>     shorthand: wait until document.body innerText contains needle
 *   shot <name.png>        screenshot -> <out>/<name.png> (default out: .claude/ui-helper/.ui-shots/)
 *   eval <js-expr>         evaluate and print the JSON result
 *   click <selector>       querySelector(...).click()  (selector = first token, no spaces)
 *   fill <selector> <val>  set value + dispatch input/change events (plain DOM apps)
 *   upload <selector> <path>  set a file on an <input type=file> (absolute or cwd-relative path)
 *   sleep <ms>             pause
 *   errors                 print console errors + uncaught exceptions seen so far
 *
 * Exit code is 1 if any command printed ERR. Chrome is located via
 * CHROME_PATH, else the standard Chrome/Edge install paths (Windows + Linux).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import path from "node:path";

const outDirArg = process.argv.indexOf("--out");
const outDir =
  outDirArg > -1 ? path.resolve(process.argv[outDirArg + 1]) : path.join(import.meta.dirname, ".ui-shots");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("ERR no Chrome/Edge found; set CHROME_PATH");
  process.exit(1);
}

const profileDir = path.join(tmpdir(), `ui-driver-${process.pid}`);
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1280,900",
  // Port 6000 (dashboard) is on Chrome's restricted-port list (X11) and hits
  // ERR_UNSAFE_PORT without this; the other 600x homelab ports are unaffected.
  "--explicitly-allowed-ports=6000",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank",
]);

const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  const onData = (chunk) => {
    buf += chunk;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) {
      chrome.stderr.off("data", onData);
      resolve(m[1]);
    }
  };
  chrome.stderr.on("data", onData);
  chrome.on("exit", (code) => reject(new Error(`chrome exited early (${code})\n${buf}`)));
  setTimeout(() => reject(new Error(`no DevTools banner after 20s\n${buf}`)), 20_000);
});

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
const events = []; // collected console errors / exceptions
let loadFired = null; // resolver for the next Page.loadEventFired

ws.onmessage = (msg) => {
  const m = JSON.parse(msg.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
    return;
  }
  if (m.method === "Page.loadEventFired" && loadFired) {
    loadFired();
    loadFired = null;
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    events.push(`exception: ${d.exception?.description ?? d.text}`);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    events.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    events.push(`log: ${m.params.entry.text} (${m.params.entry.url ?? ""})`);
  }
};

function send(method, params = {}, sessionId = undefined) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

// Attach to the initial about:blank page target.
const { targetInfos } = await send("Target.getTargets");
const page = targetInfos.find((t) => t.type === "page");
const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Log.enable", {}, sessionId);

async function evaluate(expr) {
  const r = await send(
    "Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

async function waitFor(expr, timeoutMs = 30_000) {
  const start = Date.now();
  for (;;) {
    if (await evaluate(`!!(${expr})`)) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${expr}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

let failed = false;

async function run(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const sp = trimmed.indexOf(" ");
  const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
  const rest = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
  try {
    switch (cmd) {
      case "nav": {
        const loaded = new Promise((r) => (loadFired = r));
        await send("Page.navigate", { url: rest }, sessionId);
        await Promise.race([
          loaded,
          new Promise((_, rej) => setTimeout(() => rej(new Error("load timeout (30s)")), 30_000)),
        ]);
        console.log(`ok nav ${rest}`);
        break;
      }
      case "wait": {
        const expr = rest.startsWith("text=")
          ? `document.body && document.body.innerText.includes(${JSON.stringify(rest.slice(5))})`
          : rest;
        await waitFor(expr);
        console.log(`ok wait ${rest}`);
        break;
      }
      case "shot": {
        await mkdir(outDir, { recursive: true });
        const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
        const file = path.join(outDir, rest || "screenshot.png");
        await writeFile(file, Buffer.from(data, "base64"));
        console.log(`ok shot ${file}`);
        break;
      }
      case "eval": {
        const v = await evaluate(rest);
        console.log(`ok eval ${JSON.stringify(v)}`);
        break;
      }
      case "click": {
        const sel = rest.split(/\s+/)[0];
        await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("no element: " + ${JSON.stringify(sel)}); el.click(); })()`,
        );
        console.log(`ok click ${sel}`);
        break;
      }
      case "fill": {
        const s = rest.indexOf(" ");
        if (s === -1) throw new Error("usage: fill <selector> <value>");
        const sel = rest.slice(0, s);
        const val = rest.slice(s + 1);
        await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("no element: " + ${JSON.stringify(sel)});
             el.value = ${JSON.stringify(val)};
             el.dispatchEvent(new Event("input", { bubbles: true }));
             el.dispatchEvent(new Event("change", { bubbles: true })); })()`,
        );
        console.log(`ok fill ${sel}`);
        break;
      }
      case "upload": {
        const s = rest.indexOf(" ");
        if (s === -1) throw new Error("usage: upload <selector> <path>");
        const sel = rest.slice(0, s);
        const file = path.resolve(rest.slice(s + 1).trim());
        if (!existsSync(file)) throw new Error(`no such file: ${file}`);
        const { root } = await send("DOM.getDocument", {}, sessionId);
        const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: sel }, sessionId);
        if (!nodeId) throw new Error(`no element: ${sel}`);
        await send("DOM.setFileInputFiles", { files: [file], nodeId }, sessionId);
        console.log(`ok upload ${sel} ${file}`);
        break;
      }
      case "sleep": {
        await new Promise((r) => setTimeout(r, Number(rest) || 0));
        console.log(`ok sleep ${rest}`);
        break;
      }
      case "errors": {
        if (events.length === 0) console.log("ok errors none");
        else {
          console.log(`ok errors ${events.length}`);
          for (const e of events) console.log(`  ${e}`);
        }
        break;
      }
      default:
        throw new Error(`unknown command: ${cmd}`);
    }
  } catch (err) {
    failed = true;
    console.log(`ERR ${cmd} ${err.message.split("\n")[0]}`);
  }
}

const rl = createInterface({ input: process.stdin });
const lines = [];
for await (const line of rl) lines.push(line);
for (const line of lines) await run(line);

try {
  await send("Browser.close");
} catch {
  chrome.kill();
}
await new Promise((r) => chrome.on("exit", r));
await rm(profileDir, { recursive: true, force: true }).catch(() => {});
process.exit(failed ? 1 : 0);
