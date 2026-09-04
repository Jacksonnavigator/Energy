import {
  collection,
  collectionGroup,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "./firebase";
import {
  alignBucketStartEat,
  bucketIntegratedKwh,
  buildDeviceTelemetryIndex,
  dedupeTelemetryPoints,
  EAT_OFFSET_MS,
  getEatHour,
  integrateKwhBetween,
  resolveKwhBetween,
  normalizePowerW,
  rowKwhFromDeviceIndex,
} from "./telemetry-utils";

export type DeviceStatus = "online" | "offline" | "fault" | "stale";
export type CommandState = "idle" | "pending" | "confirmed" | "failed";

export type TelemetryPoint = {
  id: string;
  ts: number;
  power: number;
  voltage?: number;
  current?: number;
  energy?: number;
  pf?: number;
  deviceId?: string;
  deviceName?: string;
};

export type Device = {
  id: string;
  name: string;
  site: string;
  status: DeviceStatus;
  relay: boolean;
  load: number;
  voltage: number;
  current: number;
  power_factor: number;
  todayKwh: number;
  lastSeen: string;
  lastSeenMs: number;
  ratedKw: number;
  command: CommandState;
  telemetry?: TelemetryPoint[];
  latestReading?: TelemetryPoint;
  energySource?: string;
};

export type Recommendation = {
  id: string;
  title: string;
  detail: string;
  device: string;
  savingKwh: number;
  savingTzs: number;
  co2SavedKg: number;
  priority: "high" | "medium" | "low";
  category: string;
};

export type Incident = {
  id: string;
  title: string;
  device: string;
  severity: "critical" | "warning" | "info";
  detected: string;
  duration: string;
  rootCause: string;
};

export type TouPeriod = "peak" | "standard" | "offpeak";

export type RenewableMixEntry = {
  source: string;
  pct: number;
  color: string;
};

export type PlatformSettings = {
  timezone: string;
  currency: "TZS";
  tariffPerKwh: number;
  emissionFactorKgCo2PerKwh: number;
  maxPower: number;
  maxDailyCost: number;
  maxDailyEnergy: number;
  orgName: string;
  primaryContact: string;
  renewableMix: RenewableMixEntry[];
  monthlyBudget: number;
  notifications: {
    criticalFaults: boolean;
    thresholdWarnings: boolean;
    weeklyDigest: boolean;
    relayConfirmations: boolean;
  };
};

export type ExportRecord = {
  id: string;
  name: string;
  format: string;
  size: string;
  created: string;
  createdAtMs: number;
  status: string;
  rowCount?: number;
  actor?: string;
};

export type ActivityRecord = {
  id: string;
  action: string;
  target: string;
  actor: string;
  time: string;
  state: string;
};

export const TARIFF_TZS_PER_KWH = 292;
export const TIMEZONE = "Africa/Dar_es_Salaam (UTC+3)";
export const GRID_EMISSION_FACTOR_KGCO2_PER_KWH = 0.43;

export const TELEMETRY_TIMEZONE = "Africa/Dar_es_Salaam";

export function formatTelemetryDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TELEMETRY_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

export function formatTelemetryTime(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TELEMETRY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

export function formatTelemetryDate(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TELEMETRY_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(new Date(ts));
}

const ENERGY_SOURCE_COLORS: Record<string, string> = {
  hydro: "var(--chart-3)",
  solar: "var(--chart-1)",
  "solar pv": "var(--chart-1)",
  wind: "var(--chart-4)",
  biogas: "var(--chart-4)",
  thermal: "var(--chart-2)",
  grid: "var(--chart-2)",
  diesel: "var(--chart-5)",
  gas: "var(--chart-5)",
};

const defaultPlatformSettings: PlatformSettings = {
  timezone: TIMEZONE,
  currency: "TZS",
  tariffPerKwh: TARIFF_TZS_PER_KWH,
  emissionFactorKgCo2PerKwh: GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
  maxPower: 10000,
  maxDailyCost: 50000,
  maxDailyEnergy: 200,
  orgName: "HydraNet Tanzania Operations",
  primaryContact: "Operations team",
  renewableMix: [],
  monthlyBudget: 1500000,
  notifications: {
    criticalFaults: true,
    thresholdWarnings: true,
    weeklyDigest: true,
    relayConfirmations: false,
  },
};

function numberFromConfig(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function positiveNumberFromConfig(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function normalizeRenewableMix(raw: unknown): { mix: RenewableMixEntry[]; configured: boolean } {
  if (!Array.isArray(raw) || raw.length === 0) return { mix: [], configured: false };
  return {
    configured: true,
    mix: raw.map((entry, index) => {
      const item = entry as Record<string, unknown>;
      return {
        source: String(item.source ?? `Source ${index + 1}`),
        pct: Number(item.pct ?? 0),
        color: String(item.color ?? `var(--chart-${(index % 5) + 1})`),
      };
    }),
  };
}

function normalizePlatformSettings(raw: Record<string, unknown> | null): PlatformSettings {
  const notifications = (raw?.notifications ?? {}) as Record<string, unknown>;
  return {
    timezone: String(raw?.timezone ?? defaultPlatformSettings.timezone),
    currency: "TZS",
    tariffPerKwh: positiveNumberFromConfig(raw?.tariffPerKwh, defaultPlatformSettings.tariffPerKwh),
    emissionFactorKgCo2PerKwh: positiveNumberFromConfig(
      raw?.emissionFactorKgCo2PerKwh ?? raw?.gridEmissionFactorKgCo2PerKwh,
      defaultPlatformSettings.emissionFactorKgCo2PerKwh,
    ),
    maxPower: positiveNumberFromConfig(raw?.maxPower, defaultPlatformSettings.maxPower),
    maxDailyCost: positiveNumberFromConfig(raw?.maxDailyCost, defaultPlatformSettings.maxDailyCost),
    maxDailyEnergy: positiveNumberFromConfig(
      raw?.maxDailyEnergy,
      defaultPlatformSettings.maxDailyEnergy,
    ),
    orgName: String(raw?.orgName ?? defaultPlatformSettings.orgName),
    primaryContact: String(raw?.primaryContact ?? defaultPlatformSettings.primaryContact),
    renewableMix: normalizeRenewableMix(raw?.renewableMix).mix,
    monthlyBudget: positiveNumberFromConfig(
      raw?.monthlyBudget,
      defaultPlatformSettings.monthlyBudget,
    ),
    notifications: {
      criticalFaults: Boolean(
        notifications.criticalFaults ?? defaultPlatformSettings.notifications.criticalFaults,
      ),
      thresholdWarnings: Boolean(
        notifications.thresholdWarnings ?? defaultPlatformSettings.notifications.thresholdWarnings,
      ),
      weeklyDigest: Boolean(
        notifications.weeklyDigest ?? defaultPlatformSettings.notifications.weeklyDigest,
      ),
      relayConfirmations: Boolean(
        notifications.relayConfirmations ??
        defaultPlatformSettings.notifications.relayConfirmations,
      ),
    },
  };
}

export type TimeRange = "hour" | "day" | "week" | "month";

export function getTimeRangeHours(range: TimeRange): number {
  switch (range) {
    case "hour":
      return 1;
    case "day":
      return 24;
    case "week":
      return 7 * 24;
    case "month":
      return 30 * 24;
  }
}

export const touBands: { id: TouPeriod; label: string; window: string; multiplier: number }[] = [
  { id: "peak", label: "Peak", window: "18:00 – 22:00", multiplier: 1.35 },
  { id: "standard", label: "Standard", window: "06:00 – 18:00", multiplier: 1.0 },
  { id: "offpeak", label: "Off-peak", window: "22:00 – 06:00", multiplier: 0.72 },
];

export const periodOf = (hour: number): TouPeriod =>
  hour >= 18 && hour < 22 ? "peak" : hour >= 6 && hour < 18 ? "standard" : "offpeak";

export const currency = (n: number) =>
  new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 0,
  }).format(n);

const STALE_MS = 5 * 60 * 1000;
const TELEMETRY_LIMIT = 500;
export const EMPTY_TELEMETRY_MSG =
  "No telemetry yet — readings appear when devices report to Firestore";

function normalizeTimestamp(value: unknown): Date | null {
  if (!value) return null;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof value === "number") return new Date(value < 1e12 ? value * 1000 : value);
  if (value instanceof Date) return value;
  return null;
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) return String(seconds) + "s ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return String(minutes) + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return String(hours) + "h ago";
  return String(Math.round(hours / 24)) + "d ago";
}

