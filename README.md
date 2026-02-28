# YourBud 🌱

A practical starter for a personal AI agent with:

- modular tool system
- persistent memory + retrieval scoring
- GPT-5.3 Codex LLM brain via OpenClaw adapter (subscription path)
- optional OpenAI-compatible API brain
- multi-agent mode (researcher / builder / critic)
- self-debug and deep self-improve learning loop
- **daily skill acquisition pipeline** (curriculum + evaluator + spaced repetition + promotion/demotion)
- **Central Library** for knowledge, thinking, reflection, and self-awareness traces
- web UI dashboard with highlights
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

- `swarm <task>` → researcher/builder/critic chain
- `self-debug` → diagnostics (includes LLM + trainer + library status)
- `self-improve` → learning cycle and policy extraction
- `recall <query>` → memory retrieval with ranking
- `daily-run` → force manual daily skill training
- `daily-run auto` → run daily trainer only if not already run today
- `skill-status` → inspect curriculum progression and due dates
- `library catalog` → latest central library traces
- `library find <query>` → search central library
- `library add <kind> <title> :: <text>` → add a trace (`knowledge|thinking|reflection|self-awareness`)
- `dashboard-highlights` → summary for dashboard blocks

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

Learning automation:

- `AUTO_LEARN_INTERVAL=6` → run self-improve every N turns
- `AUTO_DAILY_RUN=true` → run daily skill trainer hook on first interaction each day

Behavior:

- normal chat replies use LLM + memory + central library context injection
- learned policies are injected into every reply prompt
- if chosen provider fails, agent falls back to rule-based replies
- command pathways (`swarm`, `self-debug`, `self-improve`, `recall`, `daily-run`, `library ...`, tools) still work

## Why this architecture

Most agents fail in 4 places: memory drift, no observability, weak orchestration, and poor recovery.

YourBud addresses each one:

1. **Memory**: persistent + searchable + periodic reflections
2. **Observability**: diagnostics endpoint/command + dashboard highlights
3. **Orchestration**: explicit multi-agent role chain
4. **Recovery**: catches tool errors and continues
5. **Learning**: daily curriculum with spaced repetition and promotion/demotion
6. **Meta-cognition**: central trace library for reflective retrieval

## Structure

```txt
src/
  core/
    agent.ts            # main loop + commands + daily hooks
    centralLibrary.ts   # catalog + retrieval for reflection traces
    learning.ts         # self-improvement + policy extraction
    orchestrator.ts     # researcher/builder/critic chain
    planner.ts          # command planning
    memory.ts           # persistent memory + retrieval
    skillTrainer.ts     # curriculum + evaluator + spaced repetition
    types.ts            # shared interfaces
  llm/
    brain.ts            # provider switch + fallback strategy
    openclaw.ts         # OpenClaw subscription-style bridge
    openai.ts           # OpenAI-compatible LLM adapter
  tools/
    local.ts            # local tool plugins
  web/
    server.ts           # dashboard + API
  index.ts              # app entry (CLI or Web)
```

## Next upgrades

- richer evaluator using task-grounded scoring rubrics
- trace clustering and long-term compaction in central library
- tool permission policies (allowlist + confirmation gates)
- autonomous evaluation loop with regression tests
- background workers for parallel agent swarms
