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

  // Restore saved state — suppress transitions so the layout snaps instantly (no jump)
  const saved = localStorage.getItem('pl_sidebar');
  if (saved === 'collapsed' && !isMobileNav()) {
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
        sidebar.classList.remove('mobile-open', 'collapsed');
        if (overlay) overlay.classList.remove('active');
        updateToggleIcon();
        return;
      }
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('pl_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
      updateToggleIcon();
    });
  }

  // Mobile open
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('mobile-open');
      if (overlay) overlay.classList.add('active');
      updateToggleIcon();
    });
  }

  // Close overlay
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open', 'collapsed');
      overlay.classList.remove('active');
      updateToggleIcon();
    });
  }

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
  const current = window.location.pathname.split('/').pop() || 'index.php';
  document.querySelectorAll('.nav-item').forEach(link => {
    const href = link.getAttribute('href');
    if (href && current.includes(href)) {
      link.classList.add('active');
    }
  });
}

/* ── 4. TOAST NOTIFICATIONS ── */
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

/* ── 5. LANDING PAGE NAVBAR SCROLL ── */
function initLandingNav() {
  const nav = document.getElementById('landingNav');
  if (!nav) return;

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
      // Close mobile menu
      const menu = document.getElementById('mobileMenu');
      if (menu) menu.classList.remove('open');
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
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    const icon = burger.querySelector('i');
    const setMenuState = isOpen => {
      menu.classList.toggle('open', isOpen);
      burger.classList.toggle('open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
      document.body.classList.toggle('landing-menu-open', isOpen);
      if (icon) icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    };

    burger.addEventListener('click', () => setMenuState(!menu.classList.contains('open')));
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => setMenuState(false));
    });
  }
}

/* ── 6. AOS INIT ── */
function initAOS() {
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 700, easing: 'ease-out-cubic', once: true, offset: 80 });
  }
}

/* ── 7. GSAP HERO PARALLAX ── */
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
      const item = items.find(i => i.id === el.id);
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

/* ── 13. PROGRESS BAR ANIMATIONS ── */
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

/* ── 14. LIGHTWEIGHT MOTION SYSTEM ── */
function initMotionEffects() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.add('page-loading');
  requestAnimationFrame(() => {
    document.body.classList.add('page-loaded');
  });

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || link.target === '_blank') return;
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      let nextUrl;
      try {
        nextUrl = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (nextUrl.origin !== window.location.origin || nextUrl.pathname === window.location.pathname) return;
      event.preventDefault();
      document.body.classList.add('page-leaving');
      setTimeout(() => {
        window.location.href = nextUrl.href;
      }, reduceMotion ? 0 : 180);
    });
  });

  const revealSelectors = [
    '.landing-body section > *',
    '.hero-copy > *',
    '.hero-dashboard-card',
    '.feature-row',
    '.problem-card',
    '.tech-pill',
    '.app-layout .topbar',
    '.app-layout .ops-hero',
    '.app-layout .panel',
    '.app-layout .bbox-card',
    '.app-layout .kpi-card',
    '.app-layout .chart-panel',
    '.app-layout .settings-card',
    '.app-layout .ticket-status-panel'
  ].join(',');

  const revealItems = Array.from(document.querySelectorAll(revealSelectors))
    .filter(el => !el.closest('.sidebar') && !el.classList.contains('motion-ready'));

  revealItems.forEach((el, index) => {
    el.classList.add('motion-ready');
    el.style.setProperty('--motion-delay', `${Math.min(index % 8, 7) * 45}ms`);
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  revealItems.forEach(el => observer.observe(el));
}

function initMetricCountUp() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initLiveClock();
  initActiveNav();
  initLandingNav();
  initAOS();
  initGSAP();
  initCountUp();
  initTyped();
  initHeroBars();
  initLandingCharts();
  initPasswordToggle();
  initMotionEffects();
  initMetricCountUp();
  animateProgressBars();
});
