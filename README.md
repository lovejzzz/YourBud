# YourBud 🌱

A clean starter for a personal AI agent with:

- modular tool system
- lightweight local memory store
- simple planning loop
- CLI chat runtime

## Quick start

```bash
npm install
npm run dev
```

Then try:

- `time`
- `echo hello`
- `shell pwd`
- `remember SKYX likes punchy examples`
- `memories`

## Why this repo exists

This is a foundation for a "dream AI partner" architecture:

1. Clear mission + behavior config
2. Memory that persists between runs
3. Tool plugins with permission control
4. Planner/executor separation
5. Easy upgrade path to real LLM orchestration

## Next upgrades (suggested)

- LLM adapter (`OpenAI` / `Anthropic`)
- memory scoring + retrieval ranking
- tool safety policies (allowlist + dry-run)
- web UI dashboard
- multi-agent orchestration (researcher / builder / critic)

## Structure

```txt
src/
  core/
    agent.ts      # main loop
    planner.ts    # command planning
    memory.ts     # persistent memory
    types.ts      # shared interfaces
  tools/
    local.ts      # built-in local tools
```
