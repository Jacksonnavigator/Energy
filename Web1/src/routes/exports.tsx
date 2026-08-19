import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/hydranet/AppShell";
import { downloadCsv } from "@/lib/firebase-api";
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
  { id: "consumption", name: "Consumption report", desc: "Interval kWh per device and site", icon: Table2 },
  { id: "cost", name: "Cost allocation", desc: "Spend split by site and tariff band", icon: FileSpreadsheet },
  { id: "relay", name: "Relay event log", desc: "Every switch action with actor and time", icon: FileText },
] as const;

function ExportsPage() {
  const { exportsHistory, devices, allTelemetry, commands, siteBreakdown, tariffPerKwh, platformSettings, getPointKwh } =
    useHydranetDashboardData();

  const generateReport = (templateId: (typeof templates)[number]["id"]) => {
    const stamp = new Date().toISOString().slice(0, 10);

    if (templateId === "consumption") {
      if (!allTelemetry.length) {
        toast.error("No telemetry data available to export");
        return;
      }
      downloadCsv(
        `consumption-${stamp}.csv`,
        ["Device", "Site", "Timestamp", "Power kW", "Energy kWh"],
        allTelemetry.map((point) => {
          const device = devices.find((d) => d.id === point.deviceId);
          return [
            point.deviceName || point.deviceId || "Unknown",
            device?.site ?? "Unknown",
            new Date(point.ts).toISOString(),
            (point.power / 1000).toFixed(3),
            getPointKwh(point).toFixed(3),
          ];
        }),
      );
      toast.success("Consumption report downloaded");
      return;
    }

    if (templateId === "cost") {
      if (!siteBreakdown.length) {
        toast.error("No site cost data available to export");
        return;
      }
      downloadCsv(
        `cost-allocation-${stamp}.csv`,
        ["Site", "kWh", "Cost TZS", "Tariff TZS/kWh"],
        siteBreakdown.map((site) => [site.site, site.kwh, site.cost, tariffPerKwh]),
      );
      toast.success("Cost allocation report downloaded");
      return;
    }

    if (!commands.length) {
      toast.error("No relay commands available to export");
      return;
    }
    downloadCsv(
      `relay-events-${stamp}.csv`,
      ["Device ID", "Command", "Status", "Timestamp"],
      commands.map((cmd) => [cmd.deviceId, cmd.cmd, cmd.status, new Date(cmd.createdAtMs).toISOString()]),
    );
    toast.success("Relay event log downloaded");
  };

  return (
    <AppShell title="Exports" subtitle={`Reports and scheduled data deliveries · ${platformSettings.timezone}`}>
      <div className="grid gap-4 md:grid-cols-3">
        {templates.map(({ id, name, desc, icon: Icon }) => (
          <div key={name} className="card-surface flex flex-col p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-semibold">{name}</p>
            <p className="mt-1 flex-1 text-xs text-muted-foreground">{desc}</p>
            <button
              onClick={() => generateReport(id)}
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-xs font-medium transition-colors hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" /> Generate
            </button>
          </div>
        ))}
      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Recent exports</h2>
        </div>
        {exportsHistory.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No export history yet. Generate a report above or wait for relay commands to appear here.
          </p>
        ) : (
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
