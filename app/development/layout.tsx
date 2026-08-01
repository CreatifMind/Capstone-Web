"use client";

import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "../model-review-console/model-review-console.css";

export default function DevelopmentLayout({ children }: { children: ReactNode }) {
  return <PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app" dataPage="development">
    <div className="mrc-shell">
      <header className="mrc-topbar">
        <div>
          <h1>Development Workspace</h1>
          <p>Validate browser inference, track model readiness, and coordinate deployment work.</p>
        </div>
        <nav className="mrc-topbar-actions" aria-label="Development navigation">
          <a href="/development" className="mrc-logout">Development</a>
          <a href="/auth/signout" className="mrc-logout">Log out</a>
        </nav>
      </header>
      <main className="mrc-body" id="main-content">{children}</main>
    </div>
  </PageHtml>;
}
