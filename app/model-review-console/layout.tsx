"use client";

import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "./model-review-console.css";

export default function ModelReviewConsoleLayout({ children }: { children: ReactNode }) {
  return <PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app" dataPage="model-review-console">
    <div className="mrc-shell">
      <header className="mrc-topbar">
        <div>
          <h1>Model Review Console</h1>
          <p>Test the detector, track retrain readiness, and hand off between teams.</p>
        </div>
        <a href="/auth/signout" className="mrc-logout">Log out</a>
      </header>
      <main className="mrc-body" id="main-content">{children}</main>
    </div>
  </PageHtml>;
}
