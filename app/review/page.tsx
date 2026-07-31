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

function SummaryCard({ label, valueId, detail, tone, icon, kpiFilter }: { label: string; valueId: string; detail: string; tone: string; icon: string; kpiFilter: string }) {
  return (
    <article className={"review-summary-card " + tone} data-kpi-filter={kpiFilter} role="button" tabIndex={0}>
      <span className="review-summary-icon"><i className={"fa-solid " + icon} aria-hidden="true" /></span>
      <div>
        <span>{label}</span>
        <strong id={valueId}>-</strong>
        <small>{detail}</small>
      </div>
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
            <a href="/auth/signout" className="logout-btn"><i className="fa-solid fa-right-from-bracket" aria-hidden="true" /><span className="logout-text">Logout</span></a>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div className="topbar-left">
              <button id="mobileToggle" className="mobile-toggle" aria-label="Open navigation"><i className="fa-solid fa-bars" /></button>
              <div className="topbar-title"><h1>Review Workspace</h1><p>Inspect, verify and manage AI scan results</p></div>
            </div>
            <div className="topbar-right" data-topbar-actions data-topbar-variant="standard" />
          </header>

          <div className="page-body review-page-body">
            <section className="review-summary-grid" aria-label="Scan verification summary">
              <SummaryCard label="Unique objects detected" valueId="historyProcessedToday" detail="Tracked-video objects and images" tone="total" icon="fa-file-lines" kpiFilter="total" />
              <SummaryCard label="Confirmed" valueId="historyConfirmed" detail="Scans confirmed" tone="confirmed" icon="fa-circle-check" kpiFilter="confirmed" />
              <SummaryCard label="Needs Review" valueId="historyReviewCount" detail="Requires attention" tone="review" icon="fa-triangle-exclamation" kpiFilter="review_needed" />
              <SummaryCard label="Rejected" valueId="historyRejected" detail="Rejected scans" tone="rejected" icon="fa-circle-xmark" kpiFilter="rejected" />
            </section>

            <section className="review-filter-toolbar" aria-label="Review filters">
              <label className="sr-only" htmlFor="historySearch">Search scan history</label>
              <div className="review-filter-control review-filter-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><input id="historySearch" type="search" placeholder="Search scans" /></div>
              <label className="review-filter-control"><span className="sr-only">Filter by date</span><i className="fa-regular fa-calendar" aria-hidden="true" /><input id="historyDate" type="date" aria-label="Filter by date" /></label>
              <label className="review-filter-control"><span className="sr-only">Filter by category</span><select id="historyCategory" aria-label="Filter by category"><option value="">All categories</option>{categories.map(category => <option key={category} value={category.toLowerCase().replace(/ /g, "_")}>{category}</option>)}</select></label>
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
                <header className="review-panel-header"><div><h2 id="reviewHistoryTitle">Scan History</h2><p id="historyRange" aria-live="polite">Loading scans</p></div><div className="review-history-tools"><button id="exportReviewHistoryPdf" className="secondary-btn review-history-trigger" type="button"><i className="fa-solid fa-file-pdf" aria-hidden="true" />PDF</button><button id="exportReviewHistoryExcel" className="secondary-btn review-history-trigger" type="button"><i className="fa-solid fa-file-excel" aria-hidden="true" />Excel</button><button id="openFullHistory" className="secondary-btn review-history-trigger" type="button"><i className="fa-solid fa-table-list" aria-hidden="true" />View Full History</button></div></header>
                <div id="reviewHistoryList" className="review-history-list" aria-live="polite"><div className="review-list-skeleton"><span /><span /><span /></div></div>
                <div id="historyPageButtons" className="history-pagination review-pagination" aria-label="Scan history pagination" />
              </section>

              <section id="reviewSelectedPanel" className="panel bbox-card review-selected-panel is-active-tab" aria-labelledby="liveStreamTitle">
                <header className="review-panel-header review-selected-header"><h2 id="liveStreamTitle" title="No scan selected">No scan selected</h2><span id="resultSourceState">No saved result</span></header>
                <div className="review-selected-content">
                  <div className="review-primary-column">
                    <div id="reviewMediaTabs" className="review-media-tabs" role="tablist" aria-label="Video review media" hidden>
                      <button id="reviewDetectedObjectsTab" className="review-media-tab active" type="button" role="tab" aria-selected="true" aria-controls="detectedObjectsPanel">Detected Objects</button>
                      <button id="reviewAnnotatedVideoTab" className="review-media-tab" type="button" role="tab" aria-selected="false" aria-controls="annotatedVideoPanel">Annotated Video</button>
                    </div>
                    <section className="stream-panel review-stream-panel" aria-label="Selected scan image">
                      <div id="detectedObjectsPanel" className="stream-canvas-wrap" role="tabpanel" aria-labelledby="reviewDetectedObjectsTab"><canvas id="liveInferenceCanvas" aria-label="Waste sorting classification overlay" /></div>
                    </section>
                    <section id="annotatedVideoPanel" className="annotated-video-panel bbox-card review-annotated-video-panel" hidden aria-live="polite" role="tabpanel" aria-labelledby="reviewAnnotatedVideoTab">
                      <div className="panel-heading-row">
                        <div>
                          <span className="panel-kicker">Video scan output</span>
                          <h2>Annotated Video Result</h2>
                        </div>
                        <span id="annotatedVideoStatus">Unavailable</span>
                      </div>
                      <div id="annotatedVideoBody" className="annotated-video-body">
                        <p className="feed-empty">Annotated video is unavailable for this scan.</p>
                      </div>
                    </section>
                    <div className="review-form-row">
                      <section className="review-decision-card" aria-labelledby="reviewDecisionTitle">
                        <label className="review-category-field"><span id="reviewDecisionTitle">Correct category</span><select id="reviewCategorySelect" aria-label="Correct category" disabled><option value="">Select category</option>{categories.map(category => <option key={category} value={category.toLowerCase().replace(/ /g, "_")}>{category}</option>)}</select></label>
                        <dl className="review-selected-meta sr-only" aria-label="Selected scan metadata"><div><dt>Source</dt><dd id="reviewMetaSource">-</dd></div><div><dt>Uploaded</dt><dd id="reviewMetaTime">-</dd></div><div><dt>Status</dt><dd id="reviewMetaStatus">-</dd></div></dl>
                      </section>
                    </div>
                  </div>
                  <aside className="review-inspector">
                    <section className="mini-panel detection-panel bbox-card" aria-label="AI Prediction"><div id="liveFeed" className="live-feed"><div className="feed-empty">Select a scan to view detected materials.</div></div></section>
                    <section className="mini-panel action-panel bbox-card" id="liveActionPanel"><div className="panel-heading-row"><h3>Recommended Route</h3><span id="liveActionBadge">Waiting</span></div><div id="liveActionText" className="recommendation-detail"><strong>Waiting for scan result</strong><p>Select a scan to view the recommended route.</p></div></section>
                  </aside>
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
          <div id="reviewHistoryModal" className="modal-overlay review-history-modal" role="presentation" aria-hidden="true">
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reviewHistoryModalTitle" tabIndex={-1}>
              <button type="button" className="modal-close" data-review-history-close aria-label="Close full history"><i className="fa-solid fa-xmark" /></button>
              <header><div><h2 id="reviewHistoryModalTitle">Audit History</h2><p id="reviewHistoryModalRange" aria-live="polite">Loading scans</p></div><div className="review-history-tools"><button id="exportAuditHistoryPdf" className="secondary-btn review-history-trigger" type="button"><i className="fa-solid fa-file-pdf" aria-hidden="true" />PDF</button><button id="exportAuditHistoryExcel" className="secondary-btn review-history-trigger" type="button"><i className="fa-solid fa-file-excel" aria-hidden="true" />Excel</button></div></header>
              <div className="review-history-modal-body">
                <div className="review-history-modal-filters">
                  <input id="fullHistorySearch" type="search" placeholder="Search scans" aria-label="Search full history" />
                  <input id="fullHistoryDate" type="date" aria-label="Filter full history by date" />
                  <select id="fullHistoryCategory" aria-label="Filter full history by category"><option value="">All categories</option>{categories.map(category => <option key={category} value={category.toLowerCase().replace(/ /g, "_")}>{category}</option>)}</select>
                  <select id="fullHistoryStatus" aria-label="Filter full history by status"><option value="">All statuses</option><option value="review_needed">Review Needed</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option></select>
                  <button id="fullHistorySortTimestamp" className="history-sort active" type="button">Newest first</button><button id="fullHistorySortConfidence" className="history-sort" type="button">Confidence</button>
                </div>
                <div className="table-wrap"><table className="ledger-table"><thead><tr><th>Timestamp</th><th>Preview</th><th>Category</th><th>Class</th><th>Weight</th><th>AI Confidence</th><th>Status</th><th>Action</th></tr></thead><tbody id="fullHistoryTableBody" /></table></div>
              </div>
              <div id="fullHistoryPageButtons" className="history-pagination" aria-label="Full history pagination" />
            </section>
          </div>
          <div id="auditReviewModal" className="modal-overlay audit-review-modal" aria-hidden="true">
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="auditReviewTitle" tabIndex={-1}>
              <button type="button" className="modal-close" data-audit-review-close aria-label="Close review">×</button>
              <h2 id="auditReviewTitle">Review result</h2>
              <p id="auditReviewDescription">Confirm the AI result, correct the category, or reject this result.</p>
              <div className="audit-review-body">
                <section className="audit-review-snapshot"><strong id="auditReviewBanner">SAVED AI RESULT</strong><div className="audit-review-summary"><img id="auditReviewPreview" alt="Selected scan preview" hidden /><div><p><strong>AI prediction:</strong> <span id="auditReviewPrediction">-</span></p><p><strong>Confidence:</strong> <span id="auditReviewConfidence">-</span></p><p><strong>Weight:</strong> <span id="auditReviewWeight">-</span></p><p><strong>Classification:</strong> <span id="auditReviewClass">-</span></p><p><strong>Final category:</strong> <span id="auditReviewFinalCategory">-</span></p><p><strong>Status:</strong> <span id="auditReviewStatus">-</span></p><p><strong>Timestamp:</strong> <span id="auditReviewTimestamp">-</span></p><p id="auditReviewQuantityRow" hidden><strong>Quantity:</strong> <span id="auditReviewQuantity">-</span></p></div></div></section>
                <label className="audit-review-category">Manual category<select id="auditReviewCategory" aria-label="Manual category">{categories.map(category => <option key={category} value={category.toLowerCase().replace(/ /g, "_")}>{category}</option>)}</select></label>
                <p id="auditReviewFeedback" className="audit-review-feedback" role="status" aria-live="polite" />
              </div>
              <div className="modal-actions"><button id="auditReviewVerify" type="button" className="primary-btn">Verify Result</button><button id="auditReviewReject" type="button" className="danger-btn">Reject Result</button></div>
            </section>
          </div>
        </main>
      </div>
    </PageHtml>
  );
}
