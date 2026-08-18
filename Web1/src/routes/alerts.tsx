import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Info } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { useHydranetDashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts & Events | Smart Energy" },
      {
        name: "description",
        content: "Critical faults, threshold warnings and relay events across all connected electrical assets.",
      },
      { property: "og:title", content: "Alerts & Events | Smart Energy" },
      { property: "og:description", content: "Acknowledge faults, warnings and relay events from one queue." },
    ],
  }),
  component: AlertsPage,
});

const severityMeta = {
  critical: { icon: AlertTriangle, chip: "bg-destructive/12 text-destructive" },
  warning: { icon: BellRing, chip: "bg-warning/15 text-warning" },
  info: { icon: Info, chip: "bg-secondary text-muted-foreground" },
} as const;

function AlertsPage() {
  const { alerts: seed } = useHydranetDashboardData();
  const [rows, setRows] = useState(seed);
  const [showAck, setShowAck] = useState(true);

  useEffect(() => {
    setRows(seed);
  }, [seed]);
  const open = rows.filter((r) => !r.acknowledged);
  const visible = showAck ? rows : open;

  return (
    <AppShell
      title="Alerts"
      subtitle={`${open.length} open · ${rows.length - open.length} acknowledged`}
      actions={
        <button
          onClick={() => setShowAck((v) => !v)}
          className="hidden h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          {showAck ? "Hide acknowledged" : "Show all"}
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {(["critical", "warning", "info"] as const).map((s) => {
          const Icon = severityMeta[s].icon;
          return (
            <div key={s} className="card-surface flex items-center gap-4 p-5">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", severityMeta[s].chip)}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="label-eyebrow">{s}</p>
                <p className="text-xl font-semibold tabular-nums">{rows.filter((r) => r.severity === s).length}</p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Event queue</h2>
        </div>
        <ul className="divide-y divide-border">
          {visible.map((a) => {
            const Icon = severityMeta[a.severity].icon;
            return (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", severityMeta[a.severity].chip)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.device} · {a.time} · {a.id}
                    </p>
                  </div>
                </div>
                {a.acknowledged ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" /> <span className="hidden sm:inline">Acknowledged</span>
                  </span>
                ) : (
                  <button
                    onClick={() => setRows((prev) => prev.map((r) => (r.id === a.id ? { ...r, acknowledged: true } : r)))}
                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Acknowledge
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
