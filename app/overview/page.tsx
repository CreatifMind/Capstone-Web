import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveRole, roleHomePath } from "@/lib/admin";

export const metadata: Metadata = { title: "PurityLoop AI | Plant Overview" };
export const dynamic = "force-dynamic";

const modules = [
  { href: "/upload", icon: "fa-cloud-arrow-up", title: "Upload", text: "Run image and video scans." },
  { href: "/review", icon: "fa-clipboard-check", title: "Review", text: "Verify scan results and routing decisions." },
  { href: "/analytics", icon: "fa-chart-simple", title: "Analytics", text: "Monitor recycling performance." },
  { href: "/development", icon: "fa-code-branch", title: "Development", text: "Validate model and deployment readiness." },
  { href: "/admin/users", icon: "fa-users-gear", title: "User Management", text: "Create and manage workspace accounts." },
];

export default async function OverviewPage() {
  const context = await requireActiveRole(["plant_manager"]);
  if ("error" in context) {
    if (context.error === "unauthenticated") redirect("/login");
    redirect(context.profile ? roleHomePath(context.profile.role) : "/login");
  }

  return <>
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-title">
          <h1>Plant Overview</h1>
          <p>Full PurityLoop workspace access for plant-level supervision.</p>
        </div>
      </div>
    </header>
    <div className="page-body admin-page-body">
      <section className="admin-card">
        <h2>Workspace Modules</h2>
        <p className="admin-dialog-helper">Use this overview as the plant manager entry point into operations, development, and administration.</p>
        <div className="admin-form-grid">
          {modules.map((module) => (
            <a key={module.href} href={module.href} className="admin-card" style={{ textDecoration: "none", color: "inherit" }}>
              <i className={`fa-solid ${module.icon}`} aria-hidden="true" />
              <h3>{module.title}</h3>
              <p>{module.text}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  </>;
}
