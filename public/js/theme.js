/* =============================================================
   PURITYLOOP AI — SHARED PLATFORM JS (theme.js)
   Collapsible sidebar, mobile nav, AOS, GSAP, CountUp
   ============================================================= */

/* ── 1. COLLAPSIBLE SIDEBAR ── */
function initSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('sidebarToggle');
  const mobileToggle = document.getElementById('mobileToggle');
  if (!sidebar) return;
  const isMobileNav = () => window.matchMedia('(max-width: 1000px)').matches;
  if (sidebar.dataset.sidebarReady === 'true') return;
  sidebar.dataset.sidebarReady = 'true';

  const closeMobileSidebar = () => {
    sidebar.classList.remove('mobile-open', 'collapsed');
    document.documentElement.classList.remove('sidebar-state-collapsed');
    document.body.classList.remove('app-sidebar-open');
    if (overlay) overlay.classList.remove('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    updateToggleIcon();
  };

  // Restore saved state — suppress transitions so the layout snaps instantly (no jump)
  const saved = localStorage.getItem('pl_sidebar');
  if (saved === 'collapsed' && !isMobileNav()) {
    document.documentElement.classList.add('sidebar-state-collapsed');
    document.documentElement.classList.add('no-transition');
    sidebar.classList.add('collapsed');
    // Remove the suppressor after one paint so future user-triggered transitions still animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('no-transition');
      });
    });
  }

  // Desktop collapse toggle
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (isMobileNav()) {
        closeMobileSidebar();
        return;
      }
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('pl_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
      document.documentElement.classList.toggle('sidebar-state-collapsed', sidebar.classList.contains('collapsed'));
      updateToggleIcon();
    });
  }

  // Mobile open
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      document.documentElement.classList.remove('sidebar-state-collapsed');
      sidebar.classList.add('mobile-open');
      document.body.classList.add('app-sidebar-open');
      if (overlay) overlay.classList.add('active');
      mobileToggle.setAttribute('aria-expanded', 'true');
      updateToggleIcon();
    });
  }

  // Close overlay
  if (overlay) {
    overlay.addEventListener('click', () => {
      closeMobileSidebar();
    });
  }

  sidebar.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      if (isMobileNav()) {
        closeMobileSidebar();
        return;
      }
      const isCollapsed = sidebar.classList.contains('collapsed') || document.documentElement.classList.contains('sidebar-state-collapsed');
      if (!isMobileNav() && isCollapsed) {
        document.documentElement.classList.add('no-transition');
        window.clearTimeout(window.__plSidebarTransitionTimer);
        window.__plSidebarTransitionTimer = window.setTimeout(() => {
          document.documentElement.classList.remove('no-transition');
        }, 700);
      }
    });
  });

  window.addEventListener('resize', () => {
    if (!isMobileNav()) {
      sidebar.classList.remove('mobile-open');
      document.body.classList.remove('app-sidebar-open');
      if (overlay) overlay.classList.remove('active');
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.toggle('sidebar-state-collapsed', sidebar.classList.contains('collapsed'));
      updateToggleIcon();
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
      closeMobileSidebar();
    }
  });

  function updateToggleIcon() {
    if (!toggle) return;
    const icon = toggle.querySelector('i');
    if (!icon) return;
    icon.className = sidebar.classList.contains('collapsed') || (isMobileNav() && !sidebar.classList.contains('mobile-open'))
      ? 'fa-solid fa-angles-right'
      : 'fa-solid fa-angles-left';
  }
  updateToggleIcon();
}

/* ── 2. LIVE CLOCK ── */
function initLiveClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }
  tick();
  setInterval(tick, 1000);
}

/* ── 3. ACTIVE NAV ITEM ── */
function initActiveNav() {
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-item').forEach(link => {
    const href = (link.getAttribute('href') || '').replace(/\/$/, '') || '/';
    if (href !== '/' && currentPath === href) {
      link.classList.add('active');
    }
  });
}

/* ── 4. TOPBAR ACCOUNT ACTIONS ── */
function initTopbarAccountActions() {
  const topbarRight = document.querySelector('.topbar-right');
  const userBadge = topbarRight?.querySelector('.user-badge');
  if (!topbarRight || !userBadge || topbarRight.querySelector('.topbar-account-actions')) return;

  const actions = document.createElement('div');
  actions.className = 'topbar-account-actions';
  actions.innerHTML = `
    <a href="/login" class="topbar-logout-btn" aria-label="Logout">
      <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
      <span>Logout</span>
    </a>
  `;

  userBadge.insertAdjacentElement('afterend', actions);
}

