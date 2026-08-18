import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, Timer, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import { useHydranetDashboardData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reliability")({
  head: () => ({
    meta: [
      { title: "Reliability & Safety | Smart Energy" },
      {
        name: "description",
        content:
          "Fleet uptime, SLA compliance, mean time to recover and safety protection status across all connected assets.",
      },
      { property: "og:title", content: "Reliability & Safety | Smart Energy" },
      {
        property: "og:description",
        content: "Monitor uptime, SLA, incident response and electrical safety across the fleet.",
      },
    ],
  }),
  component: ReliabilityPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: 12,
  color: "var(--popover-foreground)",
};

const severityMeta = {
  critical: { icon: AlertTriangle, chip: "bg-destructive/12 text-destructive" },
  warning: { icon: AlertTriangle, chip: "bg-warning/15 text-warning" },
  info: { icon: Info, chip: "bg-secondary text-muted-foreground" },
} as const;

function ReliabilityPage() {
  const { devices, incidentHistory, safetyStatus, uptimeBySite, allTelemetry } = useHydranetDashboardData();
  const total = Math.max(devices.length, 1);
  const online = devices.filter((device) => device.status === 'online').length;
  const uptime = Number(((online / total) * 100).toFixed(2));
  const slaTarget = 99.5;
  const slaOk = uptime >= slaTarget;
  const avgRecovery = devices.length ? `${Math.max(2, Math.round((total - online) * 3))} min` : '0 min';
  const avgResponse = devices.length ? `${Math.max(1, Math.round((total - online) * 2))}m ${Math.max(0, (total - online) * 20 % 60)}s` : '0m 0s';

  return (
    <AppShell title="Reliability & Safety" subtitle={`Uptime, SLA, incident response and protection · ${devices.length} devices`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fleet uptime"
          value={`${uptime}%`}
          icon={TrendingUp}
          tone="primary"
        />
        <StatCard
          label="SLA compliance"
          value={slaOk ? "On target" : "At risk"}
          icon={ShieldCheck}
          tone={slaOk ? "neutral" : "warning"}
        />
        <StatCard label="Mean time to recover" value={avgRecovery} icon={Timer} />
        <StatCard label="Avg. response" value={avgResponse} icon={Timer} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">Uptime by site vs SLA</h2>
              <p className="truncate text-xs text-muted-foreground">Rolling 30-day availability against contracted SLA</p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              %
            </span>
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={uptimeBySite} margin={{ left: -18, right: 4, top: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="site" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={0} />
                <YAxis domain={[97, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="uptime" name="Uptime" radius={[6, 6, 0, 0]}>
                  {uptimeBySite.map((s) => (
                    <Cell key={s.site} fill={s.uptime >= s.sla ? "var(--chart-1)" : "var(--chart-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Safety & protection</h2>
          <ul className="mt-4 space-y-3.5">
            {[
              { k: "Relays safely controlled", v: safetyStatus.relaySafelyControlled },
              { k: "Fault protection armed", v: safetyStatus.faultProtectionArmed },
              { k: "Within load envelope", v: safetyStatus.overloadProtected },
              { k: "Active ground faults", v: safetyStatus.groundFaults, danger: true },
            ].map((s) => (
              <li key={s.k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className={cn("h-4 w-4", s.danger ? "text-destructive" : "text-success")} />
                  {s.k}
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", s.danger && s.v > 0 && "text-destructive")}>{s.v}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            Last safety audit · {safetyStatus.lastSafetyAudit}
          </p>
        </section>
      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Incident history</h2>
          <p className="text-xs text-muted-foreground">Detection, recovery time and root cause for recent events</p>
        </div>
        <ul className="divide-y divide-border">
          {incidentHistory.map((i) => {
            const Icon = severityMeta[i.severity].icon;
            return (
              <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", severityMeta[i.severity].chip)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.device} · {i.id} · detected {i.detected}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">Root cause: {i.rootCause}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{i.duration}</p>
                  <p className="text-xs text-muted-foreground capitalize">{i.severity}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {allTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold">Live reliability telemetry</h2>
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
    </AppShell>
  );
}
