import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
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

  return <AppShell role="plant_manager" title="Plant Overview" subtitle="Full PurityLoop workspace access for plant-level supervision.">
    <div className="page-body admin-page-body">
      <section className="admin-card plant-overview-card">
        <div className="plant-overview-heading">
          <span className="panel-kicker">Plant Manager</span>
          <h2>Workspace Modules</h2>
        </div>
        <p className="admin-dialog-helper">Use this overview as the plant manager entry point into operations, development, and administration.</p>
        <div className="plant-module-grid">
          {modules.map((module) => (
            <a key={module.href} href={module.href} className="plant-module-card">
              <span className="plant-module-icon"><i className={`fa-solid ${module.icon}`} aria-hidden="true" /></span>
              <span>
                <strong>{module.title}</strong>
                <small>{module.text}</small>
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  </AppShell>;
}
