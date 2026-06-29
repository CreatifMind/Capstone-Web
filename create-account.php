<?php
$pageTitle = 'Create Account | PurityLoop AI Platform';
$pageDescription = 'Create a PurityLoop AI operator account for waste classification and review workflows.';
$bodyClass = 'login-body premium-login lab-ui dark-ai dark-login';
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <meta name="description" content="<?= htmlspecialchars($pageDescription, ENT_QUOTES, 'UTF-8') ?>" />

  <link rel="icon" href="assets/logo.png" type="image/png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
    rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" href="css/style.css" />
</head>

<body class="<?= htmlspecialchars($bodyClass, ENT_QUOTES, 'UTF-8') ?>">

  <div class="login-split">
    <div class="login-visual">
      <div class="login-visual-content">
        <div class="login-brand-badge">
          <img src="assets/logo.png" alt="PurityLoop AI Logo" />
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
            <span>Secure capstone demo account</span>
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
        <a href="login.php"
          style="display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:0.8125rem;font-weight:600;margin-bottom:28px;text-decoration:none;">
          <i class="fa-solid fa-arrow-left"></i> Back to Login
        </a>
        <h2>Create account</h2>
        <p>Set up operator access for the PurityLoop AI platform</p>
      </div>

      <form id="createAccountForm" action="upload.php" method="get" novalidate>
        <div class="form-group">
          <label for="fullName">Full Name</label>
          <input type="text" id="fullName" name="fullName" placeholder="Admin Operator" autocomplete="name" required />
        </div>

        <div class="form-group">
          <label for="facilityName">Facility Name</label>
          <input type="text" id="facilityName" name="facilityName" placeholder="PurityLoop Demo MRF" required />
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
        <a href="login.php" class="create-account-link">Login</a>
      </div>

      <div class="login-trust-row">
        <span class="trust-badge"><i class="fa-solid fa-lock"></i> SSL Secured</span>
        <span class="trust-badge"><i class="fa-solid fa-shield-check"></i> AI Verified</span>
        <span class="trust-badge"><i class="fa-solid fa-certificate"></i> Capstone 2026</span>
      </div>
    </div>
  </div>

  <script src="js/theme.js"></script>
  <script>
    const signupForm = document.getElementById('createAccountForm');
    if (signupForm) {
      signupForm.addEventListener('submit', event => {
        event.preventDefault();
        window.location.href = 'upload.php';
      });
    }
  </script>
</body>

</html>
