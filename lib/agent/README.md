# `lib/agent/` — AI-Native Runtime

Sprint 1 deliverable. The minimal viable foundation for the V3 agentic
architecture.

## Layout

```
lib/agent/
├── types.ts                 Core types: CapabilityTool, AgentDefinition, AssistantBlock
├── registry.ts              Tool registration + executeTool with audit logging
├── anthropic-adapter.ts     Convert CapabilityTool → Anthropic tool_use schema
├── README.md                You are here
├── agents/
│   └── logic.ts             First agent — landlord-side screening (Sprint 1-3)
└── tools/
    ├── index.ts             Barrel — importing it registers all tools
    ├── classify-files.ts          (stub, full impl Sprint 2)
    ├── run-pdf-forensics.ts       (live — wraps lib/forensics/runForensics)
    ├── lookup-corp-registry.ts    (live — search_corp_registry RPC)
    ├── lookup-bn.ts               (live — lookup_corp_by_bn RPC)
    ├── validate-id-numbers.ts     (live — pure-local SIN/DL/OHIP)
    ├── search-canlii.ts           (stub, full impl Sprint 2)
    ├── search-ontario-portal.ts   (stub, full impl Sprint 2)
    └── compute-screening-score.ts (live — deterministic v3 scoring)
```

## Sprint 1 status

✅ Tool registry + audit logging
✅ Anthropic-adapter for converting tools to function-calling schema
✅ Supabase migration `agent_runtime_v1` applied (5 new tables)
✅ Reference tool implementation (classify_files)
✅ 4 tools fully wired:
   - `run_pdf_forensics` — calls existing forensics pipeline
   - `lookup_corp_registry` — direct RPC
   - `lookup_bn` — direct RPC
   - `validate_id_numbers` — pure-local
   - `compute_screening_score` — deterministic v3 scoring (no AI)
✅ Logic agent definition with bilingual system prompt + workflow

⏳ Pending (Sprint 2):
- Inline implementations of `classify_files`, `search_canlii`,
  `search_ontario_portal` (currently stubs that return empty / call legacy)
- `lib/agent/loop.ts` — the agentic loop with SSE streaming
- `lib/agent/memory.ts` — user_facts recall + accumulation
- `app/api/agent/chat/route.ts` — entry point
- `app/chat/page.tsx` — frontend chat UI

## How to add a new tool

1. Create `lib/agent/tools/your-tool-name.ts` following any existing tool's pattern
2. Add the import to `tools/index.ts`
3. If the agent should be allowed to call it, add the name to that agent's
   `toolNames` array (e.g. `agents/logic.ts`)
4. Update `docs/agents/<agent>.md` with the new tool

## Audit trail

Every tool call writes a `tool_executions` row. Schema:
- conversation_id (nullable for offline / cron use)
- tool_name + tool_version
- input (jsonb, capped at 32KB)
- output (jsonb, capped at 32KB)
- status: success | error | timeout
- duration_ms

This is **mandatory for compliance** (PIPEDA + Ontario Human Rights). Don't
skip the audit row even when the tool errors.

## Reference: ADR-002

We chose to write a custom ~200-line agent loop instead of LangChain or
Claude Agent SDK. Reasons + re-evaluation triggers in
[`docs/adr/002-custom-agent-loop.md`](../../docs/adr/002-custom-agent-loop.md).
