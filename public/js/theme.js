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

  const onResize = () => {
    if (!isMobileNav()) {
      sidebar.classList.remove('mobile-open');
      document.body.classList.remove('app-sidebar-open');
      if (overlay) overlay.classList.remove('active');
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.toggle('sidebar-state-collapsed', sidebar.classList.contains('collapsed'));
      updateToggleIcon();
    }
  };

  const onKeydown = e => {
    if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
      closeMobileSidebar();
    }
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('purityloop:page-cleanup', () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeydown);
  }, { once: true });

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
  if (!el || el.dataset.clockReady === 'true') return;
  el.dataset.clockReady = 'true';
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    el.classList.add('clock-ready');
  }
  tick();
  const timer = window.setInterval(tick, 1000);
  window.addEventListener('purityloop:page-cleanup', () => {
    window.clearInterval(timer);
  }, { once: true });
}

/* ── 3. ACTIVE NAV ITEM ── */
function initActiveNav() {
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-item').forEach(link => {
    link.classList.remove('active');
    const href = (link.getAttribute('href') || '').replace(/\/$/, '') || '/';
    if (href !== '/' && currentPath === href) {
      link.classList.add('active');
    }
  });
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
  if (!nav || nav.dataset.landingNavReady === 'true') return;
  nav.dataset.landingNavReady = 'true';
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

  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

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
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  const navTargets = [...new Set([...navLinks].map(link => link.getAttribute('href')).filter(Boolean))];
  const sections = navTargets
    .map(href => document.getElementById(href.slice(1)))
    .filter(Boolean);
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
    const onKeydown = e => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        setMenuState(false);
      }
    };
    const onResize = () => {
      if (!window.matchMedia('(max-width: 768px)').matches) {
        setMenuState(false);
      }
    };
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);
    window.addEventListener('purityloop:page-cleanup', () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
    }, { once: true });
  }

  window.addEventListener('purityloop:page-cleanup', () => {
    observer.disconnect();
    window.removeEventListener('scroll', onScroll);
  }, { once: true });
}

/* ── 7. AOS INIT ── */
function initAOS() {
  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 700, easing: 'ease-out-cubic', once: true, offset: 80 });
  }
}

/* ── 8. GSAP HERO PARALLAX ── */
function initGSAP() {
  const hero = document.querySelector('.hero-section');
  if (typeof gsap === 'undefined' || !hero) return;
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  const context = gsap.context(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.hero-tag', { opacity: 0, y: 20, duration: 0.6 })
      .from('.hero-headline', { opacity: 0, y: 30, duration: 0.7 }, '-=0.3')
      .from('.hero-sub', { opacity: 0, y: 20, duration: 0.6 }, '-=0.4')
      .from('.hero-btns', { opacity: 0, y: 16, duration: 0.5 }, '-=0.3')
      .from('.hero-social-proof', { opacity: 0, y: 12, duration: 0.4 }, '-=0.2')
      .from('.hero-dashboard-card', { opacity: 0, x: 40, duration: 0.8 }, '-=0.6');

    if (typeof ScrollTrigger !== 'undefined') {
      [['.hero-blob-1', -80, 1], ['.hero-blob-2', -50, 1.5], ['.hero-dashboard-card', 30, 1]].forEach(([target, y, scrub]) => {
        gsap.to(target, { y, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub } });
      });
    }
  }, hero);
  window.addEventListener('purityloop:page-cleanup', () => context.revert(), { once: true });
}

