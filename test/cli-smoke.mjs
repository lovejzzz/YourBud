import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], { env: { ...process.env, APP_MODE: "cli" }, stdio: ["pipe", "pipe", "pipe"] });

let out = "";
child.stdout.on("data", (d) => {
  out += d.toString();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  await sleep(300);
  child.stdin.write("self-debug\n");
  await sleep(350);
  child.stdin.write("daily-report compact\n");
  await sleep(350);
  child.stdin.write("exit\n");

  await new Promise((resolve) => child.on("close", resolve));

  if (!out.includes("YourBud ready")) throw new Error("cli banner missing");
  if (!out.includes("name=")) throw new Error("self-debug output missing");
  if (!out.toLowerCase().includes("daily report")) throw new Error("daily-report output missing");

  console.log("cli smoke ok");
}

run().catch((err) => {
  console.error(err);
  child.kill("SIGTERM");
  process.exit(1);
});
