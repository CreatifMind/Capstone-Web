import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveDevelopment, roleHomePath } from "@/lib/admin";
import ModelReviewConsole from "@/components/model-review-console/ModelReviewConsole";

export const metadata: Metadata = { title: "PurityLoop AI | Development Workspace" };
export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  const context = await requireActiveDevelopment();
  if ("error" in context) {
    if (context.error === "unauthenticated") redirect("/login");
    redirect(context.profile ? roleHomePath(context.profile.role) : "/login");
  }
  return <ModelReviewConsole role={context.profile.role as "development_team" | "plant_manager"} />;
}
