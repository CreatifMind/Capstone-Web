# PurityLoop AI — Codex Handoff

**Last updated:** 20 July 2026 (Malaysia time)  
**Purpose:** Transfer the project to a different Codex account without losing technical context, design decisions, known failures, or current constraints.

> Important: This handoff is based on the project conversations and screenshots available to the previous Codex account. The repository itself was not present in the handoff workspace, so the next Codex must inspect the actual code, Git history, environment configuration, and database schema before making changes. Where the current implementation is uncertain, this document says **verify** rather than guessing.

## 1. Project overview

**PurityLoop AI** is a final-year capstone project. It is an AI-powered waste detection and classification platform designed mainly for **Material Recovery Facility (MRF) managers**.

The intended high-level workflow is:

1. A user uploads waste media.
2. The frontend sends the upload to a FastAPI backend.
3. A custom YOLOv8 model detects and classifies the waste.
4. Uploads may be stored in Google Drive for traceability.
5. Detection records and related metadata are stored in Supabase.
6. The frontend shows the results for review and verification and provides history/log and analytics views.

Supported or planned input types discussed so far:

- Individual image files
- Multiple image files in one upload/batch
- MP4 video files, including multiple MP4 uploads
- ZIP archives containing images

The public frontend previously shared is:

**https://purityloop-ai.vercel.app/**

The next Codex should verify that this URL still points to the latest deployment.

## 2. Technology stack

### Frontend

- Next.js
- React
- TypeScript
- Hosted on Vercel
- Supports both light mode and dark mode

### Backend and AI

- FastAPI
- Python
- YOLOv8
- Custom-trained model, previously referred to as `best.pt`
- Backend was running from the developer's laptop and exposed publicly through ngrok

### Data and storage

- Supabase for the application database
- Google Drive for uploaded media storage/traceability

### Deployment status to verify

The last confirmed architecture was:

```text
Vercel frontend
    -> ngrok public URL
        -> FastAPI running on the developer's laptop
            -> YOLOv8 model
            -> Supabase
            -> Google Drive
```

Google Cloud Run and Hugging Face were evaluated as possible permanent backend hosts, especially for large-batch testing, but no completed migration was confirmed. Do not assume that either one is currently in production.

## 3. Intended users and product behavior

The primary user is an MRF manager or operator who needs to:

- Upload a large number of waste images or videos.
- Let the AI continue processing without being forced to remain on the Upload page.
- Inspect each AI result efficiently.
- Confirm the prediction, correct the category, reject the result, or route uncertain scans for manual review.
- Move between previous and next scans.
- Review historical detections and analytics.
- Retain traceability between the source file, AI result, user verification, and storage record.

The lecturer's scale test requires processing at least **10,000 images in one test** and measuring how long the model takes. Cost and feasibility for **10,000, 20,000, and 30,000 images** have also been discussed.

## 4. Core processing requirement

The most important functional requirement is that detection must be independent of the current browser page or React component lifecycle.

Example expected behavior:

1. The user uploads 10 images and starts detection.
2. The backend continues processing all 10 images.
3. While they are processing, the user can upload more images as another batch.
4. The user can navigate to Review, Analytics, History/Log, or another page.
5. Navigation must not cancel, pause, or lose either batch.
6. Progress and completed results should appear incrementally without waiting for the whole batch to finish.
7. Reloading or reopening the site should reconstruct job state from durable backend/database state.

The user also asked whether Batch A and Batch B can run at the same time. Parallel batches are desirable, but the concurrency design must respect available CPU/GPU memory, model safety, rate limits, database connections, and storage limits. Do not add unrestricted concurrency without measuring it.

### Architectural direction

The durable direction is a backend-owned job system, not a long-running operation owned by the Upload page. A reasonable architecture is:

```text
Upload accepted
    -> durable batch/job and item records created
        -> background worker claims pending items
            -> file retrieval/preparation
                -> YOLO inference
                    -> result and progress persisted
                        -> frontend reads/subscribes to durable state
```

This is an intended direction, not proof of the current implementation. The next Codex must trace the existing code before proposing schema or worker changes.

## 5. Processing problems previously reported

### A. Processing stops after navigation

