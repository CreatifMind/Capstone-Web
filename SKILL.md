---
name: ui-ux-pro-max
version: 2.5.0
source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
platform: Antigravity IDE
description: >
  UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color
  palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart
  types across 10 stacks. Actions: plan, build, create, design, implement,
  review, fix, improve, optimize, enhance, refactor, and check UI/UX code.
---

# UI/UX Pro Max — Design Intelligence Skill

Comprehensive design guide for web and mobile applications. Contains 50+ UI
styles, 161 color palettes, 57 font pairings, 161 product types with reasoning
rules, 99 UX guidelines, and 25 chart types across 10 technology stacks.

---

## When to Apply This Skill

**Must use** when the task involves:
- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for UX, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand)

**Recommended** when:
- UI looks "not professional enough" but the reason is unclear
- Pre-launch UI quality optimization
- Building design systems or reusable component libraries

**Skip** for: pure backend logic, API/database-only work, infrastructure/DevOps.

**Decision criteria:** If the task changes how a feature *looks, feels, moves, or
is interacted with*, this Skill must be used.

---

## Rule Categories by Priority

| Priority | Category            | Impact   | Key Checks                                             | Anti-Patterns to Avoid                              |
|----------|---------------------|----------|--------------------------------------------------------|-----------------------------------------------------|
| 1        | Accessibility       | CRITICAL | Contrast 4.5:1, Alt text, Keyboard nav, ARIA labels    | Removing focus rings, icon-only buttons without labels |
| 2        | Touch & Interaction | CRITICAL | Min 44×44px targets, 8px+ spacing, loading feedback   | Hover-only interactions, 0ms state changes          |
| 3        | Performance         | HIGH     | WebP/AVIF, lazy loading, reserve space (CLS < 0.1)    | Layout thrashing, Cumulative Layout Shift           |
| 4        | Style Selection     | HIGH     | Match product type, consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic, emoji as icons          |
| 5        | Layout & Responsive | HIGH     | Mobile-first, viewport meta, no horizontal scroll     | Fixed px widths, disable-zoom, overflow-x           |
| 6        | Typography & Color  | MEDIUM   | Base 16px, line-height 1.5, semantic color tokens     | Text < 12px, gray-on-gray, raw hex in components   |
| 7        | Animation           | MEDIUM   | 150–300ms, transform/opacity only, motion has meaning | Decorative animation, animating width/height        |
| 8        | Forms & Feedback    | MEDIUM   | Visible labels, error near field, submit feedback     | Placeholder-only labels, errors at top only         |
| 9        | Navigation          | HIGH     | Predictable back, bottom nav ≤5, deep linking         | Overloaded nav, broken back, no deep links          |
| 10       | Charts & Data       | LOW      | Legends, tooltips, accessible colors                  | Color-only data encoding                            |

---

## Quick Reference Checklist

### §1 — Accessibility (CRITICAL)

- `color-contrast` — Minimum 4.5:1 for normal text, 3:1 for large text
- `focus-states` — Visible focus rings on every interactive element (2–4px outline)
- `alt-text` — Descriptive alt text for all meaningful images
- `aria-labels` — `aria-label` for icon-only buttons
- `keyboard-nav` — Tab order matches visual order; full keyboard support
- `form-labels` — Always use `<label for="...">`, never placeholder-only
- `skip-links` — "Skip to main content" for keyboard users
- `heading-hierarchy` — Sequential h1→h2→h3, never skip levels
- `color-not-only` — Don't convey info by color alone; pair with icon or text
- `reduced-motion` — Wrap all animations in `@media (prefers-reduced-motion: no-preference)`

### §2 — Touch & Interaction (CRITICAL)

- `touch-target-size` — Min 44×44px (or 48×48dp on Android); expand hitSlop if visual is smaller
- `touch-spacing` — Minimum 8px gap between adjacent touch targets
- `hover-vs-tap` — Primary interactions must work with click/tap, not hover alone
- `loading-buttons` — Disable button during async ops; show spinner or progress text
- `error-feedback` — Show error inline, near the element that caused it
- `cursor-pointer` — All clickable elements must have `cursor: pointer`
- `tap-delay` — Use `touch-action: manipulation` to eliminate 300ms delay

### §3 — Performance (HIGH)

