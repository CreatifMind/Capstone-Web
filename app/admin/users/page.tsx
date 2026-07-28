import type { Metadata } from "next";
import AdminUsersClient from "./AdminUsersClient";

export const metadata: Metadata = { title: "PurityLoop AI | User Management" };
export const dynamic = "force-dynamic";
export default function AdminUsersPage() { return <AdminUsersClient />; }
