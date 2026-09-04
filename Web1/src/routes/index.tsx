import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  CircleDollarSign,
  Cpu,
  Gauge,
  Leaf,
  MapPin,
  RadioTower,
  ShieldCheck,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { EMPTY_TELEMETRY_MSG, useHydranetDashboardData } from "@/lib/dashboard-data";
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
        content:
          "Monitor devices, energy use and costs in real time from one operations dashboard.",
      },
    ],
  }),
  component: Overview,
});

const DEVICE_AREA_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function ProgressRow({
  label,
  value,
  detail,
  tone = "primary",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{detail}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-secondary">
        <div
          className={cn(
            "h-full rounded-md",
            tone === "primary" && "bg-primary",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "destructive" && "bg-destructive",
          )}
          style={{ width: Math.min(100, Math.max(0, value)) + "%" }}
        />
      </div>
    </div>
  );
}

function CompactMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "success" | "warning" | "destructive";
}) {
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            tone === "primary" && "text-primary",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
          )}
        />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Overview() {
  const {
    devices,
    deviceConsumptionSeries,
    siteBreakdown,
    dashboardSummary,
    recommendations,
    currency,
    tariffPerKwh,
    GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
    isLoading,
  } = useHydranetDashboardData();

  const totalDevices = dashboardSummary.totalDevices;
  const online = dashboardSummary.online;
  const stale = dashboardSummary.stale;
  const offline = dashboardSummary.offline;
  const faults = dashboardSummary.faults;
  const pending = dashboardSummary.pending;
  const attentionCount = stale + offline + faults + pending;
  const fleetHealthPct = totalDevices ? Math.round((online / totalDevices) * 100) : 0;
  const loadPct = Math.round(dashboardSummary.loadFactor * 100);
  const energyToday = dashboardSummary.energyTodayKwh;
  const topConsumers = [...devices].sort((a, b) => b.todayKwh - a.todayKwh).slice(0, 5);
  const maxTopConsumerKwh = Math.max(1, ...topConsumers.map((device) => device.todayKwh));
  const maxSiteCost = Math.max(1, ...siteBreakdown.map((site) => site.cost));
  const chartDevices = devices.filter((device) =>
    deviceConsumptionSeries.some((point) => Number(point[device.id]) > 0),
  );
  const deviceNameById = new Map(devices.map((device) => [device.id, device.name]));
  const topSite = siteBreakdown[0];
  const statusTone = faults || offline ? "destructive" : stale || pending ? "warning" : "success";

  return (
    <AppShell
      title="Operations Overview"
      subtitle={`All sites - ${isLoading ? "Loading" : "Live telemetry"}`}
    >
      <section className="card-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium",
                statusTone === "success" && "border-success/25 bg-success/10 text-success",
                statusTone === "warning" && "border-warning/30 bg-warning/10 text-warning",
                statusTone === "destructive" &&
                  "border-destructive/25 bg-destructive/10 text-destructive",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  statusTone === "success" && "bg-success",
                  statusTone === "warning" && "bg-warning",
                  statusTone === "destructive" && "bg-destructive",
                )}
              />
              {attentionCount ? `${attentionCount} to review` : "Fleet nominal"}
            </span>
            <span className="text-xs text-muted-foreground">
              {online}/{totalDevices || 0} devices online -{" "}
              {dashboardSummary.totalLoadKw.toFixed(1)} kW load
            </span>
          </div>
          <Link
            to="/devices"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Review devices <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <CompactMetric
            label="Active load"
            value={`${dashboardSummary.totalLoadKw.toFixed(1)} kW`}
            detail={`${loadPct}% capacity`}
            icon={Zap}
            tone={loadPct > 80 ? "warning" : "primary"}
          />
          <CompactMetric
            label="Energy today"
            value={`${energyToday.toLocaleString()} kWh`}
            detail="Telemetry-derived"
            icon={Gauge}
            tone="primary"
          />
          <CompactMetric
            label="Month spend"
            value={currency(dashboardSummary.monthToDateCost)}
            detail={`${dashboardSummary.monthToDateKwh.toLocaleString()} kWh`}
            icon={Wallet}
          />
          <CompactMetric
            label="Fleet health"
            value={`${fleetHealthPct}%`}
            detail={`${online}/${totalDevices || 0} online`}
            icon={Cpu}
            tone={attentionCount ? "warning" : "success"}
          />
          <CompactMetric
            label="Attention"
            value={String(attentionCount)}
            detail={`${faults} faults, ${stale} stale`}
            icon={AlertTriangle}
            tone={attentionCount ? "warning" : "success"}
          />
          <CompactMetric
            label="CO2 today"
            value={`${dashboardSummary.co2TodayKg.toLocaleString()} kg`}
            detail={`${dashboardSummary.carbonIntensityGCo2PerKwh} g/kWh`}
            icon={Leaf}
            tone="success"
          />
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
        <section className="card-surface p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">Consumption by device</h2>
              <p className="truncate text-xs text-muted-foreground">
                Last 24 hours from device telemetry
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              kWh/device
            </span>
          </div>
          <div className="mt-4 h-72">
            {deviceConsumptionSeries.length && chartDevices.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={deviceConsumptionSeries}
                  margin={{ left: -18, right: 4, top: 8, bottom: 8 }}
                >
                  <defs>
                    {chartDevices.map((device, index) => (
                      <linearGradient
                        key={device.id}
                        id={`deviceKwhFill${index}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={DEVICE_AREA_COLORS[index % DEVICE_AREA_COLORS.length]}
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor={DEVICE_AREA_COLORS[index % DEVICE_AREA_COLORS.length]}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    unit=" kWh"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(value, name) => [
                      Number(value).toFixed(2) + " kWh",
                      deviceNameById.get(String(name)) ?? String(name),
                    ]}
                    labelFormatter={(label) => "Hour: " + label}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {chartDevices.map((device, index) => (
                    <Area
                      key={device.id}
                      type="monotone"
                      dataKey={device.id}
                      name={device.name}
                      stackId="devices"
                      stroke={DEVICE_AREA_COLORS[index % DEVICE_AREA_COLORS.length]}
                      strokeWidth={2}
                      fill={`url(#deviceKwhFill${index})`}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {EMPTY_TELEMETRY_MSG}
              </p>
            )}
          </div>
        </section>

        <section className="card-surface p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
              <RadioTower className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Operations posture</h2>
              <p className="text-xs text-muted-foreground">Current load, cost, and impact</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <ProgressRow
              label="Online fleet"
              value={fleetHealthPct}
              detail={`${online}/${totalDevices || 0}`}
              tone={attentionCount ? "warning" : "success"}
            />
            <ProgressRow
              label="Load factor"
              value={loadPct}
              detail={`${loadPct}%`}
              tone={loadPct > 80 ? "warning" : "primary"}
            />
            <ProgressRow
              label="Budget remaining"
              value={
                dashboardSummary.monthToDateCost + dashboardSummary.budgetRemaining > 0
                  ? (dashboardSummary.budgetRemaining /
                      (dashboardSummary.monthToDateCost + dashboardSummary.budgetRemaining)) *
                    100
                  : 0
              }
              detail={currency(dashboardSummary.budgetRemaining)}
              tone="success"
            />
          </div>
          <div className="mt-4 grid gap-2 border-t border-border pt-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CircleDollarSign className="h-4 w-4" /> Top site cost
              </span>
              <span className="font-semibold tabular-nums">
                {topSite ? currency(topSite.cost) : currency(0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Leaf className="h-4 w-4" /> CO2 today
              </span>
              <span className="font-semibold tabular-nums">
                {dashboardSummary.co2TodayKg.toLocaleString()} kg
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Top consumers today</h2>
              <p className="text-xs text-muted-foreground">Ranked by kWh reported today</p>
            </div>
            <BatteryCharging className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {topConsumers.length ? (
              topConsumers.map((device, index) => (
                <div
                  key={device.id}
                  className="rounded-md border border-border bg-secondary/25 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{device.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {device.id} - {device.site}
                      </p>
                    </div>
                    <span className="rounded bg-card px-2 py-1 text-xs font-semibold tabular-nums">
                      #{index + 1}
                    </span>
                  </div>
                  <div className="mt-3">
                    <ProgressRow
                      label="Energy"
                      value={(device.todayKwh / maxTopConsumerKwh) * 100}
                      detail={`${device.todayKwh} kWh`}
                      tone={index === 0 ? "warning" : "primary"}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{currency(device.todayKwh * tariffPerKwh)}</span>
                    <span>{device.load.toFixed(1)} kW now</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No device telemetry has been loaded yet.
              </p>
            )}
          </div>
        </section>

        <section className="card-surface p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-muted-foreground">
              <MapPin className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Cost by site</h2>
              <p className="text-xs text-muted-foreground">Month-to-date allocation</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {siteBreakdown.length ? (
              siteBreakdown.map((site) => (
                <ProgressRow
                  key={site.site}
                  label={site.site}
                  value={(site.cost / maxSiteCost) * 100}
                  detail={currency(site.cost)}
                  tone="primary"
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No site totals available yet.</p>
            )}
          </div>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Tariff: {tariffPerKwh} TZS/kWh.
          </p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
        <section className="card-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Recommended actions</h2>
              <p className="text-xs text-muted-foreground">
                Generated from device status and recent usage
              </p>
            </div>
            <Link
              to="/energy"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              Energy <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {recommendations.length ? (
              recommendations.slice(0, 4).map((rec) => (
                <article
                  key={rec.id}
                  className="rounded-md border border-border bg-secondary/25 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{rec.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {rec.detail}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-1 text-[11px] font-medium capitalize",
                        rec.priority === "high" && "bg-destructive/10 text-destructive",
                        rec.priority === "medium" && "bg-warning/10 text-warning",
                        rec.priority === "low" && "bg-accent text-accent-foreground",
                      )}
                    >
                      {rec.priority}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-card px-2 py-1 tabular-nums">
                      {rec.savingKwh} kWh
                    </span>
                    <span className="rounded bg-card px-2 py-1 tabular-nums">
                      {currency(rec.savingTzs)}
                    </span>
                    <span className="rounded bg-card px-2 py-1 tabular-nums">
                      {rec.co2SavedKg} kg CO2
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recommendations yet.</p>
            )}
          </div>
        </section>

        <Link
          to="/sustainability"
          className="card-surface group flex flex-col justify-between p-4 transition-colors hover:border-primary/35 hover:bg-accent/25"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold">Sustainability snapshot</h2>
            </div>
            <p className="mt-4 text-2xl font-semibold tabular-nums">
              {Math.round(energyToday * GRID_EMISSION_FACTOR_KGCO2_PER_KWH).toLocaleString()} kg
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              CO2 today at {GRID_EMISSION_FACTOR_KGCO2_PER_KWH} kg/kWh.
            </p>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
            Open sustainability <ArrowRight className="h-4 w-4" />
          </p>
        </Link>
      </div>
    </AppShell>
  );
}