One reported scenario:

- Seven images were uploaded.
- Detection completed for only three images.
- The user navigated to another page and later returned.
- Processing had stopped at three.
- Result and History showed only those three images.

The same general issue was reported for image/video upload or detection: the process worked while the relevant page stayed mounted, then stopped when the user navigated away.

Likely area to investigate: frontend-owned loops, abort signals, component cleanup, page-scoped polling that also drives work, lost in-memory queues, or backend endpoints that perform work only while a request remains active. This is only a hypothesis until verified from code and logs.

### B. Google Drive upload succeeds but detection does not start

A later and more serious regression was reported: images and videos were uploaded to Google Drive but did not continue into detection.

Trace the pipeline boundary carefully:

- Was the processing job/item created before or after Drive upload?
- Was the stored Drive file ID or URL committed to the expected field?
- Was the item moved from an uploading state to a pending/queued state?
- Did a worker claim it?
- Could the worker download/read the Drive file?
- Was an exception swallowed or recorded only in the terminal?
- Did the frontend treat Drive upload completion as overall completion?

### C. FastAPI job endpoint returns 500 after upstream disconnect

One concrete error was:

```text
GET /api/jobs/<job-id> -> 500 Internal Server Error
httpx.RemoteProtocolError: Server disconnected
[worker] job failed
```

The next Codex should determine which upstream call disconnected (for example, Drive, Supabase, model service, or another HTTP dependency). A job-status GET should not become a permanent 500 merely because one worker step failed. Failed item/job state should be persisted and returned as structured status; transient external calls need bounded retries, timeout handling, and useful error details.

### D. Excessive progress polling

The local FastAPI terminal repeatedly printed requests from `localhost:8000` for the latest processing-job progress. Some polling is expected, but it should not be coupled to doing the actual work or block page rendering.

Verify:

- Poll interval and whether duplicate components start duplicate intervals
- Interval cleanup on unmount
- Whether polling stops or backs off for terminal states
- Whether focus/reconnect triggers accidental polling bursts
- Whether navigation now waits for a backend polling cycle before showing cached UI
- Whether the app can use Supabase Realtime or a single shared job-state mechanism without adding unnecessary complexity

### E. A previous multiple-processing refactor caused regressions

A prior attempt to restructure multiple-image processing changed Supabase-related behavior and produced results the user did not want. The user then asked to restore the project to the version from before that work, and the restoration was reported as completed.

Consequences for the next Codex:

- Do not assume experimental job tables or code from that attempt are still present.
- Inspect `git status`, the active branch, recent commits, migrations, and the live Supabase schema before editing.
- Do not recreate the old refactor blindly.
- Explain why any database change is necessary before applying it.
- Never perform destructive schema cleanup or reset data without explicit approval and a rollback plan.

## 6. Supabase context

Supabase stores detection-related application data. A screenshot previously showed several tables or structures that appeared duplicated, and the user asked about tidying the database. That cleanup was not confirmed as completed and should not be mixed casually with the processing redesign.

Before modifying Supabase, the next Codex should produce an evidence-based map of:

- Existing tables, columns, primary keys, foreign keys, indexes, enums, functions, triggers, and RLS policies
- Which frontend and backend files read or write each table/column
- Which structures are genuinely duplicated versus serving different flows
- Current migration history and whether the live schema matches repository migrations
- Data retention requirements and whether existing records are needed for the capstone demonstration

Avoid renaming/dropping tables or columns just to make the schema look cleaner. First stabilize the desired processing lifecycle, then design a compatible migration if needed.

## 7. Exact scan count and page-loading regression

The UI contained a hard-coded or capped value of **200** where the user wanted the exact total number of uploaded scans.

A previous change modified an offset/pagination path. After that change:

- Navigating to another page appeared to wait for one backend cycle before content was shown.
- Some places still displayed 200.

Required behavior:

- Show the correct semantic count: clearly distinguish total uploaded scan items, completed detections, batches, videos, and extracted frames.
- Do not calculate the total from only the current page of results.
- Do not fetch every row just to count them if the database can return an exact count efficiently.
- Do not make normal page navigation wait for a processing-worker round.
- Preserve cached content while fresh data loads where appropriate.
- Search the entire codebase for literal `200`, pagination limits, default totals, and duplicated summary components before changing anything.

