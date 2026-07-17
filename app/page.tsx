import PageHtml from "@/components/PageHtml";

const html = `
<nav id="landingNav" class="ops-home-nav" role="navigation" aria-label="PurityLoop public navigation">
  <a href="/" class="ops-home-brand" aria-label="PurityLoop AI home">
    <img src="/assets/logo.png" alt="PurityLoop AI" />
  </a>
  <div class="ops-home-links">
    <a href="#attention" class="nav-link active">Attention</a>
    <a href="#workflow" class="nav-link">Workflow</a>
    <a href="#results" class="nav-link">Results</a>
    <a href="#analytics" class="nav-link">Analytics</a>
    <a href="/about-technology" class="nav-link">Technology</a>
  </div>
  <div class="ops-home-actions">
    <div data-theme-slot="landing"></div>
    <a href="/login" class="ops-btn ops-btn-primary">Open Demo</a>
    <button id="navBurger" class="ops-menu-btn" type="button" aria-label="Toggle menu" aria-expanded="false">
      <i class="fa-solid fa-bars"></i>
    </button>
  </div>
</nav>

<div id="mobileMenu" class="ops-mobile-menu" role="menu">
  <a href="#attention" class="nav-link" role="menuitem">Attention</a>
  <a href="#workflow" class="nav-link" role="menuitem">Workflow</a>
  <a href="#results" class="nav-link" role="menuitem">Results</a>
  <a href="#analytics" class="nav-link" role="menuitem">Analytics</a>
  <a href="/about-technology" class="nav-link" role="menuitem">Technology</a>
  <a href="/login" class="ops-btn ops-btn-primary" role="menuitem">Open Demo</a>
</div>

<main class="ops-home">
  <section id="hero" class="ops-hero" aria-labelledby="heroTitle">
    <div class="ops-hero-copy">
      <p class="ops-eyebrow">AI OPERATIONS PLATFORM FOR RECYCLING FACILITIES</p>
      <h1 id="heroTitle">Catch contamination before it costs the shift.</h1>
      <p class="ops-hero-sub">PurityLoop helps MRF teams identify materials, flag hazardous contamination, and prioritise manual review—before poor-quality loads become costly rework, safety incidents, or rejected bales.</p>
      <div class="ops-hero-ctas">
        <a href="/login" class="ops-btn ops-btn-primary ops-btn-lg">Open Live Demo Dashboard</a>
        <a href="#workflow" class="ops-btn ops-btn-secondary ops-btn-lg">See How It Works</a>
      </div>
      <div class="ops-urgency-strip">
        <i class="fa-regular fa-clock" aria-hidden="true"></i>
        <span>Demo workspace includes a live priority queue, hazard alerts, and batch-quality insights.</span>
      </div>
    </div>

    <aside class="ops-command-panel" aria-label="Operations command preview">
      <header>
        <div>
          <span class="ops-panel-kicker">Operations Command</span>
          <strong>Action required</strong>
        </div>
        <span class="ops-updated">Updated 2 min ago</span>
      </header>
      <div class="ops-command-metrics">
        <div class="ops-command-metric danger">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <strong>2</strong>
          <span>Critical hazard alerts</span>
        </div>
        <div class="ops-command-metric warning">
          <i class="fa-solid fa-users-gear" aria-hidden="true"></i>
          <strong>14</strong>
          <span>Items awaiting human review</span>
        </div>
        <div class="ops-command-metric success">
          <i class="fa-solid fa-bullseye" aria-hidden="true"></i>
          <strong>92.4%</strong>
          <span>Current batch purity</span>
        </div>
        <div class="ops-command-metric value">
          <i class="fa-solid fa-sack-dollar" aria-hidden="true"></i>
          <strong>RM 4,860</strong>
          <span>Estimated recoverable value</span>
        </div>
      </div>
      <div class="ops-hazard-row">
        <div class="ops-hazard-icon"><i class="fa-solid fa-battery-quarter" aria-hidden="true"></i></div>
        <div>
          <span>Critical hazard alert</span>
          <strong>Battery detected in mixed recyclables</strong>
          <p>Potential fire risk. Immediate isolation recommended.</p>
        </div>
      </div>
      <div class="ops-panel-footer">
        <p><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Unreviewed items may affect batch purity.</p>
        <a href="/log" class="ops-btn ops-btn-primary">Open Review Queue</a>
      </div>
    </aside>
  </section>

  <section id="attention" class="ops-section ops-attention" aria-labelledby="attentionTitle">
    <div class="ops-section-heading">
      <h2 id="attentionTitle">What needs attention now?</h2>
      <p>Surface the operational exceptions that can affect safety, purity, and recoverable value.</p>
    </div>
    <div class="ops-priority-grid">
      <article class="ops-priority-card urgent">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <h3>Critical Alerts</h3>
        <strong>Battery detected in mixed recyclables</strong>
        <p>Immediate isolation recommended</p>
        <a href="/log">View critical alerts</a>
      </article>
      <article class="ops-priority-card review">
        <i class="fa-solid fa-clipboard-question" aria-hidden="true"></i>
        <h3>Review Queue</h3>
        <strong>14 low-confidence items require verification</strong>
        <p>Average review age: 18 minutes</p>
        <a href="/log">Open review queue</a>
      </article>
      <article class="ops-priority-card quality">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <h3>Batch Quality</h3>
        <strong>Current purity: 92.4%</strong>
        <p>Below the 95% target for this material stream</p>
        <a href="/analytics">Inspect batch quality</a>
      </article>
    </div>
  </section>

  <section class="ops-section ops-benefits" aria-labelledby="benefitsTitle">
    <div class="ops-section-heading compact">
      <h2 id="benefitsTitle">How PurityLoop helps</h2>
    </div>
    <div class="ops-benefit-row">
      <article>
        <i class="fa-solid fa-camera-retro" aria-hidden="true"></i>
        <h3>Detect material automatically</h3>
        <p>Identify recyclable materials as images and batch uploads enter the review workflow.</p>
      </article>
      <article>
        <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
        <h3>Flag contamination and hazards early</h3>
        <p>Bring risky items to the front of the queue before they compromise the load.</p>
      </article>
      <article>
        <i class="fa-solid fa-list-check" aria-hidden="true"></i>
        <h3>Prioritise human review and improve batch quality</h3>
        <p>Focus operators on uncertain items so teams can protect purity and recover more value.</p>
      </article>
    </div>
  </section>

  <section id="workflow" class="ops-section ops-workflow" aria-labelledby="workflowTitle">
    <div class="ops-section-heading">
      <h2 id="workflowTitle">Capture → Detect → Review → Improve</h2>
      <p>A simple operational loop for material classification, exception handling, and quality improvement.</p>
    </div>
    <div class="ops-flow-line" aria-hidden="true"></div>
    <div class="ops-flow-grid">
      <article><span>01</span><h3>Capture</h3><p>Upload images, batch files, or camera footage.</p></article>
      <article><span>02</span><h3>Detect</h3><p>Identify recyclable materials and potential contaminants.</p></article>
      <article><span>03</span><h3>Review</h3><p>Send uncertain or hazardous items to the right operator.</p></article>
      <article><span>04</span><h3>Improve</h3><p>Track purity, recovery value, and recurring contamination patterns.</p></article>
    </div>
  </section>

  <section id="results" class="ops-section ops-results" aria-labelledby="resultsTitle">
    <div class="ops-section-heading">
      <h2 id="resultsTitle">Prototype results and operational potential</h2>
      <p>Evidence from prototype evaluation, clearly separated from site-specific operational claims.</p>
    </div>
    <div class="ops-results-grid">
      <article><i class="fa-solid fa-check" aria-hidden="true"></i><strong data-countup>98.2%</strong><span>detection accuracy</span></article>
      <article><i class="fa-solid fa-gauge-high" aria-hidden="true"></i><strong>Faster</strong><span>exception review</span></article>
      <article><i class="fa-solid fa-chart-pie" aria-hidden="true"></i><strong>Material-level</strong><span>reporting</span></article>
    </div>
    <p class="ops-proof-note">Prototype evaluation results. Performance may vary by lighting, material condition, camera angle, and site workflow.</p>
  </section>

  <section id="analytics" class="ops-section ops-analytics" aria-labelledby="analyticsTitle">
    <div class="ops-section-heading">
      <h2 id="analyticsTitle">Operations at a glance</h2>
      <p>One dashboard preview for purity, material mix, recoverable value, review queue status, and critical alerts.</p>
    </div>
    <div class="ops-analytics-preview">
      <article class="purity">
        <span>Current Batch Purity</span>
        <strong>92.4%</strong>
        <div><i style="width: 92.4%"></i></div>
        <p>Target: 95.0%</p>
      </article>
      <article>
        <span>Material Mix</span>
        <div class="ops-donut" aria-hidden="true"></div>
        <p>PET 39.7% · HDPE 22.1% · Cardboard 17.8%</p>
      </article>
      <article>
        <span>Recoverable Value</span>
        <strong>RM 4,860</strong>
        <p>Estimated from confirmed recyclable materials</p>
      </article>
      <article>
        <span>Review Queue Status</span>
        <strong>14</strong>
        <p>6 high priority · 8 standard review</p>
      </article>
      <article class="alerts">
        <span>Critical Alerts</span>
        <strong>2 active</strong>
        <p>Battery detected · Propane canister</p>
      </article>
      <article>
        <span>Recent Verification Activity</span>
        <ul>
          <li>Battery detected · Line 2 · 2 min ago</li>
          <li>Film wrap detected · Line 1 · 4 min ago</li>
          <li>Glass detected · Line 3 · 7 min ago</li>
        </ul>
      </article>
    </div>
    <a href="/analytics" class="ops-btn ops-btn-secondary ops-dashboard-link">Explore the operations dashboard</a>
  </section>

  <section class="ops-final-cta" aria-labelledby="finalCtaTitle">
    <div class="ops-stream-particles" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
    <div>
      <h2 id="finalCtaTitle">Don’t let the next contaminated batch become tomorrow’s loss.</h2>
      <p>Open the PurityLoop demo to see how hazards, low-confidence items, and material quality can be managed from one operational view.</p>
      <div class="ops-final-actions">
        <a href="/login" class="ops-btn ops-btn-light ops-btn-lg">Launch Demo Dashboard</a>
        <span>No setup required. Use the sample workflow to explore alerts, review queues, and analytics.</span>
      </div>
    </div>
  </section>
</main>

<footer class="ops-home-footer">
  <a href="/" class="ops-home-brand"><img src="/assets/logo.png" alt="PurityLoop AI" /></a>
  <nav aria-label="Footer navigation">
    <a href="#attention">Attention</a>
    <a href="#workflow">Workflow</a>
    <a href="#analytics">Analytics</a>
    <a href="/about-technology">About the Technology</a>
    <a href="/login">Open Demo</a>
  </nav>
</footer>
`;

export default function Page() {
  return <PageHtml bodyClass="landing-body ops-home-page" html={html} />;
}
