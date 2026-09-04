import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LucideIcon } from "lucide-react";
import { Calculator, Clock, MapPin, PiggyBank, Receipt, Wallet } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import { useHydranetDashboardData } from "@/lib/dashboard-data";

export const Route = createFileRoute("/costs")({
  head: () => ({
    meta: [
      { title: "Cost Management | Smart Energy" },
      {
        name: "description",
        content:
          "Track energy spend against budget, tariff bands and per-site cost allocation for connected assets.",
      },
      { property: "og:title", content: "Cost Management | Smart Energy" },
      {
        property: "og:description",
        content: "Energy spend, budget variance and per-site cost allocation.",
      },
    ],
  }),
  component: CostsPage,
});

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value);
}

function CostFact({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border py-3 last:border-b-0">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function CostsPage() {
  const {
    costTrend,
    siteBreakdown,
    platformSettings,
    dashboardSummary,
    currency,
    recentTelemetry,
    formatTelemetryDateTime,
    recommendations,
    tariffPerKwh,
    touBands,
    getPointKwh,
    EMPTY_TELEMETRY_MSG: emptyMsg,
  } = useHydranetDashboardData();

  const monthToDate = dashboardSummary.monthToDateCost;
  const budgetRemaining = dashboardSummary.budgetRemaining;
  const dailyBudget = platformSettings.monthlyBudget > 0 ? platformSettings.monthlyBudget / 30 : 0;
  const todayCost = dashboardSummary.energyTodayKwh * tariffPerKwh;
  const savingsIdentified = recommendations.reduce((sum, rec) => sum + rec.savingTzs, 0);
  const measuredCostTrend = costTrend.length > 0;

  const displayCostTrend = useMemo(() => {
    if (costTrend.length) return costTrend;

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        m: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        cost: 0,
        budget: Number(dailyBudget.toFixed(0)),
      };
    });
  }, [costTrend, dailyBudget]);

  const tariffRows = useMemo(
    () =>
      touBands.map((band) => ({
        ...band,
        rate: Math.round(tariffPerKwh * band.multiplier),
      })),
    [tariffPerKwh, touBands],
  );

  return (
    <AppShell
      title="Costs"
      subtitle={`Tanzania spend control - ${measuredCostTrend ? `${costTrend.length} periods tracked` : "budget baseline ready"}`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Month to date"
          value={currency(monthToDate)}
          icon={Wallet}
          tone="primary"
        />
        <StatCard label="Today" value={currency(todayCost)} icon={Calculator} />
        <StatCard
          label="Avg. unit cost"
          value={formatNumber(tariffPerKwh)}
          unit="TZS/kWh"
          icon={Receipt}
        />
        <StatCard label="Budget remaining" value={currency(budgetRemaining)} icon={PiggyBank} />
      </div>

      <section className="card-surface mt-6 p-5">
        <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <h2 className="text-sm font-semibold">Spend vs budget</h2>
            <p className="text-xs text-muted-foreground">
              {measuredCostTrend
                ? "Measured energy cost in Tanzanian shillings"
                : "Budget line shown while the dashboard waits for cost-bearing telemetry"}
            </p>
          </div>
          <p className="text-xs font-medium text-muted-foreground tabular-nums">
            Daily budget {currency(dailyBudget)}
          </p>
        </div>
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayCostTrend} margin={{ left: 4, right: 4, top: 8 }}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="m"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="cost"
                name="Spend"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#costFill)"
              />
              <Line
                type="monotone"
                dataKey="budget"
                name="Budget"
                stroke="var(--chart-2)"
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card-surface mt-6 p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold">Tanzania billing basis</h2>
            <p className="text-xs text-muted-foreground">
              Costs use TZS, East Africa Time and the editable platform tariff.
            </p>
            <div className="mt-4">
              <CostFact
                icon={Receipt}
                label="Default unit rate"
                value={`${formatNumber(tariffPerKwh)} TZS/kWh`}
                detail="Used for live cost, reports and projections"
              />
              <CostFact
                icon={Clock}
                label="Billing timezone"
                value={platformSettings.timezone}
                detail="Daily and monthly periods align to Tanzania operations"
              />
              <CostFact
                icon={PiggyBank}
                label="Monthly budget"
                value={currency(platformSettings.monthlyBudget)}
                detail={`${currency(dailyBudget)} available per operating day`}
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Tariff bands</h2>
            <p className="text-xs text-muted-foreground">
              Multipliers apply to the configured TZS/kWh rate for local operating windows.
            </p>
            <div className="mt-4 divide-y divide-border">
              {tariffRows.map((band) => (
                <div key={band.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{band.label}</p>
                    <p className="text-xs text-muted-foreground">{band.window}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(band.rate)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">TZS/kWh</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Cost allocation by site</h2>
        </div>
        <ul className="divide-y divide-border">
          {siteBreakdown.length ? (
            siteBreakdown.map((site) => {
              const share = monthToDate > 0 ? Math.round((site.cost / monthToDate) * 100) : 0;
              return (
                <li
                  key={site.site}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{site.site}</p>
                    <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{currency(site.cost)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {share}% - {site.kwh} kWh
                    </p>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-5 py-5">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-muted-foreground">
                <MapPin className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">Awaiting site energy readings</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Site costs will appear as soon as devices report energy to Firestore.
                </p>
              </div>
            </li>
          )}
        </ul>
      </section>

      <section className="card-surface mt-6 p-5">
        <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <h2 className="text-sm font-semibold">Live cost readings</h2>
            <p className="text-xs text-muted-foreground">
              Each row uses the database energy value multiplied by the Tanzania tariff.
            </p>
          </div>
          <p className="text-xs font-medium text-success tabular-nums">
            Savings identified {currency(savingsIdentified)}
          </p>
        </div>
        {recentTelemetry.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Device</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Power</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Energy</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {recentTelemetry.slice(0, 20).map((point) => {
                  const kwh = getPointKwh(point);
                  const estimatedCost = kwh * tariffPerKwh;
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-3 py-2">{point.deviceName || "Unknown"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatTelemetryDateTime(point.ts)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {(point.power / 1000).toFixed(2)} kW
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{kwh.toFixed(3)} kWh</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {currency(estimatedCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyMsg}
          </p>
        )}
      </section>
    </AppShell>
  );
}
