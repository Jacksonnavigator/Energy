import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/hydranet/AppShell";
import { Switch } from "@/components/ui/switch";
import { useHydranetDashboardData } from "@/lib/dashboard-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Platform Settings | Smart Energy" },
      {
        name: "description",
        content: "Configure organisation details, tariff rates, alert thresholds and notification channels for Smart Energy.",
      },
      { property: "og:title", content: "Platform Settings | Smart Energy" },
      { property: "og:description", content: "Manage tariffs, thresholds and notification preferences." },
    ],
  }),
  component: SettingsPage,
});

function Field({ label, defaultValue, suffix, placeholder }: { label: string; defaultValue?: string; suffix?: string; placeholder?: string }) {
    return (
      <label className="block">
        <span className="label-eyebrow">{label}</span>
        <span className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3">
          <input
            defaultValue={defaultValue}
            placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

function ToggleRow({ title, desc, initial }: { title: string; desc: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
  );
}

function SettingsPage() {
  const { platformSettings } = useHydranetDashboardData();

  return (
    <AppShell
      title="Settings"
      subtitle={`Organisation, tariffs, thresholds and notifications · ${platformSettings.timezone}`}
      actions={
        <button className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
          Save changes
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Organisation</h2>
          <div className="mt-5 space-y-4">
            <Field label="Organisation name" defaultValue={platformSettings.timezone ? "" : ""} placeholder="Not configured" />
            <Field label="Primary contact" defaultValue="" placeholder="Not configured" />
            <Field label="Reporting timezone" defaultValue={platformSettings.timezone} />
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Tariff & thresholds</h2>
          <div className="mt-5 space-y-4">
            <Field label="Unit rate" defaultValue={String(platformSettings.tariffPerKwh || 0)} suffix="TZS/kWh" />
            <Field label="Monthly budget" defaultValue={String(platformSettings.maxDailyCost * 30 || 0)} suffix="TZS" />
            <Field label="Overload warning" defaultValue={String(platformSettings.maxPower ? 85 : 0)} suffix="% of rated" />
            <Field label="Stale telemetry timeout" defaultValue="0" suffix="minutes" />
            <Field label="Relay command timeout" defaultValue="0" suffix="seconds" />
          </div>
        </section>
      </div>

      <section className="card-surface mt-4 p-5">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <div className="mt-2 divide-y divide-border">
          <ToggleRow title="Critical fault alerts" desc="Email and SMS the on-call operator immediately" initial />
          <ToggleRow title="Threshold warnings" desc="Notify when load or power factor breaches limits" initial />
          <ToggleRow title="Weekly digest" desc="Consumption and cost summary every Monday 07:00" initial />
          <ToggleRow title="Relay change confirmations" desc="Send a receipt whenever an asset is switched" initial={false} />
        </div>
      </section>

      <section className="card-surface mt-4 p-5">
        <h2 className="text-sm font-semibold">Danger zone</h2>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <p className="min-w-0 text-xs text-muted-foreground">
            Deregistering removes all devices and permanently deletes historical telemetry.
          </p>
          <button className="shrink-0 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10">
            Deregister account
          </button>
        </div>
      </section>
    </AppShell>
  );
}
