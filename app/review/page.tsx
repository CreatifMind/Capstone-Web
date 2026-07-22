import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | Review Workspace" };

const categories = [
  "General Trash",
  "Food Organics",
  "Metal",
  "Plastic",
  "Glass",
  "Textile",
  "Paper",
  "Battery",
  "Cardboard"
];

function NavItem({ href, icon, label, active = false }: { href: string; icon: string; label: string; active?: boolean }) {
  return (
    <a href={href} className={"nav-item" + (active ? " active" : "")} data-tooltip={label}>
      <i className={"nav-item-icon fa-solid " + icon} aria-hidden="true" />
      <span className="nav-item-label">{label}</span>
    </a>
  );
}

function SummaryCard({ label, valueId, detail, tone, icon, kpiFilter, chartId }: { label: string; valueId: string; detail: string; tone: string; icon: string; kpiFilter: string; chartId?: string }) {
  return (
    <article className={"review-summary-card " + tone} data-kpi-filter={kpiFilter} role="button" tabIndex={0}>
      <span className="review-summary-icon"><i className={"fa-solid " + icon} aria-hidden="true" /></span>
      <div>
        <span>{label}</span>
        <strong id={valueId}>-</strong>
        <small>{detail}</small>
      </div>
      {chartId && <canvas id={chartId} className="review-summary-chart" aria-hidden="true" />}
    </article>
  );
}

