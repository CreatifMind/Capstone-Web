# Graph Report - .  (2026-07-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 494 nodes · 714 edges · 84 communities (69 shown, 15 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `281dcd27`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- script.js
- api.ts
- main.py
- compilerOptions
- theme.js
- PageHtml.tsx
- package.json
- devDependencies
- polyfills.js
- layout.ts
- page.ts
- page.ts
- page.ts
- polyfills.js
- webpack.js
- vercel.json
- ProgressBar.tsx
- layout.tsx
- BoundingBoxOverlay.tsx
- KpiCard.tsx
- extract_frames.py
- search_all_overlap.py
- package.json
- package.json
- package.json
- package.json
- next.config.mjs
- next-env.d.ts
- restart_tunnel.sh
- tailwind.config.ts

## God Nodes (most connected - your core abstractions)
1. `initPurityLoopTheme()` - 18 edges
2. `renderMaterialDetail()` - 16 edges
3. `compilerOptions` - 16 edges
4. `plSafeArray()` - 14 edges
5. `plGetAnalyticsSummary()` - 13 edges
6. `initAnalyticsCharts()` - 12 edges
7. `safeArray()` - 11 edges
8. `plGetScanResults()` - 11 edges
9. `initPurityLoopApp()` - 11 edges
10. `predict()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `DetectedMaterialsPanel()` --calls--> `safeArray()`  [EXTRACTED]
  components/DetectedMaterialsPanel.tsx → lib/utils.ts
- `normalizeDetectedMaterials()` --calls--> `safeArray()`  [EXTRACTED]
  lib/api.ts → lib/utils.ts
- `normalizeScanResults()` --calls--> `safeArray()`  [EXTRACTED]
  lib/api.ts → lib/utils.ts
- `attachMaterialsToScans()` --calls--> `safeArray()`  [EXTRACTED]
  lib/api.ts → lib/utils.ts
- `saveScanResult()` --calls--> `safeArray()`  [EXTRACTED]
  lib/api.ts → lib/utils.ts

## Import Cycles
- None detected.

## Communities (84 total, 15 thin omitted)

### Community 0 - "script.js"
Cohesion: 0.07
Nodes (77): activateDetailPanel(), animateProgressBars(), detectionResults, detectWasteTypeFromFileName(), drawEmptyAnalyticsCharts(), drawEmptyChart(), drawFallbackAnalyticsCharts(), drawFallbackBars() (+69 more)

### Community 1 - "api.ts"
Cohesion: 0.14
Nodes (26): DetectedMaterialsPanel(), attachMaterialsToScans(), canUseSupabase(), getAnalyticsData(), getLatestScanResult(), getScanLogs(), getScanResultById(), getScansWithMaterials() (+18 more)

### Community 2 - "main.py"
Cohesion: 0.15
Nodes (27): config_path(), get_model(), google_auth(), google_callback(), google_credentials_path(), google_oauth_client_path(), google_oauth_state_path(), google_oauth_token_path() (+19 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (28): ./*, dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 4 - "theme.js"
Cohesion: 0.15
Nodes (27): animateProgressBars(), applyPlTheme(), bindOverlayLocks(), bindSettingsThresholdSliders(), closeAppSidebar(), closeLandingMenu(), initActiveNav(), initAOS() (+19 more)

### Community 6 - "package.json"
Cohesion: 0.10
Nodes (19): next, dependencies, next, puppeteer, react, react-dom, @supabase/supabase-js, name (+11 more)

### Community 7 - "devDependencies"
Cohesion: 0.11
Nodes (19): autoprefixer, eslint, eslint-config-next, devDependencies, autoprefixer, eslint, eslint-config-next, postcss (+11 more)

### Community 8 - "polyfills.js"
Cohesion: 0.22
Nodes (9): e(), eb(), ib(), nb(), ob(), rb(), sb(), t() (+1 more)

### Community 9 - "layout.ts"
Cohesion: 0.12
Nodes (14): Diff, FirstArg, LayoutProps, MaybeField, Negative, NonNegative, Numeric, OmitWithTag (+6 more)

### Community 10 - "page.ts"
Cohesion: 0.12
Nodes (14): Diff, FirstArg, LayoutProps, MaybeField, Negative, NonNegative, Numeric, OmitWithTag (+6 more)

### Community 11 - "page.ts"
Cohesion: 0.12
Nodes (14): Diff, FirstArg, LayoutProps, MaybeField, Negative, NonNegative, Numeric, OmitWithTag (+6 more)

### Community 12 - "page.ts"
Cohesion: 0.12
Nodes (14): Diff, FirstArg, LayoutProps, MaybeField, Negative, NonNegative, Numeric, OmitWithTag (+6 more)

### Community 13 - "polyfills.js"
Cohesion: 0.22
Nodes (9): e(), eb(), ib(), nb(), ob(), rb(), sb(), t() (+1 more)

### Community 14 - "webpack.js"
Cohesion: 0.32
Nodes (12): applyHandler(), applyInvalidatedModules(), createModuleHotObject(), createRequire(), hotApply(), hotCheck(), internalApply(), setStatus() (+4 more)

### Community 16 - "vercel.json"
Cohesion: 0.25
Nodes (7): buildCommand, cleanUrls, framework, installCommand, outputDirectory, $schema, trailingSlash

## Knowledge Gaps
- **124 isolated node(s):** `type`, `TEntry`, `PageParams`, `PageProps`, `LayoutProps` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `renderMaterialDetail()` (e.g. with `plIsContaminatedMaterial()` and `plIsRecyclable()`) actually correct?**
  _`renderMaterialDetail()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `plGetAnalyticsSummary()` (e.g. with `plIsContaminatedMaterial()` and `plIsRecyclable()`) actually correct?**
  _`plGetAnalyticsSummary()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `type`, `TEntry`, `PageParams` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `script.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06504065040650407 - nodes in this community are weakly interconnected._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13968253968253969 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._