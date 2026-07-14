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
        <a href="/upload" class="nav-item active" data-tooltip="Upload">
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
            <h1>Upload</h1>
            <p>Select waste images, review the queue, then start detection.</p>
          </div>
        </div>

        <div class="topbar-right">
          <div data-theme-slot="app"></div>

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
        <section class="upload-command-grid">
          <div class="panel upload-panel bbox-card">
            <div class="upload-box"
              style="border: 2px dashed var(--border); padding: 60px 40px; border-radius: 12px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1;">
              <div class="upload-icon">
                <i class="fa-solid fa-arrow-up-from-bracket"></i>
              </div>
              <h2>Upload Waste Images</h2>
              <p>Select one or multiple clear waste images for detection.</p>
              <label for="fileUpload" class="upload-label"
                style="background: var(--primary); color: white; padding: 12px 32px; border-radius: 8px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: var(--transition); font-size: 0.9375rem; margin-bottom: 12px;">
                <i class="fa-solid fa-file-image"></i> Choose Images
              </label>
              <label for="zipUpload" class="secondary-btn upload-zip-label">
                <i class="fa-solid fa-file-zipper"></i> Upload ZIP
              </label>
              <input type="file" id="fileUpload" accept="image/jpeg,image/png,image/webp" multiple style="display: none;" />
              <input type="file" id="zipUpload" accept=".zip,application/zip" style="display: none;" />
              <p id="fileName" class="file-name" style="font-size: 0.875rem; color: var(--muted); margin-bottom: 16px;">
                No images selected</p>

              <div id="uploadMessages" class="upload-messages" aria-live="polite"></div>
              <div id="uploadQueue" class="upload-queue" aria-label="Selected image queue">
                <p class="upload-queue-empty">No images selected.</p>
              </div>
              <div class="upload-batch-actions">
                <button type="button" id="scanImageBtn" class="primary-btn upload-scan-btn" disabled>
                  <i class="fa-solid fa-magnifying-glass-chart"></i> Detect Images
                </button>
                <button type="button" id="clearUploadBtn" class="text-btn" disabled>Clear Selection</button>
              </div>
              <div id="batchProcessingStatus" class="batch-processing-status" aria-live="polite"></div>
              <div id="batchSummary" class="batch-summary" hidden></div>
              <div id="uploadProgress" class="upload-progress" hidden aria-live="polite">
                <div class="upload-progress-row">
                  <span id="uploadProgressLabel">Uploading image</span>
                  <strong id="uploadProgressPercent">0%</strong>
                </div>
                <div class="upload-progress-track">
                  <span id="uploadProgressBar"></span>
                </div>
              </div>
            </div>
          </div>

          <div class="panel upload-info-panel bbox-card">
            <div>
              <div class="section-heading compact" style="margin-bottom: 24px;">
                <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--text); text-align: left;">Upload and Quality
                  Tips</h2>
              </div>
              <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 20px;">
                <li style="display: flex; gap: 14px; font-size: 0.9375rem; align-items: start;">
                  <span style="color: var(--primary); font-size: 1.125rem; line-height: 1.25;"><i
                      class="fa-solid fa-lightbulb"></i></span>
                  <div>
                    <strong style="display: block; color: var(--text); font-weight: 600; margin-bottom: 4px;">Lighting &
                      Contrast</strong>
                    <p style="color: var(--muted); font-size: 0.875rem; line-height: 1.4; margin: 0;">Use clear,
                      evenly lit images with the waste item visible.</p>
                  </div>
                </li>
                <li style="display: flex; gap: 14px; font-size: 0.9375rem; align-items: start;">
                  <span style="color: var(--primary); font-size: 1.125rem; line-height: 1.25;"><i
                      class="fa-solid fa-expand"></i></span>
                  <div>
                    <strong style="display: block; color: var(--text); font-weight: 600; margin-bottom: 4px;">Full
                      Visibility</strong>
                    <p style="color: var(--muted); font-size: 0.875rem; line-height: 1.4; margin: 0;">Avoid excessive
                      overlap so the model can identify material boundaries.</p>
                  </div>
                </li>
                <li style="display: flex; gap: 14px; font-size: 0.9375rem; align-items: start;">
                  <span style="color: var(--primary); font-size: 1.125rem; line-height: 1.25;"><i
                      class="fa-solid fa-circle-minus"></i></span>
                  <div>
                    <strong style="display: block; color: var(--text); font-weight: 600; margin-bottom: 4px;">Minimize
                      Blur</strong>
                    <p style="color: var(--muted); font-size: 0.875rem; line-height: 1.4; margin: 0;">Avoid blurred
                      captures and low-resolution screenshots.</p>
                  </div>
                </li>
                <li style="display: flex; gap: 14px; font-size: 0.9375rem; align-items: start;">
                  <span style="color: var(--primary); font-size: 1.125rem; line-height: 1.25;"><i
                      class="fa-solid fa-clipboard-list"></i></span>
                  <div>
                    <strong style="display: block; color: var(--text); font-weight: 600; margin-bottom: 4px;">Supported
                      Formats</strong>
                    <p style="color: var(--muted); font-size: 0.875rem; line-height: 1.4; margin: 0;">Images: JPG, PNG,
                      WEBP. Maximum recommended size: 10 MB.</p>
                    <p style="color: var(--muted); font-size: 0.875rem; line-height: 1.4; margin: 4px 0 0;">Upload up to 10 images directly. For larger batches, upload a ZIP file containing up to 50 images.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div class="instruction-box"
              style="background: var(--light); border: 1px solid var(--border); padding: 18px; border-radius: 8px; margin-top: 28px;">
              <h4
                style="font-weight: 700; font-size: 0.875rem; color: var(--text); display: flex; align-items: center; gap: 8px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.02em;">
                <i class="fa-solid fa-circle-info" style="color: var(--primary);"></i> SCAN START
              </h4>
              <p style="font-size: 0.8125rem; color: var(--muted); line-height: 1.5; margin: 0;">
                Each image is processed one at a time. Successful scans appear in Results after the batch finishes.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page upload-pro-page lab-ui dark-ai dark-app" dataPage="upload" html={html} />;
}
