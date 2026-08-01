import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "../admin/admin.css";

export default function OverviewLayout({ children }: { children: ReactNode }) {
  return <PageHtml bodyClass="ops-pro-page admin-pro-page lab-ui dark-ai dark-app" dataPage="overview">
    <div className="app-layout">
      <aside id="appSidebar" className="sidebar" aria-label="Plant manager navigation">
        <div className="sidebar-header">
          <a href="/overview" className="sidebar-logo"><img src="/assets/logo.png" alt="PurityLoop AI Logo" /></a>
        </div>
        <nav className="sidebar-nav" aria-label="Plant manager navigation">
          <div className="sidebar-section-label">Plant Manager</div>
          <a href="/overview" className="nav-item active" data-tooltip="Overview"><i className="nav-item-icon fa-solid fa-chart-line" aria-hidden="true" /><span className="nav-item-label">Overview</span></a>
          <a href="/upload" className="nav-item" data-tooltip="Upload"><i className="nav-item-icon fa-solid fa-cloud-arrow-up" aria-hidden="true" /><span className="nav-item-label">Upload</span></a>
          <a href="/review" className="nav-item" data-tooltip="Review"><i className="nav-item-icon fa-solid fa-clipboard-check" aria-hidden="true" /><span className="nav-item-label">Review</span></a>
          <a href="/analytics" className="nav-item" data-tooltip="Analytics"><i className="nav-item-icon fa-solid fa-chart-simple" aria-hidden="true" /><span className="nav-item-label">Analytics</span></a>
          <a href="/development" className="nav-item" data-tooltip="Development"><i className="nav-item-icon fa-solid fa-code-branch" aria-hidden="true" /><span className="nav-item-label">Development</span></a>
          <a href="/admin/users" className="nav-item" data-tooltip="Users"><i className="nav-item-icon fa-solid fa-users-gear" aria-hidden="true" /><span className="nav-item-label">Users</span></a>
        </nav>
        <div className="sidebar-footer">
          <div className="user-row"><div className="user-avatar">PM</div><div className="user-info"><div className="user-name">Plant Manager</div><div className="user-role">Full workspace access</div></div></div>
          <a href="/auth/signout" className="logout-btn"><i className="fa-solid fa-right-from-bracket" aria-hidden="true" /><span className="logout-text">Logout</span></a>
        </div>
      </aside>
      <main className="main-content" id="main-content">{children}</main>
    </div>
  </PageHtml>;
}