function formatRecordTime(ms: number): string {
  return ms > 0 ? formatRelativeTime(new Date(ms)) : "Unknown time";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  if (bytes < 1024) return String(bytes) + " B";
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}

function startOfEatDay(ts = Date.now()): number {
  return alignBucketStartEat(ts, 24 * 60 * 60 * 1000);
}

function startOfEatMonth(ts = Date.now()): number {
  const eatDate = new Date(ts + EAT_OFFSET_MS);
  return Date.UTC(eatDate.getUTCFullYear(), eatDate.getUTCMonth(), 1) - EAT_OFFSET_MS;
}

function deviceKwhBetween(
  device: Device,
  startMs: number,
  endMs: number,
  fallbackToday = false,
): number {
  const points = deviceTelemetryPoints(device);
  let kwh = resolveKwhBetween(points, startMs, endMs);
  if (kwh <= 0 && fallbackToday) kwh = Math.max(0, device.todayKwh);
  return kwh;
}

function normalizeDevice(id: string, raw: Record<string, unknown>, ratedKw: number): Device {
  const telemetry = (raw.lastTelemetry || raw.telemetry || {}) as Record<string, unknown>;
  const updatedAt =
    normalizeTimestamp(telemetry.ts) ||
    normalizeTimestamp(telemetry.receivedAt) ||
    normalizeTimestamp(raw.updatedAt) ||
    null;
  const stale = !!updatedAt && Date.now() - updatedAt.getTime() > STALE_MS;
  const isOnline = Boolean(raw.isOnline) && !stale;
  const desiredRelay = raw.desiredRelayState ? String(raw.desiredRelayState).toUpperCase() : null;
  const relayState = raw.relayState ? String(raw.relayState).toUpperCase() : null;
  const relay = relayState
    ? relayState === "ON"
    : desiredRelay
      ? desiredRelay === "ON"
      : Boolean(raw.isOn);
  const powerW = normalizePowerW(Number(telemetry.p ?? telemetry.power ?? raw.currentPower ?? 0));
  const voltage = Number(telemetry.v ?? telemetry.voltage ?? 0);
  const current = Number(telemetry.i ?? telemetry.current ?? 0);
  const energy = Number(telemetry.e ?? telemetry.energy ?? raw.energyToday ?? 0);
  const site = typeof raw.site === "string" ? raw.site : "Primary site";
  const deviceRatedKw = Number(raw.ratedPowerKw ?? raw.ratedKw ?? ratedKw);
  const explicitFault = String(raw.status ?? "").toLowerCase() === "fault" || raw.fault === true;
  const status: DeviceStatus = !isOnline
    ? "offline"
    : stale
      ? "stale"
      : explicitFault
        ? "fault"
        : "online";

  const deviceName = String(raw.name ?? id);
  const latestReading: TelemetryPoint | undefined = updatedAt
    ? {
        id: `${id}-latest`,
        ts: updatedAt.getTime(),
        power: powerW,
        voltage,
        current,
        energy,
        pf: Number(telemetry.pf ?? telemetry.powerFactor ?? 0.95),
        deviceId: id,
        deviceName,
      }
    : undefined;

  return {
    id,
    name: deviceName,
    site,
    status,
    relay,
    load: Number((powerW / 1000).toFixed(1)),
    voltage,
    current,
    power_factor: Number(telemetry.pf ?? telemetry.powerFactor ?? 0.95),
    todayKwh: energy,
    lastSeen: updatedAt ? formatRelativeTime(updatedAt) : "No telemetry",
    lastSeenMs: updatedAt?.getTime() ?? 0,
    ratedKw: deviceRatedKw,
    command: "idle",
    latestReading,
    energySource: typeof raw.energySource === "string" ? raw.energySource : undefined,
  };
}

