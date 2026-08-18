import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Cpu, Gauge, Leaf, ShieldCheck, Wallet, Zap } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import { useHydranetDashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Overview | Smart Energy" },
      {
        name: "description",
        content:
          "Live overview of connected electrical assets, load, relay states, energy consumption and cost across every Smart Energy site.",
      },
      { property: "og:title", content: "Operations Overview | Smart Energy" },
      {
        property: "og:description",
        content: "Monitor devices, energy use, costs and alerts in real time from one operations dashboard.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { devices, alerts, consumptionSeries, siteBreakdown, currency, TARIFF_TZS_PER_KWH, GRID_EMISSION_FACTOR_KGCO2_PER_KWH, reliabilityMetrics, platformSettings, allTelemetry } = useHydranetDashboardData();
  const online = devices.filter((d) => d.status === "online").length;
  const totalLoad = devices.reduce((s, d) => s + d.load, 0);
  const openAlerts = alerts.filter((a) => !a.acknowledged);
  const stale = devices.filter((d) => d.status === "stale").length;
  const offline = devices.filter((d) => d.status === "offline").length;
  const faults = devices.filter((d) => d.status === "fault").length;
  const pending = devices.filter((d) => d.command === "pending").length;
  const energyToday = devices.reduce((s, d) => s + d.todayKwh, 0);
  const monthToDate = siteBreakdown.reduce((sum, site) => sum + site.cost, 0);
  const topConsumers = [...devices].sort((a, b) => b.todayKwh - a.todayKwh).slice(0, 5);

  return (
    <AppShell title="Operations Overview" subtitle={`All sites · ${platformSettings.timezone ? 'Live telemetry' : 'No data'}`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active load" value={totalLoad.toFixed(1)} unit="kW" icon={Zap} tone="primary" delta={{ value: devices.length ? "Live" : "No data", direction: "up", good: false }} />
        <StatCard label="Energy today" value={energyToday.toLocaleString()} unit="kWh" icon={Gauge} delta={{ value: devices.length ? "Live" : "No telemetry", direction: "down" }} />
        <StatCard label="Spend this month" value={currency(monthToDate)} icon={Wallet} delta={{ value: devices.length ? "Live" : "No data", direction: "down" }} />
        <StatCard label="Devices online" value={`${online}/${devices.length}`} icon={Cpu} tone={openAlerts.length ? "warning" : "neutral"} />
      </div>

      <section className="card-surface mt-4 grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
        {[
          { k: "Online", v: online, c: "text-success" },
          { k: "Stale telemetry", v: stale, c: "text-warning" },
          { k: "Faults", v: faults, c: "text-destructive" },
          { k: "Offline", v: offline, c: "text-muted-foreground" },
          { k: "Pending commands", v: pending, c: "text-warning" },
        ].map((h) => (
          <div key={h.k}>
            <p className="label-eyebrow">{h.k}</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", h.c)}>{h.v}</p>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">Consumption profile</h2>
              <p className="truncate text-xs text-muted-foreground">Last 24 hours, aggregated across sites</p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              kWh
            </span>
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={consumptionSeries} margin={{ left: -18, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="kwhFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Area type="monotone" dataKey="kwh" stroke="var(--chart-1)" strokeWidth={2} fill="url(#kwhFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card-surface p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="truncate text-sm font-semibold">Open alerts</h2>
            <Link to="/alerts" className="shrink-0 text-xs font-medium text-primary">
              View all
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {openAlerts.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-lg bg-secondary/60 p-3">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    a.severity === "critical" ? "text-destructive" : "text-warning",
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.device} · {a.time}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Top consumers today</h2>
          <div className="mt-4 space-y-3">
            {topConsumers.length ? topConsumers.map((d) => (
              <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.id} · {d.site}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn("h-full rounded-full", d.load > 70 ? "bg-warning" : "bg-primary")}
                      style={{ width: `${Math.min(100, (d.load / 90) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{d.todayKwh} kWh</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{currency(d.todayKwh * (TARIFF_TZS_PER_KWH || platformSettings.tariffPerKwh || 0))}</p>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No device telemetry has been loaded yet.</p>}
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Cost by site</h2>
          <ul className="mt-4 space-y-3.5">
            {siteBreakdown.length ? siteBreakdown.map((s) => (
              <li key={s.site} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="truncate text-sm">{s.site}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{currency(s.cost)}</span>
              </li>
            )) : <li className="text-sm text-muted-foreground">No site totals available yet.</li>}
          </ul>
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            Month-to-date tariff: {platformSettings.tariffPerKwh || 0} TZS/kWh.
          </p>
        </section>
      </div>
      {allTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold">Live telemetry feed</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date & Time</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Power (kW)</th>
                </tr>
              </thead>
              <tbody>
                {allTelemetry.slice(0, 15).map((point) => {
                  const date = new Date(point.ts);
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3">{point.deviceName || 'Unknown'}</td>
                      <td className="py-2 px-3 text-muted-foreground">{date.toLocaleString()}</td>
                      <td className="text-right py-2 px-3">{(point.power / 1000).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Link to="/sustainability" className="card-surface group block p-5 transition-colors hover:bg-accent/40">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Leaf className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold">Sustainability snapshot</h2>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fleet carbon today:{" "}
            <span className="font-medium text-foreground">
              {Math.round(energyToday * GRID_EMISSION_FACTOR_KGCO2_PER_KWH).toLocaleString()} kgCO₂
            </span>{" "}
            at {GRID_EMISSION_FACTOR_KGCO2_PER_KWH} kgCO₂/kWh grid factor. Track renewables, emissions trend and efficiency savings.
          </p>
          <p className="mt-3 text-xs font-medium text-primary">Explore carbon & recommendations →</p>
        </Link>

        <Link to="/reliability" className="card-surface group block p-5 transition-colors hover:bg-accent/40">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold">Reliability & safety</h2>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fleet uptime{" "}
            <span className="font-medium text-foreground">{reliabilityMetrics.uptime || 0}%</span> against a{" "}
            {reliabilityMetrics.slaTarget}% SLA, mean time to recover {reliabilityMetrics.mttr} and protection status.
          </p>
          <p className="mt-3 text-xs font-medium text-primary">View uptime & incidents →</p>
        </Link>
      </section>
    </AppShell>
  );
}