## 8. Review page redesign decisions

Recent design work focused on merging the Result and History/Log experience into a more useful **Review** page. The user repeatedly emphasized that these tasks should be frontend design changes only unless a logic change is explicitly authorized.

### Global UI constraints

- Support both light mode and dark mode.
- Design for a 16:9 desktop viewport.
- The main content should be usable at 100% browser zoom without clipping or requiring awkward scrolling.
- Preserve existing business logic, event handlers, API contracts, state flow, and backend behavior during UI-only tasks.
- Do not touch the website audit PDF during this design work.
- Do not make unrelated page or schema changes.
- Responsive behavior still matters; do not solve one screenshot by using fragile absolute positioning.

### Review page layout direction

The requested direction includes:

- Merge the previous Result and History content into the Review page.
- Make **Active Scan** use the full width of its parent panel.
- Place **Result** and **Recommended Action/Recommended Route** below Active Scan.
- Remove the **Review Note** section.
- Let **AI Prediction** and **Recommended Route** use the space freed by Review Note.
- Add a **Previous Scan** button to the left of **Verify Result**.
- Keep **Reject** and **Next Scan** actions available in the review workflow.
- Replace the label **Select Scan** with the current image/file name.

### Typography and visual hierarchy

The user wants important information slightly larger and secondary controls slightly smaller.

Examples of items that can use smaller text:

- Correct Category
- Previous Scan
- Verify Result
- Reject
- Next Scan

Do not shrink text so much that it becomes difficult to use. The hierarchy should come from a controlled type scale, spacing, weight, color, and grouping rather than many arbitrary font sizes.

### Specific defects visible in recent screenshots

These are concrete acceptance items, not general styling suggestions:

- Recommended Route was still blocked/clipped. It must remain fully visible at the target viewport and with realistic content lengths.
- The red **Contaminant** status should sit beside the category name rather than appearing detached.
- The **Estimated Weight** card had too much empty space between the value area and **Qty**. Tighten its internal layout.
- **AI Status: Confirmed Contaminant** was too close to a divider line. Add proper vertical breathing room.
- In the **Need Human Review** state, **Manual Audit Queue** looked as if it was floating above Recommended Route and the warning. It should be anchored within a clear card/section hierarchy.
- Labels and values should not collide, float between unrelated sections, or be clipped when text wraps.

### Review page states that must be tested

At minimum, render and inspect:

- Confirmed contaminant
- Need human review/manual audit
- Long image filename
- Long category name
- Long recommended route text
- No or unknown estimated weight
- Light mode and dark mode
- Sidebar open and closed
- Target 16:9 desktop viewport at 100% zoom
- A narrower responsive viewport

## 9. Upload page design context

The user also asked to refine the Upload page:

- Remove **Upload & Quality Tips**.
- Reconsider the **Batch Summary** placement; whether to relocate or remove it was not decided.
- Fit the important workflow within a 100% zoom desktop viewport.
- Consider the page with the sidebar closed.
- Preserve light and dark modes.

Do not permanently remove Batch Summary until its purpose and replacement are confirmed. First identify what decisions it helps the user make and whether the same information is already shown elsewhere.

## 10. Full website testing requested

The user previously requested a complete review of every page and a realistic simulation of the flow using:

- An image upload
- Multiple images
- An MP4 video
- Multiple MP4 videos
- A ZIP archive containing images

The test should cover more than successful upload. For each media type, verify:

1. File validation and upload progress
2. Storage/Google Drive result
3. Durable job/item creation
4. Detection starts automatically when expected
5. Processing continues after route navigation
6. Incremental progress and partial results
7. Refresh/reconnect behavior
8. Result persistence in Supabase
9. Review page rendering and controls
10. History/Log and Analytics consistency
11. Useful error and retry behavior
12. Duplicate submissions and idempotency

No completed end-to-end audit was confirmed in the prior conversation.

## 11. Current status: confirmed versus uncertain

