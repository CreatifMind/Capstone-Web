import PageHtml from "@/components/PageHtml";

const html = `
<div class="app-layout">
    <!-- Sidebar Overlay for Mobile -->
    <div id="sidebarOverlay" class="sidebar-overlay"></div>

    <!-- Collapsible Sidebar -->
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
        <a href="/result" class="nav-item" data-tooltip="Result">
          <i class="nav-item-icon fa-solid fa-wand-magic-sparkles"></i>
          <span class="nav-item-label">Result</span>
        </a>
        <a href="/log" class="nav-item" data-tooltip="Log">
          <i class="nav-item-icon fa-solid fa-clipboard-check"></i>
          <span class="nav-item-label">Log</span>
        </a>
        <a href="/analytics" class="nav-item active" data-tooltip="Analytics">
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
        <a href="/login" class="logout-btn" style="width: 100%; margin-top: 10px; display: flex;">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span class="logout-text">Logout</span>
        </a>
      </div>
    </aside>

    <main class="main-content">
      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <button id="mobileToggle" class="mobile-toggle" aria-label="Open navigation">
            <i class="fa-solid fa-bars"></i>
          </button>
          <div class="topbar-title">
            <h1>Analytics</h1>
            <p>Track upload throughput, material recovery, contamination risk, and review workload.</p>
          </div>
        </div>

        <div class="topbar-right">
          <!-- Search Bar -->
          <div class="search-bar">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" placeholder="Search uploads, materials, review logs..." aria-label="Search" />
          </div>

          <!-- Live Clock / Date Pill -->
          <div class="date-pill">
            <i class="fa-solid fa-clock" style="margin-right: 4px;"></i>
            <span id="liveClock">00:00:00 AM</span>
          </div>

          <!-- Notification Button -->
          <button class="topbar-icon-btn" aria-label="Notifications">
            <i class="fa-solid fa-bell"></i>
            <span class="notif-dot"></span>
          </button>

          <!-- User Badge -->
          <div class="user-badge">
            <div class="user-badge-avatar">AD</div>
            <span style="margin-left: 6px;">Admin Mode</span>
          </div>
        </div>
      </header>

      <div class="page-body">
        <!-- KPI ROW: 4 Cards -->
        <section class="kpi-grid kpi-grid-four">
          <article class="kpi-card material drill-trigger bbox-card" data-drill-target="detail-yield" tabindex="0">
            <div class="kpi-icon-row">
              <span class="kpi-badge badge-blue"><i class="fa-solid fa-recycle"></i></span>
              <span class="kpi-trend trend-neutral">no data</span>
            </div>
            <span>Detected Materials</span>
            <strong>0</strong>
            <p>No scan data yet</p>
            <div class="kpi-progress-meta"><span>Saved scan progress</span><strong>0%</strong></div>
            <div class="kpi-progress-bar"><span class="kpi-progress-fill" style="width: 0%"></span></div>
          </article>

          <article class="kpi-card revenue drill-trigger bbox-card" data-drill-target="detail-resale" tabindex="0">
            <div class="kpi-icon-row">
              <span class="kpi-badge badge-green"><i class="fa-solid fa-sack-dollar"></i></span>
              <span class="kpi-trend trend-neutral">no data</span>
            </div>
            <span>Revenue Data</span>
            <strong>No data</strong>
            <p>No resale formula or value field saved</p>
            <div class="kpi-progress-meta"><span>Revenue data availability</span><strong>0%</strong></div>
            <div class="kpi-progress-bar"><span class="kpi-progress-fill" style="width: 0%"></span></div>
          </article>

          <article class="kpi-card purity drill-trigger bbox-card" data-drill-target="detail-purity" tabindex="0">
            <div class="kpi-icon-row">
              <span class="kpi-badge badge-amber"><i class="fa-solid fa-chart-simple"></i></span>
              <span class="kpi-trend trend-neutral">no data</span>
            </div>
            <span>Average Confidence</span>
            <strong>0.0%</strong>
            <p>No scan data yet</p>
            <div class="kpi-progress-meta"><span>Saved scan confidence</span><strong>0%</strong></div>
            <div class="kpi-progress-bar"><span class="kpi-progress-fill" style="width: 0%"></span></div>
          </article>

          <article class="kpi-card hazard drill-trigger bbox-card" data-drill-target="detail-contaminants" tabindex="0">
            <div class="kpi-icon-row">
              <span class="kpi-badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i></span>
              <span class="kpi-trend trend-neutral">stable</span>
            </div>
            <span>Contaminated Items</span>
            <strong>0</strong>
            <p>No contamination data yet</p>
            <div class="kpi-progress-meta"><span>Current risk load</span><strong>0%</strong></div>
            <div class="kpi-progress-bar"><span class="kpi-progress-fill" style="width: 0%"></span></div>
          </article>
        </section>

        <!-- Row 2 -->
        <section class="dashboard-row-3col">
          <!-- System Alerts Panel -->
          <article class="panel alert-stack bbox-card">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">System Alerts</p>
                <h2>Live Status</h2>
              </div>
            </div>

            <a href="/log" class="alert-row review">
              <div class="alert-row-icon"><i class="fa-solid fa-bell"></i></div>
              <div class="alert-row-body">
                <strong>0 Pending Reviews</strong>
                <p>No scan data yet.</p>
              </div>
              <span class="alert-row-value">0</span>
            </a>

            <div class="alert-row success drill-trigger" data-drill-target="detail-purity" tabindex="0">
              <div class="alert-row-icon"><i class="fa-solid fa-bullseye"></i></div>
              <div class="alert-row-body">
                <strong>AI Detection Precision</strong>
                <p>No saved scans yet.</p>
              </div>
              <span class="alert-row-value">0.0%</span>
            </div>

            <div class="alert-row neutral drill-trigger" data-drill-target="detail-contaminants" tabindex="0">
              <div class="alert-row-icon"><i class="fa-solid fa-ban"></i></div>
              <div class="alert-row-body">
                <strong>Anomalies Blocked</strong>
                <p>No contamination data yet.</p>
              </div>
              <span class="alert-row-value">0</span>
            </div>

            <div class="alert-row danger-row drill-trigger" data-drill-target="detail-purity" tabindex="0">
              <div class="alert-row-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
              <div class="alert-row-body">
                <strong>No review alerts</strong>
                <p>Upload scans to generate review signals.</p>
              </div>
              <span class="alert-row-value" style="color: var(--danger);">!</span>
            </div>
          </article>

          <!-- Composition Donut Chart -->
          <article class="panel chart-panel drill-trigger bbox-card" data-drill-target="detail-composition"
            tabindex="0">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Composition</p>
                <h2>Material Mix</h2>
              </div>
            </div>
            <p class="chart-subtitle">No material data yet. Upload scans to populate this chart.</p>
            <div class="chart-box">
              <canvas id="compositionChart"></canvas>
            </div>
          </article>

          <!-- Commodity Resale Bar Chart -->
          <article class="panel chart-panel drill-trigger bbox-card" data-drill-target="detail-resale" tabindex="0">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Commodity Value</p>
                <h2>Resale Value by Category</h2>
              </div>
            </div>
            <p class="chart-subtitle">No resale data yet. Saved scans do not include revenue fields.</p>
            <div class="chart-box">
              <canvas id="resaleChart"></canvas>
            </div>
          </article>
        </section>

        <!-- Row 3 -->
        <section class="dashboard-row-3col analytics-operational-row">
          <article class="panel chart-panel review-workload-panel drill-trigger bbox-card"
            data-drill-target="detail-ledger" tabindex="0">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Review Workload</p>
                <h2>Human Review Queue</h2>
              </div>
            </div>
            <p class="chart-subtitle">Operator workload by upload type and confidence risk.</p>
            <div class="review-workload-viz" aria-label="Human review workload visualisation">
              <div class="workload-meter">
                <strong>0</strong>
                <span>Pending reviews</span>
              </div>
              <div class="workload-bars">
                <div class="workload-row">
                  <span>Mixed batches</span>
                  <strong>0%</strong>
                  <i style="width: 0%"></i>
                </div>
                <div class="workload-row">
                  <span>Low confidence scans</span>
                  <strong>0%</strong>
                  <i style="width: 0%"></i>
                </div>
                <div class="workload-row warning">
                  <span>Hazard checks</span>
                  <strong>0%</strong>
                  <i style="width: 0%"></i>
                </div>
                <div class="workload-row quiet">
                  <span>Operator corrections</span>
                  <strong>0%</strong>
                  <i style="width: 0%"></i>
                </div>
              </div>
            </div>
          </article>

          <!-- Recent Ledger Preview -->
          <article class="panel ledger-preview bbox-card">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Log Trail</p>
                <h2>Recent Verification Ledger</h2>
              </div>
              <a href="/log" class="secondary-btn">Full Ledger</a>
            </div>

            <div class="ledger-list" id="dashLedgerList">
              <div class="feed-empty">No scan history yet.</div>
            </div>
          </article>

          <!-- Yield Line Chart -->
          <article class="panel chart-panel drill-trigger bbox-card" data-drill-target="detail-yield" tabindex="0">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Yield</p>
                <h2>Material Diverted Over Time</h2>
              </div>
            </div>
            <p class="chart-subtitle">No scan data yet. Saved material counts appear here after uploads.</p>
            <div class="chart-box">
              <canvas id="yieldChart"></canvas>
            </div>
          </article>

        </section>

        <!-- DETAIL DOCK -->
        <section class="detail-dock" id="analyticsDrillDetails" style="margin-top: 24px;">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Drill-through Details</p>
              <h2>Dashboard Component Details</h2>
            </div>
            <p class="detail-hint">Select a dashboard card, chart, or list row above to inspect the diagnostic details.
            </p>
          </div>

          <!-- YIELD DETAIL -->
          <article class="panel detail-panel active" id="detail-yield">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Yield Detail</p>
                <h2>Recyclable Yield Breakdown</h2>
              </div>
            </div>
            <p class="detail-copy">Tonnage recovered by material across the past six months. Click a material row below
              to
              view specific sorting statistics.</p>
            <div class="detail-grid five">
              <div class="feed-empty">No material data yet.</div>
            </div>
            <div class="month-table">
              <div><span>No saved scans</span><strong>0</strong></div>
            </div>
          </article>

          <!-- REVENUE DETAIL -->
          <article class="panel detail-panel" id="detail-resale">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Revenue Detail</p>
                <h2>Estimated Resale Value Breakdown</h2>
              </div>
            </div>
            <p class="detail-copy">Recovered tonnage multiplied by estimated commodity resale rates. Click any material
              for detailed analysis.</p>
            <div class="table-wrap">
              <table class="ledger-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Tonnage</th>
                    <th>Market Rate</th>
                    <th>Estimated Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="4"><div class="feed-empty">No resale data yet.</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <!-- PURITY DETAIL -->
          <article class="panel detail-panel" id="detail-purity">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Purity Detail</p>
                <h2>Purity Analysis &amp; System Actions</h2>
              </div>
            </div>
            <div class="detail-grid two">
              <div class="formula-card">
                <span>Formula</span>
                <strong>Purity = Verified recyclable results / Total audited results x 100</strong>
                <p>Average purity is calculated from verified, clean recyclable upload outcomes.</p>
              </div>
              <div class="action-card warning" style="border-left: 4px solid var(--amber);">
                <span>System Alert</span>
                <strong>Glass purity dropped by 4.2%</strong>
                <p>High impurity count in mixed ZIP uploads. Review image quality and batch composition.</p>
              </div>
            </div>
            <div class="bar-list">
              <div><span>No saved scans</span><strong>0%</strong><i style="width: 0%"></i></div>
            </div>
          </article>

          <!-- COMPOSITION DETAIL -->
          <article class="panel detail-panel" id="detail-composition">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Composition Detail</p>
                <h2>Material Composition Details</h2>
              </div>
            </div>
            <div class="detail-grid two">
              <div>
                <h3>Recyclables Breakdown</h3>
                <div class="bar-list compact">
                  <div><span>No recyclable data</span><strong>0</strong><i style="width: 0%"></i></div>
                </div>
              </div>
              <div>
                <h3>Contaminants &amp; Hazards</h3>
                <div class="bar-list compact danger-bars">
                  <div><span>No contaminant data</span><strong>0</strong><i style="width: 0%"></i></div>
                </div>
              </div>
            </div>
          </article>

          <!-- CONTAMINANTS DETAIL -->
          <article class="panel detail-panel" id="detail-contaminants">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Contaminant Detail</p>
                <h2>Hazard &amp; Contaminant Logs</h2>
              </div>
            </div>
            <div class="detail-grid four">
              <div class="feed-empty">No contaminant logs yet.</div>
            </div>
          </article>

          <!-- LEDGER PREVIEW DETAIL -->
          <article class="panel detail-panel" id="detail-ledger">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Ledger Detail</p>
                <h2>Recent Scan Verification Ledger</h2>
              </div>
              <a href="/log" class="secondary-btn">Open Verification Logs Page</a>
            </div>
            <div class="table-wrap">
              <table class="ledger-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Upload Source</th>
                    <th>Material</th>
                    <th>Weight</th>
                    <th>AI Confidence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="6"><div class="feed-empty">No scan history yet.</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <!-- MATERIAL DEEP DIVE -->
          <article class="panel detail-panel material-detail-output" id="detail-material">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Material Deep Dive</p>
                <h2><span data-material-title>Material</span> Details</h2>
                <p data-material-subtitle class="detail-copy">Select a material to inspect tonnage, value, purity, and
                  distribution.</p>
              </div>
            </div>
            <div class="detail-grid three">
              <div class="metric-tile static"><span data-material-kpi-one>Tonnage Recovered</span><strong
                  data-material-tonnage>0 t</strong><small>Year-to-date</small></div>
              <div class="metric-tile static"><span data-material-kpi-two>Commodity Market Value</span><strong
                  data-material-value>$0</strong><small data-material-rate>@ market rate</small></div>
              <div class="metric-tile static"><span data-material-kpi-three>Avg Material Purity</span><strong
                  data-material-purity>0%</strong><small data-material-status>AI-verified sorting score</small></div>
            </div>
            <div class="detail-grid two">
              <div>
                <h3 data-material-trend-title>30-Day Recovery Trend</h3>
                <div class="spark-bars" data-material-trend></div>
              </div>
              <div>
                <h3 data-material-zone-title>Distribution by Upload Source</h3>
                <div class="bar-list compact" data-material-zones></div>
              </div>
            </div>
          </article>

          <!-- AI UPLOAD DIAGNOSTICS -->
          <article class="panel detail-panel belt-detail-output" id="detail-belt">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">AI Upload Diagnostics</p>
                <h2>Upload Source: <span data-belt-id>Upload queue</span></h2>
                <p class="detail-copy" data-belt-insight>Uploaded images are processed by the classifier and routed to
                  human review when confidence or contamination risk requires a decision.</p>
              </div>
            </div>

            <div class="detail-grid three">
              <div class="metric-tile static"><span>Processing Load</span><strong data-belt-load>8.5 t/h
                  equiv.</strong><small data-belt-capacity>/ 10 t/h cap</small></div>
              <div class="metric-tile static"><span>AI Core Version</span><strong data-belt-speed>v2.4
                  Active</strong><small data-belt-max-speed>Core Model</small></div>
              <div class="metric-tile static"><span>Review State</span><strong
                  data-belt-action>Operational</strong><small>Human validation available</small></div>
            </div>

            <div class="detail-grid two">
              <div class="detail-card">
                <h3>Upload and Compute Diagnostics</h3>
                <dl class="detail-list">
                  <div>
                    <dt>Input channel</dt>
                    <dd data-belt-scanner>Web upload</dd>
                  </div>
                  <div>
                    <dt>Compute Core Temp</dt>
                    <dd data-belt-motor>42°C</dd>
                  </div>
                  <div>
                    <dt>File policy</dt>
                    <dd data-belt-air>100 MB batch limit</dd>
                  </div>
                </dl>
              </div>
              <div class="detail-card">
                <h3>Model Reliability and Material Mix</h3>
                <div class="bar-list compact" data-belt-uptime></div>
                <div class="bar-list compact" data-belt-composition></div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page analytics-pro-page lab-ui dark-ai dark-app" dataPage="analytics" html={html} />;
}
