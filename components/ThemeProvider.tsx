"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/roles";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = Exclude<ThemePreference, "system">;

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

type WorkspaceProfile = {
  name: string;
  email: string;
  role: Role;
};

const STORAGE_KEY = "purityloop-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const ROLE_LABEL: Record<Role, string> = {
  operator: "Operator",
  development_team: "Development Team",
  admin: "Admin Mode",
  plant_manager: "Plant Manager"
};

const ROLE_INITIALS: Record<Role, string> = {
  operator: "OP",
  development_team: "DT",
  admin: "AD",
  plant_manager: "PM"
};

const ROLE_DETAIL: Record<Role, string> = {
  operator: "MRF review mode",
  development_team: "Model and web workspace",
  admin: "Workspace administration",
  plant_manager: "Full workspace access"
};

const PLANT_MANAGER_NAV = [
  { href: "/overview", icon: "fa-chart-line", label: "Overview" },
  { href: "/upload", icon: "fa-cloud-arrow-up", label: "Upload" },
  { href: "/review", icon: "fa-magnifying-glass", label: "Review" },
  { href: "/analytics", icon: "fa-chart-line", label: "Analytics" },
  { href: "/development", icon: "fa-code-branch", label: "Development" },
  { href: "/admin/users", icon: "fa-users-gear", label: "Users" }
];

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolvedTheme = preference === "system" ? systemTheme() : preference;
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  window.dispatchEvent(
    new CustomEvent("purityloop:theme-change", {
      detail: { preference, resolvedTheme }
    })
  );

  return resolvedTheme;
}

function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  icon: string;
}> = [
  { value: "light", label: "Light", icon: "fa-sun" },
  { value: "dark", label: "Dark", icon: "fa-moon" },
  { value: "system", label: "System", icon: "fa-desktop" }
];

