import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveModelReview } from "@/lib/admin";
import ModelReviewConsole from "@/components/model-review-console/ModelReviewConsole";

export const metadata: Metadata = { title: "PurityLoop AI | Model Review Console" };
export const dynamic = "force-dynamic";

export default async function ModelReviewConsolePage() {
  const context = await requireActiveModelReview();
  if ("error" in context) redirect("/login");
  return <ModelReviewConsole role={context.profile.role as "model_team" | "web_team" | "project_manager"} />;
}
