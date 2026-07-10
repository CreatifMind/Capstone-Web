"use client";

import { useLayoutEffect } from "react";

type PageHtmlProps = {
  bodyClass: string;
  dataPage?: string;
  html: string;
};

export default function PageHtml({ bodyClass, dataPage, html }: PageHtmlProps) {
  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    let firstFrame = 0;
    let secondFrame = 0;

    try {
      let pref = "system";
      try { pref = window.localStorage.getItem("pl_theme") || "system"; } catch {}
      const resolved = pref === "system"
        ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : pref;
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.setAttribute("data-theme-pref", pref);
      document.body.className = bodyClass;
      if (dataPage) {
        document.body.setAttribute("data-page", dataPage);
      } else {
        document.body.removeAttribute("data-page");
      }

      const isDesktop = window.matchMedia("(min-width: 1001px)").matches;
      const sidebar = document.getElementById("appSidebar");
      const savedSidebar = window.localStorage.getItem("pl_sidebar");

      if (isDesktop && savedSidebar === "collapsed") {
        document.documentElement.classList.add("sidebar-state-collapsed", "no-transition");
        sidebar?.classList.add("collapsed");
        sidebar?.classList.remove("mobile-open");
        document.body.classList.remove("app-sidebar-open");

        firstFrame = window.requestAnimationFrame(() => {
          secondFrame = window.requestAnimationFrame(() => {
            document.documentElement.classList.remove("no-transition");
          });
        });
      }

      window.dispatchEvent(new CustomEvent("purityloop:page-ready"));
    } catch {
      // Keep rendering even if a browser extension or restricted context blocks DOM updates.
    }

    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [bodyClass, dataPage, html]);

  return (
    <div
      className={bodyClass}
      data-page={dataPage}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