- `image-optimization` — Use WebP/AVIF, `srcset`, `loading="lazy"` for below-fold images
- `image-dimension` — Declare `width`/`height` or `aspect-ratio` to prevent layout shift
- `font-loading` — `font-display: swap` to avoid invisible text (FOIT)
- `font-preload` — Preload only the critical font weights used above the fold
- `critical-css` — Inline critical above-the-fold CSS or load it first
- `bundle-splitting` — Split code by route to reduce initial TTI
- `virtualize-lists` — Virtualize any list with 50+ items
- `progressive-loading` — Use skeleton screens for operations > 1s, not just spinners
- `debounce-throttle` — Debounce scroll, resize, and input handlers
- `content-jumping` — Reserve space for async content; never allow CLS on load

### §4 — Style Selection (HIGH)

- `style-match` — Choose a style that matches the product category:
  - **Dashboards / admin panels** → clean flat, subtle shadows, structured grids
  - **SaaS / B2B tools** → minimalism or glassmorphism, professional color palette
  - **AI / tech products** → dark mode, glassmorphism, monospace accents
  - **Healthcare / sustainability** → soft greens, clean minimalism, high contrast
  - **E-commerce** → bento grid or card-heavy layouts, warm conversion palettes
- `consistency` — One style across all pages; never mix flat and skeuomorphic
- `no-emoji-icons` — Use SVG icon libraries (Lucide, Heroicons, Feather); never emojis as UI icons
- `effects-match-style` — Shadows, border-radius, blur all aligned with the chosen style
- `dark-mode-pairing` — Design both light/dark variants together
- `icon-style-consistent` — One icon set, one stroke width, across the whole product
- `primary-action` — One primary CTA per screen; secondary actions visually subordinate

### §5 — Layout & Responsive (HIGH)

- `viewport-meta` — `<meta name="viewport" content="width=device-width, initial-scale=1">`; never disable zoom
- `mobile-first` — Write CSS for smallest screen first, then add breakpoints upward
- `breakpoint-consistency` — Use a systematic set: 375 / 768 / 1024 / 1440
- `readable-font-size` — Minimum 16px body text on mobile (avoids iOS auto-zoom)
- `line-length-control` — 35–60 chars/line on mobile; 60–75 on desktop
- `horizontal-scroll` — Never allow horizontal scroll on mobile
- `spacing-scale` — Use a 4pt / 8dp incremental spacing system throughout
- `container-width` — Max-width for desktop content: `max-w-6xl` or `max-w-7xl`
- `z-index-management` — Define a layered scale: 0 / 10 / 20 / 40 / 100 / 1000
- `fixed-element-offset` — Fixed headers/footers must add padding to prevent content overlap
- `viewport-units` — Use `min-h-dvh` instead of `100vh` on mobile
- `visual-hierarchy` — Use size, spacing, and contrast — not color alone — to establish hierarchy

### §6 — Typography & Color (MEDIUM)

- `line-height` — 1.5–1.75 for body text
- `line-length` — 65–75 characters per line maximum
- `font-pairing` — Heading and body fonts must complement each other in weight and personality
- `font-scale` — Use a consistent type scale: 12 / 14 / 16 / 18 / 24 / 32
- `weight-hierarchy` — Headings 600–700, labels 500, body 400
- `color-semantic` — Use semantic tokens (primary, error, surface, on-surface), not raw hex in components
- `color-dark-mode` — Dark mode uses desaturated/tonal variants, not simply inverted colors
- `color-accessible-pairs` — All foreground/background pairs must meet 4.5:1 (AA) minimum
- `number-tabular` — Use tabular figures for prices, counters, and data tables
- `whitespace-balance` — Use whitespace to group related content and separate sections

### §7 — Animation (MEDIUM)

- `duration-timing` — 150–300ms for micro-interactions; complex transitions ≤ 400ms
- `transform-performance` — Animate only `transform` and `opacity`; never `width`, `height`, `top`, `left`
- `loading-states` — Show skeleton or progress indicator if loading > 300ms
- `excessive-motion` — Animate 1–2 key elements per view maximum
- `easing` — `ease-out` for entering; `ease-in` for exiting; never `linear` for UI
- `motion-meaning` — Every animation must express a cause-effect relationship, not decorate
- `state-transition` — Hover, active, expanded, collapsed states must animate, not snap
- `stagger-sequence` — Stagger list/grid entrance by 30–50ms per item
- `no-blocking-animation` — Never block user input during an animation
- `exit-faster-than-enter` — Exit animation ≈ 60–70% duration of enter animation
- `scale-feedback` — Subtle scale (0.95–1.05) on press for tappable cards/buttons

### §8 — Forms & Feedback (MEDIUM)

