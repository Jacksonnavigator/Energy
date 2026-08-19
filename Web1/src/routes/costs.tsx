import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PiggyBank, Receipt, TrendingDown, Wallet } from "lucide-react";
import { AppShell } from "@/components/hydranet/AppShell";
import { StatCard } from "@/components/hydranet/StatCard";
import { EMPTY_TELEMETRY_MSG, useHydranetDashboardData } from "@/lib/dashboard-data";

export const Route = createFileRoute("/costs")({
  head: () => ({
    meta: [
      { title: "Cost Management | Smart Energy" },
      {
        name: "description",
        content: "Track energy spend against budget, tariff bands and per-site cost allocation for connected assets.",
      },
      { property: "og:title", content: "Cost Management | Smart Energy" },
      { property: "og:description", content: "Energy spend, budget variance and per-site cost allocation." },
    ],
  }),
  component: CostsPage,
});

function CostsPage() {
  const { costTrend, siteBreakdown, platformSettings, currency, recentTelemetry, formatTelemetryDateTime, recommendations, tariffPerKwh, getPointKwh, EMPTY_TELEMETRY_MSG: emptyMsg } =
    useHydranetDashboardData();
  const monthToDate = siteBreakdown.reduce((sum, site) => sum + site.cost, 0);
  const totalSiteSpend = siteBreakdown.reduce((sum, site) => sum + site.cost, 0);
  const budgetRemaining = Math.max(0, (platformSettings.monthlyBudget || platformSettings.maxDailyCost * 30) - monthToDate);
  const avgRate = tariffPerKwh;
  const savingsIdentified = recommendations.reduce((sum, rec) => sum + rec.savingTzs, 0);

  return (
    <AppShell title="Costs" subtitle={`Spend and budget variance · ${costTrend.length || 0} periods tracked`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Month to date" value={currency(monthToDate)} icon={Wallet} tone="primary" />
        <StatCard label="Budget remaining" value={currency(budgetRemaining)} icon={PiggyBank} />
        <StatCard label="Avg. unit cost" value={String(avgRate)} unit="TZS/kWh" icon={Receipt} />
        <StatCard label="Savings identified" value={currency(savingsIdentified)} icon={TrendingDown} />
      </div>

      <section className="card-surface mt-6 p-5">
        <h2 className="text-sm font-semibold">Spend vs budget</h2>
        <p className="text-xs text-muted-foreground">Monthly totals in TZS</p>
        <div className="mt-5 h-72">
          {costTrend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costTrend} margin={{ left: 4, right: 4, top: 8 }}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis width={64} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Area type="monotone" dataKey="cost" name="Spend" stroke="var(--chart-1)" strokeWidth={2} fill="url(#costFill)" />
                <Line type="monotone" dataKey="budget" name="Budget" stroke="var(--chart-2)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{emptyMsg}</p>
          )}
        </div>
      </section>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Cost allocation by site</h2>
        </div>
        <ul className="divide-y divide-border">
          {siteBreakdown.map((s) => {
            const share = totalSiteSpend > 0 ? Math.round((s.cost / totalSiteSpend) * 100) : 0;
            return (
              <li key={s.site} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.site}</p>
                  <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{currency(s.cost)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{share}% · {s.kwh} kWh</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {recentTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold">Live cost readings</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Device</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Time</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Power</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {recentTelemetry.slice(0, 20).map((point) => {
                  const kwh = getPointKwh(point);
                  const estimatedCost = kwh * tariffPerKwh;
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3">{point.deviceName || "Unknown"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{formatTelemetryDateTime(point.ts)}</td>
                      <td className="text-right py-2 px-3">{(point.power / 1000).toFixed(2)} kW</td>
                      <td className="text-right py-2 px-3">{currency(estimatedCost)}</td>
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
