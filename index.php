<?php
$pageTitle = 'PurityLoop AI | Intelligent Waste Sorting Platform';
$pageDescription = 'PurityLoop AI uses YOLOv8 computer vision to automate waste sorting, detect contaminants, and power smarter recycling operations.';
$bodyClass = 'landing-body lab-ui dark-ai dark-landing';
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <meta name="description"
    content="<?= htmlspecialchars($pageDescription, ENT_QUOTES, 'UTF-8') ?>" />

  <link rel="icon" href="assets/logo.png" type="image/png" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
    rel="stylesheet" />

  <!-- CDN Packages -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/aos/2.3.4/aos.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />

  <link rel="stylesheet" href="css/style.css" />
</head>

<body class="<?= htmlspecialchars($bodyClass, ENT_QUOTES, 'UTF-8') ?>">

  <!-- ══════════════════════════════════════
       TOP NAVIGATION BAR
  ══════════════════════════════════════ -->
  <nav id="landingNav" class="landing-nav" role="navigation" aria-label="Main navigation">
    <!-- Logo -->
    <a href="index.php" class="nav-logo">
      <img src="assets/logo.png" alt="PurityLoop AI Logo" />
    </a>

    <!-- Desktop Links -->
    <div class="nav-links">
      <a href="#hero" class="nav-link active">Home</a>
      <a href="#features" class="nav-link">Features</a>
      <a href="#how" class="nav-link">How It Works</a>
      <a href="#analytics" class="nav-link">Platform</a>
      <a href="#capstone" class="nav-link">Technology</a>
      <a href="#contact" class="nav-link">Contact</a>
    </div>

    <!-- Actions -->
    <div class="nav-actions">
      <a href="#contact" class="btn-outline" style="min-height:38px;padding:0 16px;font-size:0.875rem;">Request Demo</a>
      <a href="login.php" class="btn" style="min-height:38px;padding:0 18px;font-size:0.875rem;">Login</a>
      <button id="navBurger" class="nav-burger" aria-label="Toggle menu" aria-expanded="false">
        <span class="nav-burger-label">Menu</span>
        <i class="fa-solid fa-bars"></i>
      </button>
    </div>
  </nav>

  <!-- Mobile Menu -->
  <div id="mobileMenu" class="mobile-menu" role="menu">
    <a href="#hero" class="nav-link" role="menuitem">Home</a>
    <a href="#features" class="nav-link" role="menuitem">Features</a>
    <a href="#how" class="nav-link" role="menuitem">How It Works</a>
    <a href="#analytics" class="nav-link" role="menuitem">Platform</a>
    <a href="#capstone" class="nav-link" role="menuitem">Technology</a>
    <a href="login.php" class="btn" style="margin-top:8px;">Login</a>
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
          <a href="#problem" class="btn btn-lg">
            <i class="fa-solid fa-arrow-down"></i> Explore more
          </a>
          <a href="login.php" class="btn-outline btn-lg">
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

          <div class="hdc-metrics">
            <div class="hdc-metric">
              <span class="hdc-metric-val">98.2%</span>
              <span class="hdc-metric-label">AI Precision</span>
            </div>
            <div class="hdc-metric">
              <span class="hdc-metric-val">9</span>
              <span class="hdc-metric-label">Categories</span>
            </div>
            <div class="hdc-metric">
              <span class="hdc-metric-val">&lt;100ms</span>
              <span class="hdc-metric-label">Inference</span>
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
              <span class="hdc-item-label">YOLOv8 Detection</span>
              <span class="hdc-item-val">97.3%</span>
            </div>
            <div class="hdc-item">
              <span class="hdc-item-dot" style="background:#3B82F6"></span>
              <span class="hdc-item-label">Contaminant Blocking</span>
              <span class="hdc-item-val">Active</span>
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
       SECTION 2 — THE PROBLEM
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
       SECTION 3 — HOW IT WORKS
  ══════════════════════════════════════ -->
  <section id="how" class="section">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-up">
        <div class="section-tag"><i class="fa-solid fa-gears"></i> Process Flow</div>
        <h2 class="section-headline">How PurityLoop AI Works</h2>
        <p class="section-sub">A five-stage AI-powered pipeline that turns uploaded waste images into actionable
          recycling intelligence.</p>
      </div>

      <div class="steps-flow" data-aos="fade-up" data-aos-delay="100">
        <div class="step-item">
          <div class="step-icon-wrap"><i class="fa-solid fa-image"></i></div>
          <div class="step-num">1</div>
          <h3>Capture Waste Image</h3>
          <p>Upload single images, mixed batches, or ZIP files from the web platform.</p>
        </div>

        <div class="step-connector" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></div>

        <div class="step-item">
          <div class="step-icon-wrap"><i class="fa-solid fa-brain"></i></div>
          <div class="step-num">2</div>
          <h3>YOLOv8 Inference</h3>
          <p>Computer vision model runs in real-time, identifying 9 waste categories with confidence scoring.</p>
        </div>

        <div class="step-connector" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></div>

        <div class="step-item">
          <div class="step-icon-wrap"><i class="fa-solid fa-magnifying-glass-chart"></i></div>
          <div class="step-num">3</div>
          <h3>Bounding Box Audit</h3>
          <p>Each detected item is boxed and labeled with material type, confidence interval, and risk level.</p>
        </div>

        <div class="step-connector" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></div>

        <div class="step-item">
          <div class="step-icon-wrap"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="step-num">4</div>
          <h3>Hazard Quarantine</h3>
          <p>Batteries and chemicals trigger immediate quarantine alerts and are isolated from recyclable streams.</p>
        </div>

        <div class="step-connector" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></div>

        <div class="step-item">
          <div class="step-icon-wrap"><i class="fa-solid fa-chart-line"></i></div>
          <div class="step-num">5</div>
          <h3>Operations Dashboard</h3>
          <p>Material yields, purity rates, and commodity values flow into real-time analytics and audit ledger.</p>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 4 — CORE FEATURES
  ══════════════════════════════════════ -->
  <section id="features" class="section section-alt">
    <div class="section-inner">
      <div class="section-header" data-aos="fade-right">
        <div>
          <div class="section-tag"><i class="fa-solid fa-star"></i> Platform Features</div>
          <h2 class="section-headline">Everything You Need to Run<br>a Smarter Facility</h2>
          <p class="section-sub">From live inference to executive reporting, PurityLoop AI covers the entire
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
            <img src="assets/items/upload-result-reference.png" alt="Conveyor belt scan"
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
          <p>Batteries, lithium cells, chemical containers, and high-organic materials are automatically flagged and
            isolated before they can contaminate recyclable bales, protecting commodity value and plant safety.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> Automatic fire-risk battery isolation</li>
            <li><i class="fa-solid fa-check"></i> Multi-level severity classification (low/high/critical)</li>
            <li><i class="fa-solid fa-check"></i> Real-time quarantine alert with override capability</li>
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
              <div><strong>Battery Hazard | hazard-sample.png</strong><br><small>Lithium risk detected | Immediate quarantine</small></div>
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
          <p>Upload-wide KPIs, commodity resale tracking, material yield charts, and purity ring gauges in one
            unified command view for facility operators and QA managers.</p>
          <ul class="feature-list">
            <li><i class="fa-solid fa-check"></i> 1,500t diverted YTD with per-material breakdown</li>
            <li><i class="fa-solid fa-check"></i> $842,500 estimated commodity revenue tracked</li>
            <li><i class="fa-solid fa-check"></i> Drill-through analytics from KPI to raw scan data</li>
          </ul>
        </div>
        <div class="feature-visual material-dashboard-card" data-aos="fade-left">
          <div class="feature-visual-header">
            <span style="font-size:0.875rem;font-weight:700;">Material Diverted (YTD)</span>
            <span class="feature-visual-tag">+5.2% vs last year</span>
          </div>
          <div class="material-metric-grid">
            <div class="material-metric-tile">
              <strong>1,500t</strong>
              <span>Total Diverted</span>
            </div>
            <div class="material-metric-tile">
              <strong>$842k</strong>
              <span>Revenue</span>
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
       SECTION 5 — LIVE IMPACT COUNTERS
  ══════════════════════════════════════ -->
  <section id="impact" class="section impact-section">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-up" style="color:white;margin-bottom:60px;">
        <div class="section-tag"
          style="background:rgba(255,255,255,0.1);color:#6EE7B7;border-color:rgba(255,255,255,0.15);">
          <i class="fa-solid fa-chart-line"></i> Real Results
        </div>
        <h2 class="section-headline" style="color:white;">Platform Performance at a Glance</h2>
        <p class="section-sub" style="color:rgba(255,255,255,0.6);">Measured across uploaded images and material
          categories for the 2026 capstone prototype.</p>
      </div>

      <div class="impact-grid">
        <div class="impact-item" data-aos="fade-up" data-aos-delay="0">
          <span id="count-1" class="impact-num">98.2%</span>
          <p class="impact-label">Detection Accuracy</p>
          <p class="impact-sub">Across all 9 waste categories</p>
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
        <div class="impact-item" data-aos="fade-up" data-aos-delay="300">
          <span id="count-4" class="impact-num">24/7</span>
          <p class="impact-label">Uptime Monitoring</p>
          <p class="impact-sub">Continuous AI operation</p>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 6 — ANALYTICS SHOWCASE
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
       SECTION 7 — CAPSTONE HIGHLIGHTS
  ══════════════════════════════════════ -->
  <section id="capstone" class="section">
    <div class="section-inner">
      <div class="section-header centered" data-aos="fade-up">
        <div class="section-tag"><i class="fa-solid fa-graduation-cap"></i> Capstone 2026</div>
        <h2 class="section-headline">Built with Cutting-Edge Technology</h2>
        <p class="section-sub">A full-stack AI prototype designed for real Material Recovery Facility operations, built
          as a final year capstone project.</p>
      </div>

      <div class="capstone-grid">
        <div data-aos="fade-right">
          <h3 style="margin-bottom:20px;">Technology Stack</h3>
          <div class="tech-stack-grid">
            <span class="tech-pill"><i class="fa-brands fa-html5"></i> HTML5</span>
            <span class="tech-pill"><i class="fa-solid fa-palette"></i> Tailwind CSS</span>
            <span class="tech-pill"><i class="fa-brands fa-js"></i> JavaScript ES6+</span>
            <span class="tech-pill"><i class="fa-solid fa-chart-bar"></i> Chart.js</span>
            <span class="tech-pill"><i class="fa-solid fa-brain"></i> YOLOv8 AI Model</span>
            <span class="tech-pill"><i class="fa-solid fa-robot"></i> Machine Learning</span>
            <span class="tech-pill"><i class="fa-solid fa-bolt"></i> GSAP Animation</span>
            <span class="tech-pill"><i class="fa-solid fa-eye"></i> Computer Vision</span>
            <span class="tech-pill"><i class="fa-brands fa-github"></i> Git & GitHub</span>
            <span class="tech-pill"><i class="fa-solid fa-server"></i> Vercel Deploy</span>
          </div>
        </div>

        <div data-aos="fade-left">
          <h3 style="margin-bottom:20px;">Research Areas</h3>
          <div class="research-list">
            <div class="research-item">
              <i class="fa-solid fa-recycle"></i>
              <div>
                <h4>Waste Stream Classification</h4>
                <p>YOLOv8 object detection trained on 9-category waste taxonomy for MRF operations.</p>
              </div>
            </div>
            <div class="research-item">
              <i class="fa-solid fa-shield-halved"></i>
              <div>
                <h4>Hazard Detection & Isolation</h4>
                <p>Real-time battery and chemical contaminant identification with automatic quarantine triggers.</p>
              </div>
            </div>
            <div class="research-item">
              <i class="fa-solid fa-chart-line"></i>
              <div>
                <h4>Purity & Yield Analytics</h4>
                <p>Material purity scoring, tonnage tracking, and commodity value intelligence dashboards.</p>
              </div>
            </div>
            <div class="research-item">
              <i class="fa-solid fa-magnifying-glass-chart"></i>
              <div>
                <h4>Audit Trail & QA Workflow</h4>
                <p>Full scan verification ledger with human-in-the-loop override capability for low-confidence results.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════
       SECTION 8 — FINAL CTA
  ══════════════════════════════════════ -->
  <section id="contact" class="section section-alt final-cta">
    <div class="section-inner">
      <div class="final-cta-inner" data-aos="fade-up">
        <div class="section-tag" style="justify-content:center;"><i class="fa-solid fa-rocket"></i> Get Started</div>
        <h2>Ready to Experience<br>Intelligent Waste Sorting?</h2>
        <p>Explore the full PurityLoop AI platform, from YOLOv8 inference to operations analytics. Built for real
          MRF use cases.</p>
        <div class="final-cta-btns">
          <a href="login.php" class="btn btn-xl">
            <i class="fa-solid fa-sign-in-alt"></i> Launch Platform
          </a>
          <a href="#analytics" class="btn-outline btn-xl">
            <i class="fa-solid fa-chart-area"></i> View Analytics Demo
          </a>
        </div>
        <p style="margin-top:24px;font-size:0.8125rem;color:var(--muted);">Capstone prototype | No account required |
          Free access</p>
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
      <a href="#how">How It Works</a>
      <a href="#analytics">Analytics</a>
      <a href="#capstone">Capstone</a>
      <a href="login.php">Platform</a>
    </div>
    <p class="footer-copy">© 2026 PurityLoop AI | Capstone Demonstration Project | Built with YOLOv8 +
      JavaScript</p>
  </footer>


  <!-- ══════════════════════════════════════
       SCRIPTS
  ══════════════════════════════════════ -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/aos/2.3.4/aos.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/typed.js/2.0.16/typed.umd.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/countup.js/2.8.0/countUp.umd.js"></script>
  <script src="js/theme.js"></script>

</body>

</html>
