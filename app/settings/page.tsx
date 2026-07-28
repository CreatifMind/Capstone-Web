import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | Settings" };

const html = `
<div class="app-layout">
    <div id="sidebarOverlay" class="sidebar-overlay"></div>
    <aside id="appSidebar" class="sidebar">
      <div class="sidebar-header">
        <a href="/" class="sidebar-logo"><img src="/assets/logo.png" alt="PurityLoop AI Logo" /></a>
        <button id="sidebarToggle" class="sidebar-toggle" aria-label="Collapse Sidebar"><i
            class="fa-solid fa-angles-left"></i></button>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Platform</div>
        <a href="/upload" class="nav-item" data-tooltip="Upload"><i
            class="nav-item-icon fa-solid fa-cloud-arrow-up"></i><span class="nav-item-label">Upload</span></a>
        <a href="/review" class="nav-item" data-tooltip="Review"><i
            class="nav-item-icon fa-solid fa-magnifying-glass"></i><span class="nav-item-label">Review</span></a>
        <a href="/analytics" class="nav-item" data-tooltip="Analytics"><i
            class="nav-item-icon fa-solid fa-chart-line"></i><span class="nav-item-label">Analytics</span></a>
        <a href="/settings" class="nav-item active" data-tooltip="Settings"><i
            class="nav-item-icon fa-solid fa-gear"></i><span class="nav-item-label">Settings</span></a>
      </nav>
      <div class="sidebar-footer">
        <div class="user-row">
          <div class="user-avatar">AD</div>
          <div class="user-info">
            <div class="user-name">Admin Operator</div>
            <div class="user-role">MRF Review Mode</div>
          </div>
        </div>
        <a href="/auth/signout" class="logout-btn"><i class="fa-solid fa-right-from-bracket"></i><span
            class="logout-text">Logout</span></a>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="topbar-left">
          <button id="mobileToggle" class="mobile-toggle" aria-label="Open navigation"><i
              class="fa-solid fa-bars"></i></button>
          <div class="topbar-title">
            <h1>Settings</h1>
            <p>Configure operator preferences, confidence thresholds, and human review rules.</p>
          </div>
        </div>

        <div class="topbar-right" data-topbar-actions data-topbar-variant="standard"></div>
      </header>

      <div class="page-body">
        <section class="settings-grid">
          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Profile</p>
            <h2>Operator account</h2>
            <div class="settings-row"><span>Name</span><strong>Admin Operator</strong></div>
            <div class="settings-row"><span>Role</span><strong>MRF Review Supervisor</strong></div>
            <div class="settings-row"><span>Facility</span><strong>Not configured</strong></div>
          </article>

          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Demo configuration</p>
            <h2>Alert preferences</h2>
            <label class="settings-toggle"><span>Low confidence uploads</span><input type="checkbox" checked disabled /></label>
            <label class="settings-toggle"><span>Hazard material detection</span><input type="checkbox" checked disabled /></label>
            <label class="settings-toggle"><span>Daily analytics summary</span><input type="checkbox" disabled /></label>
          </article>

          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Demo configuration</p>
            <h2>Detection confidence</h2>
            <div class="threshold-control">
              <span>Manual review below</span>
              <strong>85%</strong>
            </div>
            <input type="range" min="50" max="99" value="85" aria-label="Detection confidence threshold" disabled />
          </article>

          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Demo configuration</p>
            <h2>Human-in-the-loop</h2>
            <label class="settings-toggle"><span>Require review for low-confidence results</span><input type="checkbox" checked disabled /></label>
            <label class="settings-toggle"><span>Record clean recyclable scans</span><input type="checkbox" disabled /></label>
            <label class="settings-toggle"><span>Escalate battery hazards</span><input type="checkbox" checked disabled /></label>
          </article>

          <article class="settings-card panel bbox-card wide">
            <p class="eyebrow">System</p>
            <h2>Preferences</h2>
            <div class="settings-row"><span>Environment</span><strong id="settingsEnvironment">Public demo</strong></div>
            <div class="settings-row"><span>Model</span><strong id="settingsModelStatus">Checking backend…</strong></div>
            <div class="settings-row"><span>Backend</span><strong id="settingsBackendStatus">Checking connection…</strong></div>
            <div class="settings-row"><span>Default result page</span><strong>Latest saved scan</strong></div>
            <div class="settings-row"><span>Theme</span><strong id="settingsThemeStatus">System</strong></div>
          </article>
        </section>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page settings-pro-page lab-ui dark-ai dark-app" dataPage="settings" html={html} />;
}