export default function ReviewPage() {
  return (
    <PageHtml bodyClass="ops-pro-page review-pro-page lab-ui dark-ai dark-app" dataPage="review">
      <div className="app-layout">
        <div id="sidebarOverlay" className="sidebar-overlay" />

        <aside id="appSidebar" className="sidebar">
          <div className="sidebar-header">
            <a href="/" className="sidebar-logo"><img src="/assets/logo.png" alt="PurityLoop AI Logo" /></a>
            <button id="sidebarToggle" className="sidebar-toggle" aria-label="Collapse Sidebar"><i className="fa-solid fa-angles-left" /></button>
          </div>
          <nav className="sidebar-nav" aria-label="Platform navigation">
            <div className="sidebar-section-label">Platform</div>
            <NavItem href="/upload" icon="fa-cloud-arrow-up" label="Upload" />
            <NavItem href="/review" icon="fa-magnifying-glass" label="Review" active />
            <NavItem href="/analytics" icon="fa-chart-line" label="Analytics" />
            <NavItem href="/settings" icon="fa-gear" label="Settings" />
          </nav>
          <div className="sidebar-footer">
            <div className="user-row"><div className="user-avatar">AD</div><div className="user-info"><div className="user-name">Admin Operator</div><div className="user-role">HITL Supervisor</div></div></div>
            <a href="/login" className="logout-btn"><i className="fa-solid fa-right-from-bracket" aria-hidden="true" /><span className="logout-text">Logout</span></a>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div className="topbar-left">
              <button id="mobileToggle" className="mobile-toggle" aria-label="Open navigation"><i className="fa-solid fa-bars" /></button>
              <div className="topbar-title"><h1>Review Workspace</h1><p>Inspect, verify and manage AI scan results</p></div>
            </div>
            <div className="topbar-right">
              <div data-theme-slot="app" />
              <div className="date-pill"><i className="fa-solid fa-clock" aria-hidden="true" /><span id="liveClock">00:00:00 AM</span></div>
              <button className="topbar-icon-btn" aria-label="Notifications"><i className="fa-solid fa-bell" /><span className="notif-dot" /></button>
              <div className="user-badge review-badge"><div className="user-badge-avatar">QA</div><span>0 review needed</span></div>
            </div>
          </header>

          <div className="page-body review-page-body">
            <section className="review-summary-grid" aria-label="Scan verification summary">
              <SummaryCard label="Total scans" valueId="historyProcessedToday" detail="Saved scans" tone="total" icon="fa-file-lines" kpiFilter="total" />
              <SummaryCard label="Confirmed" valueId="historyConfirmed" detail="Scans confirmed" tone="confirmed" icon="fa-circle-check" kpiFilter="confirmed" />
              <SummaryCard label="Needs review" valueId="historyReviewCount" detail="Requires attention" tone="review" icon="fa-triangle-exclamation" kpiFilter="review_needed" chartId="historyReviewMixChart" />
              <SummaryCard label="Rejected" valueId="historyRejected" detail="Rejected scans" tone="rejected" icon="fa-circle-xmark" kpiFilter="rejected" />
            </section>

            <section className="review-filter-toolbar" aria-label="Review filters">
              <label className="sr-only" htmlFor="historySearch">Search scan history</label>
              <div className="review-filter-control review-filter-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><input id="historySearch" type="search" placeholder="Search scans" /></div>
              <label className="review-filter-control"><span className="sr-only">Filter by date</span><i className="fa-regular fa-calendar" aria-hidden="true" /><input id="historyDate" type="date" aria-label="Filter by date" /></label>
              <label className="review-filter-control"><span className="sr-only">Filter by status</span><select id="historyStatus" aria-label="Filter by status"><option value="">All statuses</option><option>Confirmed Recyclable</option><option>Confirmed Contaminant</option><option>Review Needed</option><option>Verified</option><option>Rejected</option></select></label>
              <div className="review-sort-controls" aria-label="Sort scans">
                <button className="history-sort active" type="button" data-sort="timestamp" aria-sort="descending">Newest first</button>
                <button className="history-sort" type="button" data-sort="confidence" aria-sort="none">Confidence</button>
              </div>
            </section>

            <section className="review-workspace" aria-label="Review workspace">
              <div className="review-tabbar" role="tablist" aria-label="Review panels">
                <button type="button" className="review-tab" data-tab="history" role="tab" id="reviewTabHistory" aria-selected="false" aria-controls="reviewHistoryPanel">History</button>
                <button type="button" className="review-tab active" data-tab="selected" role="tab" id="reviewTabSelected" aria-selected="true" aria-controls="reviewSelectedPanel">Selected Scan</button>
              </div>

              <section id="reviewHistoryPanel" className="panel bbox-card review-history-panel" aria-labelledby="reviewHistoryTitle">
                <header className="review-panel-header"><div><h2 id="reviewHistoryTitle">Scan History</h2><p id="historyRange" aria-live="polite">Loading scans</p></div></header>
                <div id="reviewHistoryList" className="review-history-list" aria-live="polite"><div className="review-list-skeleton"><span /><span /><span /></div></div>
                <div id="historyPageButtons" className="history-pagination review-pagination" aria-label="Scan history pagination" />
              </section>

              <section id="reviewSelectedPanel" className="panel bbox-card review-selected-panel is-active-tab" aria-labelledby="liveStreamTitle">
                <header className="review-panel-header review-selected-header"><h2 id="liveStreamTitle" title="No scan selected">No scan selected</h2><span id="resultSourceState">No saved result</span></header>
                <div className="review-selected-content">
                  <section className="stream-panel review-stream-panel" aria-label="Selected scan image">
                    <div className="stream-canvas-wrap"><canvas id="liveInferenceCanvas" aria-label="Waste sorting classification overlay" /></div>
                  </section>
                  <aside className="review-inspector">
                    <section className="mini-panel detection-panel bbox-card"><h3>AI Prediction</h3><div id="liveFeed" className="live-feed"><div className="feed-empty">Select a scan to view detected materials.</div></div></section>
                    <section className="mini-panel action-panel bbox-card" id="liveActionPanel"><div className="panel-heading-row"><h3>Recommended Route</h3><span id="liveActionBadge">Waiting</span></div><div id="liveActionText" className="recommendation-detail"><strong>Waiting for scan result</strong><p>Select a scan to view the recommended route.</p></div></section>
                    <p id="reviewWorkspaceWarning" className="review-workspace-warning" hidden role="status" />
                  </aside>

                  <div className="review-form-row">
                    <section className="review-decision-card" aria-labelledby="reviewDecisionTitle">
                      <label className="review-category-field"><span id="reviewDecisionTitle">Correct category</span><select id="reviewCategorySelect" aria-label="Correct category" disabled><option value="">Select category</option>{categories.map(category => <option key={category} value={category.toLowerCase().replace(/ /g, "_")}>{category}</option>)}</select></label>
                      <dl className="review-selected-meta sr-only" aria-label="Selected scan metadata"><div><dt>Source</dt><dd id="reviewMetaSource">-</dd></div><div><dt>Uploaded</dt><dd id="reviewMetaTime">-</dd></div><div><dt>Status</dt><dd id="reviewMetaStatus">-</dd></div></dl>
                    </section>
                  </div>
                </div>
                <p id="reviewActionFeedback" className="review-action-feedback" role="status" aria-live="polite" />
                <div className="review-action-bar">
                  <button id="previousScanBtn" className="secondary-btn" type="button" disabled aria-label="Previous scan"><i className="fa-solid fa-backward" aria-hidden="true" />Previous Scan</button>
                  <button id="reviewVerifyButton" className="primary-btn" type="button" disabled><i className="fa-solid fa-circle-check" aria-hidden="true" />Verify Result</button>
                  <button id="reviewRejectButton" className="danger-btn" type="button" disabled><i className="fa-solid fa-circle-xmark" aria-hidden="true" />Reject</button>
                  <button id="nextScanBtn" className="secondary-btn" type="button" disabled><i className="fa-solid fa-forward" aria-hidden="true" />Next Scan</button>
                  <span id="finderNavigationStatus" className="sr-only">No uploads</span>
                </div>
              </section>
            </section>

            <div id="finderGrid" hidden aria-hidden="true" />
            <span id="finderCountText" hidden />
            <span id="liveScanned" hidden>0 items</span><span id="livePurity" hidden>0%</span><span id="liveMarketValue" hidden>RM 0.00</span><span id="liveReviewNeeded" hidden>No data</span>
          </div>
        </main>
      </div>
    </PageHtml>
  );
}
