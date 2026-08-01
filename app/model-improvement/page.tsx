import { redirect } from "next/navigation";
import PageHtml from "@/components/PageHtml";
import { requireActiveRole, roleHomePath } from "@/lib/admin";

export const metadata = { title: "PurityLoop AI | Model Review" };
export const dynamic = "force-dynamic";

export default async function ModelImprovementPage() {
  const result = await requireActiveRole(["model_team"]);

  if ("error" in result) {
    if (result.error === "unauthenticated") redirect("/login");
    if (result.error === "inactive") redirect("/login?reason=inactive");
    redirect(result.profile ? roleHomePath(result.profile.role) : "/login");
  }

  return (
    <PageHtml bodyClass="ops-pro-page model-review-pro-page lab-ui dark-ai dark-app" dataPage="model-improvement">
      <div className="app-layout">
        <div id="sidebarOverlay" className="sidebar-overlay" />
        <aside id="appSidebar" className="sidebar" aria-label="Model Review navigation">
          <div className="sidebar-header">
            <a href="/model-improvement" className="sidebar-logo"><img src="/assets/logo.png" alt="PurityLoop AI Logo" /></a>
            <button id="sidebarToggle" className="sidebar-toggle" aria-label="Collapse Sidebar"><i className="fa-solid fa-angles-left" aria-hidden="true" /></button>
          </div>
          <nav className="sidebar-nav" aria-label="Model Review navigation">
            <div className="sidebar-section-label">Model Review</div>
            <a href="/model-improvement" className="nav-item active" data-tooltip="Model Review">
              <i className="nav-item-icon fa-solid fa-magnifying-glass-chart" aria-hidden="true" />
              <span className="nav-item-label">Model Review</span>
            </a>
          </nav>
          <div className="sidebar-footer">
            <div className="user-row">
              <div className="user-avatar">MR</div>
              <div className="user-info">
                <div className="user-name">{result.profile.name}</div>
                <div className="user-role">Model Review</div>
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
              <button id="mobileToggle" className="mobile-toggle" aria-label="Open navigation"><i className="fa-solid fa-bars" aria-hidden="true" /></button>
              <div className="topbar-title">
                <h1>Model Review</h1>
                <p>Review model quality signals and prepare improvements without operational tools.</p>
              </div>
            </div>
            <div className="topbar-right" data-topbar-actions data-topbar-variant="standard" />
          </header>

          <div className="page-body model-review-page-body">
            <section className="model-review-hero panel bbox-card" aria-labelledby="modelReviewTitle">
              <div>
                <p className="eyebrow">PurityLoop AI</p>
                <h2 id="modelReviewTitle">Model Review Workspace</h2>
                <p>
                  A protected workspace for the model team to inspect validation status, document review priorities,
                  and prepare future model-improvement workflows.
                </p>
              </div>
              <span className="status-pill">Role: Model Team</span>
            </section>

            <section className="model-review-grid" aria-label="Model review foundations">
              <article className="panel bbox-card model-review-card">
                <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                <div>
                  <h3>Protected Access</h3>
                  <p>Only active `model_team` profiles can reach this workspace. Operators and administrators are redirected to their own areas.</p>
                </div>
              </article>
              <article className="panel bbox-card model-review-card">
                <i className="fa-solid fa-chart-simple" aria-hidden="true" />
                <div>
                  <h3>Review Readiness</h3>
                  <p>Use this area as the foundation for future model validation notes, QA queues, and improvement planning.</p>
                </div>
              </article>
              <article className="panel bbox-card model-review-card">
                <i className="fa-solid fa-lock" aria-hidden="true" />
                <div>
                  <h3>Operational Separation</h3>
                  <p>Upload, Review, Analytics, Settings, and Admin User Management remain outside this role-specific workspace.</p>
                </div>
              </article>
            </section>

            <section className="panel bbox-card model-review-panel" aria-labelledby="modelReviewNextTitle">
              <div>
                <p className="panel-kicker">Next capability layer</p>
                <h2 id="modelReviewNextTitle">Model review tools can be added here safely</h2>
                <p>
                  This page establishes server-side access control and a dedicated navigation shell before adding
                  model-specific workflows such as validation batches, error triage, and retraining notes.
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>
    </PageHtml>
  );
}