- `input-labels` — Every input has a visible `<label>`, never placeholder-only
- `error-placement` — Show error message directly below the related field
- `submit-feedback` — Loading → success / error state after every form submit
- `required-indicators` — Mark required fields with asterisk and explain notation
- `toast-dismiss` — Auto-dismiss toasts in 3–5 seconds; provide manual close
- `confirmation-dialogs` — Confirm before any destructive action (delete, reset, logout)
- `inline-validation` — Validate on blur (not on every keystroke)
- `error-clarity` — Error messages must state: what went wrong + how to fix it
- `progressive-disclosure` — Reveal complex options progressively; don't overwhelm upfront
- `success-feedback` — Confirm completed actions with brief visual feedback (checkmark, toast, color flash)
- `focus-management` — After submit error, auto-focus the first invalid field
- `undo-support` — Allow undo for destructive or bulk actions via an "Undo" toast

### §9 — Navigation (HIGH)

- `back-behavior` — Back navigation must be predictable and preserve scroll/state
- `nav-state-active` — Current location highlighted with color, weight, or indicator
- `bottom-nav-limit` — Bottom navigation max 5 items with both icon and text label
- `nav-label-icon` — Navigation items must have both icon and text; icon-only harms discoverability
- `modal-escape` — Modals must have a clear close affordance; swipe-down on mobile
- `adaptive-navigation` — Sidebar on ≥ 1024px; bottom/top nav on smaller screens
- `state-preservation` — Navigating back restores scroll position, filters, and form state
- `navigation-consistency` — Navigation placement stays the same on every page
- `focus-on-route-change` — After page transition, move focus to main content region

### §10 — Charts & Data (LOW)

- `chart-type` — Match chart to data: trend → line, comparison → bar, proportion → donut
- `legend-visible` — Always show legend near the chart, not below a scroll fold
- `tooltip-on-interact` — Show exact values on hover (web) or tap (mobile)
- `axis-labels` — Label axes with units; ensure text is readable on small screens
- `empty-data-state` — Show meaningful message + guidance when no data exists
- `loading-chart` — Use skeleton while chart data loads; never show empty axes
- `no-pie-overuse` — Avoid pie/donut for > 5 categories; use bar chart
- `pattern-texture` — Supplement color with patterns so colorblind users can distinguish data
- `direct-labeling` — For small datasets, label values directly on the chart
- `gridline-subtle` — Grid lines low-contrast (e.g. gray-200) so they don't compete with data

---

## Design System: Recommended Palettes by Product Type

### AI / Tech Tools (SaaS, dashboards, analytics)
```
Primary:    #0f6b48  (deep forest green) or #0d4f8b  (navy blue)
Secondary:  #1a1a2e  (dark navy) or #083d2a  (very dark green)
Accent:     #20b26b  (bright green) or #4fc3f7  (sky blue)
Background: #f4f7f5  (light tinted) or #0d1117  (dark mode)
Surface:    #ffffff  / #161b22  (dark mode)
Muted:      #6c7b74  / #8b949e  (dark mode)
Danger:     #b42318
Warning:    #a16207
Success:    #1f8a5b
```

### Healthcare / Sustainability / Environmental
```
Primary:    #0f6b48  or #2d6a4f
Secondary:  #40916c  or #1b4332
Accent:     #95d5b2  or #74c69d
Background: #f0f7f4  or #d8f3dc
```

### Fintech / Banking / Enterprise
```
Primary:    #1e3a5f  or #0f172a
Secondary:  #2563eb  or #1d4ed8
Accent:     #f59e0b  or #10b981
Background: #f8fafc  or #0f172a  (dark)
```

### E-commerce / Consumer
```
Primary:    #7c3aed  or #db2777
Secondary:  #1e293b
Accent:     #f97316  or #eab308
Background: #fafafa
```

---

## Design System: Font Pairings by Style

### Professional / SaaS / Dashboard
- **Inter + Inter** — Same family, weight variation. Headings 700, body 400.
  `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');`

- **DM Sans + DM Sans** — Friendly professional. Slightly warmer than Inter.
  `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');`

- **Sora + Nunito** — Modern + approachable. Great for AI/tech products.
  `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Nunito:wght@400;600&display=swap');`

### Authoritative / Enterprise / Fintech
- **Plus Jakarta Sans + Plus Jakarta Sans** — Geometric precision, premium feel.
- **Outfit + Outfit** — Clean, structural, great for data-heavy UIs.

### Minimal / Clean
- **Space Grotesk + Inter** — Technical + utilitarian. Popular for developer tools.

---

## Design System: UI Style Reference

