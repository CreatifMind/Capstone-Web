# Frontend Packages CDN Reference

This file serves as a reference for pre-approved frontend library CDNs. **Do not include all of them in every page**—selectively include them based on the page's specific functionality.

---

## 📋 Table of Contents
1. [Always Include](#always-include)
2. [3D and Visual](#3d-and-visual)
3. [Animation](#animation)
4. [Charts](#charts)
5. [UI Components](#ui-components)

---

## 1. Always Include <a name="always-include"></a>
These core styling, icon, and basic scroll animation packages can be included across pages.

### Tailwind CSS
*Utility-first CSS framework for rapid UI development.*
```html
<script src="https://cdn.tailwindcss.com"></script>
```

### Google Fonts (Inter)
*A clean, modern sans-serif font family optimized for user interfaces.*
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### Font Awesome Icons (v6.5.1)
*Comprehensive vector icon library.*
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
```

### AOS (Animate On Scroll)
*Simple scroll-triggered animations.*
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/aos/2.3.4/aos.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/aos/2.3.4/aos.js"></script>
```
*Initialization:*
```javascript
// Initialize AOS in your script.js
AOS.init({
  duration: 800,
  once: true
});
```

---

## 2. 3D and Visual (Pick ONE if needed) <a name="3d-and-visual"></a>
Use these for rich graphical effects or canvas animations.

### Three.js (r128)
*Lightweight and user-friendly 3D library.*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

### p5.js (v1.9.0)
*Creative coding platform for drawing and visual art.*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>
```

### Particles.js (v2.0.0)
*Lightweight library for creating interactive particle backgrounds.*
```html
<script src="https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js"></script>
```

---

## 3. Animation (Pick GSAP or anime.js if needed) <a name="animation"></a>
Use these for complex micro-interactions, timelines, and UI animations.

### GSAP (GreenSock Animation Platform)
*High-performance HTML5 animations and scroll effects.*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
```

### Anime.js (v3.2.2)
*Lightweight JavaScript animation library with a simple API.*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>
```

### Animate.css (v4.1.1)
*A library of ready-to-use cross-browser CSS animations.*
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
```

### Lottie Player
*Enables rendering of rich After Effects animations locally using JSON files.*
```html
<script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
```

---

## 4. Charts (Pick ONE if needed) <a name="charts"></a>
Use these to build analytical interfaces, diagrams, and dashboards.

### Chart.js
*Simple, clean, HTML5-based charting library.*
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

### ApexCharts
*Modern and interactive SVG charts.*
```html
<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
```

### Apache ECharts (v5)
*Powerful, enterprise-grade charting and visualization library.*
```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
```

### D3.js (v7.8.5)
*Low-level library for manipulating documents based on data (highly customizable).*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
```

---

## 5. UI Components <a name="ui-components"></a>
Add interactive capabilities and sleek widgets to your application.

### Alpine.js (v3)
*Minimal framework for composing behavior directly in your HTML markup.*
```html
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
```

### Typed.js (v2.0.16)
*A library that types out strings at a specified speed.*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/typed.js/2.0.16/typed.umd.js"></script>
```

### CountUp.js (v2.8.0)
*Animates numerical values to count up or down.*
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/countup.js/2.8.0/countUp.umd.js"></script>
```

### Swiper (v11)
*Modern mobile touch slider.*
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">
<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
```

### SweetAlert2 (v11)
*A beautiful, responsive, customizable replacement for JavaScript's popup boxes.*
```html
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
```

### Tippy.js (v6)
*The complete tooltip, popover, dropdown, and menu solution.*
```html
<script src="https://unpkg.com/tippy.js@6"></script>
```
