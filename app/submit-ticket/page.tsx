import PageHtml from "@/components/PageHtml";

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
        <a href="/result" class="nav-item" data-tooltip="Result"><i
            class="nav-item-icon fa-solid fa-wand-magic-sparkles"></i><span class="nav-item-label">Result</span></a>
        <a href="/log" class="nav-item" data-tooltip="Log"><i
            class="nav-item-icon fa-solid fa-clipboard-check"></i><span class="nav-item-label">Log</span></a>
        <a href="/analytics" class="nav-item" data-tooltip="Analytics"><i
            class="nav-item-icon fa-solid fa-chart-line"></i><span class="nav-item-label">Analytics</span></a>
        <a href="/submit-ticket" class="nav-item active" data-tooltip="Submit Ticket"><i
            class="nav-item-icon fa-solid fa-ticket"></i><span class="nav-item-label">Submit Ticket</span></a>
        <a href="/settings" class="nav-item" data-tooltip="Settings"><i
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
        <a href="/login" class="logout-btn"><i class="fa-solid fa-right-from-bracket"></i><span
            class="logout-text">Logout</span></a>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="topbar-left">
          <button id="mobileToggle" class="mobile-toggle" aria-label="Open navigation"><i
              class="fa-solid fa-bars"></i></button>
          <div class="topbar-title">
            <h1>Submit Ticket</h1>
            <p>Report model, upload, or facility workflow issues to the support queue.</p>
          </div>
        </div>

        <div class="topbar-right">
          <div data-theme-slot="app"></div>

          <div class="date-pill">
            <i class="fa-solid fa-clock" style="margin-right: 4px;"></i>
            <span id="liveClock">00:00:00 AM</span>
          </div>

          <button class="topbar-icon-btn" aria-label="Notifications">
            <i class="fa-solid fa-bell"></i>
            <span class="notif-dot"></span>
          </button>

          <div class="user-badge">
            <div class="user-badge-avatar">AD</div>
            <span style="margin-left: 6px;">Admin Mode</span>
          </div>
        </div>
      </header>

      <div class="page-body">
        <section class="support-layout">
          <form class="support-form panel bbox-card">
            <div class="section-heading compact">
              <div>
                <p class="eyebrow">Operator request</p>
                <h2>New support ticket</h2>
              </div>
            </div>
            <div class="form-grid two">
              <div class="form-group">
                <label for="ticketTitle">Ticket title</label>
                <input id="ticketTitle" type="text" placeholder="Camera confidence dropped on mixed batch" />
              </div>
              <div class="form-group">
                <label for="ticketCategory">Category</label>
                <select id="ticketCategory">
                  <option>AI detection</option>
                  <option>Upload issue</option>
                  <option>Human review</option>
                  <option>Analytics report</option>
                </select>
              </div>
              <div class="form-group">
                <label for="ticketPriority">Priority</label>
                <select id="ticketPriority">
                  <option>Medium</option>
                  <option>Low</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </div>
              <div class="form-group">
                <label for="ticketImage">Optional image</label>
                <input id="ticketImage" type="file" accept="image/jpeg,image/png,image/webp" />
              </div>
            </div>
            <div class="form-group">
              <label for="ticketDescription">Description</label>
              <textarea id="ticketDescription" rows="6"
                placeholder="Describe what happened, which upload was affected, and what action is needed."></textarea>
            </div>
            <button type="button" class="primary-btn" id="submitTicketBtn"><i class="fa-solid fa-paper-plane"></i> Submit Ticket</button>
          </form>

          <aside class="ticket-status-panel panel bbox-card">
            <p class="eyebrow">Ticket queue</p>
            <h2>Current tickets</h2>
            <div class="ticket-status-list">
              <div class="feed-empty">No support tickets submitted yet.</div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page support-pro-page lab-ui dark-ai dark-app" dataPage="submit-ticket" html={html} />;
}
