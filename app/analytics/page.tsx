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
        <a href="/log" class="nav-item" data-tooltip="History">
          <i class="nav-item-icon fa-solid fa-clipboard-check"></i>
          <span class="nav-item-label">History</span>
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
            <h1>Analytics Overview</h1>
            <p>Operational insights and next actions</p>
          </div>
        </div>

        <div class="topbar-right">
          <div data-theme-slot="app"></div>

          <label class="analytics-date-control" for="analyticsRange">
            <span class="sr-only">Analytics date range</span>
            <i class="fa-regular fa-calendar" aria-hidden="true"></i>
            <select id="analyticsRange" aria-label="Analytics date range">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <button id="analyticsRefresh" class="topbar-icon-btn" type="button" aria-label="Refresh analytics" title="Refresh analytics">
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="page-body">
        <section class="analytics-overview" aria-label="Analytics overview">
          <div id="analyticsOverviewState" class="analytics-overview-state" role="status" aria-live="polite" hidden></div>
          <section class="analytics-kpi-grid" aria-label="Analytics key performance indicators">
            <article class="analytics-kpi analytics-kpi-review"><span class="analytics-kpi-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span><span>Needs Review</span><strong data-overview="needs-review">-</strong><p data-overview="needs-review-note">Loading analytics...</p><small data-overview="needs-review-compare" hidden></small></article>
            <article class="analytics-kpi"><span class="analytics-kpi-icon"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span><span>Confirmed Today</span><strong data-overview="confirmed-today">-</strong><p>High-confidence items</p><small data-overview="confirmed-today-compare" hidden></small></article>
            <article class="analytics-kpi"><span class="analytics-kpi-icon"><i class="fa-solid fa-sack-dollar" aria-hidden="true"></i></span><span>Recoverable Value</span><strong data-overview="recoverable-value">-</strong><p>Estimated recoverable value</p><small data-overview="recoverable-value-compare" hidden></small></article>
            <article class="analytics-kpi"><span class="analytics-kpi-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><span>Average Confidence</span><strong data-overview="average-confidence">-</strong><p>Across all scans</p><small data-overview="average-confidence-compare" hidden></small></article>
          </section>

          <section class="analytics-attention-banner" data-overview="attention-banner">
            <span class="analytics-banner-icon"><i class="fa-solid fa-circle-exclamation"></i></span>
            <div><h2 data-overview="attention-title">Loading analytics...</h2><p data-overview="attention-copy"></p></div>
            <div class="analytics-banner-actions"><a data-overview="review-link" class="primary-btn" href="/log">Open Review Queue <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="secondary-btn" href="/log">View History</a></div>
          </section>

          <section class="analytics-insights" aria-labelledby="analyticsInsightsHeading">
            <h2 id="analyticsInsightsHeading">Key Insights</h2>
            <div class="analytics-insight-grid">
              <article><i class="fa-solid fa-biohazard"></i><div><span>Top Contamination Source</span><strong data-overview="top-contaminant">-</strong><small data-overview="top-contaminant-meta"></small></div></article>
              <article><i class="fa-solid fa-recycle"></i><div><span>Top Recyclable Material</span><strong data-overview="top-recyclable">-</strong><small data-overview="top-recyclable-meta"></small></div></article>
              <article><i class="fa-regular fa-clock"></i><div><span>Avg. Review Turnaround</span><strong data-overview="review-turnaround">-</strong><small>Completed human reviews</small></div></article>
              <article><i class="fa-solid fa-tag"></i><div><span>Highest-Value Category</span><strong data-overview="highest-value">-</strong><small data-overview="highest-value-meta"></small></div></article>
              <article><i class="fa-solid fa-cloud-arrow-up"></i><div><span>Last Upload</span><strong data-overview="last-upload">-</strong><small data-overview="last-upload-meta"></small></div></article>
            </div>
          </section>

          <section class="analytics-overview-grid">
            <article class="analytics-overview-card analytics-material-mix"><header><div><h2>Material Mix</h2><p data-overview="mix-subtitle">By weight</p></div></header><div class="analytics-chart-wrap"><canvas id="overviewMaterialMix"></canvas><div class="analytics-donut-center" data-overview="mix-center" hidden><strong data-overview="mix-total">0</strong><span data-overview="mix-total-label">Total items</span></div><p class="analytics-chart-empty" data-overview="mix-empty" hidden>No material data is available for this period.</p></div><p class="analytics-chart-summary" data-overview="mix-summary"></p><button class="analytics-detail-link" type="button" data-drill-target="detail-composition">View full breakdown <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></article>
            <article class="analytics-overview-card analytics-value-card"><header><div><h2>Recoverable Value by Category</h2><p>Estimated value (RM)</p></div></header><div class="analytics-chart-wrap"><canvas id="overviewValueByCategory"></canvas><p class="analytics-chart-empty" data-overview="value-empty" hidden>No recoverable value is available for this period.</p></div><p class="analytics-chart-summary" data-overview="value-summary"></p><button class="analytics-detail-link" type="button" data-drill-target="detail-resale">View value details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></article>
            <article class="analytics-overview-card analytics-trend-card"><header><div><h2>Daily Scan Trend</h2><p>Scans over time</p></div></header><div class="analytics-chart-wrap"><canvas id="overviewDailyTrend"></canvas><p class="analytics-chart-empty" data-overview="trend-empty" hidden>No scan activity is available for this period.</p></div><p class="analytics-chart-summary" data-overview="trend-summary"></p><button class="analytics-detail-link" type="button" data-drill-target="detail-yield">View trend analysis <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></article>
            <article class="analytics-overview-card analytics-manager-actions"><header><div><h2>Manager Actions</h2><p>Prioritised operational work</p></div></header><div id="analyticsManagerActions" class="analytics-action-list"></div><a class="primary-btn" href="/log">Go to Review Queue <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></article>
          </section>

          <section class="analytics-recent-log" aria-labelledby="analyticsRecentLogHeading"><header><h2 id="analyticsRecentLogHeading">Recent Verification Log</h2><a href="/log">View all history <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></header><div class="analytics-table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Source</th><th>Status</th><th>Details</th></tr></thead><tbody id="analyticsRecentLog"><tr><td colspan="5">Loading analytics...</td></tr></tbody></table></div></section>
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
            <p class="detail-copy">Weight recovered by material across the past six months. Click a material row below
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
            <p class="detail-copy">Recovered kg multiplied by estimated commodity resale rates. Click any material
              for detailed analysis.</p>
            <div class="table-wrap">
              <table class="ledger-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Weight (kg)</th>
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
                <p data-material-subtitle class="detail-copy">Select a material to inspect weight, value, purity, and
                  distribution.</p>
              </div>
            </div>
            <div class="detail-grid three">
              <div class="metric-tile static"><span data-material-kpi-one>Estimated Weight</span><strong
                  data-material-tonnage>0.000 kg</strong><small>Year-to-date</small></div>
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
                  human review only when confidence is below 85%.</p>
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
