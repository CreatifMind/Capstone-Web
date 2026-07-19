"use client";

import { useLayoutEffect } from "react";
import { unzip } from "fflate";

type PageHtmlProps = {
  bodyClass: string;
  dataPage?: string;
  html: string;
};

type PageLifecycleState = {
  activeKey?: string;
  cleanupFrame?: number;
};

type PageWindow = Window & {
  __PURITYLOOP_PAGE_LIFECYCLE__?: PageLifecycleState;
};

export default function PageHtml({ bodyClass, dataPage, html }: PageHtmlProps) {
  const pageKey = `${dataPage || "root"}:${bodyClass}`;
  const pageStateScript = `document.body.className=${JSON.stringify(bodyClass)};${dataPage ? `document.body.setAttribute("data-page",${JSON.stringify(dataPage)});` : 'document.body.removeAttribute("data-page");'}`;

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    let firstFrame = 0;
    let secondFrame = 0;

    try {
      const pageWindow = window as PageWindow;
      const lifecycle = pageWindow.__PURITYLOOP_PAGE_LIFECYCLE__ ||= {};
      if (lifecycle.cleanupFrame) window.cancelAnimationFrame(lifecycle.cleanupFrame);
      lifecycle.cleanupFrame = undefined;
      const isNewPage = lifecycle.activeKey !== pageKey;
      lifecycle.activeKey = pageKey;

      Object.assign(window, { __PURITYLOOP_ZIP__: { unzip } });
      document.body.className = bodyClass;
      if (dataPage) {
        document.body.setAttribute("data-page", dataPage);
      } else {
        document.body.removeAttribute("data-page");
      }
      const main = document.querySelector("main");
      if (main && !main.id) main.id = "main-content";

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

      if (isNewPage) window.dispatchEvent(new CustomEvent("purityloop:page-ready"));
    } catch {
      // Keep rendering even if a browser extension or restricted context blocks DOM updates.
    }

    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      const pageWindow = window as PageWindow;
      const lifecycle = pageWindow.__PURITYLOOP_PAGE_LIFECYCLE__;
      if (!lifecycle) return;
      lifecycle.cleanupFrame = window.requestAnimationFrame(() => {
        if (lifecycle.activeKey !== pageKey) return;
        lifecycle.activeKey = undefined;
        lifecycle.cleanupFrame = undefined;
        window.dispatchEvent(new CustomEvent("purityloop:page-cleanup"));
      });
    };
  }, [bodyClass, dataPage, pageKey]);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: pageStateScript }} />
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div
        className={bodyClass}
        data-page={dataPage}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
