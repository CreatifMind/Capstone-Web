import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PurityLoop AI | Intelligent Waste Sorting Platform",
  description:
    "PurityLoop AI uses YOLOv8 computer vision to automate waste sorting, detect contaminants, and power smarter recycling operations.",
  icons: {
    icon: "/assets/logo.png"
  }
};

const assetVersion = Date.now();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('pl_sidebar')==='collapsed'&&window.matchMedia('(min-width:1001px)').matches){document.documentElement.classList.add('sidebar-state-collapsed')}}catch(e){}" +
              "try{var k='purityloop-theme',p=localStorage.getItem(k),v=['light','dark','system'];if(v.indexOf(p)<0){var l=localStorage.getItem('pl_theme')||localStorage.getItem('purityloop_theme');p=v.indexOf(l)>=0?l:'system';localStorage.setItem(k,p)}var r=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p,d=document.documentElement;d.setAttribute('data-theme',r);d.setAttribute('data-theme-preference',p);d.style.colorScheme=r;}catch(e){}"
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/aos/2.3.4/aos.css" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"
        />
        <link rel="stylesheet" href="/css/style.css" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__PURITYLOOP_CONFIG__=${JSON.stringify({
              apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
              useSupabase: process.env.NEXT_PUBLIC_USE_SUPABASE === "true",
              supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
              supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
            })};`
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/aos/2.3.4/aos.js" strategy="afterInteractive" />
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" strategy="afterInteractive" />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"
          strategy="afterInteractive"
        />
        <Script src="https://cdn.jsdelivr.net/npm/chart.js" strategy="afterInteractive" />
        <Script
          src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"
          strategy="afterInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/typed.js/2.0.16/typed.umd.js"
          strategy="afterInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/countup.js/2.8.0/countUp.umd.js"
          strategy="afterInteractive"
        />
        <Script src={`/js/theme.js?v=${assetVersion}`} strategy="afterInteractive" />
        <Script src={`/js/script.js?v=${assetVersion}`} strategy="afterInteractive" />
      </body>
    </html>
  );
}