/* ── 5. TOAST NOTIFICATIONS ── */
window.showToast = function (message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const icons = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>'
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '<i class="fa-solid fa-circle-info"></i>'}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show'); }); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3800);
};

/* ── 6. LANDING PAGE NAVBAR SCROLL ── */
function initLandingNav() {
  const nav = document.getElementById('landingNav');
  if (!nav) return;
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('mobileMenu');
  const closeButton = document.getElementById('mobileMenuClose');
  const icon = burger ? burger.querySelector('i') : null;
  const setMenuState = isOpen => {
    if (!burger || !menu) return;
    menu.classList.toggle('open', isOpen);
    burger.classList.toggle('open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('landing-menu-open', isOpen);
    if (icon) icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  };

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMenuState(false);
    });
  });

  // Active section highlight while scrolling
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
        });
      }
    });
  }, { threshold: 0.45 });
  sections.forEach(s => observer.observe(s));

  // Mobile burger menu
  if (burger && menu) {
    burger.addEventListener('click', () => setMenuState(!menu.classList.contains('open')));
    if (closeButton) closeButton.addEventListener('click', () => setMenuState(false));
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => setMenuState(false));
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        setMenuState(false);
      }
    });
    window.addEventListener('resize', () => {
      if (!window.matchMedia('(max-width: 768px)').matches) {
        setMenuState(false);
      }
    });
  }
}

/* ── 7. AOS INIT ── */
function initAOS() {
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 700, easing: 'ease-out-cubic', once: true, offset: 80 });
  }
}

/* ── 8. GSAP HERO PARALLAX ── */
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  // Hero headline entrance
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.hero-tag', { opacity: 0, y: 20, duration: 0.6 })
    .from('.hero-headline', { opacity: 0, y: 30, duration: 0.7 }, '-=0.3')
    .from('.hero-sub', { opacity: 0, y: 20, duration: 0.6 }, '-=0.4')
    .from('.hero-btns', { opacity: 0, y: 16, duration: 0.5 }, '-=0.3')
    .from('.hero-social-proof', { opacity: 0, y: 12, duration: 0.4 }, '-=0.2')
    .from('.hero-dashboard-card', { opacity: 0, x: 40, duration: 0.8 }, '-=0.6');

  // Blob parallax
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.to('.hero-blob-1', {
      y: -80, ease: 'none',
      scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1 }
    });
    gsap.to('.hero-blob-2', {
      y: -50, ease: 'none',
      scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1.5 }
    });

    // Dashboard card scroll
    gsap.to('.hero-dashboard-card', {
      y: 30, ease: 'none',
      scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1 }
    });
  }
}

/* ── 8. COUNTUP ANIMATION ── */
function initCountUp() {
  if (typeof CountUp === 'undefined') return;

  const items = [
    { id: 'count-1', end: 95, suffix: '%' },
    { id: 'count-2', end: 40, suffix: '%' },
    { id: 'count-3', end: 30, suffix: '%' },
    { id: 'count-4', end: 24, suffix: '/7' },
  ];

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const item = (Array.isArray(items) ? items : []).find(i => i.id === el.id);
      if (!item) return;
      const cu = new CountUp.CountUp(el, item.end, {
        suffix: item.suffix,
        duration: 2.2,
        useEasing: true,
      });
      if (!cu.error) cu.start();
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  items.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) observer.observe(el);
  });
}

/* ── 9. TYPED.JS HERO SUBHEADLINE ── */
function initTyped() {
  if (typeof Typed === 'undefined') return;
  const el = document.getElementById('typedText');
  if (!el) return;
  new Typed(el, {
    strings: [
      'Classify uploaded waste images in seconds.',
      'Recover recyclable value with AI confidence scoring.',
      'Detect contamination before it reaches the final stream.',
      'Route uncertain results to human review.',
    ],
    typeSpeed: 45,
    backSpeed: 25,
    backDelay: 2200,
    loop: true,
    showCursor: true,
    cursorChar: '|',
  });
}

/* ── 10. ANIMATED HERO CHART BARS ── */
function initHeroBars() {
  const bars = document.querySelectorAll('.hdc-bar[data-h]');
  bars.forEach((bar, i) => {
    setTimeout(() => {
      bar.style.height = bar.dataset.h;
    }, 300 + i * 80);
  });
}

