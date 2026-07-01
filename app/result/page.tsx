import PageHtml from "@/components/PageHtml";

const html = `
<div class="app-layout">
    <div id="sidebarOverlay" class="sidebar-overlay"></div>

    <aside id="appSidebar" class="sidebar">
      <div class="sidebar-header">
        <a href="/" class="sidebar-logo">
          <img src="/assets/logo.png" alt="PurityLoop AI Logo" />
        </a>
        <button id="sidebarToggle" class="sidebar-toggle" aria-label="Collapse Sidebar">
          <i class="fa-solid fa-angles-left"></i>
        </button>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Platform</div>
        <a href="/upload" class="nav-item" data-tooltip="Upload">
          <i class="nav-item-icon fa-solid fa-cloud-arrow-up"></i>
          <span class="nav-item-label">Upload</span>
        </a>
        <a href="/result" class="nav-item active" data-tooltip="Result">
          <i class="nav-item-icon fa-solid fa-wand-magic-sparkles"></i>
          <span class="nav-item-label">Result</span>
        </a>
        <a href="/log" class="nav-item" data-tooltip="Log">
          <i class="nav-item-icon fa-solid fa-clipboard-check"></i>
          <span class="nav-item-label">Log</span>
        </a>
        <a href="/analytics" class="nav-item" data-tooltip="Analytics">
          <i class="nav-item-icon fa-solid fa-chart-line"></i>
          <span class="nav-item-label">Analytics</span>
        </a>
        <a href="/submit-ticket" class="nav-item" data-tooltip="Submit Ticket">
          <i class="nav-item-icon fa-solid fa-ticket"></i>
          <span class="nav-item-label">Submit Ticket</span>
        </a>
        <a href="/settings" class="nav-item" data-tooltip="Settings">
          <i class="nav-item-icon fa-solid fa-gear"></i>
          <span class="nav-item-label">Settings</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="user-row">
          <div class="user-avatar">AD</div>
          <div class="user-info">
            <div class="user-name">Admin Operator</div>
            <div class="user-role">MRF Review Mode</div>
          </div>
        </div>
        <a href="/login" class="logout-btn">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span class="logout-text">Logout</span>
        </a>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="topbar-left">
          <button id="mobileToggle" class="mobile-toggle" aria-label="Open navigation">
            <i class="fa-solid fa-bars"></i>
          </button>
          <div class="topbar-title">
            <h1>Image Classification Results</h1>
            <p>Review uploaded images, confidence scores, contaminants, and recommended sorting action.</p>
          </div>
        </div>

        <div class="topbar-right">
          <div class="search-bar">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" placeholder="Search uploads, materials, confidence..." aria-label="Search" />
          </div>

          <div class="date-pill">
            <i class="fa-solid fa-clock" style="margin-right: 4px;"></i>
            <span id="liveClock">00:00:00 AM</span>
          </div>

          <button class="topbar-icon-btn" aria-label="Notifications">
            <i class="fa-solid fa-bell"></i>
            <span class="notif-dot"></span>
          </button>

          <div class="user-badge live-badge">
            <div class="user-badge-avatar">AI</div>
            <span>Processing</span>
          </div>
        </div>
      </header>

      <div class="page-body">
        <section class="ops-hero result-hero">
          <div class="ops-hero-copy">
            <span class="ops-kicker">Upload-to-result workflow</span>
            <h2>Every image becomes a reviewable sorting decision.</h2>
            <p>PurityLoop AI maps uploaded waste images into detected materials, confidence scores, contamination flags,
              and a human-approved log trail.</p>
          </div>
          <div class="ops-hero-metrics" aria-label="Current result summary">
            <div>
              <span id="liveScanned">0 items</span>
              <small>Detected in active image</small>
            </div>
            <div>
              <span id="livePurity">0%</span>
              <small>Estimated purity</small>
            </div>
            <div>
              <span id="liveMarketValue">$0.00</span>
              <small>Recoverable value</small>
            </div>
            <div>
              <span id="liveCO2Offset">0.0 kg</span>
              <small>CO2 offset</small>
            </div>
          </div>
        </section>

        <section class="result-workbench">
          <article class="stream-panel bbox-card">
            <div class="stream-panel-header">
              <div>
                <span class="panel-kicker">Active image analysis</span>
                <h2 id="liveStreamTitle">Select image to audit</h2>
              </div>
              <span class="recording-chip">
                <span></span> AI ready
              </span>
            </div>

            <div class="stream-canvas-wrap">
              <canvas id="liveInferenceCanvas" aria-label="Waste sorting classification overlay"></canvas>
              <div class="scan-line"></div>
              <div class="scan-hud" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </article>

          <aside class="result-inspector">
            <section class="mini-panel detection-panel bbox-card">
              <div class="panel-heading-row">
                <h3>Material breakdown</h3>
                <span>Live inference</span>
              </div>
              <div id="liveFeed" class="live-feed">
                <div class="feed-empty">Upload or select an image to view detected materials.</div>
              </div>
            </section>

            <section class="mini-panel action-panel bbox-card" id="liveActionPanel">
              <div class="panel-heading-row">
                <h3>Recommended action</h3>
                <span>Human check</span>
              </div>
              <div id="liveActionText">
                Select an uploaded image to generate a sorting recommendation.
              </div>
              <div class="action-button-stack">
                <button type="button" id="activeBeltDetailBtn" class="primary-btn full-btn">Verify result</button>
                <a href="/log" class="secondary-btn full-btn">Open review logs</a>
              </div>
            </section>
          </aside>
        </section>

        <section class="upload-review-board">
          <header class="finder-header">
            <div>
              <span class="panel-kicker">Uploaded image queue</span>
              <h2>Images waiting for audit</h2>
            </div>
            <div class="finder-toolbar">
              <div class="live-toggle-container" id="liveScanToggle">
                <span class="recording-chip compact">
                  <span class="snapshot-live"></span>
                  Simulate incoming uploads
                </span>
                <label class="switch">
                  <input type="checkbox" id="autoScanCheckbox">
                  <span class="slider"></span>
                </label>
              </div>
              <div class="queue-count-pill">
                <span id="finderCountText">0 items</span>
              </div>
            </div>
          </header>

          <div class="finder-body">
            <aside class="finder-sidebar">
              <h4>Queue views</h4>
              <div class="finder-sidebar-list">
                <button type="button" class="finder-sidebar-item active">All uploads</button>
                <button type="button" class="finder-sidebar-item">Needs review</button>
                <button type="button" class="finder-sidebar-item">Quarantine candidates</button>
              </div>
            </aside>

            <div class="finder-content-pane">
              <div class="finder-grid" id="finderGrid">
                <div class="feed-empty">No uploaded images yet.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="detail-dock" id="liveDrillDetails">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Batch diagnostics</p>
              <h2>Upload source and material details</h2>
            </div>
            <p class="detail-hint">Select an image or material to inspect model confidence, batch source, and risk
              profile.</p>
          </div>

          <article class="panel detail-panel active belt-detail-output bbox-card" id="detail-belt">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Upload source</p>
                <h2>Source: <span data-belt-id>Upload queue</span></h2>
                <p class="detail-copy" data-belt-insight>Image uploads are queued for AI classification and human
                  verification.</p>
              </div>
            </div>

            <div class="detail-grid three">
              <div class="metric-tile static"><span>Processing load</span><strong data-belt-load>On-demand</strong><small
                  data-belt-capacity>Upload queue</small></div>
              <div class="metric-tile static"><span>AI model</span><strong data-belt-speed>YOLOv8 active</strong><small
                  data-belt-max-speed>Classification core</small></div>
              <div class="metric-tile static"><span>Review action</span><strong
                  data-belt-action>Ready</strong><small>Human-in-the-loop enabled</small></div>
            </div>

            <div class="detail-grid two">
              <div class="detail-card">
                <h3>Upload diagnostics</h3>
                <dl class="detail-list">
                  <div>
                    <dt>Input channel</dt>
                    <dd data-belt-scanner>Web upload</dd>
                  </div>
                  <div>
                    <dt>Compute state</dt>
                    <dd data-belt-motor>Online</dd>
                  </div>
                  <div>
                    <dt>File policy</dt>
                    <dd data-belt-air>100 MB batch limit</dd>
                  </div>
                </dl>
              </div>
              <div class="detail-card">
                <h3>Model reliability and mix</h3>
                <div class="bar-list compact" data-belt-uptime></div>
                <div class="bar-list compact" data-belt-composition></div>
              </div>
            </div>
          </article>

          <article class="panel detail-panel material-detail-output bbox-card" id="detail-material">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Material deep dive</p>
                <h2><span data-material-title>Material</span> Details</h2>
                <p data-material-subtitle class="detail-copy">Review volume metrics, contamination risk, and historical
                  trend signals for the selected material.</p>
              </div>
            </div>

            <div class="detail-grid three">
              <div class="metric-tile static"><span data-material-kpi-one>Total flagged</span><strong
                  data-material-tonnage>0</strong><small>Current mock dataset</small></div>
              <div class="metric-tile static"><span data-material-kpi-two>Market value</span><strong
                  data-material-value>$0</strong><small data-material-rate>Estimated</small></div>
              <div class="metric-tile static"><span data-material-kpi-three>Risk rating</span><strong
                  data-material-purity>Medium</strong><small data-material-status>Awaiting review</small></div>
            </div>

            <div class="detail-grid two">
              <div class="detail-card">
                <h3 data-material-trend-title>30-day trend</h3>
                <div class="spark-bars" data-material-trend></div>
              </div>
              <div class="detail-card">
                <h3 data-material-zone-title>Distribution by upload type</h3>
                <div class="bar-list compact" data-material-zones></div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page result-pro-page lab-ui dark-ai dark-app" dataPage="result" html={html} />;
}