/* ── 9. TYPED.JS HERO SUBHEADLINE ── */
function initTyped() {
  if (typeof Typed === 'undefined') return;
  const el = document.getElementById('typedText');
  if (!el || el.dataset.typedReady === 'true') return;
  el.dataset.typedReady = 'true';
  const typed = new Typed(el, {
    strings: [
      'Classify uploaded waste images with browser-assisted AI.',
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
  window.addEventListener('purityloop:page-cleanup', () => typed.destroy(), { once: true });
}

/* ── 10. ANIMATED HERO CHART BARS ── */
function initHeroBars() {
  const bars = document.querySelectorAll('.hdc-bar[data-h]');
  const timers = [...bars].map((bar, i) => window.setTimeout(() => {
      bar.style.height = bar.dataset.h;
    }, 300 + i * 80));
  window.addEventListener('purityloop:page-cleanup', () => timers.forEach(timer => window.clearTimeout(timer)), { once: true });
}

/* ── 11. LANDING ANALYTICS CHARTS ── */
function initLandingCharts() {
  if (typeof Chart === 'undefined') return;
  const chartIds = ['landingForecastChart', 'landingInventoryChart', 'landingRiskChart', 'landingProcChart'];
  chartIds.forEach(id => Chart.getChart(id)?.destroy());
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.color = isLight ? 'rgba(22,38,31,0.68)' : 'rgba(244,255,249,0.62)';
  const chartGrid = isLight ? 'rgba(22,38,31,0.10)' : 'rgba(178, 255, 224, 0.16)';
  const chartText = isLight ? 'rgba(22,38,31,0.68)' : 'rgba(244,255,249,0.62)';
  const mint = isLight ? '#2f8f5b' : '#00F08A';
  const teal = isLight ? '#12a4a0' : '#00D6D6';
  const moss = isLight ? '#7dbf98' : '#7DDFA7';
  const amber = isLight ? '#d9a24a' : '#D8A448';
  const coral = isLight ? '#d85e70' : '#D85E70';
  const slate = isLight ? '#6b7a72' : '#78938D';

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
          borderWidth: 0,
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
  window.addEventListener('purityloop:page-cleanup', () => {
    chartIds.forEach(id => Chart.getChart(id)?.destroy());
  }, { once: true });
}

/* ── 11A. THEME-AWARE CHART PRESENTATION ── */
function refreshChartTheme() {
  if (!window.Chart || typeof Chart.getChart !== 'function') return;

  const isLight = document.documentElement.dataset.theme === 'light';
  const colors = {
    text: isLight ? '#506259' : '#a9bbb0',
    grid: isLight ? 'rgba(17,32,24,0.10)' : 'rgba(255,255,255,0.09)',
    surface: isLight ? '#ffffff' : '#0c1812',
    green: isLight ? '#15803d' : '#22c55e',
    cyan: isLight ? '#087c91' : '#22d3ee',
    blue: isLight ? '#2563eb' : '#60a5fa',
    amber: isLight ? '#b45309' : '#fbbf24',
    red: isLight ? '#dc2626' : '#f87171',
    muted: isLight ? '#78887f' : '#73877b'
  };
  const categoryColors = [
    colors.green,
    colors.cyan,
    colors.blue,
    colors.amber,
    '#8b5cf6',
    '#14b8a6',
    colors.muted,
    '#0ea5e9',
    colors.red
  ];

  [
    'landingForecastChart',
    'landingInventoryChart',
    'landingRiskChart',
    'landingProcChart',
    'compositionChart',
    'resaleChart',
    'yieldChart'
  ].forEach(id => {
    const chart = Chart.getChart(id);
    if (!chart) return;

    const legendLabels = chart.options?.plugins?.legend?.labels;
    if (legendLabels) legendLabels.color = colors.text;
    ['x', 'y'].forEach(axis => {
      const scale = chart.options?.scales?.[axis];
      if (!scale) return;
      if (scale.ticks) scale.ticks.color = colors.text;
      if (scale.grid && scale.grid.display !== false) scale.grid.color = colors.grid;
    });

    const dataset = chart.data?.datasets?.[0];
    if (id === 'landingForecastChart') {
      chart.data.datasets[0].borderColor = colors.green;
      chart.data.datasets[0].pointBackgroundColor = colors.green;
      chart.data.datasets[0].backgroundColor = isLight ? 'rgba(21,128,61,0.10)' : 'rgba(34,197,94,0.12)';
      if (chart.data.datasets[1]) {
        chart.data.datasets[1].borderColor = colors.cyan;
        chart.data.datasets[1].pointBackgroundColor = colors.cyan;
      }
    } else if (id === 'landingInventoryChart' && dataset) {
      dataset.backgroundColor = categoryColors.slice(0, 6);
    } else if (id === 'landingRiskChart' && dataset) {
      dataset.backgroundColor = [colors.green, colors.cyan, colors.red, colors.amber, '#14b8a6'];
    } else if (id === 'landingProcChart' && dataset) {
      dataset.backgroundColor = isLight ? 'rgba(21,128,61,0.64)' : 'rgba(34,197,94,0.64)';
      dataset.borderColor = colors.green;
    } else if (id === 'compositionChart' && dataset) {
      dataset.backgroundColor = categoryColors;
      dataset.borderColor = colors.surface;
    } else if ((id === 'resaleChart' || id === 'yieldChart') && dataset) {
      dataset.backgroundColor = categoryColors;
    }

    chart.update('none');
  });

  if (!Chart.getChart('compositionChart') && typeof window.drawEmptyAnalyticsCharts === 'function') {
    window.drawEmptyAnalyticsCharts();
  }
}

window.addEventListener('purityloop:theme-change', () => {
  window.requestAnimationFrame(refreshChartTheme);
});

function initCreateAccountForm() {
  const form = document.getElementById('createAccountForm');
  if (!form || form.dataset.authReady === 'true') return;
  form.dataset.authReady = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const requiredFields = [...form.querySelectorAll('[required]')];
    const invalid = requiredFields.find(field => !String(field.value || '').trim() || (field.type === 'email' && !field.checkValidity()));
    if (invalid) {
      invalid.focus();
      window.showToast?.('Complete required fields with a valid email before creating an account.', 'warning');
      return;
    }
    window.showToast?.('Account creation is not enabled in this public demo yet. No account or password was saved.', 'warning');
  });
}

function initAuthLogout() {
  if (document.documentElement.dataset.authLogoutReady === 'true') return;
  document.documentElement.dataset.authLogoutReady = 'true';
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest('a[href="/login"].logout-btn, a[href="/login"].topbar-logout-btn') : null;
    if (!target) return;
    event.preventDefault();
    try { await window.__PURITYLOOP_AUTH__?.signOut?.(); } catch (error) { console.warn('PurityLoop: sign out failed.', error); }
    try { sessionStorage.removeItem('purityloop_demo_user'); } catch {}
    window.location.assign('/login');
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

function revealLandingFallback() {
  document.body.classList.remove('page-loading', 'page-leaving');
  document.body.classList.add('page-loaded');
  document.documentElement.classList.remove('no-transition');
  [
    '.hero-tag',
    '.hero-headline',
    '.hero-sub',
    '.hero-btns',
    '.hero-social-proof',
    '.hero-dashboard-card'
  ].forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      el.style.removeProperty('visibility');
    });
  });
}

