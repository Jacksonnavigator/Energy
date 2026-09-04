import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Gauge, Leaf, Timer, Zap } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import {
  EMPTY_TELEMETRY_MSG,
  getComparisonPeriodRange,
  useHydranetDashboardData,
  type ComparisonPeriod,
  type EnergyChartRange,
  type TouPeriod,
} from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/energy")({
  head: () => ({
    meta: [
      { title: "Energy Analytics | Smart Energy" },
      {
        name: "description",
        content:
          "Consumption profiles, peak demand, load factor and site-level energy breakdown for connected assets.",
      },
      { property: "og:title", content: "Energy Analytics | Smart Energy" },
      {
        property: "og:description",
        content: "Analyse consumption, peak demand and load factor across every site.",
      },
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
function TimeOfUseExplorer() {
  const {
    hourlyProfile,
    touBands,
    currency,
    EMPTY_TELEMETRY_MSG: emptyMsg,
  } = useHydranetDashboardData();
  const [filter, setFilter] = useState<TouPeriod | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "hour",
    dir: "asc",
  });

  const rows = useMemo(() => {
    const base = hourlyProfile.filter((h) => filter === "all" || h.period === filter);
    return [...base].sort((a, b) =>
      sort.dir === "asc" ? a[sort.key] - b[sort.key] : b[sort.key] - a[sort.key],
    );
  }, [filter, hourlyProfile, sort]);

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
            Choose a tariff band to compare peak, standard and off-peak usage · East Africa Time
            (UTC+3)
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [{ id: "all", label: "All hours" }, ...touBands] as {
              id: TouPeriod | "all";
              label: string;
            }[]
          ).map((b) => (
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
              {totalKwh > 0 ? Math.round((b.kwh / totalKwh) * 100) : 0}% of day · avg{" "}
              {b.avg.toFixed(0)} kWh/h · {currency(b.cost)}
            </p>
          </div>
        ))}
      </div>

      <div className="h-64 px-2 py-4">
        {hourlyProfile.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...rows].sort((a, b) => a.hour - b.hour)}
              margin={{ left: -18, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="t"
                tickLine={false}
                axisLine={false}
                interval={filter === "all" ? 2 : 0}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
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
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyMsg}
          </p>
        )}
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs">
              <th className="px-5 py-2.5 text-left font-medium">
                <SortButton k="hour" label="Hour" />
              </th>
              <th className="px-5 py-2.5 text-left font-medium text-muted-foreground">Band</th>
              <th className="px-5 py-2.5 text-right font-medium">
                <SortButton k="kwh" label="Energy (kWh)" />
              </th>
              <th className="px-5 py-2.5 text-right font-medium">
                <SortButton k="cost" label="Cost" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((h) => (
              <tr key={h.hour} className="transition-colors hover:bg-secondary/40">
                <td className="px-5 py-2.5 font-medium tabular-nums">{h.t}</td>
                <td className="px-5 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{
                      background: `color-mix(in oklab, ${periodColor[h.period]} 14%, transparent)`,
                      color: periodColor[h.period],
                    }}
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

