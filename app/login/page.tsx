import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | Sign In" };

const html = `
<div class="login-split">

    <div class="login-visual">
      <div class="login-visual-content">
        <!-- Brand mark -->
        <div class="login-brand-badge">
          <img src="/assets/logo.png" alt="PurityLoop AI Logo" />
        </div>

        <h1 class="login-headline">
          Automated waste sorting<br>for cleaner recycling loops.
        </h1>

        <p class="login-desc">
          Upload waste images, classify materials with AI, detect contamination, and keep every decision auditable.
        </p>

        <!-- Checklist -->
        <div class="login-checklist">
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>YOLOv8 waste classification</span>
          </div>
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>Contamination risk detection</span>
          </div>
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>Human review log trail</span>
          </div>
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>Operations analytics dashboard</span>
          </div>
        </div>

        <!-- Custom SVG Sorting & Recycling Illustration -->
        <div class="login-illustration">
          <svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Background grid & scanning beams -->
            <path d="M40 120H360" stroke="var(--ai-border-strong)" stroke-width="2" stroke-dasharray="4 4" />
            <path d="M200 40V200" stroke="var(--ai-border-strong)" stroke-width="2" stroke-dasharray="4 4" />

            <!-- Conveyor belt line -->
            <rect x="50" y="116" width="300" height="8" rx="4" fill="var(--ai-border-strong)" />

            <!-- Scanning field -->
            <path d="M200 40L140 120H260L200 40Z" fill="url(#scanGrad)" opacity="0.45" />

            <!-- Camera / Sensor Node -->
            <circle cx="200" cy="40" r="16" fill="#10B981" />
            <circle cx="200" cy="40" r="24" stroke="#34D399" stroke-width="2" opacity="0.5" />
            <circle cx="200" cy="40" r="6" fill="#FFFFFF" />

            <!-- Moving elements (sorted waste packages) -->
            <!-- Glass -->
            <rect x="80" y="100" width="30" height="30" rx="6" fill="#10B981" opacity="0.8" />
            <path d="M95 105V125M85 115H105" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" />
            <text x="95" y="90" fill="var(--ai-muted)" font-size="9" text-anchor="middle"
              font-family="Inter, sans-serif" font-weight="bold">PET [98%]</text>

            <!-- Scanning target -->
            <rect x="185" y="100" width="30" height="30" rx="6" fill="#34D399" stroke="#FFFFFF" stroke-width="2" />
            <path d="M190 115H210M200 105V125" stroke="#FFFFFF" stroke-width="2" />
            <text x="200" y="90" fill="#34D399" font-size="10" text-anchor="middle" font-family="Inter, sans-serif"
              font-weight="bold">SCANNING...</text>

            <!-- Cardboard -->
            <rect x="290" y="100" width="30" height="30" rx="6" fill="color-mix(in srgb, var(--ai-text) 15%, transparent)"
              stroke="var(--ai-border-strong)" />
            <text x="305" y="90" fill="var(--ai-muted)" font-size="9" text-anchor="middle"
              font-family="Inter, sans-serif">ALUM</text>

            <!-- Gradients -->
            <defs>
              <linearGradient id="scanGrad" x1="200" y1="40" x2="200" y2="120" gradientUnits="userSpaceOnUse">
                <stop stop-color="#34D399" stop-opacity="0.8" />
                <stop offset="1" stop-color="#10B981" stop-opacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div class="login-visual-footer">
        <div class="ai-badge">
          <span class="ai-badge-dot"></span>
          AI-Powered | YOLOv8 Model
        </div>
        <p>© 2026 PurityLoop AI | Capstone Demonstration</p>
      </div>
    </div>

    <div class="login-card">
      <div class="login-card-header">
        <div data-theme-slot="auth"></div>
        <a href="/"
          style="display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:0.8125rem;font-weight:600;margin-bottom:28px;text-decoration:none;">
          <i class="fa-solid fa-arrow-left"></i> Back to Home
        </a>
        <h2>Sign in to PurityLoop AI</h2>
        <p>Enter your email and password to continue.</p>
      </div>

      <!-- Login Form -->
      <form id="loginForm" action="/upload" method="post" novalidate>

        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" placeholder="operator@facility.com" autocomplete="email"
            required />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <div class="password-wrap">
            <input type="password" id="password" name="password" placeholder="Enter your password"
              autocomplete="current-password" required />
            <button type="button" id="passwordToggle" aria-label="Toggle password visibility">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </div>

        <button type="submit" class="btn btn-full btn-lg" id="loginBtn">
          <i class="fa-solid fa-sign-in-alt"></i>
          Continue
        </button>

      </form>

      <div class="create-account-panel">
        <div>
          <span>Need an account?</span>
          <strong>Create an account to manage your workspace</strong>
        </div>
        <a href="/create-account" class="create-account-link">Create Account</a>
      </div>

      <!-- Trust indicators -->
      <div class="login-trust-row">
        <span class="trust-badge"><i class="fa-solid fa-shield-halved"></i> Secure Workspace</span>
        <span class="trust-badge"><i class="fa-solid fa-certificate"></i> Capstone 2026</span>
      </div>

      <div class="small-note" style="margin-top:24px;">
        Your credentials are used only to establish your current workspace session.
      </div>
    </div>

  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="login-body premium-login dark-ai dark-login" html={html} />;
}