function deriveCommandState(status?: string): CommandState {
  const value = String(status ?? "idle").toLowerCase();
  if (value === "pending") return "pending";
  if (value === "confirmed" || value === "done" || value === "success") return "confirmed";
  if (value === "failed") return "failed";
  return "idle";
}

type CommandRow = {
  deviceId: string;
  cmd: string;
  status: string;
  createdAtMs: number;
  actor?: string;
};

function deriveDeviceEnergyShare(devices: Device[]): RenewableMixEntry[] {
  const withEnergy = devices.filter((device) => device.todayKwh > 0);
  const total = withEnergy.reduce((sum, device) => sum + device.todayKwh, 0);
  if (total <= 0) return [];

  return withEnergy.map((device, index) => ({
    source: device.name,
    pct: Math.round((device.todayKwh / total) * 100),
    color: `var(--chart-${(index % 5) + 1})`,
  }));
}

export type EnergyChartRange = "hours" | "days" | "weeks" | "months";

function deviceTelemetryPoints(device: Device): TelemetryPoint[] {
  const points = [...(device.telemetry ?? [])];
  if (device.latestReading) points.push(device.latestReading);
  return dedupeTelemetryPoints(points);
}

function deriveRenewableMixFromDevices(devices: Device[], endMs: number): RenewableMixEntry[] {
  const startMs = endMs - 24 * 60 * 60 * 1000;
  const bySource = new Map<string, number>();

  devices.forEach((device) => {
    const points = deviceTelemetryPoints(device);
    let kwh = points.length >= 2 ? integrateKwhBetween(points, startMs, endMs) : 0;
    if (kwh <= 0) kwh = device.todayKwh;
    if (kwh <= 0) return;
    const source = device.energySource?.trim() || "Unspecified";
    bySource.set(source, (bySource.get(source) ?? 0) + kwh);
  });

  const total = Array.from(bySource.values()).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  return Array.from(bySource.entries()).map(([source, kwh], index) => ({
    source,
    pct: Math.round((kwh / total) * 100),
    color: ENERGY_SOURCE_COLORS[source.toLowerCase()] ?? `var(--chart-${(index % 5) + 1})`,
  }));
}

export function getEnergyChartSeries(
  telemetry: TelemetryPoint[],
  range: EnergyChartRange,
  tariffPerKwh: number,
): Array<{ label: string; kwh: number; cost: number }> {
  const hasUsableData =
    telemetry.length >= 2 || telemetry.some((p) => p.power > 0 || (p.energy ?? 0) > 0);
  if (!hasUsableData) return [];

  const endMs = Math.max(Date.now(), ...telemetry.map((point) => point.ts));

  if (range === "hours") {
    const startMs = endMs - 24 * 60 * 60 * 1000;
    return bucketIntegratedKwh(telemetry, 60 * 60 * 1000, startMs, endMs, true).map(
      ({ bucketStart, kwh }) => ({
        label: formatTelemetryTime(bucketStart),
        kwh: Number(kwh.toFixed(1)),
        cost: Number((kwh * tariffPerKwh).toFixed(1)),
      }),
    );
  }

  if (range === "days") {
    const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    return bucketIntegratedKwh(telemetry, 24 * 60 * 60 * 1000, startMs, endMs, true).map(
      ({ bucketStart, kwh }) => ({
        label: formatTelemetryDate(bucketStart),
        kwh: Number(kwh.toFixed(1)),
        cost: Number((kwh * tariffPerKwh).toFixed(1)),
      }),
    );
  }

  if (range === "weeks") {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const startMs = endMs - 6 * weekMs;
    return bucketIntegratedKwh(telemetry, weekMs, startMs, endMs, true).map(
      ({ bucketStart, kwh }) => ({
        label: formatTelemetryDate(bucketStart),
        kwh: Number(kwh.toFixed(1)),
        cost: Number((kwh * tariffPerKwh).toFixed(1)),
      }),
    );
  }

  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const minTs = Math.min(...telemetry.map((point) => point.ts));
  const spanMs = endMs - minTs;
  const monthCount = Math.min(6, Math.max(1, Math.ceil(spanMs / monthMs)));
  const startMs = endMs - monthCount * monthMs;
  return bucketIntegratedKwh(telemetry, monthMs, startMs, endMs, true).map(
    ({ bucketStart, kwh }) => ({
      label: new Intl.DateTimeFormat("en-GB", {
        timeZone: TELEMETRY_TIMEZONE,
        month: "short",
        year: "numeric",
      }).format(new Date(bucketStart)),
      kwh: Number(kwh.toFixed(1)),
      cost: Number((kwh * tariffPerKwh).toFixed(1)),
    }),
  );
}

export type ComparisonPeriod = "hour" | "day" | "week" | "month" | "custom";

