"use client";

import { useEffect } from "react";

type PageHtmlProps = {
  bodyClass: string;
  dataPage?: string;
  html: string;
};

export default function PageHtml({ bodyClass, dataPage, html }: PageHtmlProps) {
  useEffect(() => {
    document.body.className = bodyClass;
    if (dataPage) {
      document.body.setAttribute("data-page", dataPage);
    } else {
      document.body.removeAttribute("data-page");
    }
    window.dispatchEvent(new CustomEvent("purityloop:page-ready"));
  }, [bodyClass, dataPage, html]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
