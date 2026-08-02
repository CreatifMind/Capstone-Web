import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "../model-review-console/model-review-console.css";

export default function DevelopmentLayout({ children }: { children: ReactNode }) {
  return <PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app" dataPage="development">
    {children}
  </PageHtml>;
}