function getComparisonBucketMs(spanMs: number): number {
  if (spanMs <= 2 * 60 * 60 * 1000) return 5 * 60 * 1000;
  if (spanMs <= 36 * 60 * 60 * 1000) return 60 * 60 * 1000;
  if (spanMs <= 45 * 24 * 60 * 60 * 1000) return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

export function getComparisonPeriodRange(
  period: ComparisonPeriod,
  custom?: { fromMs: number; toMs: number },
): { startMs: number; endMs: number } {
  const now = Date.now();
  switch (period) {
    case "hour":
      return { startMs: now - 60 * 60 * 1000, endMs: now };
    case "day":
      return { startMs: now - 24 * 60 * 60 * 1000, endMs: now };
    case "week":
      return { startMs: now - 7 * 24 * 60 * 60 * 1000, endMs: now };
    case "month":
      return { startMs: now - 30 * 24 * 60 * 60 * 1000, endMs: now };
    case "custom":
      if (custom && custom.toMs > custom.fromMs)
        return { startMs: custom.fromMs, endMs: custom.toMs };
      return { startMs: now - 7 * 24 * 60 * 60 * 1000, endMs: now };
  }
}

export function getDeviceComparisonSeries(
  devices: Device[],
  telemetryByDevice: Map<string, TelemetryPoint[]>,
  deviceIds: string[],
  startMs: number,
  endMs: number,
  options: { useTodayFallback?: boolean } = {},
): Array<{ label: string; total: number; [deviceId: string]: string | number }> {
  if (endMs <= startMs) return [];

  const selected = deviceIds.length
    ? devices.filter((device) => deviceIds.includes(device.id))
    : devices;
  if (!selected.length) return [];

  const bucketMs = getComparisonBucketMs(endMs - startMs);
  const spanMs = endMs - startMs;
  const formatLabel = (ts: number) =>
    spanMs <= 36 * 60 * 60 * 1000 ? formatTelemetryTime(ts) : formatTelemetryDate(ts);

  const alignedStart = alignBucketStartEat(startMs, bucketMs);
  const rows: Array<{ label: string; total: number; [deviceId: string]: string | number }> = [];
  const canUseTodayFallback =
    options.useTodayFallback !== false && endMs >= startOfEatDay(Date.now());

  for (let t = alignedStart; t < endMs; t += bucketMs) {
    const bucketEnd = Math.min(t + bucketMs, endMs);
    const row: { label: string; total: number; [deviceId: string]: string | number } = {
      label: formatLabel(t),
      total: 0,
    };

    selected.forEach((device) => {
      const fromMap = telemetryByDevice.get(device.id) ?? [];
      const points = dedupeTelemetryPoints([...deviceTelemetryPoints(device), ...fromMap]);
      let kwh = resolveKwhBetween(points, t, bucketEnd);
      if (kwh <= 0) {
        const inBucket = points.filter((p) => p.ts >= t && p.ts <= bucketEnd);
        const bucketEnergy = inBucket.find((p) => (p.energy ?? 0) > 0)?.energy;
        if (bucketEnergy) kwh = bucketEnergy;
      }
      row[device.id] = Number(kwh.toFixed(2));
      row.total += kwh;
    });

    row.total = Number(row.total.toFixed(2));
    rows.push(row);
  }

  const allZero = !rows.length || rows.every((row) => row.total === 0);
  if (canUseTodayFallback && allZero && selected.some((d) => d.todayKwh > 0)) {
    const bucketStart = alignBucketStartEat(
      Math.max(...selected.map((d) => d.lastSeenMs || d.latestReading?.ts || endMs)),
      bucketMs,
    );
    const row: { label: string; total: number; [deviceId: string]: string | number } = {
      label: formatLabel(bucketStart),
      total: 0,
    };
    selected.forEach((device) => {
      const kwh = Math.max(0, device.todayKwh);
      row[device.id] = Number(kwh.toFixed(2));
      row.total += kwh;
    });
    row.total = Number(row.total.toFixed(2));
    return [row];
  }

  return rows;
}

function buildCostTrend(
  telemetry: TelemetryPoint[],
  tariffPerKwh: number,
  monthlyBudget: number,
): Array<{ m: string; cost: number; budget: number }> {
  const hasUsableData =
    telemetry.length >= 2 || telemetry.some((p) => p.power > 0 || (p.energy ?? 0) > 0);
  if (!hasUsableData) return [];

  const minTs = Math.min(...telemetry.map((point) => point.ts));
  const maxTs = Math.max(...telemetry.map((point) => point.ts));
  const spanMs = maxTs - minTs;
  const twoMonthsMs = 62 * 24 * 60 * 60 * 1000;
  const endMs = Date.now();

  if (spanMs < twoMonthsMs) {
    const startMs = endMs - 30 * 24 * 60 * 60 * 1000;
    const dailyBudget = monthlyBudget / 30;
    return bucketIntegratedKwh(telemetry, 24 * 60 * 60 * 1000, startMs, endMs, true)
      .map(({ bucketStart, kwh }) => ({
        m: formatTelemetryDate(bucketStart),
        cost: Number((kwh * tariffPerKwh).toFixed(0)),
        budget: Number(dailyBudget.toFixed(0)),
      }))
      .filter((bucket) => bucket.cost > 0);
  }

  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const startMs = endMs - 6 * monthMs;
  return bucketIntegratedKwh(telemetry, monthMs, startMs, endMs, true)
    .map(({ bucketStart, kwh }) => ({
      m: new Intl.DateTimeFormat("en-GB", {
        timeZone: TELEMETRY_TIMEZONE,
        month: "short",
        year: "numeric",
      }).format(new Date(bucketStart)),
      cost: Number((kwh * tariffPerKwh).toFixed(0)),
      budget: Number(monthlyBudget.toFixed(0)),
    }))
    .filter((bucket) => bucket.cost > 0);
}

export function emissionsSeries(
  telemetry: TelemetryPoint[],
  timeRange: TimeRange,
  emissionFactor = GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
): Array<{ m: string; co2: number; baseline: number; avoided: number }> {
  const hasUsableData =
    telemetry.length >= 2 || telemetry.some((p) => p.power > 0 || (p.energy ?? 0) > 0);
  if (!hasUsableData) return [];

  const now = Date.now();
  const hours = getTimeRangeHours(timeRange);
  const startMs = now - hours * 60 * 60 * 1000;
  const endMs = now;

  let bucketMs: number;
  let formatLabel: (ts: number) => string;

  if (timeRange === "hour") {
    bucketMs = 5 * 60 * 1000;
    formatLabel = (ts) => formatTelemetryTime(ts);
  } else if (timeRange === "day") {
    bucketMs = 60 * 60 * 1000;
    formatLabel = (ts) =>
      new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    bucketMs = 24 * 60 * 60 * 1000;
    formatLabel = (ts) => formatTelemetryDate(ts);
  }

  const buckets = bucketIntegratedKwh(
    telemetry,
    bucketMs,
    startMs,
    endMs,
    bucketMs >= 60 * 60 * 1000,
  );
  if (!buckets.length) return [];

  return buckets.map(({ bucketStart, kwh }, index, arr) => {
    const co2 = Math.round(kwh * emissionFactor);
    const prevKwh = index > 0 ? arr[index - 1].kwh : kwh;
    const baseline = Math.round(prevKwh * emissionFactor);
    const avoided = baseline > co2 ? baseline - co2 : 0;
    return { m: formatLabel(bucketStart), co2, baseline, avoided };
  });
}

export { recordExport, sendRelayCommand, savePlatformSettings } from "./firebase-api";

export function useHydranetDashboardData() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [exportRecords, setExportRecords] = useState<ExportRecord[]>([]);
  const [platformSettings, setPlatformSettings] =
    useState<PlatformSettings>(defaultPlatformSettings);
  const [telemetryMap, setTelemetryMap] = useState<Map<string, TelemetryPoint[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [renewableMixConfigured, setRenewableMixConfigured] = useState(false);
  const commandsRef = useRef(commands);
  const devicesRef = useRef(devices);
  const telemetryMapRef = useRef(telemetryMap);
  const platformSettingsRef = useRef(platformSettings);
  const telemetryUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const devicesLoadedRef = useRef(false);

  useEffect(() => {
    commandsRef.current = commands;
    devicesRef.current = devices;
    telemetryMapRef.current = telemetryMap;
    platformSettingsRef.current = platformSettings;
  }, [commands, devices, telemetryMap, platformSettings]);

  useEffect(() => {
    if (!db) {
      setDevices([]);
      setCommands([]);
      setExportRecords([]);
      setPlatformSettings(defaultPlatformSettings);
      setRenewableMixConfigured(false);
      setIsLoading(false);
      return undefined;
    }

    let unsubDevices: Unsubscribe | undefined;
    let unsubscribeAuth: (() => void) | undefined;

    const attachTelemetryListener = (deviceId: string) => {
      const existing = telemetryUnsubsRef.current.get(deviceId);
      existing?.();

      const unsub = onSnapshot(
        query(
          collection(db, "devices", deviceId, "telemetry"),
          orderBy("ts", "desc"),
          limit(TELEMETRY_LIMIT),
        ),
        (snapshot) => {
          const deviceName = devicesRef.current.find((d) => d.id === deviceId)?.name ?? deviceId;
          const points = snapshot.docs
            .map((docSnap) => {
              const raw = docSnap.data() as Record<string, unknown>;
              const ts = normalizeTimestamp(raw.ts) ?? normalizeTimestamp(raw.receivedAt);
              if (!ts) return null;
              return {
                id: docSnap.id,
                ts: ts.getTime(),
                power: normalizePowerW(Number(raw.p ?? raw.power ?? 0)),
                voltage: Number(raw.v ?? raw.voltage ?? 0),
                current: Number(raw.i ?? raw.current ?? 0),
                energy: Number(raw.e ?? raw.energy ?? 0),
                pf: Number(raw.pf ?? raw.powerFactor ?? 0.95),
                deviceId,
                deviceName,
              };
            })
            .filter((point): point is TelemetryPoint => point !== null)
            .sort((a, b) => a.ts - b.ts);

          setTelemetryMap((prev) => {
            const next = new Map(prev);
            next.set(deviceId, points);
            return next;
          });
        },
        (error) => {
          console.warn(`Unable to load telemetry for ${deviceId}:`, error);
          setTelemetryMap((prev) => {
            const next = new Map(prev);
            next.set(deviceId, []);
            return next;
          });
        },
      );
      telemetryUnsubsRef.current.set(deviceId, unsub);
    };

    const attachDeviceListener = () => {
      unsubDevices?.();

      unsubDevices = onSnapshot(
        collection(db, "devices"),
        (snapshot) => {
          if (!devicesLoadedRef.current) {
            devicesLoadedRef.current = true;
            setIsLoading(false);
          }

          const commandMap = new Map(
            commandsRef.current.map((command) => [command.deviceId, command]),
          );
          const ratedKw = platformSettingsRef.current.maxPower / 1000;
          const next = snapshot.docs.map((docSnap) => {
            const raw = docSnap.data() as Record<string, unknown>;
            const normalized = normalizeDevice(docSnap.id, raw, ratedKw);
            const latest = commandMap.get(docSnap.id);
            if (latest) normalized.command = deriveCommandState(latest.status);
            normalized.telemetry = telemetryMapRef.current.get(docSnap.id) || [];
            return normalized;
          });

          setDevices(next);
          snapshot.docs.forEach((docSnap) => {
            attachTelemetryListener(docSnap.id);
          });
        },
        (error) => {
          console.warn("Unable to load devices from Firestore:", error);
          setDevices([]);
          setIsLoading(false);
        },
      );
    };

    if (auth) {
      unsubscribeAuth = onAuthStateChanged(auth, () => {
        attachDeviceListener();
      });
    } else {
      attachDeviceListener();
    }

    const unsubCommands = onSnapshot(
      query(collectionGroup(db, "commands"), orderBy("createdAtMs", "desc"), limit(100)),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const parent = docSnap.ref.parent.parent;
          return {
            deviceId: String(parent?.id ?? "UNKNOWN"),
            cmd: String(raw.cmd ?? "").toUpperCase(),
            status: String(raw.status ?? "pending").toLowerCase(),
            createdAtMs: numberFromConfig(
              raw.createdAtMs,
              normalizeTimestamp(raw.createdAt)?.getTime() ?? 0,
            ),
            actor:
              typeof raw.actor === "string"
                ? raw.actor
                : typeof raw.requestedByEmail === "string"
                  ? raw.requestedByEmail
                  : undefined,
          };
        });
        setCommands(rows);
      },
      (error) => {
        console.warn("Unable to load command history:", error);
        setCommands([]);
      },
    );

    const unsubExports = onSnapshot(
      query(collection(db, "exports"), orderBy("createdAtMs", "desc"), limit(50)),
      (snapshot) => {
        setExportRecords(
          snapshot.docs.map((docSnap) => {
            const raw = docSnap.data() as Record<string, unknown>;
            const createdAtMs = numberFromConfig(
              raw.createdAtMs,
              normalizeTimestamp(raw.createdAt)?.getTime() ?? 0,
            );
            const sizeBytes = numberFromConfig(raw.sizeBytes, 0);
            return {
              id: docSnap.id,
              name: String(raw.name ?? raw.reportName ?? docSnap.id),
              format: String(raw.format ?? "CSV").toUpperCase(),
              size: typeof raw.size === "string" ? raw.size : formatBytes(sizeBytes),
              created: formatRecordTime(createdAtMs),
              createdAtMs,
              status: String(raw.status ?? "Ready"),
              rowCount: Number.isFinite(Number(raw.rowCount)) ? Number(raw.rowCount) : undefined,
              actor:
                typeof raw.actor === "string"
                  ? raw.actor
                  : typeof raw.actorEmail === "string"
                    ? raw.actorEmail
                    : undefined,
            };
          }),
        );
      },
      (error) => {
        console.warn("Unable to load export history:", error);
        setExportRecords([]);
      },
    );

    const unsubPlatform = onSnapshot(
      doc(db, "appConfig", "platform"),
      (snapshot) => {
        const raw = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
        const { mix, configured } = normalizeRenewableMix(raw?.renewableMix);
        setRenewableMixConfigured(configured);
        setPlatformSettings({ ...normalizePlatformSettings(raw), renewableMix: mix });
      },
      (error) => {
        console.warn("Unable to load platform settings:", error);
        setPlatformSettings(defaultPlatformSettings);
        setRenewableMixConfigured(false);
      },
    );

    const telemetryUnsubs = telemetryUnsubsRef.current;

    return () => {
      unsubscribeAuth?.();
      unsubDevices?.();
      unsubCommands?.();
      unsubExports?.();
      unsubPlatform?.();
      telemetryUnsubs.forEach((unsub) => unsub());
      telemetryUnsubs.clear();
    };
  }, []);

  const tariffPerKwh = platformSettings.tariffPerKwh;
  const emissionFactorKgCo2PerKwh = platformSettings.emissionFactorKgCo2PerKwh;

  const devicesWithTelemetry = useMemo(() => {
    return devices.map((device) => {
      const telemetry = telemetryMap.get(device.id) ?? [];
      const latest = telemetry[telemetry.length - 1];
      const latestCommand = commands.find((command) => command.deviceId === device.id);
      const command = latestCommand ? deriveCommandState(latestCommand.status) : device.command;

      if (!latest) return { ...device, command, telemetry };

      const stale = Date.now() - latest.ts > STALE_MS;
      const nextStatus: DeviceStatus =
        device.status === "fault" ? "fault" : stale ? "stale" : "online";

      return {
        ...device,
        status: nextStatus,
        command,
        telemetry,
        latestReading: { ...latest, deviceName: device.name },
        load: Number((latest.power / 1000).toFixed(1)),
        voltage: latest.voltage ?? device.voltage,
        current: latest.current ?? device.current,
        power_factor: latest.pf ?? device.power_factor,
        todayKwh: latest.energy && latest.energy > 0 ? latest.energy : device.todayKwh,
        lastSeen: formatRelativeTime(new Date(latest.ts)),
        lastSeenMs: latest.ts,
      };
    });
  }, [commands, devices, telemetryMap]);

  const allTelemetry = useMemo(() => {
    const deviceNameById = new Map(devicesWithTelemetry.map((device) => [device.id, device.name]));
    const fromSubcollections = Array.from(telemetryMap.entries()).flatMap(([deviceId, points]) =>
      points.map((point) => ({
        ...point,
        deviceName: deviceNameById.get(deviceId) ?? point.deviceName ?? deviceId,
      })),
    );
    const fallbacks = devicesWithTelemetry
      .filter((device) => device.latestReading)
      .map((device) => device.latestReading as TelemetryPoint);
    return dedupeTelemetryPoints([...fromSubcollections, ...fallbacks]);
  }, [telemetryMap, devicesWithTelemetry]);

  const recentTelemetry = useMemo(
    () => [...allTelemetry].sort((a, b) => b.ts - a.ts),
    [allTelemetry],
  );

  const deviceTelemetryIndex = useMemo(
    () => buildDeviceTelemetryIndex(allTelemetry),
    [allTelemetry],
  );

  const getPointKwh = useCallback(
    (point: TelemetryPoint) => rowKwhFromDeviceIndex(deviceTelemetryIndex, point),
    [deviceTelemetryIndex],
  );

  const getEmissionsSeries = useCallback(
    (timeRange: TimeRange) => emissionsSeries(allTelemetry, timeRange, emissionFactorKgCo2PerKwh),
    [allTelemetry, emissionFactorKgCo2PerKwh],
  );

  const getEnergyChartSeriesForRange = useCallback(
    (range: EnergyChartRange) => getEnergyChartSeries(allTelemetry, range, tariffPerKwh),
    [allTelemetry, tariffPerKwh],
  );

  const getDeviceComparisonSeriesForRange = useCallback(
    (deviceIds: string[], startMs: number, endMs: number) =>
      getDeviceComparisonSeries(devicesWithTelemetry, telemetryMap, deviceIds, startMs, endMs),
    [devicesWithTelemetry, telemetryMap],
  );

  const consumptionSeries = useMemo(() => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000;
    const bucketMs = 60 * 60 * 1000;

    return bucketIntegratedKwh(allTelemetry, bucketMs, startMs, now, true)
      .map(({ bucketStart, kwh }) => ({
        t: formatTelemetryTime(bucketStart),
        kwh: Number(kwh.toFixed(1)),
        cost: Number((kwh * tariffPerKwh).toFixed(1)),
      }))
      .filter((bucket) => bucket.kwh > 0);
  }, [allTelemetry, tariffPerKwh]);

  const deviceConsumptionSeries = useMemo(() => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000;

    return getDeviceComparisonSeries(devicesWithTelemetry, telemetryMap, [], startMs, now, {
      useTodayFallback: false,
    })
      .map((row) => ({
        ...row,
        t: row.label,
        cost: Number((row.total * tariffPerKwh).toFixed(1)),
      }))
      .filter((row) => row.total > 0);
  }, [devicesWithTelemetry, telemetryMap, tariffPerKwh]);

  const siteBreakdown = useMemo(() => {
    if (!devicesWithTelemetry.length) return [];
    const now = Date.now();
    const startMs = startOfEatMonth(now);
    const grouped = new Map<string, { site: string; kwh: number; cost: number }>();

    devicesWithTelemetry.forEach((device) => {
      const kwh = deviceKwhBetween(device, startMs, now, true);
      const existing = grouped.get(device.site) ?? { site: device.site, kwh: 0, cost: 0 };
      existing.kwh += kwh;
      existing.cost += kwh * tariffPerKwh;
      grouped.set(device.site, existing);
    });

    return Array.from(grouped.values())
      .map((site) => ({
        ...site,
        kwh: Number(site.kwh.toFixed(2)),
        cost: Number(site.cost.toFixed(0)),
      }))
      .sort((a, b) => b.kwh - a.kwh);
  }, [devicesWithTelemetry, tariffPerKwh]);

  const dashboardSummary = useMemo(() => {
    const now = Date.now();
    const todayStartMs = startOfEatDay(now);
    const energyTodayKwh = devicesWithTelemetry.reduce(
      (sum, device) => sum + deviceKwhBetween(device, todayStartMs, now, true),
      0,
    );
    const totalLoadKw = devicesWithTelemetry.reduce((sum, device) => sum + device.load, 0);
    const totalRatedKw = devicesWithTelemetry.reduce(
      (sum, device) => sum + Math.max(0, device.ratedKw),
      0,
    );
    const monthToDateKwh = siteBreakdown.reduce((sum, site) => sum + site.kwh, 0);
    const monthToDateCost = siteBreakdown.reduce((sum, site) => sum + site.cost, 0);
    const online = devicesWithTelemetry.filter((device) => device.status === "online").length;
    const stale = devicesWithTelemetry.filter((device) => device.status === "stale").length;
    const offline = devicesWithTelemetry.filter((device) => device.status === "offline").length;
    const faults = devicesWithTelemetry.filter((device) => device.status === "fault").length;
    const pending = devicesWithTelemetry.filter((device) => device.command === "pending").length;

    return {
      online,
      stale,
      offline,
      faults,
      pending,
      totalDevices: devicesWithTelemetry.length,
      totalLoadKw: Number(totalLoadKw.toFixed(2)),
      energyTodayKwh: Number(energyTodayKwh.toFixed(2)),
      monthToDateKwh: Number(monthToDateKwh.toFixed(2)),
      monthToDateCost: Number(monthToDateCost.toFixed(0)),
      budgetRemaining: Math.max(0, platformSettings.monthlyBudget - monthToDateCost),
      peakDemandKw: devicesWithTelemetry.length
        ? Math.max(0, ...devicesWithTelemetry.map((device) => device.load))
        : 0,
      loadFactor: totalRatedKw > 0 ? Math.min(1, totalLoadKw / totalRatedKw) : 0,
      carbonIntensityGCo2PerKwh: Math.round(emissionFactorKgCo2PerKwh * 1000),
      co2TodayKg: Math.round(energyTodayKwh * emissionFactorKgCo2PerKwh),
    };
  }, [
    devicesWithTelemetry,
    emissionFactorKgCo2PerKwh,
    platformSettings.monthlyBudget,
    siteBreakdown,
  ]);

  const costTrend = useMemo(
    () => buildCostTrend(allTelemetry, tariffPerKwh, platformSettings.monthlyBudget),
    [allTelemetry, tariffPerKwh, platformSettings.monthlyBudget],
  );

  const renewableMix = useMemo(() => {
    if (renewableMixConfigured && platformSettings.renewableMix.length) {
      return platformSettings.renewableMix;
    }
    const deviceShare = deriveDeviceEnergyShare(devicesWithTelemetry);
    if (deviceShare.length) return deviceShare;
    return deriveRenewableMixFromDevices(devicesWithTelemetry, Date.now());
  }, [renewableMixConfigured, platformSettings.renewableMix, devicesWithTelemetry]);

  const emissionsTrend = useMemo(() => getEmissionsSeries("day"), [getEmissionsSeries]);

  const recommendations = useMemo(() => {
    if (!devicesWithTelemetry.length) return [] as Recommendation[];

    const generated: Recommendation[] = [];

    devicesWithTelemetry.forEach((device) => {
      if (device.status === "fault" || device.status === "offline") {
        generated.push({
          id: `rec-${device.id}`,
          title:
            device.status === "fault"
              ? "Correct power quality at site"
              : "Restore telemetry connectivity",
          detail: `${device.name} is ${device.status}. Review the relay and communications path to restore stable operation.`,
          device: `${device.id} · ${device.name}`,
          savingKwh: 0,
          savingTzs: 0,
          co2SavedKg: 0,
          priority: "high",
          category: device.status === "fault" ? "Power quality" : "Reliability",
        });
      }

      if (device.status === "stale" && device.todayKwh > 0) {
        const savingKwh = Math.max(25, Math.round(device.todayKwh * 0.08));
        generated.push({
          id: `rec-${device.id}-schedule`,
          title: "Reschedule idle overnight load",
          detail: `${device.name} has stale telemetry and some overnight draw. Confirm the schedule and avoid unnecessary off-hours consumption.`,
          device: `${device.id} · ${device.name}`,
          savingKwh,
          savingTzs: Math.max(15000, Math.round(savingKwh * tariffPerKwh)),
          co2SavedKg: Math.max(0, Math.round(savingKwh * emissionFactorKgCo2PerKwh)),
          priority: "medium",
          category: "Scheduling",
        });
      }

      if (device.power_factor > 0 && device.power_factor < 0.9) {
        const savingKwh = Math.max(10, Math.round(device.todayKwh * 0.05));
        generated.push({
          id: `rec-${device.id}-pf`,
          title: "Improve power factor",
          detail: `${device.name} is operating below 0.9 PF. Add correction or reduce inductive load to cut losses.`,
          device: `${device.id} · ${device.name}`,
          savingKwh,
          savingTzs: Math.round(savingKwh * tariffPerKwh),
          co2SavedKg: Math.round(savingKwh * emissionFactorKgCo2PerKwh),
          priority: "medium",
          category: "Power quality",
        });
      }
    });

    return generated.slice(0, 4);
  }, [devicesWithTelemetry, emissionFactorKgCo2PerKwh, tariffPerKwh]);

  const hourlyProfile = useMemo(() => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000;
    const buckets = bucketIntegratedKwh(allTelemetry, 60 * 60 * 1000, startMs, now, true).filter(
      (bucket) => bucket.kwh > 0,
    );

    if (!buckets.length) return [];
    return buckets.map(({ bucketStart, kwh }, index) => {
      const hour = getEatHour(bucketStart);
      const period = periodOf(hour);
      const multiplier = touBands.find((band) => band.id === period)?.multiplier ?? 1;
      return {
        hour: index,
        t: formatTelemetryTime(bucketStart),
        kwh: Number(kwh.toFixed(1)),
        cost: Number((kwh * tariffPerKwh * multiplier).toFixed(0)),
        period,
      };
    });
  }, [allTelemetry, tariffPerKwh]);

  const exportsHistory = useMemo((): ExportRecord[] => exportRecords.slice(0, 10), [exportRecords]);

  const recentActivity = useMemo((): ActivityRecord[] => {
    return commands.slice(0, 20).map((cmd) => ({
      id: `act-${cmd.deviceId}-${cmd.createdAtMs}`,
      action: cmd.cmd === "ON" ? "Relay ON" : "Relay OFF",
      target: cmd.deviceId,
      actor: cmd.actor ?? "Unknown actor",
      time: formatRecordTime(cmd.createdAtMs),
      state: cmd.status,
    }));
  }, [commands]);

  return {
    devices: devicesWithTelemetry,
    commands,
    consumptionSeries,
    deviceConsumptionSeries,
    siteBreakdown,
    costTrend,
    renewableMix,
    renewableMixConfigured,
    emissionsTrend,
    dashboardSummary,
    sustainabilityEquivalents: {
      trees: Math.max(0, Math.round(dashboardSummary.co2TodayKg * 0.22)),
      kmAvoided: Math.max(0, Math.round(dashboardSummary.co2TodayKg * 4.8)),
      homesPowered: Math.max(0, Math.round(dashboardSummary.co2TodayKg / 220)),
      phonesCharged: Math.max(0, Math.round(dashboardSummary.co2TodayKg * 420)),
    },
    recommendations,
    exportsHistory,
    recentActivity,
    hourlyProfile,
    telemetryByDevice: telemetryMap,
    allTelemetry,
    recentTelemetry,
    formatTelemetryDateTime,
    formatTelemetryTime,
    platformSettings,
    tariffPerKwh,
    isLoading,
    getEmissionsSeries,
    getEnergyChartSeries: getEnergyChartSeriesForRange,
    getDeviceComparisonSeries: getDeviceComparisonSeriesForRange,
    getComparisonPeriodRange,
    getPointKwh,
    EMPTY_TELEMETRY_MSG,
    TARIFF_TZS_PER_KWH,
    TIMEZONE,
    emissionFactorKgCo2PerKwh,
    GRID_EMISSION_FACTOR_KGCO2_PER_KWH: emissionFactorKgCo2PerKwh,
    currency,
    touBands,
    periodOf,
    getTimeRangeHours,
  };
}
