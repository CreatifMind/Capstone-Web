import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { requireActiveDevelopmentWorkspace, roleHomePath } from "@/lib/admin";
import ModelReviewConsole from "@/components/model-review-console/ModelReviewConsole";

export const metadata: Metadata = { title: "PurityLoop AI | Development Workspace" };
export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  const context = await requireActiveDevelopmentWorkspace();
  if ("error" in context) {
    if (context.error === "unauthenticated") redirect("/login");
    redirect(context.profile ? roleHomePath(context.profile.role) : "/login");
  }
  const role = context.profile.role as "development_team" | "plant_manager";

  return (
    <AppShell role={role} title="Development Workspace" subtitle="Validate browser inference, track model readiness, and coordinate deployment work.">
      <div className="page-body mrc-body">
        <ModelReviewConsole role={role} />
      </div>
    </AppShell>
  );
}