| Area | Last known status | What the next Codex must do |
| --- | --- | --- |
| Public frontend | Deployed on Vercel | Verify URL, branch, and deployment commit |
| Backend hosting | Local FastAPI through ngrok | Verify whether this is still current |
| AI model | Custom YOLOv8 `best.pt` | Locate model loading/inference code and confirm model artifact |
| Supabase | Active application database | Inspect live schema and repository migrations before changes |
| Google Drive | Used for media storage/traceability | Trace upload-to-detection handoff |
| Multiple MP4 upload | Reported as working at one point | Re-test; detection continuation was still problematic |
| Cross-page background processing | Reported broken | Treat as a major functional blocker |
| Earlier processing refactor | Reportedly rolled back | Identify the exact Git/database checkpoint |
| Exact scan total | Still showed 200 in some UI | Find all count sources and fix semantics without blocking navigation |
| Review page | Under active visual refinement | Compare current code to the detailed UI acceptance items |
| Upload page | Refinement requested | Batch Summary decision still open |
| Cloud migration | Cloud Run/Hugging Face considered | No final platform decision confirmed |
| Large-scale test | Lecturer requires 10,000 images | Establish reproducible benchmark plan after pipeline stabilization |

## 12. Recommended continuation order

The latest conversations focused on Review page visual refinement, while the largest technical blocker is background processing across navigation. Confirm with the user which track should be worked on first. Do not combine both in one uncontrolled change.

### Track A — UI-only Review page work

1. Run the current site and reproduce the exact layout defects.
2. Identify the Review page component tree and relevant styles.
3. Record baseline screenshots for light/dark mode and sidebar open/closed.
4. Explain the root layout problem before editing.
5. Make the smallest frontend-only changes needed.
6. Test all states listed in Section 8.
7. Confirm no API, state, handler, route, database, or audit-PDF changes occurred.

### Track B — Processing reliability work

1. Inspect Git state and reproduce the failure with a small deterministic batch.
2. Trace one item from upload through storage, queue/job state, inference, persistence, and UI.
3. Prove exactly why navigation stops processing.
4. Propose the minimum durable fix and any schema impact before implementation.
5. Add bounded worker concurrency and recovery only after the lifecycle is correct.
6. Test page navigation, reload, two batches, partial failure, retry, and server restart.
7. Run progressively larger benchmarks before attempting 10,000 images.

### Track C — Count/navigation regression

This can be handled separately if it is isolated. Trace the total-count query and every component that renders the value before editing pagination or global data-loading behavior.

## 13. Non-negotiable working rules for the next Codex

1. **Inspect before fixing.** Reproduce the issue and explain the actual cause from code, runtime behavior, and logs.
2. **Do not guess the current state.** Prior attempts were rolled back and screenshots may show intermediate versions.
3. **Protect user work.** Start with `git status`, branch, remotes, and recent history. Do not reset, discard, overwrite, or revert unrelated changes.
4. **Keep scopes separate.** UI-only means no backend, API, database, storage, or business-logic changes.
5. **Support both themes.** Every visual change must be checked in light and dark mode.
6. **Preserve the audit PDF.** Do not modify it during the current frontend redesign.
7. **Avoid fragile CSS.** Do not use one-off absolute positioning or hard-coded offsets merely to match one screenshot.
8. **Do not make unapproved Supabase changes.** Explain the reason, migration, compatibility impact, backfill, rollback, and RLS consequences first.
9. **Do not expose secrets.** Never print or commit `.env` contents, Supabase service-role keys, Google credentials, ngrok tokens, or deployment secrets.
10. **Verify proportionally.** Use type-checking, linting, targeted tests, runtime flow checks, and screenshots as appropriate.
11. **Report exact files changed.** Also report tests run, results, and remaining limitations.
12. **Stop on ambiguity that changes architecture or data.** Ask before making a consequential choice.

## 14. First-session repository inspection checklist

The new account should begin with read-only inspection:

