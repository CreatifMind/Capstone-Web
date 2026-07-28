"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "./admin.css";

const navItems = [
  { href: "/admin/users", icon: "fa-users-gear", label: "User Management" },
  { href: "/admin/account", icon: "fa-user", label: "Account" }
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return <PageHtml bodyClass="ops-pro-page admin-pro-page lab-ui dark-ai dark-app" dataPage="admin">
    <div className="app-layout">
      <div id="sidebarOverlay" className="sidebar-overlay" />
      <aside id="appSidebar" className="sidebar" aria-label="Admin navigation">
        <div className="sidebar-header">
          <a href="/admin/users" className="sidebar-logo"><img src="/assets/logo.png" alt="PurityLoop AI Logo" /></a>
          <button id="sidebarToggle" className="sidebar-toggle" aria-label="Collapse Sidebar"><i className="fa-solid fa-angles-left" aria-hidden="true" /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          <div className="sidebar-section-label">Administration</div>
          {navItems.map(item => <a key={item.href} href={item.href} className={`nav-item${pathname === item.href ? " active" : ""}`} data-tooltip={item.label}>
            <i className={`nav-item-icon fa-solid ${item.icon}`} aria-hidden="true" /><span className="nav-item-label">{item.label}</span>
          </a>)}
        </nav>
        <div className="sidebar-footer">
          <div className="user-row"><div className="user-avatar">AD</div><div className="user-info"><div className="user-name">Admin Mode</div><div className="user-role">Workspace administration</div></div></div>
          <a href="/auth/signout" className="logout-btn"><i className="fa-solid fa-right-from-bracket" aria-hidden="true" /><span className="logout-text">Logout</span></a>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="topbar">
          <div className="topbar-left"><button id="mobileToggle" className="mobile-toggle" aria-label="Open navigation"><i className="fa-solid fa-bars" aria-hidden="true" /></button><div className="topbar-title"><h1>{pathname === "/admin/account" ? "Account" : "User Management"}</h1><p>{pathname === "/admin/account" ? "Your administrator account details" : "Create, review, and remove workspace access"}</p></div></div>
          <div className="topbar-right" data-topbar-actions data-topbar-variant="standard" />
        </header>
        <div className="page-body admin-page-body">{children}</div>
      </main>
    </div>
  </PageHtml>;
}
