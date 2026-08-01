export const ROLES = [
  "operator",
  "development_team",
  "admin",
  "plant_manager",
] as const;
export type Role = (typeof ROLES)[number];

export function roleHomePath(role: string) {
  if (role === "admin") return "/admin/users";
  if (role === "development_team") return "/development";
  if (role === "plant_manager") return "/overview";
  return "/upload";
}
