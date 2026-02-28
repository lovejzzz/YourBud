import { createServer } from "node:http";
import { BudAgent } from "../core/agent.js";

const page = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>YourBud Dashboard</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 0; background:#0f1115; color:#e8ecf1; }
      .wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
      .card { background:#171a21; border:1px solid #2b3242; border-radius:12px; padding:16px; margin-bottom:16px; }
      textarea, input { width:100%; background:#0f1115; color:#e8ecf1; border:1px solid #2b3242; border-radius:8px; padding:10px; }
      button { background:#6b8cff; color:white; border:0; border-radius:8px; padding:10px 14px; cursor:pointer; margin-right:8px; }
      pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>🌱 YourBud Dashboard</h1>
      <div class="card">
        <input id="msg" placeholder="Try: swarm build a task manager" />
        <div style="height:10px"></div>
        <button onclick="send()">Send</button>
        <button onclick="runDaily()">Run Daily Skills</button>
      </div>
      <div class="card">
        <h3>Response</h3>
        <pre id="out"></pre>
      </div>
      <div class="card">
        <h3>Diagnostics</h3>
        <button onclick="diag()">Run self-debug</button>
        <pre id="diag"></pre>
      </div>
      <div class="card">
        <h3>Highlights</h3>
        <button onclick="highlights()">Refresh highlights</button>
        <pre id="hl"></pre>
      </div>
    </div>

    <script>
      async function send() {
        const text = document.getElementById('msg').value;
        const res = await fetch('/api/chat', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text })});
        const data = await res.json();
        document.getElementById('out').textContent = data.output;
      }
      async function diag() {
        const res = await fetch('/api/diag');
        const data = await res.json();
        document.getElementById('diag').textContent = data.output;
      }
      async function highlights() {
        const res = await fetch('/api/highlights');
        const data = await res.json();
        document.getElementById('hl').textContent = data.output;
      }
      async function runDaily() {
        const res = await fetch('/api/daily-run', { method:'POST' });
        const data = await res.json();
        document.getElementById('out').textContent = data.output;
        await highlights();
      }
      highlights();
    </script>
  </body>
</html>`;

export async function startDashboard(agent: BudAgent, port = 8787): Promise<void> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(page);
      return;
    }

    if (req.method === "GET" && url === "/api/diag") {
      const output = await agent.diagnostics();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ output }));
      return;
    }

    if (req.method === "GET" && url === "/api/highlights") {
      const output = await agent.dashboardHighlights();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ output }));
      return;
    }

    if (req.method === "POST" && url === "/api/daily-run") {
      const output = await agent.handleUserInput("daily-run");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ output }));
      return;
    }

    if (req.method === "POST" && url === "/api/chat") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        try {
          const body = JSON.parse(raw || "{}");
          const output = await agent.handleUserInput(String(body.text || ""));
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ output }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  // eslint-disable-next-line no-console
  console.log(`Dashboard running at http://localhost:${port}`);
}