### Glassmorphism (good for: AI tools, dark mode dashboards)
```css
background: rgba(255, 255, 255, 0.08);
border: 1px solid rgba(255, 255, 255, 0.15);
backdrop-filter: blur(12px);
border-radius: 16px;
```

### Minimalism (good for: SaaS, productivity, admin panels)
```css
background: #ffffff;
border: 1px solid #e2e8f0;
border-radius: 12px;
box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
```

### Soft UI / Modern Card (good for: dashboards, analytics)
```css
background: #ffffff;
border-radius: 24px;
box-shadow: 0 18px 45px rgba(8, 61, 42, 0.09);
padding: 28px;
```

### Dark Dashboard (good for: monitoring, analytics, security tools)
```css
--bg:      #0d1117;
--surface: #161b22;
--border:  rgba(255,255,255,0.08);
--text:    #e6edf3;
--muted:   #8b949e;
```

---

## Professional UI: Common Rules

### Icons & Visual Elements

| Rule | Do | Avoid |
|------|----|-------|
| No emoji icons | Use SVG sets (Lucide, Heroicons, Feather, Phosphor) | 🎨 🚀 ⚙️ as UI icons |
| Vector-only assets | SVG/icon fonts that scale and support theming | PNG icons that blur at non-standard sizes |
| Consistent icon size | Design tokens: sm=16px, md=20px, lg=24px | Mixing 18px / 22px / 28px randomly |
| Consistent stroke width | One stroke width per visual layer (1.5px or 2px) | Mixing thick and thin strokes |
| Filled vs. outline | One style per hierarchy level | Mixed filled+outline at the same level |
| Touch target minimum | 44px × 44px minimum hit area | Tiny icons without expanded click area |

### Spacing Rhythm

Use a strict 4-point base grid:
```
4px  → micro gaps (icon-to-text, badge padding)
8px  → component internal gaps
12px → tight sections
16px → standard padding, card gaps
24px → section spacing
32px → large section breaks
48px → major page sections
```

### Color Contrast Quick Reference

| Use Case | Minimum Ratio |
|----------|--------------|
| Body text (normal) | 4.5:1 |
| Large text / headings | 3:1 |
| UI components (borders, icons) | 3:1 |
| Decorative elements | No requirement |
| Dark mode primary text | 4.5:1 |
| Dark mode secondary text | 3:1 |

---

## Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis used as structural icons
- [ ] All icons from a consistent family and stroke style
- [ ] Pressed/hover states do not cause layout shift
- [ ] Semantic color tokens used (no ad-hoc hex in components)
- [ ] Consistent border-radius scale throughout

### Typography
- [ ] Minimum 16px body text (avoids iOS auto-zoom)
- [ ] Line-height ≥ 1.5 on body text
- [ ] Heading hierarchy is sequential (h1→h2→h3)
- [ ] Font pairing loaded from Google Fonts with `font-display: swap`
- [ ] Tabular figures used for data, prices, counters

### Interaction & Feedback
- [ ] All clickable elements have `cursor: pointer`
- [ ] Touch targets ≥ 44px on mobile
- [ ] Focus ring visible on keyboard navigation
- [ ] Loading/disabled states on all async buttons
- [ ] Toast or inline confirmation for all user actions

### Layout
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1">`
- [ ] No horizontal scroll on mobile
- [ ] Content not hidden behind fixed header/footer
- [ ] Tested at 375px and 1440px viewport widths

### Accessibility
- [ ] All images have descriptive `alt` attributes
- [ ] Form inputs have `<label>` elements
- [ ] Color is not the only way information is conveyed
- [ ] `@media (prefers-reduced-motion: no-preference)` wraps all animations

### Performance
- [ ] Images use WebP and `loading="lazy"` where not critical
- [ ] `width`/`height` on all `<img>` to prevent CLS
- [ ] Animations use only `transform` and `opacity`
- [ ] Fonts loaded with `font-display: swap`

---

## Prompt Templates for Antigravity IDE

Use these copy-paste prompts in Antigravity to apply this skill to your project.

---

### General Improvement Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md.

Apply the design intelligence in that skill to improve this page.
Focus on: typography upgrade, entrance animations, interaction feedback,
and mobile sidebar toggle.

Stack: HTML + vanilla CSS + vanilla JS (no framework).
Preserve all existing functionality. Only improve the visual design
and user experience.
```

---

### Font Upgrade Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §6 (Typography & Color).

Upgrade the font on all HTML pages from Arial to Inter (Google Fonts).
- Add the Google Fonts link tag to the <head> of every HTML file
- Update the font-family in :root of style.css
- Ensure font-display: swap is set
- Keep all existing font-size and font-weight values
```