/* ── 11. LANDING ANALYTICS CHARTS ── */
function initLandingCharts() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.color = 'rgba(244,255,249,0.62)';
  const chartGrid = 'rgba(178, 255, 224, 0.16)';
  const chartText = 'rgba(244,255,249,0.62)';
  const mint = '#00F08A';
  const teal = '#00D6D6';
  const moss = '#7DDFA7';
  const amber = '#D8A448';
  const coral = '#D85E70';
  const slate = '#78938D';

  // Forecast Line Chart
  const forecastEl = document.getElementById('landingForecastChart');
  if (forecastEl) {
    new Chart(forecastEl, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
        datasets: [{
          label: 'AI Forecast',
          data: [820, 870, 940, 1010, 1090, 1150, 1230, 1310],
          borderColor: mint,
          backgroundColor: 'rgba(0,240,138,0.10)',
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: mint,
          pointRadius: 4,
        }, {
          label: 'Actual',
          data: [800, 865, 920, 990, 1050, 1120, null, null],
          borderColor: teal,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.4,
          borderDash: [6, 3],
          pointBackgroundColor: teal,
          pointRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: chartText, boxWidth: 14 } } },
        scales: {
          y: { beginAtZero: false, grid: { color: chartGrid }, ticks: { color: chartText, callback: v => v + ' t' } },
          x: { grid: { display: false }, ticks: { color: chartText } }
        }
      }
    });
  }

  // Inventory Donut
  const inventoryEl = document.getElementById('landingInventoryChart');
  if (inventoryEl) {
    new Chart(inventoryEl, {
      type: 'doughnut',
      data: {
        labels: ['Plastic', 'Metal', 'Paper', 'Glass', 'Cardboard', 'Other'],
        datasets: [{
          data: [28, 22, 18, 14, 10, 8],
          backgroundColor: [mint, teal, moss, amber, coral, slate],
          borderColor: 'rgba(4,15,13,0.90)',
          borderWidth: 2,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: chartText, boxWidth: 14, padding: 14 } } },
        cutout: '68%',
      }
    });
  }

  // Risk bar chart
  const riskEl = document.getElementById('landingRiskChart');
  if (riskEl) {
    new Chart(riskEl, {
      type: 'bar',
      data: {
        labels: ['Single image', 'ZIP batch', 'Mixed set', 'Hazard review', 'Clean batch'],
        datasets: [{
          label: 'Risk Score',
          data: [12, 8, 34, 19, 5],
          backgroundColor: [mint, teal, coral, amber, moss],
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartText } },
          x: { grid: { display: false }, ticks: { color: chartText } }
        }
      }
    });
  }

  // Procurement trend
  const procEl = document.getElementById('landingProcChart');
  if (procEl) {
    new Chart(procEl, {
      type: 'bar',
      data: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        datasets: [{
          label: 'Recovered Value ($k)',
          data: [210, 280, 320, 390],
          backgroundColor: 'rgba(0,240,138,0.62)',
          borderColor: 'rgba(0,240,138,0.95)',
          borderWidth: 1,
          borderRadius: 8,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: chartText, boxWidth: 14 } } },
        scales: {
          y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartText, callback: v => '$' + v + 'k' } },
          x: { grid: { display: false }, ticks: { color: chartText } }
        }
      }
    });
  }
}

/* ── 12. PASSWORD TOGGLE (login page) ── */
function initPasswordToggle() {
  const btn = document.getElementById('passwordToggle');
  const input = document.getElementById('password');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    const icon = btn.querySelector('i');
    if (icon) icon.className = type === 'text' ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });
}

/* ── 12A. LOGIN DEMO FLOW ── */
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.loginReady === 'true') return;
  form.dataset.loginReady = 'true';

  form.addEventListener('submit', event => {
    event.preventDefault();
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const emailValue = email?.value?.trim();
    const passwordValue = password?.value?.trim();

    if (!emailValue || !passwordValue) {
      window.showToast?.('Enter an email and password to access demo mode.', 'warning');
      return;
    }

    try {
      sessionStorage.setItem('purityloop_demo_user', JSON.stringify({
        email: emailValue,
        signedInAt: new Date().toISOString()
      }));
    } catch (error) {
      // Demo login should still route even if sessionStorage is unavailable.
    }

    window.location.assign('/upload');
  });
}

/* ── 14. PROGRESS BAR ANIMATIONS ── */
function animateProgressBars() {
  document.querySelectorAll('.kpi-progress-bar i, .kpi-progress-fill').forEach(bar => {
    const w = bar.style.width || getComputedStyle(bar).width;
    if (!bar.style.getPropertyValue('--target-width')) {
      bar.style.setProperty('--target-width', bar.style.width || '100%');
    }
    bar.style.width = '0%';
    bar.offsetHeight; // reflow
    setTimeout(() => { bar.style.width = bar.style.getPropertyValue('--target-width') || w; }, 160);
  });
}

