import PageHtml from "@/components/PageHtml";

const html = `
<nav id="landingNav" class="ops-home-nav" role="navigation" aria-label="PurityLoop technology navigation">
  <a href="/" class="ops-home-brand" aria-label="PurityLoop AI home">
    <img src="/assets/logo.png" alt="PurityLoop AI" />
  </a>
  <div class="ops-home-links">
    <a href="/" class="nav-link">Home</a>
    <a href="/#workflow" class="nav-link">Workflow</a>
    <a href="/#analytics" class="nav-link">Analytics</a>
    <a href="/about-technology" class="nav-link active">Technology</a>
  </div>
  <div class="ops-home-actions">
    <div data-theme-slot="landing"></div>
    <a href="/login" class="ops-btn ops-btn-primary">Open Demo</a>
  </div>
</nav>

<main class="ops-tech-page">
  <section class="ops-tech-hero">
    <p class="ops-eyebrow">CAPSTONE DETAILS</p>
    <h1>About the technology behind PurityLoop AI</h1>
    <p>This page keeps the model, methodology, and prototype context available without making the public homepage feel academic.</p>
  </section>

  <section class="ops-tech-grid">
    <article>
      <h2>Computer vision workflow</h2>
      <p>PurityLoop uses image-based material classification to identify recyclable items, possible contaminants, and items that should be routed to human review.</p>
      <ul>
        <li>Image or batch upload</li>
        <li>Material detection and confidence scoring</li>
        <li>Human review for uncertain or hazardous results</li>
        <li>Analytics for purity, value, and contamination patterns</li>
      </ul>
    </article>
    <article>
      <h2>Prototype model</h2>
      <p>The prototype is built around YOLOv8 computer vision inference and a web-based review workflow for MRF operations.</p>
      <ul>
        <li>FastAPI backend for prediction endpoints</li>
        <li>Next.js frontend for upload, review, and analytics screens</li>
        <li>Supabase-supported data and review workflows where configured</li>
        <li>Render and Vercel deployment targets</li>
      </ul>
    </article>
    <article>
      <h2>Evaluation context</h2>
      <p>Prototype performance should be interpreted as evaluation data, not a guaranteed production result for every facility.</p>
      <ul>
        <li>Lighting and camera angle affect image quality</li>
        <li>Material condition and contamination change confidence</li>
        <li>Site workflow determines review throughput</li>
        <li>Operational claims should be validated per facility</li>
      </ul>
    </article>
  </section>
</main>
`;

export default function AboutTechnologyPage() {
  return <PageHtml bodyClass="landing-body ops-home-page" html={html} />;
}
