---
name: orchestrate
description: Always-active model-orchestration protocol for Vibemesh-AI. Defines when to invoke opus 4.8 ultracode Workflow (THINK tasks: plan/audit/board/research/strategy) and when to deploy a Senior Lead Engineer agent to assign model tiers to implementation subtasks (BUILD tasks: implement/fix/refactor/build). Auto-applies to every prompt in this project — no slash command needed. Also embedded in CLAUDE.md.
---

# Vibemesh-AI Orchestration Protocol

This is the detailed reference for the always-active rules embedded in `CLAUDE.md`. Read that section for the compact form. This skill expands each rule with agent prompts, workflow skeletons, and decision examples.

---

## 1. Classification Matrix

Classify the request BEFORE doing anything else.

| Class | Trigger signals | Action |
|---|---|---|
| **THINK** | plan, audit, board, research, strategy, design, review, "what should we", "how should we", ultracode, workflow, deep-dive, investigate, analyze, compare | Run `Workflow` tool with `model: 'opus'` on all analysis agents. See §3. |
| **BUILD** | implement, build, fix, add, refactor, change, create, write, wire, migrate | Spawn SLE agent first (§2), then execute at the assigned tier. |
| **QUICK** | single-sentence question, single-file lookup, status check, yes/no, explain-this-line | No overhead. Proceed with current model. |

**Mixed signals** (e.g., "plan and implement"): run THINK phase first, then BUILD phase using the plan output.

**Ultracode keyword present**: always THINK class regardless of other signals.

---

## 2. Senior Lead Engineer (SLE) Agent

Deploy whenever a BUILD task spans multiple files, touches a critical subsystem, or is ambiguous in scope. Even inside a running ultracode workflow, run the SLE to assign per-subtask tiers.

### When to deploy

- Task changes ≥ 2 files
- Task touches core subsystems: `src/state/store.ts`, `server/providers.mjs`, `server/prompt.mjs`, `src/lib/params.ts`, `src/lib/openscad/`, `src/lib/storage.ts`
- Task involves security, auth, export, or the geometry pipeline
- Scope is ambiguous — SLE helps scope before executing

### SLE agent call (in a Workflow script)

```javascript
const sle = await agent(`
You are a Senior Lead Engineer on Vibemesh-AI, a TypeScript/React/Express AI-to-CAD app.

TASK: ${taskDescription}
FILES LIKELY AFFECTED: ${affectedFiles}

Assess complexity and blast radius. Return exactly one tier:

LIGHT  — mechanical, isolated, single function, test gen, doc update, trivial rename
         → haiku + effort:max

STANDARD — new component, multi-file feature, moderate refactor, new UI element, new API field
           → sonnet + effort:max

HEAVY  — core pipeline (params.ts / providers.mjs / store.ts / openscad/*), security-sensitive,
         cross-cutting architecture, major new system, anything that could break the geometry pipeline
         → opus + effort:high

Consider: (1) blast radius — how many files change; (2) risk — could it break the render or
generation pipeline; (3) novelty — is this pattern already established in the codebase.
`, {
  model: 'opus',
  effort: 'high',
  label: 'SLE: tier decision',
  schema: {
    type: 'object',
    properties: {
      tier: { type: 'string', enum: ['light', 'standard', 'heavy'] },
      rationale: { type: 'string', description: 'One sentence explaining the tier choice' },
      keyRisks: { type: 'array', items: { type: 'string' }, description: 'Top 2-3 risk factors' }
    },
    required: ['tier', 'rationale']
  }
})
```

### Tier → model/effort mapping

| Tier | `model` param | `effort` param | Typical use |
|---|---|---|---|
| `light` | `'haiku'` | `'max'` | Rename, single-function fix, test generation, docs update |
| `standard` | `'sonnet'` | `'max'` | New component, multi-file feature, new route, moderate refactor |
| `heavy` | `'opus'` | `'high'` | Core pipeline, security, cross-cutting architecture, major new system |

When running a direct `Agent()` call (not inside a Workflow), apply the tier mapping to `model` on the Agent call options.

---

## 3. Workflow Patterns for THINK Tasks

For all THINK-class requests, call the `Workflow` tool. Do not generate prose analysis inline — use the workflow harness so findings are adversarially verified and parallelized.

### Canonical THINK workflow skeleton

```javascript
export const meta = {
  name: 'think-task',
  description: 'Analysis / planning / audit for Vibemesh-AI',
  phases: [
    { title: 'Explore', detail: 'parallel discovery across dimensions', model: 'opus' },
    { title: 'Verify',  detail: 'adversarial cross-check of findings', model: 'opus' },
    { title: 'Synthesize', detail: 'ranked recommendations', model: 'opus' },
  ]
}

// Phase 1: parallel discovery
phase('Explore')
const findings = await parallel(DIMENSIONS.map(d => () =>
  agent(d.prompt, { model: 'opus', effort: 'high', label: `explore:${d.key}`, phase: 'Explore', schema: FINDINGS_SCHEMA })
))

// Phase 2: adversarial verify each real finding
phase('Verify')
const allFindings = findings.filter(Boolean).flatMap(r => r.items)
const verified = await pipeline(
  allFindings,
  f => agent(`Adversarially challenge: "${f.title}". Default to refuted=true if uncertain.`, {
    model: 'opus', effort: 'high', phase: 'Verify', schema: VERDICT_SCHEMA
  }),
  (v, f) => ({ ...f, real: !v.refuted, evidence: v.evidence })
)

// Phase 3: synthesize
phase('Synthesize')
const report = await agent(`Synthesize verified findings into a ranked action plan.`, {
  model: 'opus', effort: 'high', phase: 'Synthesize'
})
return { verified: verified.filter(f => f.real), report }
```

### When I cannot call Workflow

If the Workflow tool is blocked (permissions, context limits, or no explicit ultracode opt-in from the user), say:

> "This task calls for an opus 4.8 ultracode workflow. Please add **`ultracode`** to your prompt to authorize it, or approve the Workflow tool when prompted."

Do NOT proceed with inline analysis as a substitute — the point of the workflow is parallel adversarial verification that inline prose cannot replicate.

---

## 4. Mixed Plan-then-Build Tasks

For "plan and implement" requests:

1. Run a scoped THINK workflow to produce the plan.
2. Present the plan to the user.
3. Wait for user confirmation.
4. Run BUILD phase: spawn SLE → assign tiers → execute at assigned tiers.

This separation ensures the user sees and approves the plan before any code changes land.

---

## 5. Cost discipline within ultracode workflows

Even when the entire workflow runs under ultracode (all opus), use the SLE tier mapping for individual `agent()` calls inside `pipeline()`:

- Routine search/grep agents → `haiku` + `max`
- Feature implementation agents → `sonnet` + `max`  
- Architecture / security / core-pipeline agents → `opus` + `high`

The SLE's job inside a workflow is to prevent every sub-agent defaulting to opus when haiku would do fine.

---

## 6. Quick reference (copy-paste into a Workflow)

```javascript
// SLE tier → model/effort helper
const TIER_MODEL = {
  light:    { model: 'haiku',  effort: 'max'  },
  standard: { model: 'sonnet', effort: 'max'  },
  heavy:    { model: 'opus',   effort: 'high' },
}
```
