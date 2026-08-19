import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Car, Leaf, Lightbulb, Recycle, Smartphone, TreePine, TrendingDown } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import { EMPTY_TELEMETRY_MSG, useHydranetDashboardData, type TimeRange } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sustainability")({
  head: () => ({
    meta: [
      { title: "Sustainability & Carbon | Smart Energy" },
      {
        name: "description",
        content:
          "Carbon footprint, renewable energy mix, emissions trend and efficiency recommendations across the Smart Energy fleet.",
      },
      { property: "og:title", content: "Sustainability & Carbon | Smart Energy" },
      {
        property: "og:description",
        content: "Track fleet CO₂ emissions, renewable share and efficiency savings in real time.",
      },
    ],
  }),
  component: SustainabilityPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: 12,
  color: "var(--popover-foreground)",
};

const priorityStyle: Record<string, string> = {
  high: "bg-destructive/12 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-secondary text-muted-foreground",
};

function SustainabilityPage() {
  const {
    devices,
    renewableMix,
    getEmissionsSeries,
    sustainabilityEquivalents,
    recommendations: seed,
    GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
    currency,
    recentTelemetry, formatTelemetryDateTime,
    renewableMixConfigured,
    getPointKwh,
    EMPTY_TELEMETRY_MSG: emptyMsg,
  } = useHydranetDashboardData();
  const [timeRange, setTimeRange] = useState<TimeRange>("day");

  const emissionsTrend = useMemo(() => getEmissionsSeries(timeRange), [getEmissionsSeries, timeRange]);
  const monthLabel = new Date().toLocaleString("en", { month: "short" });

  const energyToday = devices.reduce((s, d) => s + d.todayKwh, 0);
  const co2TodayKg = Math.round(energyToday * GRID_EMISSION_FACTOR_KGCO2_PER_KWH);
  const renewableShare = renewableMix.length
    ? renewableMix.filter((r) => /hydro|solar|wind|biogas/i.test(r.source)).reduce((s, r) => s + r.pct, 0)
    : 0;
  const lastBucket = emissionsTrend[emissionsTrend.length - 1] ?? { avoided: 0 };
  const avoidedThisMonth = Math.max(0, lastBucket?.avoided ?? 0);
  const totalPotentialSaving = Array.isArray(seed) ? seed.reduce((s, r) => s + r.savingTzs, 0) : 0;
  const totalPotentialCo2 = Array.isArray(seed) ? seed.reduce((s, r) => s + r.co2SavedKg, 0) : 0;

  const topEmitters = [...devices]
    .map((d) => ({ ...d, co2Kg: Math.round(d.todayKwh * GRID_EMISSION_FACTOR_KGCO2_PER_KWH) }))
    .sort((a, b) => b.co2Kg - a.co2Kg)
    .slice(0, 5);
  const maxCo2 = Math.max(...topEmitters.map((d) => d.co2Kg), 1);

  return (
    <AppShell title="Sustainability" subtitle={`Carbon, renewables and efficiency · Grid factor ${GRID_EMISSION_FACTOR_KGCO2_PER_KWH} kgCO₂/kWh`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Carbon today"
          value={co2TodayKg.toLocaleString()}
          unit="kgCO₂"
          icon={Leaf}
          tone="primary"
        />
        <StatCard label="Grid intensity" value={String(Math.round(GRID_EMISSION_FACTOR_KGCO2_PER_KWH * 1000))} unit="gCO₂/kWh" icon={Recycle} />
        <StatCard label="Renewable share" value={`${renewableShare}%`} icon={TreePine} />
        <StatCard label={`CO₂ avoided (${monthLabel})`} value={avoidedThisMonth.toLocaleString()} unit="kgCO₂" icon={TrendingDown} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Emissions vs baseline</h2>
              <p className="text-xs text-muted-foreground">Fleet CO₂ emissions with no-action baseline · View by hour, day, week or month</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["hour", "day", "week", "month"] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11px] font-medium capitalize transition-colors",
                    timeRange === range
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 h-64">
            {emissionsTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={emissionsTrend} margin={{ left: -18, right: 4, top: 8 }}>
                  <defs>
                    <linearGradient id="co2Fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="baseline" name="Baseline" stroke="var(--chart-5)" strokeDasharray="5 4" strokeWidth={2} fill="none" />
                  <Area type="monotone" dataKey="co2" name="Actual" stroke="var(--chart-3)" strokeWidth={2} fill="url(#co2Fill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{emptyMsg}</p>
            )}
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Energy source mix</h2>
          <p className="text-xs text-muted-foreground">{renewableMixConfigured ? "Share of supply feeding the fleet" : "Today's energy share by device"}</p>
          <div className="mt-3 h-40">
            {renewableMix.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={renewableMix} dataKey="pct" nameKey="source" innerRadius={42} outerRadius={62} paddingAngle={2} stroke="var(--border)">
                  {renewableMix.map((r) => (
                    <Cell key={r.source} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v}%`, n]} />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {emptyMsg}
              </p>
            )}
          </div>
          {renewableMix.length > 0 && (
          <ul className="mt-2 space-y-2">
            {renewableMix.map((r) => (
              <li key={r.source} className="flex items-center gap-2.5 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.source}</span>
                <span className="shrink-0 font-medium tabular-nums">{r.pct}%</span>
              </li>
            ))}
          </ul>
          )}
        </section>
      </div>

      <section className="card-surface mt-6 p-5">
        <h2 className="text-sm font-semibold">Carbon equivalents</h2>
        <p className="text-xs text-muted-foreground">What today's carbon footprint looks like in everyday terms</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: TreePine, label: "Trees absorbing CO₂ for a year", value: sustainabilityEquivalents.trees.toLocaleString() },
            { icon: Car, label: "Car km not driven", value: sustainabilityEquivalents.kmAvoided.toLocaleString() },
            { icon: Leaf, label: "Homes powered (monthly)", value: sustainabilityEquivalents.homesPowered.toLocaleString() },
            { icon: Smartphone, label: "Smartphones charged", value: sustainabilityEquivalents.phonesCharged.toLocaleString() },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-border bg-secondary/40 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Top emitters today</h2>
          <div className="mt-4 space-y-3">
            {topEmitters.map((d) => (
              <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.id} · {d.site}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-chart-3" style={{ width: `${(d.co2Kg / maxCo2) * 100}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{d.co2Kg} kg</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{d.todayKwh} kWh</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <RecommendationsCard
          totalPotentialSaving={totalPotentialSaving}
          totalPotentialCo2={totalPotentialCo2}
          currency={currency}
          recommendations={seed}
        />
      </div>

      {recentTelemetry && recentTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold mb-4">Detailed emissions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date & Time</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Power (kW)</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">CO₂ (kg)</th>
                </tr>
              </thead>
              <tbody>
                {recentTelemetry.slice(0, 20).map((point) => {
                  const kwh = getPointKwh(point);
                  const co2 = (kwh * GRID_EMISSION_FACTOR_KGCO2_PER_KWH).toFixed(3);
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3">{point.deviceName || "Unknown"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{formatTelemetryDateTime(point.ts)}</td>
                      <td className="text-right py-2 px-3">{(point.power / 1000).toFixed(2)}</td>
                      <td className="text-right py-2 px-3">{co2}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {recentTelemetry.length > 20 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing 20 of {recentTelemetry.length} readings. Load more to see earlier data.
            </p>
          )}
        </section>
      )}
    </AppShell>
  );
}

function RecommendationsCard({
  totalPotentialSaving,
  totalPotentialCo2,
  currency,
  recommendations,
}: {
  totalPotentialSaving: number;
  totalPotentialCo2: number;
  currency: (value: number) => string;
  recommendations: Array<{
    id: string;
    title: string;
    detail: string;
    device: string;
    savingKwh: number;
    savingTzs: number;
    co2SavedKg: number;
    priority: "high" | "medium" | "low";
    category: string;
  }>;
}) {
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const items = recommendations ?? [];

  return (
    <section className="card-surface flex flex-col p-5">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold">Efficiency recommendations</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Identified savings: <span className="font-medium text-foreground">{currency(totalPotentialSaving)}</span> · {totalPotentialCo2} kgCO₂
      </p>
      <ul className="mt-4 flex-1 space-y-3">
        {items.slice(0, 4).map((r) => {
          const done = applied[r.id];
          return (
            <li key={r.id} className="rounded-lg border border-border bg-secondary/40 p-3">
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", priorityStyle[r.priority])}>
                  {r.priority}
                </span>
                <span className="text-[11px] text-muted-foreground">{r.category}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{r.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs tabular-nums text-success">
                  {r.savingTzs > 0 ? `−${currency(r.savingTzs)}` : "Reliability"}
                  {r.co2SavedKg > 0 && <span className="ml-1.5 text-muted-foreground">· −{r.co2SavedKg} kgCO₂</span>}
                </p>
                <button
                  onClick={() => setApplied((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                    done
                      ? "bg-success/12 text-success"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {done ? "Applied" : "Apply"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Link to="/sustainability" className="mt-4 text-xs font-medium text-primary" onClick={(e) => e.preventDefault()}>
        View all recommendations →
      </Link>
    </section>
  );
}
