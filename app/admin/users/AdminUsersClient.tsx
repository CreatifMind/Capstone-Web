"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ROLES, type Role } from "@/lib/roles";

type Status = "active" | "inactive";
type AdminUser = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: Role;
  status: Status;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_login: string | null;
};
type WorkspaceProfile = { role: Role };
type ApiBody<T> = { success: true; data: T } | { success: false; error: { message: string } };

const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))
  : "Never";
const apiError = (body: unknown, fallback: string) => {
  const error = body && typeof body === "object" && "error" in body ? (body as { error?: { message?: unknown } }).error : null;
  return typeof error?.message === "string" ? error.message : fallback;
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [viewTarget, setViewTarget] = useState<AdminUser | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const addDialog = useRef<HTMLDialogElement>(null);
  const viewDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const canManageUsers = profile?.role === "admin";

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as ApiBody<{ users: AdminUser[] }>;
    if (!response.ok || !body.success) setError(apiError(body, "Unable to load users."));
    else {
      setUsers(body.data.users);
      setError("");
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    fetch("/api/workspace/profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.profile) setProfile(body.profile); })
      .catch(() => setProfile(null));
  }, []);

  const openView = async (user: AdminUser) => {
    setViewTarget(user);
    viewDialog.current?.showModal();
    const response = await fetch(`/api/admin/users/${user.id}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as ApiBody<{ user: AdminUser }>;
    if (response.ok && body.success) {
      setViewTarget(body.data.user);
      setUsers((current) => current.map((item) => item.id === body.data.user.id ? body.data.user : item));
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setFormError("");
    const values = new FormData(form);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        role: String(values.get("role") || ""),
        status: String(values.get("status") || ""),
        password: String(values.get("password") || ""),
        confirmPassword: String(values.get("confirmPassword") || "")
      })
    });
    const body = await response.json().catch(() => ({})) as ApiBody<{ user: AdminUser }>;
    setSaving(false);
    if (!response.ok || !body.success) return setFormError(apiError(body, "Unable to create user."));
    setUsers((current) => [body.data.user, ...current]);
    addDialog.current?.close();
    form.reset();
    showToast("User created.");
  };

  const edit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;
    const form = event.currentTarget;
    setSaving(true);
    setFormError("");
    const values = new FormData(form);
    const response = await fetch(`/api/admin/users/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        role: String(values.get("role") || ""),
        status: String(values.get("status") || ""),
        password: String(values.get("password") || ""),
        confirmPassword: String(values.get("confirmPassword") || "")
      })
    });
    const body = await response.json().catch(() => ({})) as ApiBody<{ user: AdminUser }>;
    setSaving(false);
    if (!response.ok || !body.success) return setFormError(apiError(body, "Unable to update user."));
    setUsers((current) => current.map((user) => user.id === body.data.user.id ? body.data.user : user));
    editDialog.current?.close();
    form.reset();
    setEditTarget(null);
    showToast("User updated.");
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setFormError("");
    const response = await fetch(`/api/admin/users/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationEmail: deleteConfirm })
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setFormError(apiError(body, "Unable to delete user."));
    setUsers((current) => current.filter((user) => user.id !== deleteTarget.id));
    deleteDialog.current?.close();
    setDeleteTarget(null);
    setDeleteConfirm("");
    showToast("User deleted.");
  };

  return <>
    <header className="admin-content-toolbar"><p>Workspace users</p>{canManageUsers && <button className="admin-add primary-btn" type="button" onClick={() => { setFormError(""); addDialog.current?.showModal(); }}><i className="fa-solid fa-user-plus" aria-hidden="true" /> + Create User</button>}</header>
    {toast && <p className="admin-toast" role="status">{toast}</p>}
    {error && <div className="admin-error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Retry</button></div>}
    <section className="admin-card" aria-label="Users"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th>{canManageUsers && <th>Actions</th>}</tr></thead><tbody>{loading ? <tr><td colSpan={canManageUsers ? 6 : 5} className="admin-empty">Loading users...</td></tr> : users.length ? users.map((user) => <tr key={user.id}><td><div className="admin-person">{user.name}<small>Workspace user</small></div></td><td>{user.email}</td><td className="admin-role">{title(user.role)}</td><td><span className={`admin-status ${user.status}`}>{title(user.status)}</span></td><td>{date(user.last_login)}</td>{canManageUsers && <td><div className="admin-row-actions"><button type="button" className="admin-icon-btn" title="View" aria-label={`View ${user.email}`} disabled={saving} onClick={() => void openView(user)}><i className="fa-solid fa-eye" aria-hidden="true" /></button><button type="button" className="admin-icon-btn" title="Edit" aria-label={`Edit ${user.email}`} disabled={saving} onClick={() => { setFormError(""); setEditTarget(user); editDialog.current?.showModal(); }}><i className="fa-solid fa-pencil" aria-hidden="true" /></button><button type="button" className="admin-icon-btn danger" title="Delete" aria-label={`Delete ${user.email}`} disabled={saving} onClick={() => { setFormError(""); setDeleteConfirm(""); setDeleteTarget(user); deleteDialog.current?.showModal(); }}><i className="fa-solid fa-trash" aria-hidden="true" /></button></div></td>}</tr>) : <tr><td colSpan={canManageUsers ? 6 : 5} className="admin-empty">No users found.</td></tr>}</tbody></table></div></section>

    <dialog className="admin-dialog" ref={addDialog} aria-labelledby="createUserTitle"><form onSubmit={create}><h2 id="createUserTitle">Create User</h2><p>Create a PurityLoop AI account with a permanent password.</p><div className="admin-form-grid"><div className="admin-field wide"><label htmlFor="adminName">Full Name</label><input id="adminName" name="name" autoComplete="name" required autoFocus /></div><div className="admin-field wide"><label htmlFor="adminEmail">Email</label><input id="adminEmail" name="email" type="email" autoComplete="email" required /></div><div className="admin-field"><label htmlFor="adminRole">Role</label><select id="adminRole" name="role" defaultValue="operator">{ROLES.map((role) => <option key={role} value={role}>{title(role)}</option>)}</select></div><div className="admin-field"><label htmlFor="adminStatus">Status</label><select id="adminStatus" name="status" defaultValue="active"><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div className="admin-field"><label htmlFor="adminPassword">Password</label><input id="adminPassword" name="password" type="password" minLength={8} autoComplete="new-password" required /></div><div className="admin-field"><label htmlFor="adminConfirmPassword">Confirm Password</label><input id="adminConfirmPassword" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></div></div>{formError && <p className="admin-form-error" role="alert">{formError}</p>}<div className="admin-dialog-actions"><button type="button" className="admin-cancel" onClick={() => addDialog.current?.close()}>Cancel</button><button className="admin-confirm" disabled={saving}>{saving ? "Creating..." : "Create User"}</button></div></form></dialog>

    <dialog className="admin-dialog" ref={viewDialog} aria-labelledby="viewUserTitle"><div className="admin-dialog-content"><h2 id="viewUserTitle">User Details</h2>{viewTarget && <dl className="admin-details"><div><dt>Full Name</dt><dd>{viewTarget.name}</dd></div><div><dt>Email</dt><dd>{viewTarget.email}</dd></div><div><dt>Role</dt><dd>{title(viewTarget.role)}</dd></div><div><dt>Status</dt><dd>{title(viewTarget.status)}</dd></div><div><dt>User ID</dt><dd>{viewTarget.auth_user_id || viewTarget.id}</dd></div><div><dt>Account Created</dt><dd>{date(viewTarget.created_at)}</dd></div><div><dt>Last Login</dt><dd>{date(viewTarget.last_login)}</dd></div><div><dt>Last Updated</dt><dd>{date(viewTarget.updated_at)}</dd></div></dl>}<div className="admin-dialog-actions"><button type="button" className="admin-confirm" onClick={() => viewDialog.current?.close()}>Close</button></div></div></dialog>

    <dialog className="admin-dialog" ref={editDialog} aria-labelledby="editAccountTitle"><form key={editTarget?.id} onSubmit={edit}><h2 id="editAccountTitle">Edit User</h2><p>Update account details. Password changes only when both password fields are filled.</p><div className="admin-form-grid"><div className="admin-field wide"><label htmlFor="editName">Full Name</label><input id="editName" name="name" defaultValue={editTarget?.name} required autoFocus /></div><div className="admin-field wide"><label htmlFor="editEmail">Email</label><input id="editEmail" name="email" type="email" defaultValue={editTarget?.email} required /></div><div className="admin-field"><label htmlFor="editRole">Role</label><select id="editRole" name="role" defaultValue={editTarget?.role || "operator"}>{ROLES.map((role) => <option key={role} value={role}>{title(role)}</option>)}</select></div><div className="admin-field"><label htmlFor="editStatus">Status</label><select id="editStatus" name="status" defaultValue={editTarget?.status || "active"}><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div className="admin-field"><label htmlFor="editPassword">Reset Password</label><input id="editPassword" name="password" type="password" minLength={8} autoComplete="new-password" /></div><div className="admin-field"><label htmlFor="editConfirmPassword">Confirm Password</label><input id="editConfirmPassword" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" /></div></div>{formError && <p className="admin-form-error" role="alert">{formError}</p>}<div className="admin-dialog-actions"><button type="button" className="admin-cancel" onClick={() => editDialog.current?.close()}>Cancel</button><button className="admin-confirm" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button></div></form></dialog>

    <dialog className="admin-dialog" ref={deleteDialog} aria-labelledby="deleteUserTitle"><div className="admin-dialog-content"><h2 id="deleteUserTitle">Delete User</h2><p>This permanently removes the account and the user will lose access.</p>{deleteTarget && <div className="admin-delete-summary"><strong>{deleteTarget.name}</strong><span>{deleteTarget.email}</span></div>}<div className="admin-field wide"><label htmlFor="deleteConfirmEmail">Type the user's email to confirm</label><input id="deleteConfirmEmail" value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} /></div>{formError && <p className="admin-form-error" role="alert">{formError}</p>}<div className="admin-dialog-actions"><button type="button" className="admin-cancel" onClick={() => deleteDialog.current?.close()}>Cancel</button><button type="button" className="admin-confirm danger" disabled={saving || deleteConfirm.trim().toLowerCase() !== deleteTarget?.email} onClick={() => void remove()}>{saving ? "Deleting..." : "Delete User"}</button></div></div></dialog>
  </>;
}
