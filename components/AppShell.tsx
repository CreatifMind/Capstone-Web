"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Role } from "@/lib/roles";

type NavItem = {
  href: string;
  icon: string;
  label: string;
};

type AppShellProps = {
  role: Role;
  title: string;
  subtitle: string;
  children: ReactNode;
};

const OPERATOR_NAV: NavItem[] = [
  { href: "/upload", icon: "fa-cloud-arrow-up", label: "Upload" },
  { href: "/review", icon: "fa-magnifying-glass", label: "Review" },
  { href: "/analytics", icon: "fa-chart-line", label: "Analytics" },
  { href: "/settings", icon: "fa-gear", label: "Settings" }
];

const PLANT_MANAGER_NAV: NavItem[] = [
  { href: "/overview", icon: "fa-chart-line", label: "Overview" },
  { href: "/upload", icon: "fa-cloud-arrow-up", label: "Upload" },
  { href: "/review", icon: "fa-magnifying-glass", label: "Review" },
  { href: "/analytics", icon: "fa-chart-line", label: "Analytics" },
  { href: "/development", icon: "fa-code-branch", label: "Development" },
  { href: "/admin/users", icon: "fa-users-gear", label: "Users" }
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", icon: "fa-users-gear", label: "User Management" },
  { href: "/admin/account", icon: "fa-user", label: "Account" }
];

const DEVELOPMENT_NAV: NavItem[] = [
  { href: "/development", icon: "fa-code-branch", label: "Development" }
];

const ROLE_CHROME: Record<Role, { section: string; name: string; detail: string; initials: string; nav: NavItem[] }> = {
  operator: { section: "Platform", name: "Operator", detail: "MRF review mode", initials: "OP", nav: OPERATOR_NAV },
  development_team: { section: "Development", name: "Development Team", detail: "Model and web workspace", initials: "DT", nav: DEVELOPMENT_NAV },
  admin: { section: "Administration", name: "Admin Mode", detail: "Workspace administration", initials: "AD", nav: ADMIN_NAV },
  plant_manager: { section: "Plant Manager", name: "Plant Manager", detail: "Full workspace access", initials: "PM", nav: PLANT_MANAGER_NAV }
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ role, title, subtitle, children }: AppShellProps) {
  const pathname = usePathname();
  const chrome = ROLE_CHROME[role] || ROLE_CHROME.operator;

  return (
    <div className="app-layout">
      <div id="sidebarOverlay" className="sidebar-overlay" />
      <aside id="appSidebar" className="sidebar" aria-label={`${chrome.section} navigation`}>
        <div className="sidebar-header">
          <a href={role === "plant_manager" ? "/overview" : chrome.nav[0]?.href || "/upload"} className="sidebar-logo">
            <img src="/assets/logo.png" alt="PurityLoop AI Logo" />
          </a>
          <button id="sidebarToggle" className="sidebar-toggle" aria-label="Collapse Sidebar">
            <i className="fa-solid fa-angles-left" aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label={`${chrome.section} navigation`}>
          <div className="sidebar-section-label">{chrome.section}</div>
          {chrome.nav.map((item) => (
            <a key={item.href} href={item.href} className={`nav-item${isActive(pathname, item.href) ? " active" : ""}`} data-tooltip={item.label}>
              <i className={`nav-item-icon fa-solid ${item.icon}`} aria-hidden="true" />
              <span className="nav-item-label">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-row">
            <div className="user-avatar">{chrome.initials}</div>
            <div className="user-info">
              <div className="user-name">{chrome.name}</div>
              <div className="user-role">{chrome.detail}</div>
            </div>
          </div>
          <a href="/auth/signout" className="logout-btn">
            <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            <span className="logout-text">Logout</span>
          </a>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button id="mobileToggle" className="mobile-toggle" aria-label="Open navigation">
              <i className="fa-solid fa-bars" aria-hidden="true" />
            </button>
            <div className="topbar-title">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="topbar-right" data-topbar-actions data-topbar-variant="standard" />
        </header>
        {children}
      </main>
    </div>
  );
}
