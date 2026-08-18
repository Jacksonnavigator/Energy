import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Gauge, Leaf, Timer, Zap } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import { useHydranetDashboardData, type TouPeriod } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/energy")({
  head: () => ({
    meta: [
      { title: "Energy Analytics | Smart Energy" },
      {
        name: "description",
        content: "Consumption profiles, peak demand, load factor and site-level energy breakdown for connected assets.",
      },
      { property: "og:title", content: "Energy Analytics | Smart Energy" },
      { property: "og:description", content: "Analyse consumption, peak demand and load factor across every site." },
    ],
  }),
  component: EnergyPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: 12,
  color: "var(--popover-foreground)",
};

const periodColor: Record<TouPeriod, string> = {
  peak: "var(--warning)",
  standard: "var(--chart-1)",
  offpeak: "var(--chart-3)",
};

type SortKey = "hour" | "kwh" | "cost";
type ChartRange = "hours" | "days" | "weeks" | "months";

function TimeOfUseExplorer() {
  const { hourlyProfile, touBands, currency } = useHydranetDashboardData();
  const [filter, setFilter] = useState<TouPeriod | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "hour", dir: "asc" });

  const rows = useMemo(() => {
    const base = hourlyProfile.filter((h) => filter === "all" || h.period === filter);
    return [...base].sort((a, b) => (sort.dir === "asc" ? a[sort.key] - b[sort.key] : b[sort.key] - a[sort.key]));
  }, [filter, sort]);

  const bandTotals = touBands.map((b) => {
    const set = hourlyProfile.filter((h) => h.period === b.id);
    const kwh = set.reduce((s, h) => s + h.kwh, 0);
    const cost = set.reduce((s, h) => s + h.cost, 0);
    return { ...b, kwh, cost, avg: set.length ? kwh / set.length : 0, share: kwh };
  });
  const totalKwh = bandTotals.reduce((s, b) => s + b.kwh, 0);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const SortButton = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn(
        "inline-flex items-center gap-1 text-left transition-colors hover:text-foreground",
        sort.key === k ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      {sort.key === k &&
        (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  return (
    <section className="card-surface mt-6 overflow-hidden">
      <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Consumption by time of day</h2>
          <p className="text-xs text-muted-foreground">
            Choose a tariff band to compare peak, standard and off-peak usage · East Africa Time (UTC+3)
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([{ id: "all", label: "All hours" }, ...touBands] as { id: TouPeriod | "all"; label: string }[]).map((b) => (
            <button
              key={b.id}
              onClick={() => setFilter(b.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === b.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-3">
        {bandTotals.map((b) => (
          <div key={b.id} className="rounded-xl bg-secondary/50 p-3.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: periodColor[b.id] }} />
              <p className="text-xs font-medium">{b.label}</p>
              <span className="ml-auto text-[11px] text-muted-foreground">{b.window}</span>
            </div>
            <p className="mt-2 text-lg font-semibold tabular-nums">{b.kwh.toLocaleString()} kWh</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {Math.round((b.kwh / totalKwh) * 100)}% of day · avg {b.avg.toFixed(0)} kWh/h · {currency(b.cost)}
            </p>
          </div>
        ))}
      </div>

      <div className="h-64 px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...rows].sort((a, b) => a.hour - b.hour)} margin={{ left: -18, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" tickLine={false} axisLine={false} interval={filter === "all" ? 2 : 0} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={tooltipStyle} />
            <Bar dataKey="kwh" name="kWh" radius={[6, 6, 0, 0]}>
              {rows
                .slice()
                .sort((a, b) => a.hour - b.hour)
                .map((h) => (
                  <Cell key={h.hour} fill={periodColor[h.period]} />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs">
              <th className="px-5 py-2.5 text-left font-medium"><SortButton k="hour" label="Hour" /></th>
              <th className="px-5 py-2.5 text-left font-medium text-muted-foreground">Band</th>
              <th className="px-5 py-2.5 text-right font-medium"><SortButton k="kwh" label="Energy (kWh)" /></th>
              <th className="px-5 py-2.5 text-right font-medium"><SortButton k="cost" label="Cost" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((h) => (
              <tr key={h.hour} className="transition-colors hover:bg-secondary/40">
                <td className="px-5 py-2.5 font-medium tabular-nums">{h.t}</td>
                <td className="px-5 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ background: `color-mix(in oklab, ${periodColor[h.period]} 14%, transparent)`, color: periodColor[h.period] }}
                  >
                    {touBands.find((b) => b.id === h.period)?.label}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{h.kwh}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{currency(h.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EnergyPage() {
  const { consumptionSeries, hourlyProfile, siteBreakdown, devices, platformSettings, currency, tariffPerKwh, allTelemetry, GRID_EMISSION_FACTOR_KGCO2_PER_KWH } = useHydranetDashboardData();
  const [chartRange, setChartRange] = useState<ChartRange>("hours");

  const chartData = useMemo(() => {
    if (!allTelemetry.length) {
      return [{ label: 'No data', kwh: 0, cost: 0 }];
    }

    const kwhValue = (pointPower: number) => Math.max(0, (pointPower / 1000) * 0.25);
    const formatCost = (kwh: number) => Number((kwh * tariffPerKwh).toFixed(1));

    if (chartRange === 'hours') {
      const latest = new Date(Math.max(...allTelemetry.map((point) => point.ts)));
      const start = new Date(latest);
      start.setHours(latest.getHours() - 23, 0, 0, 0);
      const buckets = new Map<number, number>();

      allTelemetry.forEach((point) => {
        const date = new Date(point.ts);
        const bucketKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
        buckets.set(bucketKey, (buckets.get(bucketKey) ?? 0) + point.power);
      });

      return Array.from({ length: 24 }, (_, index) => {
        const ts = new Date(start);
        ts.setHours(start.getHours() + index);
        const key = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours()).getTime();
        const totalPower = buckets.get(key) ?? 0;
        const kwh = kwhValue(totalPower);
        return {
          label: ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          kwh: Number(kwh.toFixed(1)),
          cost: formatCost(kwh),
        };
      });
    }

    if (chartRange === 'days') {
      const latest = new Date(Math.max(...allTelemetry.map((point) => point.ts)));
      const start = new Date(latest);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      const buckets = new Map<string, number>();

      allTelemetry.forEach((point) => {
        const date = new Date(point.ts);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) ?? 0) + point.power);
      });

      return Array.from({ length: 7 }, (_, index) => {
        const ts = new Date(start);
        ts.setDate(start.getDate() + index);
        const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
        const totalPower = buckets.get(key) ?? 0;
        const kwh = kwhValue(totalPower);
        return {
          label: ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          kwh: Number(kwh.toFixed(1)),
          cost: formatCost(kwh),
        };
      });
    }

    if (chartRange === 'weeks') {
      const latest = new Date(Math.max(...allTelemetry.map((point) => point.ts)));
      const start = new Date(latest);
      const day = start.getDay();
      const diff = (day + 6) % 7;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 35);
      const buckets = new Map<string, number>();

      allTelemetry.forEach((point) => {
        const date = new Date(point.ts);
        const monday = new Date(date);
        const mondayDay = monday.getDay();
        const mondayDiff = (mondayDay + 6) % 7;
        monday.setDate(monday.getDate() - mondayDiff);
        monday.setHours(0, 0, 0, 0);
        const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) ?? 0) + point.power);
      });

      return Array.from({ length: 6 }, (_, index) => {
        const ts = new Date(start);
        ts.setDate(start.getDate() + index * 7);
        const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
        const totalPower = buckets.get(key) ?? 0;
        const kwh = kwhValue(totalPower);
        return {
          label: ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          kwh: Number(kwh.toFixed(1)),
          cost: formatCost(kwh),
        };
      });
    }

    const bucketMap = new Map<string, number>();
    allTelemetry.forEach((point) => {
      const date = new Date(point.ts);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + point.power);
    });

    return Array.from({ length: 6 }, (_, index) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - index));
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const kwh = kwhValue(bucketMap.get(key) ?? 0);
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        kwh: Number(kwh.toFixed(1)),
        cost: formatCost(kwh),
      };
    });
  }, [allTelemetry, chartRange, tariffPerKwh]);

  const monthToDateKwh = siteBreakdown.reduce((sum, site) => sum + site.kwh, 0);
  const peakDemand = devices.length ? Math.max(0, ...devices.map((device) => device.load)) : 0;
  const loadFactor = devices.length ? Math.min(1, (devices.reduce((sum, device) => sum + device.load, 0) / Math.max(1, devices.length * 2.5))) : 0;
  const carbonIntensity = devices.length ? Math.round(GRID_EMISSION_FACTOR_KGCO2_PER_KWH * 1000) : 0;
  const efficiencyNotes = useMemo(() => {
    if (!devices.length) return [] as Array<{ title: string; detail: string }>;

    return devices
      .filter((device) => device.status !== "online")
      .slice(0, 3)
      .map((device) => ({
        title:
          device.status === "fault"
            ? "Power quality issue detected"
            : device.status === "stale"
              ? "Telemetry refresh overdue"
              : "Device connectivity issue",
        detail:
          device.status === "fault"
            ? `${device.name} is reporting a fault condition. Review current draw, relay state and protection thresholds.`
            : device.status === "stale"
              ? `${device.name} has stale telemetry. Refresh the latest reading before changing scheduling or demand plans.`
              : `${device.name} is offline. Confirm the gateway or network link before resuming normal control.`,
      }));
  }, [devices]);

  return (
    <AppShell title="Energy" subtitle={`Consumption analytics · ${platformSettings.timezone}`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Month to date" value={monthToDateKwh.toLocaleString()} unit="kWh" icon={Gauge} tone="primary" />
        <StatCard label="Peak demand" value={peakDemand.toFixed(1)} unit="kW" icon={Zap} tone="warning" />
        <StatCard label="Load factor" value={loadFactor.toFixed(2)} icon={Timer} />
        <StatCard label="Carbon intensity" value={String(carbonIntensity)} unit="gCO₂/kWh" icon={Leaf} />
      </div>

      <section className="card-surface mt-6 p-5">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Consumption vs cost</h2>
            <p className="text-xs text-muted-foreground">Switch the chart to hours, days, weeks or months</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["hours", "days", "weeks", "months"] as ChartRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setChartRange(range)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-medium capitalize transition-colors",
                  chartRange === range
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -18, right: 4, top: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="kwh" name="kWh" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cost" name="Cost (K)" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <TimeOfUseExplorer />

      {/* Detailed Telemetry Table */}
      {allTelemetry && allTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold mb-4">Detailed readings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date & Time</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Power (kW)</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Energy (kWh)</th>
                </tr>
              </thead>
              <tbody>
                {allTelemetry.slice(0, 20).map((point) => {
                  const date = new Date(point.ts);
                  const dateStr = date.toLocaleDateString();
                  const timeStr = date.toLocaleTimeString();
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3">{point.deviceName || 'Unknown'}</td>
                      <td className="py-2 px-3 text-muted-foreground">{dateStr} {timeStr}</td>
                      <td className="text-right py-2 px-3">{(point.power / 1000).toFixed(2)}</td>
                      <td className="text-right py-2 px-3">{((point.power / 1000) * 0.25).toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {allTelemetry.length > 20 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing 20 of {allTelemetry.length} readings. Load more to see earlier data.
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Consumption by site</h2>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteBreakdown} margin={{ left: -18, right: 4, top: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="site" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="kwh" name="kWh" radius={[6, 6, 0, 0]}>
                  {siteBreakdown.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-4)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Efficiency notes</h2>
          {efficiencyNotes.length ? (
            <ul className="mt-4 space-y-4 text-sm">
              {efficiencyNotes.map((note) => (
                <li key={note.title}>
                  <p className="font-medium">{note.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No efficiency issues were detected from the live device data yet.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
