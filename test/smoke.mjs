import { spawn } from "node:child_process";

const env = { ...process.env, APP_MODE: "web", PORT: "8799", BRAIN_PROVIDER: "openclaw" };
const server = spawn("node", ["dist/index.js"], { env, stdio: ["ignore", "pipe", "pipe"] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady() {
  let out = "";
  server.stdout.on("data", (d) => {
    out += d.toString();
  });
  for (let i = 0; i < 30; i += 1) {
    if (out.includes("Dashboard running")) return;
    await sleep(200);
  }
  throw new Error("Server did not start in time");
}

async function run() {
  try {
    await waitReady();

    const health = await fetch("http://127.0.0.1:8799/api/health").then((r) => r.json());
    if (!health.ok) throw new Error("health endpoint failed");

    const diag = await fetch("http://127.0.0.1:8799/api/diag").then((r) => r.json());
    if (!String(diag.output || "").includes("name=")) throw new Error("diag endpoint failed");

    const report = await fetch("http://127.0.0.1:8799/api/report").then((r) => r.json());
    if (!String(report.output || "").toLowerCase().includes("daily report")) throw new Error("report endpoint failed");

    console.log("web smoke ok");
  } finally {
    server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error(err);
  server.kill("SIGTERM");
  process.exit(1);
});
