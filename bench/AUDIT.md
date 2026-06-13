# Feature Audit — image-to-CAD accuracy pipeline (2026-06-11)
Team: Senior QA Lead (live, 75 min, zero paid tokens) + Senior Product Owner (code/copy).
Refine-pass experiment run beforehand by orchestrator (ground-truth press, kimi, 3 passes).

## Refine-pass convergence (ground truth 180.4×210×82mm)
| Pass | Dims | Height err | Notes |
|---|---|---|---|
| 0 | 310×180×152 | +85% | plate dia exact from pass 0; part convention adopted unprompted |
| 1 | 347×180×138 | +68% | found: missing arm slot, pivot pin, stubby arm (overcorrected) |
| 2 | 366×180×130 | +59% | found: tongue-between-ears hinge architecture |
| 3 | 389×180×116 | +42% | found: strap-form arm, pivot height |
Verdict: feature fidelity converges every pass; height converges slowly; depth axis DIVERGES
(310→389 vs 210). Root causes: snapshot camera angle changes between passes (auto-fit);
no absolute scale anchor in refine message; perspective depth ambiguity.

## Findings (merged, deduped, severity-sorted)
| Sev | Lens | Finding | Where |
|---|---|---|---|
| P1 | QA+PO | ALL PLATES silently skips failed plates — partial export looks successful, no Draft fallback | store.ts:410 |
| P1 | QA | In-flight render lands in wrong project; phantom model + enabled STL export on empty project; StrictMode double-compile variant | store.ts:107,221 |
| P1 | PO | Printing advice has zero safety guardrails (food-contact, load-bearing, layer orientation) — flagship journey is a *broken bracket* | prompt.mjs |
| P1 | PO | Preview quality (incl. silent Draft fallback) bakes into exported STL with no confirmation | TopBar/store |
| P2 | QA | REFINE offered when latest code failed to render — snapshots stale geometry as "current model" | ChatPanel.tsx:39 |
| P2 | QA | Old same-named param values hijack newly pasted code (part="base" overrides new default) | store.ts:329 |
| P2 | PO | "Plate" misnomer vs slicer mental model; part/plate/piece/ALL/ASSEMBLY inconsistency | viewport/topbar |
| P2 | PO | Split button gated on !partParam — vanishes when an already-split piece still exceeds bed | Viewport.tsx:126 |
| P2 | PO | No rollback: every assistant msg stores code but "MODEL CODE UPDATED" chip is inert; bad refine pass unrecoverable | ChatPanel |
| P2 | PO | Canned protocol text (enum `part`, "complete program") rendered as the USER's own chat bubbles | store/ChatPanel |
| P2 | PO | Image-only projects all named "Model the part shown in the att…" | store.ts:282 |
| P2 | PO | Cold start 100% text — image pipeline (the differentiator) undiscoverable | EmptyState |
| P2 | PO | Vision warning doesn't block SEND on non-vision engine | ChatPanel |
| P3 | QA | Drop overlay invites then silently swallows non-image files | ChatPanel.tsx:70,105 |
| P3 | QA | THREE.Clock deprecation ×4 console noise | three/drei |
| P3 | PO | ⟲ glyph means refine + reset + re-scan; icon language unlearnable | various |
| P3 | PO | No product spec; bench REPORT.md is the only behavioral contract | docs |

QA PASSED: examples, sliders, quality presets (288↔2,600 tris), valid exports, all 3 image
routes + cap + thumbnails, image-only send, refine gating + JPEG snapshot, STOP→resend (role
merge), double-send guard, slider-spam coalescing, plates bar + per-plate dims + assembly
suppression, watchdog→Draft fallback chip, full persistence, clean API errors, console clean.

## Self-evaluation (orchestrator, as area lead)
- Discrepancy detection: A — every pass surfaced real, progressively finer issues; none hallucinated.
- Feature convergence: B+ — slot, pin, hinge architecture, strap arm all materialized by pass 3.
- Dimensional convergence: C− — one axis diverged; loop lacks camera consistency + scale anchoring.
- Loop robustness: B− — stale-geometry gating hole (QA), no rollback (PO).
- Pipeline overall: B — solid plumbing, zero P0s, but 4 P1s sit exactly on the new surfaces.

## Fix pass (same day) — all 17 findings + 2 refine root causes addressed
P1: ALL PARTS partial export now loud (alert + HUD note, Draft retry) ✓verified · stale-render
race guarded by project-id check ✓verified · safety caveats mandatory in prompt (load/food/heat/child) ·
Draft-quality export offers Fine re-render ✓verified.
P2: refine gated on successful compile ✓verified · param carry-over validated (default equality +
enum membership + range) ✓verified · "parts" terminology unified · split button now offers
"split further" on oversized pieces · MODEL CODE UPDATED chips restore versions ✓verified ·
app-initiated prompts render as action chips (REFINE PASS / SPLIT REQUEST / FIX REQUEST / IMAGE
PROMPT) ✓verified · image-only projects named from AI reply · empty-state photo tile ·
vision-mismatch blocks SEND.
P3: drop overlay gated to image drags + reject notices ✓verified · glyphs deduped (⇄/↺/↻/⟳) ·
spec written (docs/SPEC.md) · THREE.Clock noise = upstream, wontfix.
Refine accuracy: canonical fixed-pose snapshot (CaptureRig) + measured-bbox scale anchor in the
refine message ✓verified live — height converged 152→104 in ONE pass (old loop: 3 passes for
152→116) and the AI now reasons in anchored mm. Residual: depth-axis misread of single
perspective references (model perception limit) — documented mitigation: provide 2-3 views.