---

### Animation & Entrance Effects Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §7 (Animation).

Add professional entrance animations to style.css:
1. A fadeUp keyframe (opacity 0→1, translateY 14px→0, 0.4s ease)
2. Apply to .panel, .kpi-card, .topbar, .summary-card
3. Stagger .kpi-card children with animation-delay (0.05s increments)
4. Wrap all animations in @media (prefers-reduced-motion: no-preference)
5. Duration 150–300ms for micro-interactions only
```

---

### Button & Interaction States Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §2 (Touch & Interaction).

Improve all interactive elements in style.css:
1. Add :focus-visible outline to all inputs, buttons, and links
2. Add :active scale(0.97) to .primary-btn and .secondary-btn
3. Ensure all buttons show cursor: pointer
4. Add transition: all 0.2s ease to form inputs
5. Add focus box-shadow with brand color on input focus
```

---

### Mobile Navigation Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §9 (Navigation).

Add a mobile hamburger menu to all inner pages (upload.html, live-camera.html,
alerts.html, analytics.html):
1. Add a hamburger button in the .topbar (visible only on mobile)
2. Make .sidebar use position: fixed and slide in from the left on mobile
3. Add an overlay backdrop when the sidebar is open
4. Close the sidebar when clicking the backdrop or a nav link
5. Keep the sidebar always visible on desktop (≥ 1000px)
```

---

### Toast Notification System Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §8 (Forms & Feedback).

Add a toast notification system to js/script.js and style.css:
1. Create a showToast(message, type) function (type: 'success' | 'error' | 'warning')
2. Toast slides in from bottom-right, auto-dismisses after 3.5s
3. Stack multiple toasts vertically with 10px gap
4. Wire up: "Verify & Approve" → success toast, "Flag as Contaminated" → error toast
5. Use brand colors: success = var(--green-dark), error = var(--danger)
```

---

### Upload Drag-and-Drop Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §2 and §8.

Improve the upload interaction in upload.html and style.css:
1. Add drag-over visual state: green border, green-soft background, slight scale
2. Add dragover / dragleave / drop event listeners in script.js
3. Show a checkmark and filename after file selection
4. Animate the upload icon on drag-over (slight rotation + scale)
5. Show a file preview thumbnail after image selection
```

---

### Analytics KPI Animation Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §7 (Animation) and §3 (Performance).

Enhance the analytics.html KPI cards:
1. Animate progress bars from 0 to target width on page load (1s ease-out)
2. Add count-up animation to all numeric KPI values (1.2s duration)
3. Use requestAnimationFrame, not setInterval
4. Preserve the original final values; only animate the entrance
5. Respect prefers-reduced-motion (show final values instantly if set)
```

---

### Skeleton Loading Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md §7 and §3.

Replace the "Loading..." table row in alerts.html with a skeleton screen:
1. Add a shimmer animation keyframe to style.css
2. Create .skeleton-cell with gradient shimmer effect
3. Show 5 skeleton rows with varying cell widths while data loads
4. Remove skeleton rows after the JS populates the table
5. Timing: shimmer cycle = 1.4s
```

---

### Full PurityLoop AI Review & Fix Prompt
```
Please read .agents/skills/ui-ux-pro-max/SKILL.md.

I am working on PurityLoop AI, an AI-based waste sorting dashboard.
Tech stack: HTML + vanilla CSS + vanilla JS (no framework).
Pages: login.html, upload.html, live-camera.html, alerts.html, analytics.html
CSS: css/style.css   JS: js/script.js

Apply the design intelligence from the skill to make the following improvements.
Work through them in order of priority from the skill's rule table:

CRITICAL:
1. Add Inter font from Google Fonts to all pages
2. Add :focus-visible states to all form inputs and buttons
3. Add mobile hamburger menu for sidebar navigation

HIGH IMPACT:
4. Add page entrance animations (fadeUp stagger) to panels and KPI cards
5. Animate KPI progress bars from 0 on load
6. Add drag-over state to the upload box

INTERACTION:
7. Add a toast notification system for approve/reject actions
8. Replace loading table row with skeleton shimmer rows

POLISH:
9. Add favicon to all pages
10. Add feature stat grid to login page left panel (98.2% precision, 9 categories, 1,500t diverted YTD)

Preserve all existing functionality. Apply changes to the actual files.
Reference the Pre-Delivery Checklist in the skill before finishing.
```
