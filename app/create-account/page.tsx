import PageHtml from "@/components/PageHtml";

export const metadata = { title: "PurityLoop AI | Create Account" };

const html = `
<div class="login-split">
    <div class="login-visual">
      <div class="login-visual-content">
        <div class="login-brand-badge">
          <img src="/assets/logo.png" alt="PurityLoop AI Logo" />
        </div>

        <h1 class="login-headline">
          Join the recycling<br>operations platform.
        </h1>

        <p class="login-desc">
          Create an operator account to upload waste images, review AI classifications, and monitor recovery analytics.
        </p>

        <div class="login-checklist">
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>Operator upload access</span>
          </div>
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>Human review workflow</span>
          </div>
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>MRF analytics visibility</span>
          </div>
          <div class="checklist-item">
            <i class="fa-solid fa-circle-check"></i>
            <span>Secure operator account</span>
          </div>
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

    <div class="login-card create-account-card">
      <div class="login-card-header">
        <div data-theme-slot="auth"></div>
        <a href="/login"
          style="display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:0.8125rem;font-weight:600;margin-bottom:28px;text-decoration:none;">
          <i class="fa-solid fa-arrow-left"></i> Back to Login
        </a>
        <h2>Create account</h2>
        <p>Account creation is not enabled in the public demo yet.</p>
      </div>

      <form id="createAccountForm" method="post" novalidate>
        <div class="form-group">
          <label for="fullName">Full Name</label>
          <input type="text" id="fullName" name="fullName" placeholder="Admin Operator" autocomplete="name" required />
        </div>

        <div class="form-group">
          <label for="facilityName">Facility Name</label>
          <input type="text" id="facilityName" name="facilityName" placeholder="Facility name" required />
        </div>

        <div class="form-group">
          <label for="signupEmail">Email Address</label>
          <input type="email" id="signupEmail" name="email" placeholder="operator@facility.com" autocomplete="email"
            required />
        </div>

        <div class="form-group">
          <label for="signupPassword">Password</label>
          <div class="password-wrap">
            <input type="password" id="signupPassword" name="password" placeholder="Create your password"
              autocomplete="new-password" required />
            <button type="button" id="passwordToggle" aria-label="Toggle password visibility">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </div>

        <button type="submit" class="btn btn-full btn-lg">
          <i class="fa-solid fa-user-plus"></i>
          Create Account
        </button>
      </form>

      <div class="create-account-panel">
        <div>
          <span>Already registered?</span>
          <strong>Return to existing operator access</strong>
        </div>
        <a href="/login" class="create-account-link">Login</a>
      </div>

      <div class="login-trust-row">
        <span class="trust-badge"><i class="fa-solid fa-flask"></i> Public Demo</span>
        <span class="trust-badge"><i class="fa-solid fa-certificate"></i> Capstone 2026</span>
      </div>
    </div>
  </div>
`;

export default function Page() {
  return <PageHtml bodyClass="login-body premium-login dark-ai dark-login" html={html} />;
}
