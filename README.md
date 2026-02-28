# YourBud 🌱

A practical starter for a personal AI agent with:

- modular tool system
- persistent memory + retrieval scoring
- GPT-5.3 Codex LLM brain via OpenClaw adapter (subscription path)
- optional OpenAI-compatible API brain
- multi-agent mode (researcher / builder / critic)
- self-debug and self-improve commands
- web UI dashboard
- CLI runtime

## Quick start

```bash
npm install
cp .env.example .env
# default is subscription-style via OpenClaw bridge (BRAIN_PROVIDER=openclaw)
npm run dev
```

Web dashboard:

```bash
npm run dev:web
# open http://localhost:8787
```

## Commands

Core:

- `time`
- `echo hello`
- `shell pwd`
- `remember SKYX likes punchy examples`
- `memories`

Advanced:

- `swarm <task>` → runs researcher/builder/critic chain
- `self-debug` → runs diagnostics (includes LLM status/model)
- `self-improve` → writes an automatic reflection memory
- `recall <query>` → memory retrieval with ranking

## LLM brain configuration

Default (same style as Bud in OpenClaw runtime):

- `BRAIN_PROVIDER=openclaw`
- `OPENCLAW_AGENT_ID=main`

This calls:

- `openclaw agent --agent main --json ...`

Optional API mode:

- `BRAIN_PROVIDER=openai`
- `OPENAI_API_KEY=<your_key>`
- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `LLM_MODEL=openai-codex/gpt-5.3-codex`

Auto mode:

- `BRAIN_PROVIDER=auto` → uses OpenAI if API key exists, otherwise OpenClaw bridge.

Behavior:

- normal chat replies use LLM + memory context injection
- if chosen provider fails, agent falls back to rule-based replies
- command pathways (`swarm`, `self-debug`, `self-improve`, `recall`, tools) still work

## Why this architecture

Most agents fail in 4 places: memory drift, no observability, weak orchestration, and poor recovery.

YourBud addresses each one:

1. **Memory**: persistent + searchable + periodic reflections
2. **Observability**: diagnostics endpoint/command
3. **Orchestration**: explicit multi-agent role chain
4. **Recovery**: catches tool errors and continues

## Structure

```txt
src/
  core/
    agent.ts          # main loop + commands
    orchestrator.ts   # researcher/builder/critic chain
    planner.ts        # command planning
    memory.ts         # persistent memory + retrieval
    types.ts          # shared interfaces
  llm/
    brain.ts          # provider switch + fallback strategy
    openclaw.ts       # OpenClaw subscription-style bridge
    openai.ts         # OpenAI-compatible LLM adapter
  tools/
    local.ts          # local tool plugins
  web/
    server.ts         # dashboard + API
  index.ts            # app entry (CLI or Web)
```

## Next upgrades

- Real LLM adapters (OpenAI / Anthropic)
- Tool permission policies (allowlist + confirmation gates)
- Autonomous evaluation loop with regression tests
- Better long-term memory compaction strategy
- Background workers for parallel agent swarms
