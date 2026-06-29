<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PurityLoop AI | Settings</title>
  <link rel="icon" href="assets/logo.png" type="image/png" />
  <link
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
    rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" href="css/style.css" />
</head>

<body data-page="settings" class="ops-pro-page lab-ui lab-app dark-ai dark-app">
  <div class="app-layout">
    <div id="sidebarOverlay" class="sidebar-overlay"></div>
    <aside id="appSidebar" class="sidebar">
      <div class="sidebar-header">
        <a href="index.php" class="sidebar-logo"><img src="assets/logo.png" alt="PurityLoop AI Logo" /></a>
        <button id="sidebarToggle" class="sidebar-toggle" aria-label="Collapse Sidebar"><i
            class="fa-solid fa-angles-left"></i></button>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Platform</div>
        <a href="upload.php" class="nav-item" data-tooltip="Upload"><i
            class="nav-item-icon fa-solid fa-cloud-arrow-up"></i><span class="nav-item-label">Upload</span></a>
        <a href="result.php" class="nav-item" data-tooltip="Result"><i
            class="nav-item-icon fa-solid fa-wand-magic-sparkles"></i><span class="nav-item-label">Result</span></a>
        <a href="alerts.php" class="nav-item" data-tooltip="Log"><i
            class="nav-item-icon fa-solid fa-clipboard-check"></i><span class="nav-item-label">Log</span></a>
        <a href="analytics.php" class="nav-item" data-tooltip="Analytics"><i
            class="nav-item-icon fa-solid fa-chart-line"></i><span class="nav-item-label">Analytics</span></a>
        <a href="submit-ticket.php" class="nav-item" data-tooltip="Submit Ticket"><i
            class="nav-item-icon fa-solid fa-ticket"></i><span class="nav-item-label">Submit Ticket</span></a>
        <a href="settings.php" class="nav-item active" data-tooltip="Settings"><i
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
        <a href="login.php" class="logout-btn"><i class="fa-solid fa-right-from-bracket"></i><span
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
      </header>

      <div class="page-body">
        <section class="settings-grid">
          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Profile</p>
            <h2>Operator account</h2>
            <div class="settings-row"><span>Name</span><strong>Admin Operator</strong></div>
            <div class="settings-row"><span>Role</span><strong>MRF Review Supervisor</strong></div>
            <div class="settings-row"><span>Facility</span><strong>PurityLoop Demo MRF</strong></div>
          </article>

          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Notifications</p>
            <h2>Alert preferences</h2>
            <label class="settings-toggle"><span>Low confidence uploads</span><input type="checkbox" checked /></label>
            <label class="settings-toggle"><span>Hazard material detection</span><input type="checkbox" checked /></label>
            <label class="settings-toggle"><span>Daily analytics summary</span><input type="checkbox" /></label>
          </article>

          <article class="settings-card panel bbox-card">
            <p class="eyebrow">AI threshold</p>
            <h2>Detection confidence</h2>
            <div class="threshold-control">
              <span>Manual review below</span>
              <strong>85%</strong>
            </div>
            <input type="range" min="50" max="99" value="85" aria-label="Detection confidence threshold" />
          </article>

          <article class="settings-card panel bbox-card">
            <p class="eyebrow">Review logic</p>
            <h2>Human-in-the-loop</h2>
            <label class="settings-toggle"><span>Require review for contaminants</span><input type="checkbox" checked /></label>
            <label class="settings-toggle"><span>Auto-log clean recyclable scans</span><input type="checkbox" /></label>
            <label class="settings-toggle"><span>Escalate battery hazards</span><input type="checkbox" checked /></label>
          </article>

          <article class="settings-card panel bbox-card wide">
            <p class="eyebrow">System</p>
            <h2>Preferences</h2>
            <div class="settings-row"><span>Model</span><strong>YOLOv8 active</strong></div>
            <div class="settings-row"><span>Default result page</span><strong>Active_Scan_Viewport</strong></div>
            <div class="settings-row"><span>Theme</span><strong>Dark premium AI recycling</strong></div>
          </article>
        </section>
      </div>
    </main>
  </div>
  <script src="js/theme.js"></script>
</body>

</html>