function runThemeInit(name, init, onError) {
  try {
    init();
  } catch (error) {
    console.error(`PurityLoop: ${name} failed.`, error);
    if (typeof onError === 'function') onError();
  }
}

function initMetricCountUp() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.body.classList.contains('analytics-pro-page')) return;
  const metrics = document.querySelectorAll('.kpi-card > strong, .ops-hero-card strong, [data-countup]');
  const frames = [];
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
      if (progress < 1) frames.push(requestAnimationFrame(render));
      else metric.textContent = original;
    };

    frames.push(requestAnimationFrame(render));
  });
  window.addEventListener('purityloop:page-cleanup', () => frames.forEach(frame => cancelAnimationFrame(frame)), { once: true });
}

function initLandingPresentation() {
  const videoShell = document.querySelector('.business-video-shell');
  const video = videoShell?.querySelector('video');
  const playButton = videoShell?.querySelector('.business-video-play');
  if (videoShell && video && playButton && videoShell.dataset.videoReady !== 'true') {
    videoShell.dataset.videoReady = 'true';
    playButton.addEventListener('click', () => {
      const result = video.play();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    });
    video.addEventListener('play', () => videoShell.classList.add('video-playing'));
    video.addEventListener('pause', () => videoShell.classList.remove('video-playing'));
    video.addEventListener('ended', () => videoShell.classList.remove('video-playing'));
  }

  const root = document.querySelector('[data-methodology-tabs]');
  if (!root || root.dataset.methodologyReady === 'true') return;
  root.dataset.methodologyReady = 'true';

  const tabs = [...root.querySelectorAll('[role="tab"][data-methodology-tab]')];
  const panels = [...root.querySelectorAll('[role="tabpanel"][data-methodology-panel]')];
  const prev = root.querySelector('[data-methodology-prev]');
  const next = root.querySelector('[data-methodology-next]');
  const fullscreen = root.querySelector('[data-methodology-fullscreen]');
  const count = root.querySelector('[data-methodology-count]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeIndex = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
  let lastFocus = null;
  let lightbox = null;
  let touchStartX = 0;
  let touchStartY = 0;

  const ensureImage = index => {
    const image = panels[index]?.querySelector('img[data-methodology-image]');
    if (image && !image.getAttribute('src') && image.dataset.src) {
      image.setAttribute('src', image.dataset.src);
    }
    return image;
  };

  const setActive = (index, focusTab = false) => {
    if (!tabs.length) return;
    activeIndex = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === activeIndex;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel, panelIndex) => {
      const selected = panelIndex === activeIndex;
      panel.classList.toggle('active', selected);
      panel.hidden = !selected;
    });
    ensureImage(activeIndex);
    if (count) count.textContent = `${activeIndex + 1} of ${tabs.length}`;
    if (focusTab) {
      tabs[activeIndex].focus({ preventScroll: true });
      tabs[activeIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (lightbox?.classList.contains('open')) syncLightbox();
  };

  const scrollToMethodology = () => {
    document.getElementById('methodology')?.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
  };

  const activeTitle = () => tabs[activeIndex]?.querySelector('span')?.textContent?.trim() || 'Methodology diagram';

  const syncLightbox = () => {
    if (!lightbox) return;
    const image = ensureImage(activeIndex);
    const lightboxImage = lightbox.querySelector('[data-lightbox-image]');
    const lightboxFigure = lightbox.querySelector('[data-lightbox-figure]');
    const lightboxContent = lightbox.querySelector('[data-lightbox-content]');
    const title = lightbox.querySelector('[data-lightbox-title]');
    if (image && lightboxImage && lightboxFigure && lightboxContent) {
      lightboxImage.setAttribute('src', image.currentSrc || image.src);
      lightboxImage.setAttribute('alt', image.alt || activeTitle());
      lightboxFigure.hidden = false;
      lightboxContent.hidden = true;
      lightboxContent.replaceChildren();
    } else if (lightboxFigure && lightboxContent) {
      const activePanel = panels[activeIndex]?.cloneNode(true);
      if (activePanel) {
        activePanel.hidden = false;
        activePanel.classList.add('active');
        activePanel.removeAttribute('id');
        activePanel.removeAttribute('aria-labelledby');
        lightboxContent.replaceChildren(activePanel);
      }
      lightboxFigure.hidden = true;
      lightboxContent.hidden = false;
    }
    if (title) title.textContent = activeTitle();
  };

  const closeLightbox = () => {
    if (!lightbox) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('methodology-dialog-open');
    document.removeEventListener('keydown', onLightboxKeydown);
    if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
  };

  const openLightbox = () => {
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'methodology-lightbox';
      lightbox.setAttribute('role', 'dialog');
      lightbox.setAttribute('aria-modal', 'true');
      lightbox.setAttribute('aria-hidden', 'true');
      lightbox.innerHTML = `
        <div class="methodology-lightbox-card" role="document">
          <header class="methodology-lightbox-header">
            <p class="methodology-lightbox-title" data-lightbox-title></p>
            <div class="methodology-lightbox-actions">
              <button type="button" data-lightbox-prev aria-label="Previous methodology diagram"><i class="fa-solid fa-arrow-left"></i></button>
              <button type="button" data-lightbox-next aria-label="Next methodology diagram"><i class="fa-solid fa-arrow-right"></i></button>
              <button type="button" data-lightbox-close aria-label="Close full screen diagram"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </header>
          <figure class="methodology-lightbox-figure" data-lightbox-figure>
            <img data-lightbox-image src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="" />
          </figure>
          <div class="methodology-lightbox-content" data-lightbox-content hidden></div>
        </div>
      `;
      document.body.appendChild(lightbox);
      lightbox.querySelector('[data-lightbox-close]')?.addEventListener('click', closeLightbox);
      lightbox.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => setActive(activeIndex - 1, false));
      lightbox.querySelector('[data-lightbox-next]')?.addEventListener('click', () => setActive(activeIndex + 1, false));
      lightbox.addEventListener('click', event => {
        if (event.target === lightbox) closeLightbox();
      });
    }
    lastFocus = document.activeElement;
    syncLightbox();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('methodology-dialog-open');
    document.addEventListener('keydown', onLightboxKeydown);
    lightbox.querySelector('[data-lightbox-close]')?.focus({ preventScroll: true });
  };

  function onLightboxKeydown(event) {
    if (!lightbox?.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive(activeIndex - 1, false);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive(activeIndex + 1, false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...lightbox.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setActive(index, false));
    tab.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActive(index - 1, true);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActive(index + 1, true);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActive(0, true);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActive(tabs.length - 1, true);
      }
    });
  });

  prev?.addEventListener('click', () => setActive(activeIndex - 1, true));
  next?.addEventListener('click', () => setActive(activeIndex + 1, true));
  fullscreen?.addEventListener('click', openLightbox);
  root.addEventListener('touchstart', event => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });
  root.addEventListener('touchend', event => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    setActive(activeIndex + (deltaX < 0 ? 1 : -1), true);
  }, { passive: true });

  document.querySelectorAll('[data-methodology-jump]').forEach(link => {
    link.addEventListener('click', event => {
      const index = Number(link.getAttribute('data-methodology-jump'));
      if (!Number.isFinite(index)) return;
      event.preventDefault();
      setActive(index, false);
      scrollToMethodology();
      window.setTimeout(() => setActive(index, true), reduceMotion.matches ? 0 : 420);
    });
  });

  setActive(activeIndex, false);
}

/* ── INIT ALL ── */
function initPurityLoopTheme() {
  runThemeInit('sidebar init', initSidebar);
  runThemeInit('live clock init', initLiveClock);
  runThemeInit('active nav init', initActiveNav);
  runThemeInit('landing nav init', initLandingNav);
  runThemeInit('AOS init', initAOS);
  runThemeInit('GSAP init', initGSAP, revealLandingFallback);
  runThemeInit('Typed init', initTyped);
  runThemeInit('hero bars init', initHeroBars);
  runThemeInit('landing charts init', initLandingCharts);
  runThemeInit('create account form init', initCreateAccountForm);
  runThemeInit('auth logout init', initAuthLogout);
  runThemeInit('motion init', initMotionEffects);
  runThemeInit('metric countup init', initMetricCountUp);
  runThemeInit('progress bar init', animateProgressBars);
  runThemeInit('landing presentation init', initLandingPresentation);
  runThemeInit('chart theme refresh', refreshChartTheme);
  revealLandingFallback();
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