/* ── 15. LIGHTWEIGHT MOTION SYSTEM ── */
function initMotionEffects() {
  document.body.classList.remove('page-loading', 'page-leaving');
  document.body.classList.add('page-loaded');
}

function initMetricCountUp() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.body.classList.contains('analytics-pro-page')) return;
  const metrics = document.querySelectorAll('.kpi-card > strong, .ops-hero-card strong, [data-countup]');
  metrics.forEach(metric => {
    const original = metric.textContent.trim();
    const numberMatch = original.match(/[\d,.]+/);
    if (!numberMatch) return;
    const numeric = Number(numberMatch[0].replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return;

    const prefix = original.slice(0, numberMatch.index);
    const suffix = original.slice(numberMatch.index + numberMatch[0].length);
    const decimals = numberMatch[0].includes('.') ? numberMatch[0].split('.')[1].length : 0;
    const duration = 760;
    const startTime = performance.now();

    const render = now => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = numeric * eased;
      const formatted = decimals
        ? value.toFixed(decimals)
        : Math.round(value).toLocaleString('en-US');
      metric.textContent = `${prefix}${formatted}${suffix}`;
      if (progress < 1) requestAnimationFrame(render);
      else metric.textContent = original;
    };

    requestAnimationFrame(render);
  });
}

/* ── INIT ALL ── */
function initPurityLoopTheme() {
  initSidebar();
  initLiveClock();
  initActiveNav();
  initTopbarAccountActions();
  initLandingNav();
  initAOS();
  initGSAP();
  initCountUp();
  initTyped();
  initHeroBars();
  initLandingCharts();
  initPasswordToggle();
  initLoginForm();
  initMotionEffects();
  initMetricCountUp();
  animateProgressBars();
}

window.initPurityLoopTheme = initPurityLoopTheme;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPurityLoopTheme);
} else {
  initPurityLoopTheme();
}

window.addEventListener('purityloop:page-ready', initPurityLoopTheme);

/* ── MOBILE OVERLAY LOCKS + SETTINGS SLIDER ── */
(function () {
  const MOBILE_MAX = 768;
  const isMobile = () => window.innerWidth <= MOBILE_MAX;
  const landingMenu = () => document.getElementById('mobileMenu');
  const appSidebar = () => document.getElementById('appSidebar');

  function setExpanded(selectors, value) {
    document.querySelectorAll(selectors).forEach((el) => {
      el.setAttribute('aria-expanded', String(value));
    });
  }

  function closeLandingMenu() {
    const menu = landingMenu();
    if (menu) menu.classList.remove('open');
    document.body.classList.remove('landing-menu-open');
    setExpanded('[aria-controls="mobileMenu"], #mobileMenuClose', false);
  }

  function closeAppSidebar() {
    const sidebar = appSidebar();
    if (sidebar) sidebar.classList.remove('mobile-open');
    document.body.classList.remove('app-sidebar-open');
    setExpanded('#mobileToggle, #sidebarToggle', false);
  }

  function syncOverlayLocks() {
    if (!isMobile()) {
      closeLandingMenu();
      closeAppSidebar();
      return;
    }

    document.body.classList.toggle(
      'landing-menu-open',
      Boolean(landingMenu()?.classList.contains('open'))
    );
    document.body.classList.toggle(
      'app-sidebar-open',
      Boolean(appSidebar()?.classList.contains('mobile-open'))
    );
  }

  function bindOverlayLocks() {
    if (document.documentElement.dataset.overlayLocksBound === 'true') return;
    document.documentElement.dataset.overlayLocksBound = 'true';

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      window.setTimeout(syncOverlayLocks, 0);

      if (target.closest('#mobileMenu a')) closeLandingMenu();
      if (target.closest('#appSidebar.mobile-open a')) closeAppSidebar();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeLandingMenu();
        closeAppSidebar();
      }
    });

    window.addEventListener('resize', syncOverlayLocks);
  }

  function bindSettingsThresholdSliders() {
    document.querySelectorAll('.settings-card input[type="range"]').forEach((input) => {
      if (!(input instanceof HTMLInputElement) || input.dataset.thresholdBound === 'true') return;
      input.dataset.thresholdBound = 'true';

      const output = input.closest('.settings-card')?.querySelector('.threshold-control strong');
      const update = () => {
        if (output) output.textContent = `${input.value}%`;
      };

      input.addEventListener('input', update);
      update();
    });
  }

  function initMobileOverlayFix() {
    bindOverlayLocks();
    bindSettingsThresholdSliders();
    syncOverlayLocks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileOverlayFix);
  } else {
    initMobileOverlayFix();
  }

  window.addEventListener('purityloop:page-ready', initMobileOverlayFix);
})();
