import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | System Showcase" };

const html = `
<!-- ══════════════════════════════════════
       TOP NAVIGATION BAR
  ══════════════════════════════════════ -->
  <nav id="landingNav" class="landing-nav" role="navigation" aria-label="Main navigation">
    <!-- Logo -->
    <a href="/" class="nav-logo">
      <img src="/assets/logo.png" alt="PurityLoop AI Logo" />
    </a>

    <!-- Desktop Links -->
    <div class="nav-links">
      <a href="#hero" class="nav-link active">Home</a>
      <a href="#features" class="nav-link">Features</a>
      <a href="#analytics" class="nav-link">Platform</a>
      <a href="#contact" class="nav-link">Contact</a>
    </div>

    <!-- Actions -->
    <div class="nav-actions">
      <div data-theme-slot="landing"></div>
      <a href="/login" class="btn" style="min-height:38px;padding:0 18px;font-size:0.875rem;">Login</a>
      <button id="navBurger" class="nav-burger" aria-label="Toggle menu" aria-expanded="false">
        <span class="nav-burger-label">Menu</span>
        <i class="fa-solid fa-bars"></i>
      </button>
    </div>
  </nav>

  <!-- Mobile Menu -->
  <div id="mobileMenu" class="mobile-menu" role="menu">
    <div class="mobile-menu-header">
      <a href="/" class="mobile-menu-logo" aria-label="PurityLoop AI home">
        <img src="/assets/logo.png" alt="PurityLoop AI Logo" />
      </a>
      <button id="mobileMenuClose" class="mobile-menu-close" type="button" aria-label="Close menu">
        <span>Menu</span>
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="mobile-menu-links">
      <div data-theme-slot="landing-mobile"></div>
      <a href="#hero" class="nav-link" role="menuitem">Home</a>
      <a href="#features" class="nav-link" role="menuitem">Features</a>
      <a href="#analytics" class="nav-link" role="menuitem">Platform</a>
      <a href="/login" class="nav-link" role="menuitem">Login</a>
    </div>
  </div>


  <!-- ══════════════════════════════════════
       SECTION 1 — HERO
  ══════════════════════════════════════ -->
  <section id="hero" class="hero-section">
    <!-- Animated background blobs -->
    <div class="hero-particles" aria-hidden="true">
      <div class="hero-blob hero-blob-1"></div>
      <div class="hero-blob hero-blob-2"></div>
    </div>

    <div class="hero-inner">
      <!-- Left: Copy -->
      <div class="hero-copy">
        <div class="hero-tag">
          <span class="hero-tag-dot"></span>
          CAPSTONE PROJECT | YOLOV8 | AUTOMATED MRF CLASSIFICATION
        </div>

        <h1 class="hero-headline">
          Automated waste sorting for
          <span class="highlight">cleaner recycling loops.</span>
        </h1>

        <p class="hero-sub">
          <span id="typedText"></span>
        </p>

        <div class="hero-btns">
          <a href="/login" class="btn-outline btn-lg">
            Login
          </a>
        </div>

        <div class="hero-social-proof">
          <div class="hero-avatars">
            <span>MK</span><span>TF</span><span>AL</span><span>+</span>
          </div>
          <p><strong>PurityLoop AI</strong> | Built for MRF managers and sorting operators</p>
        </div>
      </div>

      <!-- Right: Dashboard Preview Card -->
      <div class="hero-visual">
        <div class="hero-dashboard-card">
          <div class="hdc-header">
            <span class="hdc-title">Live Detection Feed</span>
            <span class="hdc-live"><span class="hdc-live-dot"></span> YOLOv8</span>
          </div>

          <div class="hdc-metrics hdc-capability-grid">
            <div class="hdc-metric">
              <span class="hdc-metric-val">YOLOv8m-seg</span>
              <span class="hdc-metric-label">Model</span>
            </div>
            <div class="hdc-metric">
              <span class="hdc-metric-val">9</span>
              <span class="hdc-metric-label">Waste Categories</span>
            </div>
            <div class="hdc-metric">
              <span class="hdc-metric-val">Human Review</span>
              <span class="hdc-metric-label">Enabled</span>
            </div>
            <div class="hdc-metric">
              <span class="hdc-metric-val">Hazard Alert</span>
              <span class="hdc-metric-label">Routing</span>
            </div>
          </div>

          <div class="hdc-chart-placeholder">
            <div class="hdc-bar" data-h="45%" style="height:4px"></div>
            <div class="hdc-bar" data-h="62%" style="height:4px"></div>
            <div class="hdc-bar active" data-h="78%" style="height:4px"></div>
            <div class="hdc-bar" data-h="55%" style="height:4px"></div>
            <div class="hdc-bar active" data-h="90%" style="height:4px"></div>
            <div class="hdc-bar" data-h="70%" style="height:4px"></div>
            <div class="hdc-bar active" data-h="85%" style="height:4px"></div>
            <div class="hdc-bar" data-h="65%" style="height:4px"></div>
            <div class="hdc-bar active" data-h="95%" style="height:4px"></div>
            <div class="hdc-bar" data-h="72%" style="height:4px"></div>
          </div>

          <div class="hdc-items">
            <div class="hdc-item">
              <span class="hdc-item-dot" style="background:#10B981"></span>
              <span class="hdc-item-label">Contaminant Blocking</span>
              <span class="hdc-item-val">Active</span>
            </div>
            <div class="hdc-item">
              <span class="hdc-item-dot" style="background:#3B82F6"></span>
              <span class="hdc-item-label">Supabase Audit Trail</span>
              <span class="hdc-item-val">Connected</span>
            </div>
            <div class="hdc-item">
              <span class="hdc-item-dot" style="background:#F59E0B"></span>
              <span class="hdc-item-label">Recovery Analytics</span>
              <span class="hdc-item-val">Live</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 2 — BUSINESS CHALLENGE VIDEO
  ══════════════════════════════════════ -->
  <section id="business-challenge" class="section section-alt business-video-section">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-up">
        <div class="section-tag"><i class="fa-solid fa-circle-play"></i> THE BUSINESS CHALLENGE</div>
        <h2 class="section-headline">Why Waste Sorting Needs Better Intelligence</h2>
        <p class="section-sub">Contamination, delayed operator review, and low visibility make manual sorting hard to scale with confidence.</p>
      </div>

      <div class="business-video-shell" data-aos="fade-up" data-aos-delay="100">
        <video class="business-video" controls playsinline preload="metadata" poster="/assets/capstone-project-poster.jpg">
          <source src="/assets/Capstone Project.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <button class="business-video-play" type="button" aria-label="Play business challenge video">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 3 — THE PROBLEM
  ══════════════════════════════════════ -->
  <section id="problem" class="section section-alt">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-up">
        <div class="section-tag"><i class="fa-solid fa-triangle-exclamation"></i> The Problem</div>
        <h2 class="section-headline">Waste Sorting Problems Cost<br>Facilities Millions</h2>
        <p class="section-sub">Manual recycling operations suffer from human error, contamination, and zero real-time
          visibility into material quality.</p>
      </div>

      <div class="problem-grid">
        <div class="problem-card" data-aos="fade-up" data-aos-delay="0">
          <div class="problem-icon red"><i class="fa-solid fa-boxes-stacked"></i></div>
          <h3>Contaminant Infiltration</h3>
          <p>Batteries, chemicals, and organic waste enter recyclable streams, causing entire bale rejections and costly
            re-processing.</p>
          <span class="problem-stat"><i class="fa-solid fa-arrow-up"></i> 23% contamination rate</span>
        </div>

        <div class="problem-card" data-aos="fade-up" data-aos-delay="80">
          <div class="problem-icon amber"><i class="fa-solid fa-eye-slash"></i></div>
          <h3>Zero Sorting Visibility</h3>
          <p>Operators have no real-time confidence scores, no material purity tracking, and no audit trail for sorted
            batches.</p>
          <span class="problem-stat"><i class="fa-solid fa-arrow-up"></i> 31% audit failure rate</span>
        </div>

        <div class="problem-card" data-aos="fade-up" data-aos-delay="160">
          <div class="problem-icon blue"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <h3>Manual Review Backlog</h3>
          <p>Low-confidence scans pile up for human review, creating workflow bottlenecks that delay commodity baling
            and shipment.</p>
          <span class="problem-stat"><i class="fa-solid fa-clock"></i> 8+ hrs avg delay</span>
        </div>

        <div class="problem-card" data-aos="fade-up" data-aos-delay="240">
          <div class="problem-icon green"><i class="fa-solid fa-chart-bar"></i></div>
          <h3>No Material Intelligence</h3>
          <p>Without per-material yield tracking, facilities can't identify which waste streams generate the highest
            commodity value.</p>
          <span class="problem-stat"><i class="fa-solid fa-arrow-up"></i> $842k untapped revenue</span>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 5 — METHODOLOGY
  ══════════════════════════════════════ -->
  <section id="methodology" class="section methodology-section">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-up">
        <div class="section-tag"><i class="fa-solid fa-map"></i> CAPSTONE METHODOLOGY</div>
        <h2 class="section-headline">Project Methodology & Model Validation</h2>
        <p class="section-sub">Explore how PurityLoop AI was planned, developed, validated and prepared for deployment.</p>
      </div>

      <div class="methodology-tabs" data-methodology-tabs data-aos="fade-up" data-aos-delay="100">
        <div class="methodology-tablist" role="tablist" aria-label="Capstone methodology diagrams">
          <button id="methodology-tab-1" class="methodology-tab active" type="button" role="tab" aria-selected="true" aria-controls="methodology-panel-1" tabindex="0" data-methodology-tab="0">
            <span>01 — Project Lifecycle</span>
            <small>How the AI model, web application and analytics dashboard were developed in parallel.</small>
          </button>
          <button id="methodology-tab-2" class="methodology-tab" type="button" role="tab" aria-selected="false" aria-controls="methodology-panel-2" tabindex="-1" data-methodology-tab="1">
            <span>02 — Business Process</span>
            <small>The complete operational workflow from image upload and AI inference to operator review, database storage and analytics.</small>
          </button>
          <button id="methodology-tab-3" class="methodology-tab" type="button" role="tab" aria-selected="false" aria-controls="methodology-panel-3" tabindex="-1" data-methodology-tab="2">
            <span>03 — AI Development Plan</span>
            <small>The data preparation, model training, optimisation, validation and deployment process.</small>
          </button>
          <button id="methodology-tab-4" class="methodology-tab" type="button" role="tab" aria-selected="false" aria-controls="methodology-panel-4" tabindex="-1" data-methodology-tab="3">
            <span>04 — Validation Criteria</span>
            <small>The target mAP, recall, inference latency, confidence thresholds and human-review rules.</small>
          </button>
        </div>

        <div class="methodology-panels">
          <article id="methodology-panel-1" class="methodology-panel active" role="tabpanel" aria-labelledby="methodology-tab-1" tabindex="0" data-methodology-panel="0">
            <div class="methodology-panel-copy">
              <span class="methodology-index">01 / Project Lifecycle</span>
              <h3>Parallel delivery tracks</h3>
              <p>Shows how model development, web application delivery, and analytics dashboard work moved together through the capstone lifecycle.</p>
            </div>
            <figure class="methodology-figure">
              <img src="/assets/Project Lifecycle.png" width="1536" height="1024" alt="Project lifecycle diagram showing SDLC stages and three parallel tracks for AI model development, web application development, and analytics dashboard delivery." data-methodology-image="0" />
            </figure>
          </article>

          <article id="methodology-panel-2" class="methodology-panel" role="tabpanel" aria-labelledby="methodology-tab-2" tabindex="0" data-methodology-panel="1" hidden>
            <div class="methodology-panel-copy">
              <span class="methodology-index">02 / Business Process</span>
              <h3>Operational sorting workflow</h3>
              <p>Maps the upload, YOLOv8m-seg inference, operator review, Supabase record, alert queue, and dashboard update path.</p>
            </div>
            <figure class="methodology-figure">
              <img data-src="/assets/Waste Classification Business Process.png" width="1536" height="1024" alt="Waste classification business process diagram from operator upload through AI detection, review queues, Supabase storage, and analytics updates." data-methodology-image="1" loading="lazy" />
            </figure>
          </article>

          <article id="methodology-panel-3" class="methodology-panel" role="tabpanel" aria-labelledby="methodology-tab-3" tabindex="0" data-methodology-panel="2" hidden>
            <div class="methodology-panel-copy">
              <span class="methodology-index">03 / AI Development Plan</span>
              <h3>Data and model development path</h3>
              <p>Details the YOLOv8m-seg model flow from data audit and label fixing through training, optimisation, validation, and deployment.</p>
            </div>
            <figure class="methodology-figure">
              <img data-src="/assets/DL Framework & Development Plan.png" width="1536" height="1024" alt="Deep learning framework and development plan diagram covering OSEMN stages, YOLOv8m-seg architecture, data preparation, model training, and deployment gates." data-methodology-image="2" loading="lazy" />
            </figure>
          </article>

          <article id="methodology-panel-4" class="methodology-panel" role="tabpanel" aria-labelledby="methodology-tab-4" tabindex="0" data-methodology-panel="3" hidden>
            <div class="methodology-panel-copy">
              <span class="methodology-index">VALIDATION CRITERIA</span>
              <h3>Model Acceptance Targets &amp; Routing Rules</h3>
              <p>Proposed performance targets and operational confidence thresholds. These values are validation criteria, not final measured results.</p>
              <span class="methodology-target-badge">TARGETS — NOT FINAL RESULTS</span>
            </div>
            <div class="methodology-evidence">
              <figure class="methodology-figure">
                <img data-src="/assets/Production Model Success Metrics.png" width="1536" height="1024" alt="Production model success metrics diagram showing capstone validation targets for mAP, recall, inference latency, class thresholds, and human review rules." data-methodology-image="3" loading="lazy" />
              </figure>
              <div class="measured-performance-panel" aria-label="Measured model performance results">
                <div class="measured-performance-copy">
                  <h4>Measured Model Performance</h4>
                  <p>Final held-out validation results for the browser ONNX waste-classification model.</p>
                </div>
                <div class="measured-performance-summary">
                  <div class="measured-performance-hero">
                    <span>Primary score</span>
                    <strong>59.5</strong>
                    <small>mAP@0.5</small>
                  </div>
                  <dl class="measured-performance-grid">
                    <div><dt>Precision</dt><dd>0.606</dd></div>
                    <div><dt>Recall</dt><dd>0.579</dd></div>
                    <div><dt>Naming accuracy</dt><dd>0.918</dd></div>
                  </dl>
                </div>
                <dl class="measured-model-facts">
                  <div><dt>Model</dt><dd>remask200_40ep</dd></div>
                  <div><dt>Architecture</dt><dd>YOLOv8m-seg</dd></div>
                  <div><dt>Validation set</dt><dd>8,453 images</dd></div>
                  <div><dt>Deployment</dt><dd>best.onnx, 54.6 MB fp16</dd></div>
                </dl>
                <div class="measured-class-results" aria-label="Detected waste classes">
                  <p>9 fixed waste classes</p>
                  <div class="measured-class-pill-row">
                    <span>Plastic</span>
                    <span>Paper</span>
                    <span>Cardboard</span>
                    <span>Metal</span>
                    <span>Glass</span>
                    <span>Textile</span>
                    <span>Food Waste</span>
                    <span>Battery</span>
                    <span>General Trash</span>
                  </div>
                  <small>General trash and uncertain detections route to human review.</small>
                </div>
                <div class="measured-insight-grid">
                  <div class="measured-reliability-chart" aria-label="Detection reliability by scene complexity">
                    <h5>Confusion / Error Insight</h5>
                    <div class="measured-bar-row">
                      <span>One close-up object</span>
                      <div><i style="width: 85%"></i></div>
                      <strong>~85%</strong>
                    </div>
                    <div class="measured-bar-row">
                      <span>2-5 objects</span>
                      <div><i style="width: 56%"></i></div>
                      <strong>~56%</strong>
                    </div>
                    <div class="measured-bar-row">
                      <span>6+ cluttered objects</span>
                      <div><i style="width: 42%"></i></div>
                      <strong>~42%</strong>
                    </div>
                    <small>Small objects and cluttered scenes are the hardest cases.</small>
                  </div>
                  <div class="measured-selection-card">
                    <h5>Final Model Selection</h5>
                    <p>Validation label cleanup improved mAP@0.5 from <strong>0.552</strong> to <strong>0.595</strong>, a <strong>+0.043</strong> gain.</p>
                    <p>PyTorch-to-ONNX parity checked: <strong>312 vs 312</strong> detections, with <strong>0/30</strong> images differing in detection count.</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div class="methodology-controls" aria-label="Methodology diagram controls">
          <button class="methodology-control" type="button" data-methodology-prev>
            <i class="fa-solid fa-arrow-left"></i> Previous
          </button>
          <span class="methodology-count" aria-live="polite" data-methodology-count>1 of 4</span>
          <button class="methodology-control" type="button" data-methodology-next>
            Next <i class="fa-solid fa-arrow-right"></i>
          </button>
          <button class="methodology-control methodology-fullscreen" type="button" data-methodology-fullscreen>
            <i class="fa-solid fa-expand"></i> Full screen
          </button>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 6 — CORE FEATURES
  ══════════════════════════════════════ -->
  <section id="features" class="section section-alt">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-right">
        <div>
          <div class="section-tag"><i class="fa-solid fa-star"></i> Platform Features</div>
          <h2 class="section-headline">Everything You Need to Run<br>a Smarter Facility</h2>
          <p class="section-sub">From saved AI results to operational reporting, PurityLoop AI presents the complete
            operational lifecycle.</p>
        </div>
      </div>

      <!-- Feature 1 -->
      <div class="feature-row">
        <div class="feature-content" data-aos="fade-right">
          <div class="feature-num">Feature 01</div>
          <h3>Real-Time YOLOv8 Classification</h3>
          <p>Sub-second detection across 9 waste categories: plastic, metal, glass, paper, cardboard, food organics,
            textile, battery, and general trash, with exact confidence mapping per item.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> 9 material categories with 97%+ average confidence</li>
            <li><i class="fa-solid fa-check"></i> Live bounding box overlays with colour-coded risk</li>
            <li><i class="fa-solid fa-check"></i> Instant hazard flag for batteries and chemicals</li>
          </ul>
        </div>
        <div class="feature-visual" data-aos="fade-left">
          <div class="feature-visual-header">
            <span style="font-size:0.875rem;font-weight:700;">Active Scan Viewport</span>
            <span class="feature-visual-tag">ONLINE</span>
          </div>
          <div
            style="background:#111827;border-radius:12px;aspect-ratio:16/9;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            <img src="/assets/items/upload-result-reference.png" alt="Conveyor belt scan"
              style="width:100%;height:100%;object-fit:cover;opacity:0.85;" />
            <div class="scan-line"></div>
            <div class="scan-hud" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <!-- Bounding box overlays -->
            <div
              style="position:absolute;top:30%;left:2.5%;width:23.5%;height:31%;border:2px solid #39d12f;border-radius:4px;background:rgba(57,209,47,0.16);box-shadow:0 0 10px rgba(57,209,47,0.5);">
              <span
                style="position:absolute;top:-1px;left:-1px;background:#39d12f;color:#07120f;font-size:9px;font-weight:900;padding:2px 6px;letter-spacing:0.5px;white-space:nowrap;">PET_BOTTLE
                97%</span>
            </div>
            <div
              style="position:absolute;top:38%;left:28.5%;width:18.5%;height:25%;border:2px solid #39d12f;border-radius:4px;background:rgba(57,209,47,0.16);box-shadow:0 0 10px rgba(57,209,47,0.5);">
              <span
                style="position:absolute;top:-1px;left:-1px;background:#39d12f;color:#07120f;font-size:9px;font-weight:900;padding:2px 6px;white-space:nowrap;">ALUMINUM_CAN
                98%</span>
            </div>
            <div
              style="position:absolute;top:24.5%;left:50.5%;width:25.5%;height:39%;border:2px solid #39d12f;border-radius:4px;background:rgba(57,209,47,0.16);box-shadow:0 0 10px rgba(57,209,47,0.5);">
              <span
                style="position:absolute;top:-1px;left:-1px;background:#39d12f;color:#07120f;font-size:9px;font-weight:900;padding:2px 6px;white-space:nowrap;">CARDBOARD_BOX
                96%</span>
            </div>
            <div
              style="position:absolute;top:36.5%;left:79.5%;width:16%;height:30%;border:2px solid #39d12f;border-radius:4px;background:rgba(57,209,47,0.16);box-shadow:0 0 10px rgba(57,209,47,0.5);">
              <span
                style="position:absolute;top:-1px;left:-1px;background:#39d12f;color:#07120f;font-size:9px;font-weight:900;padding:2px 6px;white-space:nowrap;">GLASS_JAR
                95%</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
            <span
              style="background:#D1FAE5;color:#065F46;padding:4px 10px;border-radius:999px;font-size:0.6875rem;font-weight:700;">✓
              PET Bottle</span>
            <span
              style="background:#D1FAE5;color:#065F46;padding:4px 10px;border-radius:999px;font-size:0.6875rem;font-weight:700;">✓
              Aluminum Can</span>
            <span
              style="background:#D1FAE5;color:#065F46;padding:4px 10px;border-radius:999px;font-size:0.6875rem;font-weight:700;">✓
              Cardboard Box</span>
            <span
              style="background:#D1FAE5;color:#065F46;padding:4px 10px;border-radius:999px;font-size:0.6875rem;font-weight:700;">✓
              Glass Jar</span>
          </div>
        </div>
      </div>

      <!-- Feature 2 -->
      <div class="feature-row reverse">
        <div class="feature-content" data-aos="fade-left">
          <div class="feature-num">Feature 02</div>
          <h3>Hazard Quarantine & Contaminant Isolation</h3>
          <p>Batteries, lithium cells, chemical containers, and high-organic materials are flagged for operator review
            before they can contaminate recyclable bales.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> Fire-risk battery alerts for operators</li>
            <li><i class="fa-solid fa-check"></i> Multi-level severity classification (low/high/critical)</li>
            <li><i class="fa-solid fa-check"></i> Reviewable quarantine recommendations</li>
          </ul>
        </div>
        <div class="feature-visual alert-feed-card" data-aos="fade-right">
          <div class="feature-visual-header">
            <span style="font-size:0.875rem;font-weight:700;">Alert Feed</span>
            <span class="feature-visual-tag alert-feed-count">3 Active Alerts</span>
          </div>
          <div class="alert-feed-list">
            <div class="alert-feed-row critical">
              <span class="alert-feed-icon"><i class="fa-solid fa-battery-full"></i></span>
              <div><strong>Battery Hazard | hazard-sample.png</strong><br><small>Lithium risk detected | Operator quarantine recommended</small></div>
              <span class="alert-feed-severity">Critical</span>
            </div>
            <div class="alert-feed-row high">
              <span class="alert-feed-icon"><i class="fa-solid fa-seedling"></i></span>
              <div><strong>Organic Contamination | mixed-batch.zip</strong><br><small>Food waste in recyclable stream</small></div>
              <span class="alert-feed-severity">High</span>
            </div>
            <div class="alert-feed-row review">
              <span class="alert-feed-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
              <div><strong>Low Confidence Review | glass-upload.jpg</strong><br><small>Glass result at 82% | manual review needed</small></div>
              <span class="alert-feed-severity">Review</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature 3 -->
      <div class="feature-row">
        <div class="feature-content" data-aos="fade-right">
          <div class="feature-num">Feature 03</div>
          <h3>Operations Command Dashboard</h3>
          <p>Upload-wide KPIs, estimated recovery values, material yield charts, and purity gauges in one
            unified command view for facility operators and QA managers.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> Illustrative diverted-material breakdown</li>
            <li><i class="fa-solid fa-check"></i> Illustrative recovery-value estimates</li>
            <li><i class="fa-solid fa-check"></i> Drill-through analytics from KPI to raw scan data</li>
          </ul>
        </div>
        <div class="feature-visual material-dashboard-card" data-aos="fade-left">
          <div class="feature-visual-header">
            <span style="font-size:0.875rem;font-weight:700;">Material Diverted (YTD)</span>
            <span class="feature-visual-tag">+5.2% VS LAST YEAR</span>
          </div>
          <div class="material-metric-grid">
            <div class="material-metric-tile">
              <strong>957t</strong>
              <span>MATERIAL SUMMARY</span>
            </div>
            <div class="material-metric-tile">
              <strong>$799k</strong>
              <span>ESTIMATED RECOVERY VALUE</span>
            </div>
          </div>
          <div class="material-bar-list">
            <div class="material-bar-row">
              <span>Metal | 450t</span><strong>$540k</strong><i style="width:90%"></i>
            </div>
            <div class="material-bar-row">
              <span>Plastic | 380t</span><strong>$152k</strong><i style="width:75%"></i>
            </div>
            <div class="material-bar-row">
              <span>Glass | 127t</span><strong>$107k</strong><i style="width:52%"></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 7 — LIVE IMPACT COUNTERS
  ══════════════════════════════════════ -->
  <section id="impact" class="section impact-section">
    <div class="section-inner">
      <div class="section-header centered impact-header" data-aos="fade-up">
        <div class="section-tag impact-tag">
          <i class="fa-solid fa-flask"></i> ILLUSTRATIVE PLATFORM METRICS
        </div>
        <h2 class="section-headline">Platform Performance at a Glance</h2>
        <p class="section-sub">Example interface values showing how PurityLoop AI presents classification, review and operations information.</p>
      </div>

      <div class="impact-grid">
        <div class="impact-item" data-aos="fade-up" data-aos-delay="0">
          <span id="count-1" class="impact-num">98.2%</span>
          <p class="impact-label">Classification Visibility</p>
          <p class="impact-sub">Example 9-category dashboard signal</p>
        </div>
        <div class="impact-item" data-aos="fade-up" data-aos-delay="100">
          <span id="count-2" class="impact-num">40%</span>
          <p class="impact-label">Contamination Reduction</p>
          <p class="impact-sub">vs. manual sorting baseline</p>
        </div>
        <div class="impact-item" data-aos="fade-up" data-aos-delay="200">
          <span id="count-3" class="impact-num">30%</span>
          <p class="impact-label">Audit Time Saved</p>
          <p class="impact-sub">Per sorting batch cycle</p>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 8 — ANALYTICS SHOWCASE
  ══════════════════════════════════════ -->
  <section id="analytics" class="section section-alt">
    <div class="section-inner">
      <div class="section-header" data-aos="fade-up">
        <div>
          <div class="section-tag"><i class="fa-solid fa-chart-area"></i> Analytics</div>
          <h2 class="section-headline">AI-Powered Analytics<br>Dashboard</h2>
          <p class="section-sub">Live charts and real-time metrics that power smarter decisions across every upload
            batch.</p>
        </div>
      </div>

      <div class="analytics-grid">
        <div class="analytics-card" data-aos="fade-up" data-aos-delay="0">
          <div class="analytics-card-header">
            <h3>Material Yield Forecast</h3>
            <span
              style="font-size:0.6875rem;font-weight:700;color:#10B981;background:#D1FAE5;padding:4px 10px;border-radius:999px;">▲
              8.1% Growth</span>
          </div>
          <div class="analytics-chart-box">
            <canvas id="landingForecastChart"></canvas>
          </div>
        </div>

        <div class="analytics-card" data-aos="fade-up" data-aos-delay="80">
          <div class="analytics-card-header">
            <h3>Material Composition Mix</h3>
            <span
              style="font-size:0.6875rem;font-weight:700;color:#6B7280;background:#F3F4F6;padding:4px 10px;border-radius:999px;">2026
              YTD</span>
          </div>
          <div class="analytics-chart-box">
            <canvas id="landingInventoryChart"></canvas>
          </div>
        </div>

        <div class="analytics-card" data-aos="fade-up" data-aos-delay="160">
          <div class="analytics-card-header">
            <h3>Review Risk Heatmap</h3>
            <span
              style="font-size:0.6875rem;font-weight:700;color:#EF4444;background:#FEF2F2;padding:4px 10px;border-radius:999px;">Review
              Queue</span>
          </div>
          <div class="analytics-chart-box">
            <canvas id="landingRiskChart"></canvas>
          </div>
        </div>

        <div class="analytics-card" data-aos="fade-up" data-aos-delay="240">
          <div class="analytics-card-header">
            <h3>Quarterly Revenue Recovery</h3>
            <span
              style="font-size:0.6875rem;font-weight:700;color:#10B981;background:#D1FAE5;padding:4px 10px;border-radius:999px;">+$180k
              Q4</span>
          </div>
          <div class="analytics-chart-box">
            <canvas id="landingProcChart"></canvas>
          </div>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 10 — FINAL CTA
  ══════════════════════════════════════ -->
  <section id="contact" class="section section-alt final-cta">
    <div class="section-inner">
      <div class="final-cta-inner" data-aos="fade-up">
        <div class="section-tag" style="justify-content:center;"><i class="fa-solid fa-rocket"></i> Get Started</div>
        <h2>Ready to Experience<br>Intelligent Waste Sorting?</h2>
        <p>Explore the PurityLoop AI presentation workspace, from YOLOv8 classification to operations analytics.</p>
        <div class="final-cta-btns">
          <a href="/login" class="btn btn-xl">
            <i class="fa-solid fa-flask"></i> Login
          </a>
        </div>
        <p style="margin-top:24px;font-size:0.8125rem;color:var(--muted);">Public capstone showcase | Presentation access available</p>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       FOOTER
  ══════════════════════════════════════ -->
  <footer class="landing-footer">
    <div class="footer-logo">
      <div class="footer-logo-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      </div>
      PurityLoop AI
    </div>
    <div class="footer-links">
      <a href="#hero">Home</a>
      <a href="#features">Features</a>
      <a href="#analytics">Analytics</a>
      <a href="/login">Platform</a>
    </div>
    <p class="footer-copy">© 2026 PurityLoop AI | Capstone Presentation Project | Built with YOLOv8 +
      JavaScript</p>
  </footer>


  <!-- ══════════════════════════════════════
       SCRIPTS
  ══════════════════════════════════════ -->
`;

export default function Page() {
  return <PageHtml bodyClass="landing-body lab-ui dark-ai dark-landing" html={html} />;
}
