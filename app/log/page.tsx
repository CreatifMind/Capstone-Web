import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | Audit History" };

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
        <a href="/review" class="nav-item" data-tooltip="Review">
          <i class="nav-item-icon fa-solid fa-magnifying-glass"></i>
          <span class="nav-item-label">Review</span>
        </a>
        <a href="/analytics" class="nav-item" data-tooltip="Analytics">
          <i class="nav-item-icon fa-solid fa-chart-line"></i>
          <span class="nav-item-label">Analytics</span>
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
            <div class="user-role">HITL Supervisor</div>
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
            <h1>Audit History</h1>
            <p>Review and manage recent scan records</p>
          </div>
        </div>

        <div class="topbar-right"><button id="exportHistory" class="secondary-btn history-export" type="button"><i class="fa-solid fa-download" aria-hidden="true"></i> Export History</button><div data-topbar-actions data-topbar-variant="standard"></div></div>
      </header>

      <div class="page-body">
        <section class="ops-hero log-hero history-kpis" aria-label="Scan verification summary">
          <div class="ops-status-stack">
            <div class="ops-status-card cleared">
              <span>Confirmed</span>
              <strong id="historyConfirmed">0</strong>
              <small>Scans confirmed</small>
            </div>
            <div class="ops-status-card review">
              <span>Needs review</span>
              <strong id="historyReviewCount">0</strong>
              <small>Requires attention</small>
            </div>
            <div class="ops-status-card quarantine">
              <span>Rejected</span>
              <strong id="historyRejected">0</strong>
              <small>Rejected scans</small>
            </div>
            <div class="ops-status-card processed"><span>Total uploads</span><strong id="historyProcessedToday">0</strong><small>Saved scans</small></div>
          </div>
        </section>

        <section class="history-action-banner" aria-labelledby="historyActionTitle">
          <div class="history-banner-icon"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i></div>
          <div><h2 id="historyActionTitle">All scans are up to date</h2><p id="historyActionText">No unresolved classifications require attention.</p></div>
          <div class="history-banner-actions"><button id="showReviewQueue" type="button" class="primary-btn">Review Queue <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button><button id="showAllHistory" type="button" class="secondary-btn">View All History</button></div>
        </section>

        <section class="history-insights" aria-label="Quick Insights">
          <h2>Quick Insights</h2>
          <div class="history-insight-grid">
            <article><i class="fa-solid fa-bullseye" aria-hidden="true"></i><div><span>Most frequent category</span><strong id="historyFrequentCategory">No scan data</strong><small id="historyFrequentCategoryMeta">-</small></div></article>
            <article><i class="fa-solid fa-gauge-high" aria-hidden="true"></i><div><span>Average confidence</span><strong id="historyAverageConfidence">No data</strong><small>Across all scans</small></div></article>
            <article><i class="fa-solid fa-layer-group" aria-hidden="true"></i><div><span>Highest review category</span><strong id="historyReviewCategory">No review items</strong><small id="historyReviewCategoryMeta">-</small></div></article>
            <article><i class="fa-regular fa-clock" aria-hidden="true"></i><div><span>Last upload</span><strong id="historyLastUpload">No recent uploads</strong><small id="historyLastUploadMeta">-</small></div></article>
          </div>
        </section>

        <section class="ledger-shell history-ledger-layout">
          <section class="panel ledger-panel bbox-card">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Audit history</p>
                <h2>Audit History</h2>
                <p class="history-subtitle">Recent scan and review records</p>
              </div>
              <div class="history-filters" aria-label="History filters">
                <label class="sr-only" for="historySearch">Search scan history</label><input id="historySearch" type="search" placeholder="Search scans" />
                <input id="historyDate" type="date" aria-label="Filter by date" />
                <select id="historyStatus" aria-label="Filter by status"><option value="">All statuses</option><option>Confirmed Recyclable</option><option>Confirmed Contaminant</option><option>Review Needed</option><option>Verified</option><option>Rejected</option></select>
              </div>
            </div>

            <div class="table-wrap">
              <table class="ledger-table">
                <thead>
                  <tr>
                    <th><button class="history-sort" type="button" data-sort="timestamp" aria-sort="descending">Timestamp <i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button></th>
                    <th>Preview</th>
                    <th>Category</th>
                    <th>Class</th>
                    <th>Weight</th>
                    <th><button class="history-sort" type="button" data-sort="confidence" aria-sort="none">AI Confidence <i class="fa-solid fa-sort" aria-hidden="true"></i></button></th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="ledgerTableBody">
                  <tr class="skeleton-row"><td colspan="8"><div class="skeleton-cell" style="width: 100%;"></div></td></tr>
                </tbody>
              </table>
            </div>
            <div class="history-pagination" aria-label="Scan history pagination"><p id="historyRange" aria-live="polite">Showing 0 to 0 of 0 results</p><div id="historyPageButtons"></div></div>
          </section>
        </section>
      </div>
    </main>
  </div>

  <div class="modal-overlay" id="reviewModal" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="reviewTitle">
      <button type="button" class="modal-close" id="closeReviewModal" aria-label="Close review modal">×</button>

      <h2 id="reviewTitle">AI Classification Review</h2>
      <div class="modal-body">
        <p id="reviewDescription">Confirm whether this classification is correct or manually override the waste category.
        </p>

        <div class="review-snapshot">
          <div class="snapshot-feed">
            <span class="snapshot-live"></span>
            <strong>LOW CONFIDENCE - HUMAN AUDIT REQUIRED</strong>
          </div>
          <div class="snapshot-items"></div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="primary-btn" id="clearSegment">Verify result</button>
        <button type="button" class="danger-btn" id="quarantineSegment">Reject result</button>
      </div>
    </div>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page lab-ui dark-ai dark-app" dataPage="review-log" html={html} />;
}
