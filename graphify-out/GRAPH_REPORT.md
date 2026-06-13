# Graph Report - .  (2026-06-12)

## Corpus Check
- 47 files · ~111,774 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 404 nodes · 678 edges · 24 communities (17 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.87)
- Token cost: 0 input · 60,869 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Dialogs & Icons|UI Dialogs & Icons]]
- [[_COMMUNITY_Chat & Engine UI Panels|Chat & Engine UI Panels]]
- [[_COMMUNITY_Param Parsing & Client Lib|Param Parsing & Client Lib]]
- [[_COMMUNITY_Docs Audits & Benchmarks|Docs: Audits & Benchmarks]]
- [[_COMMUNITY_Bench Voxel-IoU Compare|Bench Voxel-IoU Compare]]
- [[_COMMUNITY_Express Server & Providers|Express Server & Providers]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_TS Config (app)|TS Config (app)]]
- [[_COMMUNITY_TS Config (node)|TS Config (node)]]
- [[_COMMUNITY_Dev Deps & ESLint|Dev Deps & ESLint]]
- [[_COMMUNITY_Bench Rerun Script|Bench Rerun Script]]
- [[_COMMUNITY_OpenSCAD Worker Client|OpenSCAD Worker Client]]
- [[_COMMUNITY_3MF Export|3MF Export]]
- [[_COMMUNITY_OpenSCAD WASM Worker|OpenSCAD WASM Worker]]
- [[_COMMUNITY_VSCode Launch Config|VSCode Launch Config]]
- [[_COMMUNITY_Claude Settings|Claude Settings]]
- [[_COMMUNITY_TS Config (root)|TS Config (root)]]
- [[_COMMUNITY_Live Parameter Concept|Live Parameter Concept]]
- [[_COMMUNITY_Viewport Camera & Placement|Viewport Camera & Placement]]
- [[_COMMUNITY_Print-bed Preview|Print-bed Preview]]
- [[_COMMUNITY_Versioning  Rollback|Versioning / Rollback]]

## God Nodes (most connected - your core abstractions)
1. `useStore` - 19 edges
2. `compilerOptions` - 17 edges
3. `compilerOptions` - 16 edges
4. `useUi` - 15 edges
5. `VibeState` - 10 edges
6. `compareTriangles()` - 9 edges
7. `providerStatus()` - 9 edges
8. `testEngine()` - 9 edges
9. `scripts` - 8 edges
10. `runEngine()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Feature Audit (image-to-CAD accuracy)` --conceptually_related_to--> `Multi-part convention (part enum)`  [INFERRED]
  bench/AUDIT.md → docs/SPEC.md
- `Safety caveats (prompt-enforced)` --conceptually_related_to--> `Feature Audit (image-to-CAD accuracy)`  [INFERRED]
  docs/SPEC.md → bench/AUDIT.md
- `Image-as-prompt surface (spec)` --references--> `Image as prompt`  [INFERRED]
  docs/SPEC.md → README.md
- `Gold-reference voxel-IoU scoring` --shares_data_with--> `In-browser openscad-wasm Web Worker`  [INFERRED]
  bench/REPORT.md → README.md
- `Surface quality presets (spec)` --references--> `Surface quality presets`  [INFERRED]
  docs/SPEC.md → README.md

## Hyperedges (group relationships)
- **AI engines dispatched over one SSE protocol** — readme_engine_claude_code, readme_engine_anthropic, readme_engine_kimi, readme_engine_local, readme_sse_protocol [EXTRACTED 1.00]
- **Browser geometry pipeline (params to export)** — readme_live_parameters, readme_openscad_wasm_worker, readme_quality_presets, readme_export_formats [INFERRED 0.85]
- **Engine benchmark across Claude/Kimi/Local** — bench_report_engine_scores, readme_engine_claude_code, readme_engine_kimi, readme_engine_local [EXTRACTED 1.00]

## Communities (24 total, 7 thin omitted)

### Community 0 - "UI Dialogs & Icons"
Cohesion: 0.06
Nodes (44): ConfirmDialog(), CustomBedDialog(), useEscape(), IconBed(), IconBulb(), IconCamera(), IconCenter(), IconCheck() (+36 more)

### Community 1 - "Chat & Engine UI Panels"
Cohesion: 0.07
Nodes (37): ChatPanel(), EmptyState(), EngineRow(), EnginesModal(), GROUPS, HelpModal(), IconChevronDown(), IconChevronUp() (+29 more)

### Community 2 - "Param Parsing & Client Lib"
Cohesion: 0.08
Nodes (39): HealthInfo, Example, applyValuesToCode(), buildDefines(), buildParam(), escapeRe(), extractScadBlock(), parseOptions() (+31 more)

### Community 3 - "Docs: Audits & Benchmarks"
Cohesion: 0.06
Nodes (42): Feature Audit (image-to-CAD accuracy), Loud partial-export fix (P1), Refine-pass convergence experiment, Stale-render race fix (P1), E2E & Model Benchmark Report, Engine benchmark scores (Claude/Kimi/Local), Gold-reference voxel-IoU scoring, Recommended draft-Kimi / finalize-Claude workflow (+34 more)

### Community 4 - "Bench Voxel-IoU Compare"
Cohesion: 0.08
Nodes (36): bboxOf(), compareTriangles(), compileScad(), goldCache, goldExistsFor(), [goldFile, candFile], goldTrisFor(), loadTris() (+28 more)

### Community 5 - "Express Server & Providers"
Cohesion: 0.11
Nodes (32): abort, app, __dirname, dist, PORT, agentPromptFromMessages(), anthropicModel(), applyRuntimeSetting() (+24 more)

### Community 6 - "Package Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, @anthropic-ai/claude-agent-sdk, @anthropic-ai/sdk, dotenv, express, fflate, openscad-wasm, react (+17 more)

### Community 7 - "TS Config (app)"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 8 - "TS Config (node)"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 9 - "Dev Deps & ESLint"
Cohesion: 0.12
Nodes (17): devDependencies, concurrently, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tsx (+9 more)

### Community 10 - "Bench Rerun Script"
Cohesion: 0.18
Nodes (6): code, dirName, messages, p, ROOT, t1

### Community 11 - "OpenSCAD Worker Client"
Cohesion: 0.31
Nodes (4): openscad, OpenScadEngine, PendingJob, CompileResult

### Community 12 - "3MF Export"
Cohesion: 0.50
Nodes (3): buildThreeMF(), fmt(), indexMesh()

### Community 13 - "OpenSCAD WASM Worker"
Cohesion: 0.50
Nodes (4): pickError(), render(), RenderRequest, RenderResponse

## Knowledge Gaps
- **140 isolated node(s):** `tsBuildInfoFile`, `target`, `lib`, `module`, `types` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useStore` connect `Chat & Engine UI Panels` to `UI Dialogs & Icons`, `Param Parsing & Client Lib`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Deps & ESLint` to `Package Dependencies`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `CompileResult` connect `OpenSCAD Worker Client` to `Param Parsing & Client Lib`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `tsBuildInfoFile`, `target`, `lib` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Dialogs & Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.06453634085213032 - nodes in this community are weakly interconnected._
- **Should `Chat & Engine UI Panels` be split into smaller, more focused modules?**
  _Cohesion score 0.07312925170068027 - nodes in this community are weakly interconnected._
- **Should `Param Parsing & Client Lib` be split into smaller, more focused modules?**
  _Cohesion score 0.07890070921985816 - nodes in this community are weakly interconnected._