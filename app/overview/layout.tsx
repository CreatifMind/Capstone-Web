import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "../admin/admin.css";

export default function OverviewLayout({ children }: { children: ReactNode }) {
  return <PageHtml bodyClass="ops-pro-page admin-pro-page lab-ui dark-ai dark-app" dataPage="overview">
    {children}
  </PageHtml>;
}
