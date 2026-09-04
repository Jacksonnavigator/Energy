import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/hydranet/AppShell";
import { Switch } from "@/components/ui/switch";
import {
  savePlatformSettings,
  useHydranetDashboardData,
  type PlatformSettings,
} from "@/lib/dashboard-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Platform Settings | Smart Energy" },
      {
        name: "description",
        content:
          "Configure organisation details, tariff rates and notification channels for Smart Energy.",
      },
      { property: "og:title", content: "Platform Settings | Smart Energy" },
      {
        property: "og:description",
        content: "Manage tariffs, thresholds and notification preferences.",
      },
    ],
  }),
  component: SettingsPage,
});

function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label-eyebrow">{label}</span>
      <span className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onCheckedChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingsPage() {
  const { platformSettings } = useHydranetDashboardData();
  const [form, setForm] = useState<PlatformSettings>(platformSettings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(platformSettings);
  }, [platformSettings]);

  const updateField = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePlatformSettings(form);
      toast.success("Platform settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Settings"
      subtitle={`Organisation, tariffs, thresholds and notifications · ${platformSettings.timezone}`}
      actions={
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Organisation</h2>
          <div className="mt-5 space-y-4">
            <Field
              label="Organisation name"
              value={form.orgName}
              onChange={(v) => updateField("orgName", v)}
              placeholder="Not configured"
            />
            <Field
              label="Primary contact"
              value={form.primaryContact}
              onChange={(v) => updateField("primaryContact", v)}
              placeholder="Not configured"
            />
            <Field
              label="Reporting timezone"
              value={form.timezone}
              onChange={(v) => updateField("timezone", v)}
            />
          </div>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Tariff & thresholds</h2>
          <div className="mt-5 space-y-4">
            <Field
              label="Unit rate"
              value={String(form.tariffPerKwh)}
              onChange={(v) => updateField("tariffPerKwh", Number(v) || 0)}
              suffix="TZS/kWh"
              type="number"
            />
            <Field
              label="Grid emissions factor"
              value={String(form.emissionFactorKgCo2PerKwh)}
              onChange={(v) => updateField("emissionFactorKgCo2PerKwh", Number(v) || 0)}
              suffix="kgCO2/kWh"
              type="number"
            />
            <Field
              label="Monthly budget"
              value={String(form.monthlyBudget)}
              onChange={(v) => updateField("monthlyBudget", Number(v) || 0)}
              suffix="TZS"
              type="number"
            />
            <Field
              label="Max rated power"
              value={String(form.maxPower)}
              onChange={(v) => updateField("maxPower", Number(v) || 0)}
              suffix="W"
              type="number"
            />
            <Field
              label="Max daily cost"
              value={String(form.maxDailyCost)}
              onChange={(v) => updateField("maxDailyCost", Number(v) || 0)}
              suffix="TZS"
              type="number"
            />
            <Field
              label="Max daily energy"
              value={String(form.maxDailyEnergy)}
              onChange={(v) => updateField("maxDailyEnergy", Number(v) || 0)}
              suffix="kWh"
              type="number"
            />
          </div>
        </section>
      </div>

      <section className="card-surface mt-4 p-5">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <div className="mt-2 divide-y divide-border">
          <ToggleRow
            title="Weekly digest"
            desc="Consumption and cost summary every Monday 07:00"
            checked={form.notifications.weeklyDigest}
            onCheckedChange={(v) =>
              updateField("notifications", { ...form.notifications, weeklyDigest: v })
            }
          />
          <ToggleRow
            title="Relay change confirmations"
            desc="Send a receipt whenever an asset is switched"
            checked={form.notifications.relayConfirmations}
            onCheckedChange={(v) =>
              updateField("notifications", { ...form.notifications, relayConfirmations: v })
            }
          />
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
