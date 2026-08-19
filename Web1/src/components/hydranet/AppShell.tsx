import { Link, useRouterState } from "@tanstack/react-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Cpu,
  Download,
  LayoutDashboard,
  Leaf,
  Menu,
  Moon,
  Settings,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { useHydranetDashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/devices", label: "Devices", icon: Cpu },
  { to: "/energy", label: "Energy", icon: BarChart3 },
  { to: "/sustainability", label: "Sustainability", icon: Leaf },
  { to: "/costs", label: "Costs", icon: Wallet },
  { to: "/exports", label: "Exports", icon: Download },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("hydranet-theme");
    const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("hydranet-theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Activity className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold tracking-tight">Smart Energy</p>
        <p className="truncate text-[11px] text-muted-foreground">Energy Intelligence</p>
      </div>
    </div>
  );
}

function GridStatusCard() {
  const { devices } = useHydranetDashboardData();
  const totalLoad = devices.reduce((sum, device) => sum + device.load, 0);
  const offlineCount = devices.filter((device) => device.status === "offline" || device.status === "fault").length;

  const status = useMemo(() => {
    if (!devices.length) return { label: "No devices", tone: "bg-muted-foreground" };
    if (offlineCount > 0) return { label: "Degraded", tone: "bg-warning" };
    if (totalLoad > devices.length * 8) return { label: "High load", tone: "bg-warning" };
    return { label: "Nominal", tone: "bg-success" };
  }, [devices.length, offlineCount, totalLoad]);

  return (
    <div className="card-surface p-3">
      <p className="text-xs font-medium">Grid status</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", status.tone)} />
        {status.label} · {totalLoad.toFixed(1)} kW fleet load
      </p>
    </div>
  );
}

function UserBadge({ userEmail }: { userEmail?: string | null }) {
  const [email, setEmail] = useState(userEmail ?? null);

  useEffect(() => {
    if (userEmail) {
      setEmail(userEmail);
      return undefined;
    }
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (user) => setEmail(user?.email ?? null));
  }, [userEmail]);

  const initials = email
    ? email
        .split("@")[0]
        .split(/[._-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "?"
    : "?";
  const displayName = email ? email.split("@")[0] : "Guest";

  return (
    <div className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 sm:flex">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[11px] font-semibold text-accent-foreground">
        {initials}
      </span>
      <span className="max-w-[120px] truncate text-xs font-medium">{displayName}</span>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  userEmail,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  userEmail?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-7 flex-1">
          <p className="label-eyebrow px-3 pb-2">Operations</p>
          <NavList />
        </div>
        <GridStatusCard />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5">
            <div className="flex items-center justify-between gap-2">
              <Brand />
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-7 flex-1">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Open menu"
                onClick={() => setOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
                {subtitle && <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <ThemeToggle />
              <UserBadge userEmail={userEmail} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
