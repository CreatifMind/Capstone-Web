export const ROLES = ["operator", "team_lead", "operations_manager", "model_team", "project_manager", "web_team", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function roleHomePath(role: string) {
  if (role === "admin") return "/admin/users";
  if (role === "model_team") return "/model-improvement";
  return "/upload";
}
