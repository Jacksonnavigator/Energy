import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { useHydranetDashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exports")({
  head: () => ({
    meta: [
      { title: "Data Exports | Smart Energy" },
      {
        name: "description",
        content: "Generate and download consumption, cost and relay event reports in CSV, XLSX or PDF format.",
      },
      { property: "og:title", content: "Data Exports | Smart Energy" },
      { property: "og:description", content: "Build and download operational energy reports on demand." },
    ],
  }),
  component: ExportsPage,
});

const templates = [
  { name: "Consumption report", desc: "Interval kWh per device and site", icon: Table2 },
  { name: "Cost allocation", desc: "Spend split by site and tariff band", icon: FileSpreadsheet },
  { name: "Relay event log", desc: "Every switch action with actor and time", icon: FileText },
];

function ExportsPage() {
  const { exportsHistory } = useHydranetDashboardData();
  return (
    <AppShell title="Exports" subtitle="Reports and scheduled data deliveries">
      <div className="grid gap-4 md:grid-cols-3">
        {templates.map(({ name, desc, icon: Icon }) => (
          <div key={name} className="card-surface flex flex-col p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-semibold">{name}</p>
            <p className="mt-1 flex-1 text-xs text-muted-foreground">{desc}</p>
            <button className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-medium transition-colors hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Generate
            </button>
          </div>
        ))}
      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Recent exports</h2>
        </div>
        <ul className="divide-y divide-border">
          {exportsHistory.map((e) => (
            <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.format} · {e.size} · {e.created}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium",
                    e.status === "Ready" ? "bg-success/12 text-success" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {e.status}
                </span>
                <button
                  aria-label={`Download ${e.name}`}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
