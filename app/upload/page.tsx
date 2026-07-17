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

      <div class="page-body upload-page-body">
        <section class="upload-workspace">
          <section class="panel upload-card" aria-labelledby="uploadCardTitle">
              <h2 id="uploadCardTitle" class="upload-card-title">Upload Waste Images</h2>
              <div class="upload-box" aria-describedby="uploadPolicy">
                <div class="upload-icon" aria-hidden="true"><i class="fa-solid fa-cloud-arrow-up"></i></div>
                <h3>Drag &amp; drop images here</h3>
                <p>or choose files to upload</p>
                <div class="upload-source-actions">
                  <label for="fileUpload" class="upload-label"><i class="fa-solid fa-image"></i> Choose Images</label>
                  <label for="videoUpload" class="secondary-btn"><i class="fa-solid fa-film"></i> Upload MP4</label>
                  <label for="zipUpload" class="secondary-btn upload-zip-label"><i class="fa-solid fa-file-zipper"></i> Upload ZIP</label>
                </div>
                <input type="file" id="fileUpload" accept="image/jpeg,image/png,image/webp" multiple />
                <input type="file" id="videoUpload" accept="video/mp4,.mp4" />
                <input type="file" id="zipUpload" accept=".zip,application/zip" />
                <p id="uploadPolicy" class="upload-file-policy">JPG, PNG, WEBP up to 10 MB each, or MP4 video. Direct upload: 10 images. ZIP: 50 images, 100 MB archive.</p>
                <div id="uploadUtilityActions" class="upload-utility-actions"></div>
                <p id="fileName" class="file-name">No images selected</p>
                <div id="uploadMessages" class="upload-messages" aria-live="polite"></div>
                <div id="uploadProgress" class="upload-progress" hidden aria-live="polite">
                  <div class="upload-progress-row"><span id="uploadProgressLabel">Uploading image</span><strong id="uploadProgressPercent">0%</strong></div>
                  <div class="upload-progress-track"><span id="uploadProgressBar"></span></div>
                </div>
              </div>
          </section>

          <section class="panel upload-queue-card" aria-labelledby="uploadQueueTitle">
              <div class="upload-queue-header">
                <h2 id="uploadQueueTitle">Upload Queue <span id="uploadQueueCount">(0)</span></h2>
                <div class="upload-queue-counts" aria-label="Upload queue counts">
                  <span><i class="fa-solid fa-images"></i><strong id="uploadSelectedCount">0</strong> Selected</span>
                  <span><i class="fa-solid fa-circle-check"></i><strong id="uploadReadyCount">0</strong> Ready</span>
                  <span><i class="fa-solid fa-triangle-exclamation"></i><strong id="uploadReviewCount">0</strong> Review</span>
                  <span><i class="fa-solid fa-circle-xmark"></i><strong id="uploadFailedCount">0</strong> Failed</span>
                </div>
              </div>
              <div id="uploadQueue" class="upload-queue" aria-label="Selected image queue"><p class="upload-queue-empty">No images selected.</p></div>
              <div id="batchProcessingStatus" class="batch-processing-status" aria-live="polite"></div>
              <div class="upload-batch-actions">
                <button type="button" id="scanImageBtn" class="primary-btn upload-scan-btn" disabled><i class="fa-solid fa-play"></i> Detect Images</button>
                <button type="button" id="clearUploadBtn" class="text-btn" disabled>Clear Selection</button>
              </div>
              <div id="batchSummary" class="batch-summary" hidden aria-live="polite"></div>
          </section>

          <section class="panel upload-tips-card" aria-labelledby="qualityTipsTitle">
              <h2 id="qualityTipsTitle"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i> Upload &amp; Quality Tips</h2>
              <ul class="upload-tips-list">
                <li><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><div><strong>Lighting &amp; Contrast</strong><p>Use clear, evenly lit images with the waste item visible.</p></div></li>
                <li><i class="fa-solid fa-expand" aria-hidden="true"></i><div><strong>Full Visibility</strong><p>Avoid excessive overlap so the model can identify material boundaries.</p></div></li>
                <li><i class="fa-solid fa-circle-minus" aria-hidden="true"></i><div><strong>Minimize Blur</strong><p>Avoid blurred captures and low-resolution screenshots.</p></div></li>
                <li><i class="fa-solid fa-briefcase" aria-hidden="true"></i><div><strong>Supported Formats</strong><p>JPG, PNG, WEBP, or MP4. Videos upload directly to Google Drive for background processing.</p></div></li>
              </ul>
          </section>
          <section class="panel batch-summary-card" aria-labelledby="batchSummaryTitle">
              <h2 id="batchSummaryTitle"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i> Batch Summary</h2>
              <dl class="batch-summary-list">
                <div><dt>Total Selected</dt><dd id="batchTotalSelected">0 images</dd></div>
                <div><dt>Valid Images</dt><dd id="batchValidImages">0 images</dd></div>
                <div><dt>Need Review</dt><dd id="batchNeedReview">0 images</dd></div>
                <div><dt>Unsupported / Skipped</dt><dd id="batchSkippedImages">0 files</dd></div>
                <div><dt>ZIP Detected</dt><dd id="batchZipDetected">No</dd></div>
                <div><dt>Max Direct Upload</dt><dd>10 images</dd></div>
              </dl>
          </section>
        </section>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page upload-pro-page lab-ui dark-ai dark-app" dataPage="upload" html={html} />;
}
