import { redirect } from "next/navigation";
import { requireActiveAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage() {
  const result = await requireActiveAdmin();
  if ("error" in result) redirect("/login");
  const { profile } = result;
  return <><div className="admin-content-toolbar"><p>Administrator profile</p></div><section className="admin-card"><div style={{ padding: 24 }} className="settings-grid"><article className="settings-card panel bbox-card"><p className="eyebrow">Profile</p><h2>{profile.name}</h2><div className="settings-row"><span>Email</span><strong>{profile.email}</strong></div><div className="settings-row"><span>Role</span><strong>Administrator</strong></div><div className="settings-row"><span>Status</span><strong>Active</strong></div></article></div></section></>;
}