- Read `README`, `AGENTS.md`, setup docs, package manifests, Python dependency files, and deployment config.
- Run `git status --short`, identify the branch, remotes, and recent commit history.
- Locate frontend pages/routes and determine whether the app uses the Next.js App Router or Pages Router.
- Locate API client configuration and environment variable names.
- Locate FastAPI app startup, routers, job endpoints, worker startup, and model loading.
- Search for upload loops, `AbortController`, request cancellation, timers, polling hooks, route cleanup, and in-memory queues.
- Search for Google Drive upload/download functions and the exact transition into inference.
- Search for Supabase table names and every insert/update/select involved in a processing item.
- Search for hard-coded `200`, pagination defaults, offset logic, and count queries.
- Locate Review/Result/History/Log/Analytics components and current navigation routes.
- Identify light/dark theme tokens and responsive breakpoints.
- Find tests and determine what can run without production credentials.
- Compare repository migrations with the live Supabase schema before proposing changes.

The next Codex should then provide a short audit report stating:

- Current architecture as implemented
- Current Git/deployment state
- Reproduced failures
- Root cause evidence
- Proposed change scope
- Risks and rollback plan
- Acceptance tests

Only after that should it implement the selected task.

## 15. Items the user should transfer securely

To make the new account effective, provide or mount the following where appropriate:

- The full Git repository, preferably with `.git` history
- The active branch name and remote repository URL
- A redacted `.env.example` containing variable names only
- Secure access to Vercel, Supabase, Google Drive/Google Cloud, and ngrok where needed; do not paste secret values into chat
- Supabase migration files or an exported schema without production secrets
- The custom model artifact (`best.pt`) or documented secure location
- A few representative image, MP4, and ZIP test files
- The latest screenshots of the Review and Upload pages
- The exact backend error log for a currently failing job
- Any benchmark dataset manifest for the 10,000-image test
- The latest deployed commit SHA, if known

If any secret was previously pasted into a chat or committed, rotate it before continuing.

## 16. Questions that remain open

The next Codex should ask only when the answer changes the current task materially:

- Which task is first now: Review page UI, background processing, or the scan-count regression?
- What is the exact current Git commit/branch after the rollback?
- Is the backend still local through ngrok, or has deployment changed?
- Which Supabase tables are live and authoritative?
- Should Batch Summary be relocated, redesigned, or removed?
- What does “scan total” mean in each location: uploaded source files, extracted frames, detected items, or completed results?
- What concurrency target and hardware will be used for the 10,000-image benchmark?
- Should two batches truly execute inference simultaneously, or should they remain independently queued while a controlled worker pool schedules them?

## 17. Ready-to-paste opening prompt for the new Codex account

Paste this prompt after attaching/mounting the repository and this handoff:

> You are continuing my final-year capstone project, **PurityLoop AI**. Read `PurityLoop_AI_Codex_Handoff.md` completely, then inspect the actual repository before changing anything. Start with Git status/branch/history, project instructions, frontend/backend structure, environment variable names, Supabase usage, Google Drive integration, and the processing pipeline. Treat the handoff as historical context, but treat the repository and reproducible runtime behavior as the source of truth.
>
> First give me a concise evidence-based current-state audit: implemented architecture, relevant files, current job lifecycle, likely cause of the selected issue, risks, and a minimal proposed scope. Do not edit files until you have explained the cause. Do not expose secrets. Preserve all unrelated work.
>
> If I select a frontend-only task, do not change logic, APIs, database code, backend code, routes, event handlers, or the website audit PDF. Preserve both light and dark modes and validate a 16:9 desktop viewport at 100% zoom. If I select processing work, trace one upload end to end before proposing schema or worker changes, and do not change Supabase without explaining the migration and rollback plan.
>
> After I approve or explicitly ask you to proceed, implement only the selected scope, test it, inspect the result visually or through runtime logs as appropriate, and report exact files changed, tests run, results, and anything still unresolved.

## 18. Short project summary

PurityLoop AI is a Next.js/React/TypeScript and FastAPI/YOLOv8 capstone platform for waste detection and verification, with Supabase for application data, Google Drive for media traceability, Vercel for the frontend, and historically ngrok plus a laptop-hosted backend. The two major active areas are (1) a precise, theme-safe Review page redesign and (2) reliable backend-owned processing that continues across navigation, supports large/multiple batches, persists progress, and survives failures. Earlier processing and pagination changes caused regressions, so the next Codex must inspect the current Git and live schema, reproduce issues, and make tightly scoped changes rather than assuming the historical design is already implemented.
