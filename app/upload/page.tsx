import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | Upload" };

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

        <div class="topbar-right" data-topbar-actions data-topbar-variant="standard"></div>
      </header>

      <div class="page-body upload-page-body">
        <section class="upload-workspace">
          <section class="panel upload-card" aria-labelledby="uploadCardTitle">
              <div class="upload-section-header">
                <h2 id="uploadCardTitle" class="upload-card-title">Upload Waste Images</h2>
                <button id="openUploadTips" type="button" class="secondary-btn upload-utility-btn" aria-haspopup="dialog" aria-controls="uploadTipsModal"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i> Quality Tips</button>
              </div>
              <div class="upload-box" aria-describedby="uploadPolicy">
                <div class="upload-icon" aria-hidden="true"><i class="fa-solid fa-cloud-arrow-up"></i></div>
                <h3>Drag &amp; drop files here</h3>
                <p>or choose files to upload</p>
                <div class="upload-source-actions">
                  <label for="fileUpload" class="upload-label"><i class="fa-solid fa-folder-open"></i> Choose Files</label>
                </div>
                <input type="file" id="fileUpload" accept="image/jpeg,image/png,image/webp,video/mp4,.mp4,.zip,application/zip" multiple />
                <p id="uploadPolicy" class="upload-file-policy">JPG, PNG, WEBP up to 10 MB each. Select multiple MP4 or ZIP files to preview them here; click Detect Images when ready. ZIP: no archive or image-count cap. MP4: up to 2 GB each.</p>
                <div id="uploadUtilityActions" class="upload-utility-actions"></div>
                <p id="fileName" class="file-name">No files selected</p>
                <div id="uploadMessages" class="upload-messages" aria-live="polite"></div>
                <div id="uploadProgress" class="upload-progress" hidden aria-live="polite">
                  <div class="upload-progress-row"><span id="uploadProgressLabel">Uploading image</span><strong id="uploadProgressPercent">0%</strong></div>
                  <div class="upload-progress-track"><span id="uploadProgressBar"></span></div>
                </div>
              </div>
          </section>

          <section class="panel upload-queue-card" aria-labelledby="uploadQueueTitle">
              <div class="upload-queue-header">
                <div class="upload-queue-title">
                  <h2 id="uploadQueueTitle">Upload Queue <span id="uploadQueueCount">(0)</span></h2>
                </div>
                <button id="openBatchSummary" type="button" class="secondary-btn upload-utility-btn upload-batch-summary-trigger" aria-haspopup="dialog" aria-controls="uploadBatchSummaryModal"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i> Batch Summary</button>
                <div class="upload-queue-counts" aria-label="Upload queue counts">
                  <span><i class="fa-solid fa-images"></i><strong id="uploadSelectedCount">0</strong> Selected</span>
                  <span><i class="fa-solid fa-circle-check"></i><strong id="uploadReadyCount">0</strong> Ready</span>
                  <span><i class="fa-solid fa-triangle-exclamation"></i><strong id="uploadReviewCount">0</strong> Review</span>
                  <span><i class="fa-solid fa-circle-xmark"></i><strong id="uploadFailedCount">0</strong> Failed</span>
                </div>
              </div>
              <div id="uploadQueue" class="upload-queue" aria-label="Selected image queue"><p class="upload-queue-empty">No images selected.</p></div>
              <div class="upload-progress-actions">
                <div id="batchProcessingStatus" class="batch-processing-status" aria-live="polite"></div>
                <div class="upload-batch-actions">
                  <button type="button" id="scanImageBtn" class="primary-btn upload-scan-btn" disabled><i class="fa-solid fa-play"></i> Detect Images</button>
                  <button type="button" id="clearUploadBtn" class="text-btn" disabled>Clear Selection</button>
                </div>
              </div>
              <div id="batchSummary" class="batch-summary" hidden aria-live="polite"></div>
          </section>
        </section>

        <div id="uploadTipsModal" class="modal-overlay upload-info-modal" aria-hidden="true">
          <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="qualityTipsTitle" tabindex="-1">
            <button type="button" class="modal-close" data-upload-modal-close aria-label="Close Quality Tips">×</button>
            <div class="upload-info-modal-body">
              <h2 id="qualityTipsTitle"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i> Upload &amp; Quality Tips</h2>
              <ul class="upload-tips-list">
                <li><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><div><strong>Lighting &amp; Contrast</strong><p>Use clear, evenly lit images with the waste item visible.</p></div></li>
                <li><i class="fa-solid fa-expand" aria-hidden="true"></i><div><strong>Full Visibility</strong><p>Avoid excessive overlap so the model can identify material boundaries.</p></div></li>
                <li><i class="fa-solid fa-circle-minus" aria-hidden="true"></i><div><strong>Minimize Blur</strong><p>Avoid blurred captures and low-resolution screenshots.</p></div></li>
                <li><i class="fa-solid fa-briefcase" aria-hidden="true"></i><div><strong>Supported Formats</strong><p>JPG, PNG, WEBP, or MP4. Videos upload directly to Google Drive for background processing.</p></div></li>
              </ul>
            </div>
          </section>
        </div>

        <div id="uploadBatchSummaryModal" class="modal-overlay upload-info-modal" aria-hidden="true">
          <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="batchSummaryTitle" tabindex="-1">
            <button type="button" class="modal-close" data-upload-modal-close aria-label="Close Batch Summary">×</button>
            <div class="upload-info-modal-body">
              <h2 id="batchSummaryTitle"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i> Batch Summary</h2>
              <dl class="batch-summary-list">
                <div><dt>Total Selected</dt><dd id="batchTotalSelected">0 images</dd></div>
                <div><dt>Valid Files</dt><dd id="batchValidImages">0 files</dd></div>
                <div><dt>Need Review</dt><dd id="batchNeedReview">0 images</dd></div>
                <div><dt>Unsupported / Skipped</dt><dd id="batchSkippedImages">0 files</dd></div>
                <div><dt>ZIP Detected</dt><dd id="batchZipDetected">No</dd></div>
                <div><dt>Direct Upload Limit</dt><dd>10 images</dd></div>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="ops-pro-page upload-pro-page lab-ui dark-ai dark-app" dataPage="upload" html={html} />;
}
