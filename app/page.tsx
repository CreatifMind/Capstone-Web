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
      <a href="#methodology" class="nav-link">Methodology</a>
      <a href="#features" class="nav-link">Features</a>
      <a href="#analytics" class="nav-link">Analytics</a>
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
      <a href="#methodology" class="nav-link" role="menuitem">Methodology</a>
      <a href="#features" class="nav-link" role="menuitem">Features</a>
      <a href="#analytics" class="nav-link" role="menuitem">Analytics</a>
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
          <span class="hero-tag-text">CAPSTONE PROJECT | YOLOV8 | AUTOMATED MRF CLASSIFICATION</span>
        </div>

        <h1 class="hero-headline">
          Automated waste<span class="hero-phone-break"><br /></span> sorting for
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
            <span class="hdc-title">Detection Preview</span>
            <span class="hdc-live"><span class="hdc-live-dot"></span> DEMONSTRATION</span>
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
              <span class="hdc-item-label">Contaminant Review</span>
              <span class="hdc-item-val">Enabled</span>
            </div>
            <div class="hdc-item">
              <span class="hdc-item-dot" style="background:#3B82F6"></span>
              <span class="hdc-item-label">Audit Trail</span>
              <span class="hdc-item-val">Connected</span>
            </div>
            <div class="hdc-item">
              <span class="hdc-item-dot" style="background:#F59E0B"></span>
              <span class="hdc-item-label">Analytics Workspace</span>
              <span class="hdc-item-val">Available</span>
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
        <video class="business-video" controls loop playsinline preload="metadata" poster="/assets/capstone-project-poster.jpg">
          <source src="/assets/capstone-project.mp4" type="video/mp4" />
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
        <p class="section-sub">Manual recycling operations suffer from human error, contamination, and limited
          visibility into material quality.</p>
      </div>

      <div class="problem-grid">
        <div class="problem-card" data-aos="fade-up" data-aos-delay="0">
          <div class="problem-icon red"><i class="fa-solid fa-boxes-stacked"></i></div>
          <h3>Contaminant Infiltration</h3>
          <p>Batteries, suspected contaminants, and organic waste enter recyclable streams, causing entire bale rejections and costly
            re-processing.</p>
        </div>

        <div class="problem-card" data-aos="fade-up" data-aos-delay="80">
          <div class="problem-icon amber"><i class="fa-solid fa-eye-slash"></i></div>
          <h3>Zero Sorting Visibility</h3>
          <p>Operators have limited confidence scoring, material purity tracking, and audit trails for sorted
            batches.</p>
        </div>

        <div class="problem-card" data-aos="fade-up" data-aos-delay="160">
          <div class="problem-icon blue"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <h3>Manual Review Backlog</h3>
          <p>Low-confidence scans pile up for human review, creating workflow bottlenecks that delay commodity baling
            and shipment.</p>
        </div>

        <div class="problem-card" data-aos="fade-up" data-aos-delay="240">
          <div class="problem-icon green"><i class="fa-solid fa-chart-bar"></i></div>
          <h3>No Material Intelligence</h3>
          <p>Without per-material yield tracking, facilities can't identify which waste streams generate the highest
            commodity value.</p>
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
          <button id="methodology-tab-5" class="methodology-tab" type="button" role="tab" aria-selected="false" aria-controls="methodology-panel-5" tabindex="-1" data-methodology-tab="4">
            <span>05 — Per-Class Model Performance</span>
            <small>Detailed 9-class mAP, precision, recall, and F1 validation metrics.</small>
          </button>
          <button id="methodology-tab-6" class="methodology-tab" type="button" role="tab" aria-selected="false" aria-controls="methodology-panel-6" tabindex="-1" data-methodology-tab="5">
            <span>06 — Model Training &amp; Benchmarks</span>
            <small>Training hyperparameters, +0.043 baseline lift, and academic industry citations.</small>
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
              <span class="methodology-index">04 / Validation Criteria</span>
              <h3>Model Acceptance Targets &amp; Routing Rules</h3>
              <p>Proposed performance targets and operational confidence thresholds. These values are validation criteria, not final measured results.</p>
            </div>
            <div class="methodology-evidence">
              <figure class="methodology-figure">
                <img data-src="/assets/Production Model Success Metrics.png" width="1536" height="1024" alt="Production model success metrics diagram showing capstone validation targets for mAP, recall, inference latency, class thresholds, and human review rules." data-methodology-image="3" loading="lazy" />
              </figure>
            </div>
          </article>

          <article id="methodology-panel-5" class="methodology-panel methodology-results-panel" role="tabpanel" aria-labelledby="methodology-tab-5" tabindex="0" data-methodology-panel="4" hidden>
            <div class="methodology-panel-copy">
              <span class="methodology-index">05 / Model Performance</span>
              <h3>Per-Class Model Performance &amp; Measured Validation</h3>
              <p>Final held-out validation results scored on 8,453 test images. Highlights overall 9-class mAP vs individual material performance.</p>
            </div>
            <div class="methodology-evidence">
              <div class="measured-performance-panel" aria-label="Measured model performance results">
                <div class="measured-performance-summary">
                  <dl class="measured-performance-grid">
                    <div><dt>Overall 9-Class mAP</dt><dd>59.5%</dd><small>Primary 9-class Box mAP@0.5</small></div>
                    <div><dt>8-Class View mAP</dt><dd>61.9%</dd><small>Excludes general_trash bucket</small></div>
                    <div><dt>Naming Accuracy</dt><dd>91.8%</dd><small>Correct classification on detected items</small></div>
                    <div><dt>Validation Set</dt><dd>8,453 images</dd><small>Held-out validation dataset</small></div>
                  </dl>
                </div>

                <div class="per-class-results-section" style="margin-top:20px;">
                  <h4 style="font-size:1rem;font-weight:700;margin-bottom:8px;color:var(--text);">9-Class Per-Class Performance Breakdown</h4>
                  <p style="font-size:0.82rem;color:var(--muted);margin-bottom:14px;">Evaluated at serving confidence threshold 0.32 on 8,453 held-out validation images (Ultralytics Box &amp; Mask mAP harness).</p>
                  
                  <div class="table-responsive">
                    <table class="per-class-table" style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                      <thead>
                        <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--muted);font-size:0.75rem;text-transform:uppercase;">
                          <th style="padding:10px 8px;">Material Class</th>
                          <th style="padding:10px 8px;">Box mAP50</th>
                          <th style="padding:10px 8px;">Mask mAP50</th>
                          <th style="padding:10px 8px;">Precision</th>
                          <th style="padding:10px 8px;">Recall</th>
                          <th style="padding:10px 8px;">F1 Score</th>
                          <th style="padding:10px 8px;">Performance Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Battery</strong></td>
                          <td style="padding:10px 8px;font-weight:700;color:var(--primary);">68.8%</td>
                          <td style="padding:10px 8px;">63.7%</td>
                          <td style="padding:10px 8px;">60.8%</td>
                          <td style="padding:10px 8px;">74.7%</td>
                          <td style="padding:10px 8px;">67.0%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-high">High Accuracy</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Textile</strong></td>
                          <td style="padding:10px 8px;font-weight:700;color:var(--primary);">68.4%</td>
                          <td style="padding:10px 8px;">62.7%</td>
                          <td style="padding:10px 8px;">61.5%</td>
                          <td style="padding:10px 8px;">64.0%</td>
                          <td style="padding:10px 8px;">62.7%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-high">High Accuracy</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Glass</strong></td>
                          <td style="padding:10px 8px;font-weight:700;color:var(--primary);">68.2%</td>
                          <td style="padding:10px 8px;">65.8%</td>
                          <td style="padding:10px 8px;">65.2%</td>
                          <td style="padding:10px 8px;">62.7%</td>
                          <td style="padding:10px 8px;">63.9%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-high">High Accuracy</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Metal</strong></td>
                          <td style="padding:10px 8px;font-weight:700;color:var(--primary);">67.6%</td>
                          <td style="padding:10px 8px;">65.9%</td>
                          <td style="padding:10px 8px;">66.9%</td>
                          <td style="padding:10px 8px;">62.2%</td>
                          <td style="padding:10px 8px;">64.5%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-high">High Accuracy</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Food Organic</strong></td>
                          <td style="padding:10px 8px;font-weight:700;color:var(--primary);">66.6%</td>
                          <td style="padding:10px 8px;">65.2%</td>
                          <td style="padding:10px 8px;">66.3%</td>
                          <td style="padding:10px 8px;">62.9%</td>
                          <td style="padding:10px 8px;">64.6%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-high">High Accuracy</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Cardboard</strong></td>
                          <td style="padding:10px 8px;font-weight:700;">57.6%</td>
                          <td style="padding:10px 8px;">53.0%</td>
                          <td style="padding:10px 8px;">55.3%</td>
                          <td style="padding:10px 8px;">56.6%</td>
                          <td style="padding:10px 8px;">56.0%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-mid">Moderate</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Plastic</strong></td>
                          <td style="padding:10px 8px;font-weight:700;">49.2%</td>
                          <td style="padding:10px 8px;">45.5%</td>
                          <td style="padding:10px 8px;">55.9%</td>
                          <td style="padding:10px 8px;">46.1%</td>
                          <td style="padding:10px 8px;">50.6%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-challenging">Deformable / Occluded</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>Paper</strong></td>
                          <td style="padding:10px 8px;font-weight:700;">49.0%</td>
                          <td style="padding:10px 8px;">44.2%</td>
                          <td style="padding:10px 8px;">50.5%</td>
                          <td style="padding:10px 8px;">49.3%</td>
                          <td style="padding:10px 8px;">49.9%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-challenging">Deformable / Occluded</span></td>
                        </tr>
                        <tr style="border-bottom:1px solid var(--border);">
                          <td style="padding:10px 8px;"><strong>General Trash</strong></td>
                          <td style="padding:10px 8px;font-weight:700;">40.5%</td>
                          <td style="padding:10px 8px;">37.8%</td>
                          <td style="padding:10px 8px;">52.1%</td>
                          <td style="padding:10px 8px;">39.8%</td>
                          <td style="padding:10px 8px;">45.1%</td>
                          <td style="padding:10px 8px;"><span class="tier-tag tier-trash">Catch-All Bucket</span></td>
                        </tr>
                        <tr style="background:rgba(0,240,138,0.06);font-weight:700;">
                          <td style="padding:10px 8px;">ALL 9 CLASSES</td>
                          <td style="padding:10px 8px;color:var(--primary);">59.5%</td>
                          <td style="padding:10px 8px;">56.0%</td>
                          <td style="padding:10px 8px;">--</td>
                          <td style="padding:10px 8px;">57.4%</td>
                          <td style="padding:10px 8px;">--</td>
                          <td style="padding:10px 8px;">Combined Average</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article id="methodology-panel-6" class="methodology-panel methodology-results-panel" role="tabpanel" aria-labelledby="methodology-tab-6" tabindex="0" data-methodology-panel="5" hidden>
            <div class="methodology-panel-copy">
              <span class="methodology-index">06 / Model Training &amp; Benchmarks</span>
              <h3>Model Lift &amp; Industry Benchmarks</h3>
              <p>Model performance improvements over baseline and industry benchmark comparisons.</p>
            </div>
            <div class="methodology-evidence">
              <div class="measured-performance-panel">
                
                <div style="padding:18px;border:1px solid var(--primary);border-radius:12px;background:color-mix(in srgb, var(--primary) 8%, var(--surface));margin-bottom:24px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
                    <div>
                      <h4 style="margin:0 0 4px;font-size:1.02rem;font-weight:700;color:var(--primary);">Model Improvement Over Baseline</h4>
                      <p style="margin:0;font-size:0.86rem;color:var(--muted);">Demonstrated accuracy gains through AI dataset refinement and segmentation optimization.</p>
                    </div>
                    <span style="font-size:1.15rem;font-weight:800;padding:6px 14px;border-radius:999px;background:var(--primary);color:#fff;">+4.3% Model Lift</span>
                  </div>

                  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid color-mix(in srgb, var(--primary) 20%, transparent);">
                    <div style="padding:10px 12px;border-radius:8px;background:var(--surface);">
                      <small style="color:var(--muted);font-size:0.75rem;font-weight:600;text-transform:uppercase;">Baseline Model</small>
                      <p style="margin:2px 0 0;font-size:1.1rem;font-weight:800;color:var(--text);">55.2% mAP</p>
                    </div>
                    <div style="padding:10px 12px;border-radius:8px;background:var(--surface);border:1px solid var(--primary);">
                      <small style="color:var(--primary);font-size:0.75rem;font-weight:700;text-transform:uppercase;">PurityLoop AI (Shipped)</small>
                      <p style="margin:2px 0 0;font-size:1.1rem;font-weight:800;color:var(--primary);">59.5% mAP</p>
                    </div>
                    <div style="padding:10px 12px;border-radius:8px;background:var(--surface);">
                      <small style="color:var(--muted);font-size:0.75rem;font-weight:600;text-transform:uppercase;">Relative Improvement</small>
                      <p style="margin:2px 0 0;font-size:1.1rem;font-weight:800;color:var(--primary);">+7.8% Gain</p>
                    </div>
                  </div>
                </div>

                <h4 style="font-size:1rem;font-weight:700;margin-bottom:8px;color:var(--text);">Field Benchmark Comparison</h4>
                <p style="font-size:0.82rem;color:var(--muted);margin-bottom:14px;">Comparing PurityLoop performance against industry standards and published computer vision literature.</p>
                
                <div class="table-responsive">
                  <table class="per-class-table" style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                    <thead>
                      <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--muted);font-size:0.75rem;text-transform:uppercase;">
                        <th style="padding:10px 8px;">System / Model</th>
                        <th style="padding:10px 8px;">mAP50 Score</th>
                        <th style="padding:10px 8px;">Domain &amp; Dataset</th>
                        <th style="padding:10px 8px;">Reference Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style="background:rgba(0,240,138,0.12);font-weight:700;border-bottom:1px solid var(--border);">
                        <td style="padding:10px 8px;color:var(--primary);font-size:0.9rem;"><strong>PurityLoop AI (Shipped Model)</strong></td>
                        <td style="padding:10px 8px;color:var(--primary);font-weight:800;font-size:0.95rem;">59.5%</td>
                        <td style="padding:10px 8px;">8,453 held-out validation images</td>
                        <td style="padding:10px 8px;"><strong>This Capstone Project</strong> (2026)</td>
                      </tr>
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 8px;"><strong>EcoDetect-YOLOv2</strong></td>
                        <td style="padding:10px 8px;font-weight:700;">59.9%</td>
                        <td style="padding:10px 8px;">IEWED 9-class cluttered stream</td>
                        <td style="padding:10px 8px;"><small><a href="https://www.mdpi.com/1424-8220/25/11/3451" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">MDPI <em>Sensors Journal</em> (2025) <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;"></i></a></small></td>
                      </tr>
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 8px;"><strong>TridentNet Baseline</strong></td>
                        <td style="padding:10px 8px;">36.3%</td>
                        <td style="padding:10px 8px;">ZeroWaste industrial baseline</td>
                        <td style="padding:10px 8px;"><small><a href="https://arxiv.org/abs/2106.02740" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">Bashkirova et al., <em>CVPR 2022</em> <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;"></i></a></small></td>
                      </tr>
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 8px;"><strong>Mask R-CNN Baseline</strong></td>
                        <td style="padding:10px 8px;">34.9%</td>
                        <td style="padding:10px 8px;">ZeroWaste industrial baseline</td>
                        <td style="padding:10px 8px;"><small><a href="https://arxiv.org/abs/2106.02740" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">Bashkirova et al., <em>CVPR 2022</em> <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;"></i></a></small></td>
                      </tr>
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 8px;"><strong>TrashDet on TACO</strong></td>
                        <td style="padding:10px 8px;">19.5%</td>
                        <td style="padding:10px 8px;">5-class litter dataset</td>
                        <td style="padding:10px 8px;"><small><a href="https://arxiv.org/abs/2003.04339" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">Proença &amp; Simões, <em>TACO Benchmark</em> <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;"></i></a></small></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          </article>
        </div>

        <div class="methodology-controls" aria-label="Methodology diagram controls">
          <button class="methodology-control" type="button" data-methodology-prev>
            <i class="fa-solid fa-arrow-left"></i> Previous
          </button>
          <span class="methodology-count" aria-live="polite" data-methodology-count>1 of 5</span>
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
          <h3>Image and Video Waste Detection</h3>
          <p>YOLOv8m-seg supports browser-assisted image detection, uploaded image analysis, and tracked MP4 processing across nine waste categories.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> Detection and classification across 9 supported waste categories</li>
            <li><i class="fa-solid fa-check"></i> Live bounding box overlays with colour-coded risk</li>
            <li><i class="fa-solid fa-check"></i> Battery hazard alerts and configurable contaminant-review rules</li>
          </ul>
        </div>
        <div class="feature-visual" data-aos="fade-left">
          <div class="feature-visual-header">
            <span style="font-size:0.875rem;font-weight:700;">Active Scan Viewport</span>
            <span class="feature-visual-tag">EXAMPLE RESULT</span>
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
          <p>Detected batteries can trigger hazard alerts, while configurable review rules help operators assess other suspected contaminants.</p>
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
              <div><strong>Low Confidence Review | glass-upload.jpg</strong><br><small>Ambiguous glass classification | manual review needed</small></div>
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
       SECTION 8 — ANALYTICS SHOWCASE
  ══════════════════════════════════════ -->
  <section id="analytics" class="section section-alt">
    <div class="section-inner">
      <div class="section-header" data-aos="fade-up">
        <div>
          <div class="section-tag"><i class="fa-solid fa-chart-area"></i> Analytics</div>
          <h2 class="section-headline">AI-Powered Analytics<br>Dashboard</h2>
          <p class="section-sub">Dashboard charts and review metrics that support smarter decisions across every upload
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
  <section id="cta" class="section section-alt final-cta">
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
      <a href="#methodology">Methodology</a>
      <a href="#features">Features</a>
      <a href="#analytics">Analytics</a>
      <a href="/login">Login</a>
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
