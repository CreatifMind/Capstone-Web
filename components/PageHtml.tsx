"use client";

import { useEffect } from "react";

type PageHtmlProps = {
  bodyClass: string;
  dataPage?: string;
  html: string;
};

export default function PageHtml({ bodyClass, dataPage, html }: PageHtmlProps) {
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    try {
      document.body.className = bodyClass;
      if (dataPage) {
        document.body.setAttribute("data-page", dataPage);
      } else {
        document.body.removeAttribute("data-page");
      }
      window.dispatchEvent(new CustomEvent("purityloop:page-ready"));
    } catch {
      // Keep rendering even if a browser extension or restricted context blocks DOM updates.
    }
  }, [bodyClass, dataPage, html]);

  return <div className={bodyClass} data-page={dataPage} dangerouslySetInnerHTML={{ __html: html }} />;
}