function ThemeSelector({ placement }: { placement: string }) {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = themeOptions.find(option => option.value === preference) || themeOptions[2];

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={"theme-control theme-control-" + placement}>
      <button
        type="button"
        className="theme-control-trigger"
        aria-label={"Theme: " + selected.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <i className={"fa-solid " + selected.icon} aria-hidden="true" />
        <span>{selected.label}</span>
        <i className="fa-solid fa-chevron-down theme-control-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="theme-control-menu" role="menu" aria-label="Choose theme">
          {themeOptions.map(option => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={preference === option.value}
              className={preference === option.value ? "active" : ""}
              onClick={() => {
                setPreference(option.value);
                setOpen(false);
              }}
            >
              <i className={"fa-solid " + option.icon} aria-hidden="true" />
              <span>{option.label}</span>
              {preference === option.value && (
                <i className="fa-solid fa-check theme-control-check" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeSelectorMounts() {
  const pathname = usePathname();
  const [slots, setSlots] = useState<HTMLElement[]>([]);

  useLayoutEffect(() => {
    const syncSlots = () => {
      setSlots(Array.from(document.querySelectorAll<HTMLElement>("[data-theme-slot]")));
    };

    syncSlots();
    window.addEventListener("purityloop:page-ready", syncSlots);
    return () => window.removeEventListener("purityloop:page-ready", syncSlots);
  }, [pathname]);

  return (
    <>
      {slots.map((slot, index) =>
        createPortal(
          <ThemeSelector placement={slot.dataset.themeSlot || "default"} />,
          slot,
          (slot.dataset.themeSlot || "theme") + "-" + index
        )
      )}
    </>
  );
}

function TopbarActions({ variant, profile }: { variant: string; profile: WorkspaceProfile | null }) {
  const analytics = variant === "analytics";
  const role = profile?.role || "admin";
  const badgeLabel = ROLE_LABEL[role];
  const initials = ROLE_INITIALS[role];
  return (
    <>
      {analytics && <><label className="analytics-date-control" htmlFor="analyticsDate"><span className="sr-only">Date selector</span><i className="fa-regular fa-calendar" aria-hidden="true" /><input id="analyticsDate" type="date" aria-label="Date selector" /></label><button id="analyticsClearDate" className="secondary-btn" type="button" disabled>All History</button></>}
      <div className="date-pill"><i className="fa-solid fa-clock" aria-hidden="true" /><span id="liveClock">00:00:00 AM</span></div>
      <ThemeSelector placement="app" />
      <button className="topbar-icon-btn" aria-label="Notifications"><i className="fa-solid fa-bell" aria-hidden="true" /><span className="notif-dot" /></button>
      <div className="user-badge"><div className="user-badge-avatar">{initials}</div><span>{badgeLabel}</span></div>
      <a href="/auth/signout" className="topbar-logout-btn" aria-label="Logout"><i className="fa-solid fa-right-from-bracket" aria-hidden="true" /><span>Logout</span></a>
    </>
  );
}

function TopbarActionMounts({ profile }: { profile: WorkspaceProfile | null }) {
  const pathname = usePathname();
  const [slots, setSlots] = useState<HTMLElement[]>([]);

  useLayoutEffect(() => {
    const syncSlots = () => setSlots(Array.from(document.querySelectorAll<HTMLElement>("[data-topbar-actions]")));
    syncSlots();
    window.addEventListener("purityloop:page-ready", syncSlots);
    return () => window.removeEventListener("purityloop:page-ready", syncSlots);
  }, [pathname]);

  return <>{slots.map((slot, index) => createPortal(<TopbarActions variant={slot.dataset.topbarVariant || "standard"} profile={profile} />, slot, `topbar-actions-${index}`))}</>;
}

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RoleChromeEnhancer({ profile }: { profile: WorkspaceProfile | null }) {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!profile) return;
    const sidebar = document.getElementById("appSidebar");
    if (!sidebar) return;

    const footerName = sidebar.querySelector<HTMLElement>(".user-name");
    const footerRole = sidebar.querySelector<HTMLElement>(".user-role");
    const footerAvatar = sidebar.querySelector<HTMLElement>(".user-avatar");
    if (footerName) footerName.textContent = ROLE_LABEL[profile.role];
    if (footerRole) footerRole.textContent = ROLE_DETAIL[profile.role];
    if (footerAvatar) footerAvatar.textContent = ROLE_INITIALS[profile.role];

    if (profile.role !== "plant_manager") return;

    const logo = sidebar.querySelector<HTMLAnchorElement>(".sidebar-logo");
    if (logo) logo.href = "/overview";

    const nav = sidebar.querySelector<HTMLElement>(".sidebar-nav");
    if (!nav) return;
    nav.setAttribute("aria-label", "Plant Manager navigation");
    nav.innerHTML = "";

    const label = document.createElement("div");
    label.className = "sidebar-section-label";
    label.textContent = "Plant Manager";
    nav.appendChild(label);

    for (const item of PLANT_MANAGER_NAV) {
      const link = document.createElement("a");
      link.href = item.href;
      link.className = `nav-item${isActiveRoute(pathname, item.href) ? " active" : ""}`;
      link.dataset.tooltip = item.label;

      const icon = document.createElement("i");
      icon.className = `nav-item-icon fa-solid ${item.icon}`;
      icon.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.className = "nav-item-label";
      text.textContent = item.label;

      link.append(icon, text);
      nav.appendChild(link);
    }
  }, [pathname, profile]);

  return null;
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);

  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
      if (!isThemePreference(stored)) {
        const legacy = localStorage.getItem("pl_theme") || localStorage.getItem("purityloop_theme");
        stored = isThemePreference(legacy) ? legacy : "system";
        localStorage.setItem(STORAGE_KEY, stored);
      }
    } catch {
      stored = "system";
    }

    const nextPreference = isThemePreference(stored) ? stored : "system";
    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (preference === "system") setResolvedTheme(applyTheme("system"));
    };

    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, nextPreference);
    } catch {
      // Theme remains usable when storage is blocked.
    }
    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data?.profile) setProfile(data.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <ThemeSelectorMounts />
      <TopbarActionMounts profile={profile} />
      <RoleChromeEnhancer profile={profile} />
    </ThemeContext.Provider>
  );
}
