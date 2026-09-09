import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = process.env.REWIND_WEB_PORT || "43139";
const env = { ...process.env, REWIND_WEB_PORT: port };
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
function start(command, args) {
  const child = spawn(command, args, { env, stdio: "inherit" });
  children.add(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 0);
  });
  return child;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
start(process.execPath, ["web/server.mjs"]);
let ready = false;
for (let attempt = 0; attempt < 80 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* wait for the child */
  }
  await delay(100);
}
if (!stopping && ready)
  start(process.execPath, [
    "node_modules/@react-router/dev/bin.js",
    "dev",
    "--host",
    "127.0.0.1",
  ]);
else if (!stopping) {
  console.error("Local API did not become ready");
  stop(1);
}