const DEVICE_LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function eatDateInputValue(ts: number): string {
  const eat = new Date(ts + 3 * 60 * 60 * 1000);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const d = String(eat.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function DeviceComparisonChart() {
  const {
    devices,
    getDeviceComparisonSeries,
    EMPTY_TELEMETRY_MSG: emptyMsg,
  } = useHydranetDashboardData();
  const [period, setPeriod] = useState<ComparisonPeriod>("week");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const weekRange = getComparisonPeriodRange("week");
  const [customFrom, setCustomFrom] = useState(() => eatDateInputValue(weekRange.startMs));
  const [customTo, setCustomTo] = useState(() => eatDateInputValue(weekRange.endMs));

  const { startMs, endMs } = useMemo(() => {
    if (period === "custom") {
      const fromMs = new Date(`${customFrom}T00:00:00+03:00`).getTime();
      const toMs = new Date(`${customTo}T23:59:59+03:00`).getTime();
      return getComparisonPeriodRange("custom", { fromMs, toMs });
    }
    return getComparisonPeriodRange(period);
  }, [period, customFrom, customTo]);

  const chartData = useMemo(
    () => getDeviceComparisonSeries(selectedDeviceIds, startMs, endMs),
    [getDeviceComparisonSeries, selectedDeviceIds, startMs, endMs],
  );

  const activeDevices = useMemo(() => {
    if (!selectedDeviceIds.length) return devices;
    return devices.filter((device) => selectedDeviceIds.includes(device.id));
  }, [devices, selectedDeviceIds]);

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((current) =>
      current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId],
    );
  };

  const periodPresets: { id: ComparisonPeriod; label: string }[] = [
    { id: "hour", label: "Last hour" },
    { id: "day", label: "Last 24h" },
    { id: "week", label: "Last 7 days" },
    { id: "month", label: "Last 30 days" },
    { id: "custom", label: "Custom" },
  ];

  const showTotalLine = activeDevices.length >= 2;

  return (
    <section className="card-surface border-primary/30 p-5 shadow-sm ring-1 ring-primary/15">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Device comparison</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare selected devices or the full fleet on one chart · pick hour, day, week, month or
            custom dates
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDeviceIds([])}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
              selectedDeviceIds.length === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            All devices
          </button>
          {devices.map((device) => {
            const active = selectedDeviceIds.length === 0 || selectedDeviceIds.includes(device.id);
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => toggleDevice(device.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  active && selectedDeviceIds.length > 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : selectedDeviceIds.length === 0
                      ? "border-border text-muted-foreground hover:text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {device.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {periodPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPeriod(preset.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                period === preset.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}
          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
                />
              </label>
              <label className="flex items-center gap-1.5">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 h-80">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -18, right: 4, top: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
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
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {activeDevices.map((device, index) => (
                <Line
                  key={device.id}
                  type="monotone"
                  dataKey={device.id}
                  name={device.name}
                  stroke={DEVICE_LINE_COLORS[index % DEVICE_LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
              {showTotalLine && (
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyMsg}
          </p>
        )}
      </div>
    </section>
  );
}

function EnergyPage() {
  const {
    siteBreakdown,
    devices,
    platformSettings,
    dashboardSummary,
    currency,
    recentTelemetry,
    formatTelemetryDateTime,
    getEnergyChartSeries,
    getPointKwh,
    GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
    EMPTY_TELEMETRY_MSG: emptyMsg,
  } = useHydranetDashboardData();
  const [chartRange, setChartRange] = useState<EnergyChartRange>("hours");

  const chartData = getEnergyChartSeries(chartRange);

  const monthToDateKwh = dashboardSummary.monthToDateKwh;
  const peakDemand = dashboardSummary.peakDemandKw;
  const loadFactor = dashboardSummary.loadFactor;
  const carbonIntensity = dashboardSummary.carbonIntensityGCo2PerKwh;
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
      <DeviceComparisonChart />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Month to date"
          value={monthToDateKwh.toLocaleString()}
          unit="kWh"
          icon={Gauge}
          tone="primary"
        />
        <StatCard
          label="Peak demand"
          value={peakDemand.toFixed(1)}
          unit="kW"
          icon={Zap}
          tone="warning"
        />
        <StatCard label="Load factor" value={loadFactor.toFixed(2)} icon={Timer} />
        <StatCard
          label="Carbon intensity"
          value={String(carbonIntensity)}
          unit="gCO₂/kWh"
          icon={Leaf}
        />
      </div>

      <section className="card-surface mt-6 p-5">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Consumption vs cost</h2>
            <p className="text-xs text-muted-foreground">
              Switch the chart to hours, days, weeks or months
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["hours", "days", "weeks", "months"] as EnergyChartRange[]).map((range) => (
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
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: -18, right: 4, top: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="kwh"
                  name="kWh"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  name="Cost (K)"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {emptyMsg}
            </p>
          )}
        </div>
      </section>

      <TimeOfUseExplorer />

      {/* Detailed Telemetry Table */}
      {recentTelemetry && recentTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold mb-4">Detailed readings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                    Date & Time
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                    Power (kW)
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                    Energy (kWh)
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentTelemetry.slice(0, 20).map((point) => {
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3">{point.deviceName || "Unknown"}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {formatTelemetryDateTime(point.ts)}
                      </td>
                      <td className="text-right py-2 px-3">{(point.power / 1000).toFixed(2)}</td>
                      <td className="text-right py-2 px-3">{getPointKwh(point).toFixed(3)}</td>
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

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Consumption by site</h2>
          <div className="mt-5 h-64">
            {siteBreakdown.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={siteBreakdown} margin={{ left: -18, right: 4, top: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="site"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={tooltipStyle} />
                  <Bar dataKey="kwh" name="kWh" radius={[6, 6, 0, 0]}>
                    {siteBreakdown.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-4)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {emptyMsg}
              </p>
            )}
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
            <p className="mt-4 text-sm text-muted-foreground">
              No efficiency issues were detected from the live device data yet.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
