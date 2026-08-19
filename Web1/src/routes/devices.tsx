import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/hydranet/AppShell";
import { Switch } from "@/components/ui/switch";
import { sendRelayCommand, useHydranetDashboardData, type DeviceStatus } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "Connected Devices | Smart Energy" },
      {
        name: "description",
        content: "Inventory and live state of every connected electrical asset, including relay control and load telemetry.",
      },
      { property: "og:title", content: "Connected Devices | Smart Energy" },
      { property: "og:description", content: "Monitor and switch relay-controlled assets across all sites." },
    ],
  }),
  component: DevicesPage,
});

const statusStyles: Record<DeviceStatus, string> = {
  online: "bg-success/12 text-success",
  offline: "bg-secondary text-muted-foreground",
  fault: "bg-destructive/12 text-destructive",
  stale: "bg-warning/12 text-warning",
};

const commandStyles: Record<string, string> = {
  idle: "text-muted-foreground",
  pending: "text-warning",
  confirmed: "text-success",
  failed: "text-destructive",
};

function DevicesPage() {
  const { devices, recentTelemetry, formatTelemetryDateTime } = useHydranetDashboardData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | DeviceStatus>("all");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const visible = devices.filter(
    (d) =>
      (filter === "all" || d.status === filter) &&
      (d.name + d.id + d.site).toLowerCase().includes(query.toLowerCase()),
  );

  const uniqueSites = new Set(devices.map((d) => d.site)).size;

  const toggleRelay = async (id: string) => {
    const target = devices.find((d) => d.id === id);
    if (!target) return;
    const turnOn = !target.relay;
    const ok = window.confirm(
      `Send relay ${turnOn ? "ON" : "OFF"} command to ${target.name} (${target.id})?`,
    );
    if (!ok) return;

    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await sendRelayCommand(id, turnOn);
      toast.success(`Relay ${turnOn ? "ON" : "OFF"} command sent to ${target.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send relay command");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <AppShell title="Devices" subtitle={`${devices.length} connected assets across ${uniqueSites} site${uniqueSites !== 1 ? "s" : ""}`}>
      <div className="card-surface p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, ID or site"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="flex shrink-0 gap-1 rounded-lg bg-secondary p-1">
            {(["all", "online", "stale", "fault", "offline"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3 lg:hidden">
        {visible.map((d) => (
          <div key={d.id} className="card-surface p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.id} · {d.site}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize", statusStyles[d.status])}>
                {d.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
              <div>
                <p className="label-eyebrow">Load</p>
                <p className="mt-1 font-semibold tabular-nums">{d.load.toFixed(1)} kW</p>
              </div>
              <div>
                <p className="label-eyebrow">Today</p>
                <p className="mt-1 font-semibold tabular-nums">{d.todayKwh} kWh</p>
              </div>
              <div>
                <p className="label-eyebrow">Current</p>
                <p className="mt-1 font-semibold tabular-nums">{d.current.toFixed(1)} A</p>
              </div>
              <div>
                <p className="label-eyebrow">PF</p>
                <p className="mt-1 font-semibold tabular-nums">{d.power_factor.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                Relay ·{" "}
                <span className={cn("capitalize", commandStyles[pendingIds.has(d.id) ? "pending" : d.command])}>
                  {pendingIds.has(d.id) ? "pending" : d.command}
                </span>
              </span>
              <Switch
                checked={d.relay}
                onCheckedChange={() => toggleRelay(d.id)}
                disabled={d.status === "offline" || pendingIds.has(d.id)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="card-surface mt-4 hidden overflow-hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left">
              {["Device", "Status", "Load", "Voltage", "Current", "PF", "Today", "Last seen", "Command", "Relay"].map((h) => (
                <th key={h} className="label-eyebrow px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.id} · {d.site}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium capitalize", statusStyles[d.status])}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{d.load.toFixed(1)} kW</td>
                <td className="px-4 py-3 tabular-nums">{d.voltage} V</td>
                <td className="px-4 py-3 tabular-nums">{d.current.toFixed(1)} A</td>
                <td className="px-4 py-3 tabular-nums">{d.power_factor.toFixed(2)}</td>
                <td className="px-4 py-3 tabular-nums">{d.todayKwh} kWh</td>
                <td className="px-4 py-3 text-muted-foreground">{d.lastSeen}</td>
                <td className={cn("px-4 py-3 text-xs font-medium capitalize", commandStyles[pendingIds.has(d.id) ? "pending" : d.command])}>
                  {pendingIds.has(d.id) ? "pending" : d.command}
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={d.relay}
                    onCheckedChange={() => toggleRelay(d.id)}
                    disabled={d.status === "offline" || pendingIds.has(d.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No devices match this filter.</p>}
      </div>

      {recentTelemetry.length > 0 && (
        <section className="card-surface mt-6 p-5">
          <h2 className="text-sm font-semibold">Detailed telemetry</h2>
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
                {recentTelemetry.slice(0, 20).map((point) => {
                  return (
                    <tr key={point.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 px-3">{point.deviceName || "Unknown"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{formatTelemetryDateTime(point.ts)}</td>
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
