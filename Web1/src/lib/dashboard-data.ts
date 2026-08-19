import { collection, collectionGroup, doc, limit, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from './firebase';
import {
  alignBucketStartEat,
  bucketIntegratedKwh,
  buildDeviceTelemetryIndex,
  dedupeTelemetryPoints,
  getEatHour,
  integrateKwhBetween,
  resolveKwhBetween,
  normalizePowerW,
  rowKwhFromDeviceIndex,
} from './telemetry-utils';

export type DeviceStatus = 'online' | 'offline' | 'fault' | 'stale';
export type CommandState = 'idle' | 'pending' | 'confirmed' | 'failed';

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
  priority: 'high' | 'medium' | 'low';
  category: string;
};

export type Incident = {
  id: string;
  title: string;
  device: string;
  severity: 'critical' | 'warning' | 'info';
  detected: string;
  duration: string;
  rootCause: string;
};

export type TouPeriod = 'peak' | 'standard' | 'offpeak';

export type RenewableMixEntry = {
  source: string;
  pct: number;
  color: string;
};

export type PlatformSettings = {
  timezone: string;
  currency: 'TZS';
  tariffPerKwh: number;
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
  status: string;
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
export const TIMEZONE = 'Africa/Dar_es_Salaam (UTC+3)';
export const GRID_EMISSION_FACTOR_KGCO2_PER_KWH = 0.43;

export const TELEMETRY_TIMEZONE = 'Africa/Dar_es_Salaam';

export function formatTelemetryDateTime(ts: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TELEMETRY_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export function formatTelemetryTime(ts: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TELEMETRY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export function formatTelemetryDate(ts: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TELEMETRY_TIMEZONE,
    month: 'short',
    day: 'numeric',
  }).format(new Date(ts));
}

const ENERGY_SOURCE_COLORS: Record<string, string> = {
  hydro: 'var(--chart-3)',
  solar: 'var(--chart-1)',
  'solar pv': 'var(--chart-1)',
  wind: 'var(--chart-4)',
  biogas: 'var(--chart-4)',
  thermal: 'var(--chart-2)',
  grid: 'var(--chart-2)',
  diesel: 'var(--chart-5)',
  gas: 'var(--chart-5)',
};

const defaultPlatformSettings: PlatformSettings = {
  timezone: TIMEZONE,
  currency: 'TZS',
  tariffPerKwh: TARIFF_TZS_PER_KWH,
  maxPower: 10000,
  maxDailyCost: 50000,
  maxDailyEnergy: 200,
  orgName: '',
  primaryContact: '',
  renewableMix: [],
  monthlyBudget: 1500000,
  notifications: {
    criticalFaults: true,
    thresholdWarnings: true,
    weeklyDigest: true,
    relayConfirmations: false,
  },
};

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
    currency: 'TZS',
    tariffPerKwh: Number(raw?.tariffPerKwh ?? defaultPlatformSettings.tariffPerKwh) || TARIFF_TZS_PER_KWH,
    maxPower: Number(raw?.maxPower ?? defaultPlatformSettings.maxPower),
    maxDailyCost: Number(raw?.maxDailyCost ?? defaultPlatformSettings.maxDailyCost),
    maxDailyEnergy: Number(raw?.maxDailyEnergy ?? defaultPlatformSettings.maxDailyEnergy),
    orgName: String(raw?.orgName ?? defaultPlatformSettings.orgName),
    primaryContact: String(raw?.primaryContact ?? defaultPlatformSettings.primaryContact),
    renewableMix: normalizeRenewableMix(raw?.renewableMix).mix,
    monthlyBudget: Number(raw?.monthlyBudget ?? defaultPlatformSettings.monthlyBudget),
    notifications: {
      criticalFaults: Boolean(notifications.criticalFaults ?? defaultPlatformSettings.notifications.criticalFaults),
      thresholdWarnings: Boolean(notifications.thresholdWarnings ?? defaultPlatformSettings.notifications.thresholdWarnings),
      weeklyDigest: Boolean(notifications.weeklyDigest ?? defaultPlatformSettings.notifications.weeklyDigest),
      relayConfirmations: Boolean(notifications.relayConfirmations ?? defaultPlatformSettings.notifications.relayConfirmations),
    },
  };
}

export type TimeRange = 'hour' | 'day' | 'week' | 'month';

export function getTimeRangeHours(range: TimeRange): number {
  switch (range) {
    case 'hour':
      return 1;
    case 'day':
      return 24;
    case 'week':
      return 7 * 24;
    case 'month':
      return 30 * 24;
  }
}

export const touBands: { id: TouPeriod; label: string; window: string; multiplier: number }[] = [
  { id: 'peak', label: 'Peak', window: '18:00 – 22:00', multiplier: 1.35 },
  { id: 'standard', label: 'Standard', window: '06:00 – 18:00', multiplier: 1.0 },
  { id: 'offpeak', label: 'Off-peak', window: '22:00 – 06:00', multiplier: 0.72 },
];

export const periodOf = (hour: number): TouPeriod =>
  hour >= 18 && hour < 22 ? 'peak' : hour >= 6 && hour < 18 ? 'standard' : 'offpeak';

export const currency = (n: number) =>
  new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

const STALE_MS = 5 * 60 * 1000;
const TELEMETRY_LIMIT = 500;
export const EMPTY_TELEMETRY_MSG = 'No telemetry yet — readings appear when devices report to Firestore';

function normalizeTimestamp(value: unknown): Date | null {
  if (!value) return null;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (value instanceof Date) return value;
  return null;
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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
  const relay = relayState ? relayState === 'ON' : desiredRelay ? desiredRelay === 'ON' : Boolean(raw.isOn);
  const powerW = normalizePowerW(Number(telemetry.p ?? telemetry.power ?? raw.currentPower ?? 0));
  const voltage = Number(telemetry.v ?? telemetry.voltage ?? 0);
  const current = Number(telemetry.i ?? telemetry.current ?? 0);
  const energy = Number(telemetry.e ?? telemetry.energy ?? raw.energyToday ?? 0);
  const site = typeof raw.site === 'string' ? raw.site : 'Primary site';
  const deviceRatedKw = Number(raw.ratedPowerKw ?? raw.ratedKw ?? ratedKw);
  const explicitFault = String(raw.status ?? '').toLowerCase() === 'fault' || raw.fault === true;
  const status: DeviceStatus = !isOnline ? 'offline' : stale ? 'stale' : explicitFault ? 'fault' : 'online';

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
    lastSeen: updatedAt ? formatRelativeTime(updatedAt) : 'No telemetry',
    lastSeenMs: updatedAt?.getTime() ?? 0,
    ratedKw: deviceRatedKw,
    command: 'idle',
    latestReading,
    energySource: typeof raw.energySource === 'string' ? raw.energySource : undefined,
  };
}

function deriveCommandState(status?: string): CommandState {
  const value = String(status ?? 'idle').toLowerCase();
  if (value === 'pending') return 'pending';
  if (value === 'confirmed' || value === 'done' || value === 'success') return 'confirmed';
  if (value === 'failed') return 'failed';
  return 'idle';
}

type CommandRow = { deviceId: string; cmd: string; status: string; createdAtMs: number };

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

export type EnergyChartRange = 'hours' | 'days' | 'weeks' | 'months';

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
    const source = device.energySource?.trim() || 'Unspecified';
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
    telemetry.length >= 2 ||
    telemetry.some((p) => p.power > 0 || (p.energy ?? 0) > 0);
  if (!hasUsableData) return [];

  const endMs = Math.max(Date.now(), ...telemetry.map((point) => point.ts));

  if (range === 'hours') {
    const startMs = endMs - 24 * 60 * 60 * 1000;
    return bucketIntegratedKwh(telemetry, 60 * 60 * 1000, startMs, endMs, true).map(({ bucketStart, kwh }) => ({
      label: formatTelemetryTime(bucketStart),
      kwh: Number(kwh.toFixed(1)),
      cost: Number((kwh * tariffPerKwh).toFixed(1)),
    }));
  }

  if (range === 'days') {
    const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    return bucketIntegratedKwh(telemetry, 24 * 60 * 60 * 1000, startMs, endMs, true).map(({ bucketStart, kwh }) => ({
      label: formatTelemetryDate(bucketStart),
      kwh: Number(kwh.toFixed(1)),
      cost: Number((kwh * tariffPerKwh).toFixed(1)),
    }));
  }

  if (range === 'weeks') {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const startMs = endMs - 6 * weekMs;
    return bucketIntegratedKwh(telemetry, weekMs, startMs, endMs, true).map(({ bucketStart, kwh }) => ({
      label: formatTelemetryDate(bucketStart),
      kwh: Number(kwh.toFixed(1)),
      cost: Number((kwh * tariffPerKwh).toFixed(1)),
    }));
  }

  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const minTs = Math.min(...telemetry.map((point) => point.ts));
  const spanMs = endMs - minTs;
  const monthCount = Math.min(6, Math.max(1, Math.ceil(spanMs / monthMs)));
  const startMs = endMs - monthCount * monthMs;
  return bucketIntegratedKwh(telemetry, monthMs, startMs, endMs, true).map(({ bucketStart, kwh }) => ({
    label: new Intl.DateTimeFormat('en-GB', {
      timeZone: TELEMETRY_TIMEZONE,
      month: 'short',
      year: 'numeric',
    }).format(new Date(bucketStart)),
    kwh: Number(kwh.toFixed(1)),
    cost: Number((kwh * tariffPerKwh).toFixed(1)),
  }));
}


export type ComparisonPeriod = 'hour' | 'day' | 'week' | 'month' | 'custom';

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
    case 'hour':
      return { startMs: now - 60 * 60 * 1000, endMs: now };
    case 'day':
      return { startMs: now - 24 * 60 * 60 * 1000, endMs: now };
    case 'week':
      return { startMs: now - 7 * 24 * 60 * 60 * 1000, endMs: now };
    case 'month':
      return { startMs: now - 30 * 24 * 60 * 60 * 1000, endMs: now };
    case 'custom':
      if (custom && custom.toMs > custom.fromMs) return { startMs: custom.fromMs, endMs: custom.toMs };
      return { startMs: now - 7 * 24 * 60 * 60 * 1000, endMs: now };
  }
}

export function getDeviceComparisonSeries(
  devices: Device[],
  telemetryByDevice: Map<string, TelemetryPoint[]>,
  deviceIds: string[],
  startMs: number,
  endMs: number,
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
        else if (inBucket.length && device.todayKwh > 0) kwh = device.todayKwh;
      }
      row[device.id] = Number(kwh.toFixed(2));
      row.total += kwh;
    });

    row.total = Number(row.total.toFixed(2));
    rows.push(row);
  }

  const allZero = !rows.length || rows.every((row) => row.total === 0);
  if (allZero && selected.some((d) => d.todayKwh > 0)) {
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
    telemetry.length >= 2 ||
    telemetry.some((p) => p.power > 0 || (p.energy ?? 0) > 0);
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
      m: new Intl.DateTimeFormat('en-GB', {
        timeZone: TELEMETRY_TIMEZONE,
        month: 'short',
        year: 'numeric',
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
    telemetry.length >= 2 ||
    telemetry.some((p) => p.power > 0 || (p.energy ?? 0) > 0);
  if (!hasUsableData) return [];

  const now = Date.now();
  const hours = getTimeRangeHours(timeRange);
  const startMs = now - hours * 60 * 60 * 1000;
  const endMs = now;

  let bucketMs: number;
  let formatLabel: (ts: number) => string;

  if (timeRange === 'hour') {
    bucketMs = 5 * 60 * 1000;
    formatLabel = (ts) => formatTelemetryTime(ts);
  } else if (timeRange === 'day') {
    bucketMs = 60 * 60 * 1000;
    formatLabel = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    bucketMs = 24 * 60 * 60 * 1000;
    formatLabel = (ts) => formatTelemetryDate(ts);
  }

  const buckets = bucketIntegratedKwh(telemetry, bucketMs, startMs, endMs, bucketMs >= 60 * 60 * 1000);
  if (!buckets.length) return [];

  return buckets.map(({ bucketStart, kwh }, index, arr) => {
    const co2 = Math.round(kwh * emissionFactor);
    const prevKwh = index > 0 ? arr[index - 1].kwh : kwh;
    const baseline = Math.round(prevKwh * emissionFactor);
    const avoided = baseline > co2 ? baseline - co2 : 0;
    return { m: formatLabel(bucketStart), co2, baseline, avoided };
  });
}

export { sendRelayCommand, savePlatformSettings } from './firebase-api';

export function useHydranetDashboardData() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(defaultPlatformSettings);
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
      setPlatformSettings(defaultPlatformSettings);
      setRenewableMixConfigured(false);
      setIsLoading(false);
      return undefined;
    }

    let unsubDevices: Unsubscribe | undefined;
    let unsubCommands: Unsubscribe | undefined;
    let unsubPlatform: Unsubscribe | undefined;
    let unsubscribeAuth: (() => void) | undefined;

    const attachTelemetryListener = (deviceId: string) => {
      const existing = telemetryUnsubsRef.current.get(deviceId);
      existing?.();

      const unsub = onSnapshot(
        query(collection(db, 'devices', deviceId, 'telemetry'), orderBy('ts', 'desc'), limit(TELEMETRY_LIMIT)),
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
        collection(db, 'devices'),
        (snapshot) => {
          if (!devicesLoadedRef.current) {
            devicesLoadedRef.current = true;
            setIsLoading(false);
          }

          const commandMap = new Map(commandsRef.current.map((command) => [command.deviceId, command]));
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
          console.warn('Unable to load devices from Firestore:', error);
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

    unsubCommands = onSnapshot(
      query(collectionGroup(db, 'commands'), orderBy('createdAtMs', 'desc'), limit(100)),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const parent = docSnap.ref.parent.parent;
          return {
            deviceId: String(parent?.id ?? 'UNKNOWN'),
            cmd: String(raw.cmd ?? '').toUpperCase(),
            status: String(raw.status ?? 'pending').toLowerCase(),
            createdAtMs: Number(raw.createdAtMs ?? Date.now()),
          };
        });
        setCommands(rows);
      },
      (error) => {
        console.warn('Unable to load command history:', error);
        setCommands([]);
      },
    );

    unsubPlatform = onSnapshot(
      doc(db, 'appConfig', 'platform'),
      (snapshot) => {
        const raw = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
        const { mix, configured } = normalizeRenewableMix(raw?.renewableMix);
        setRenewableMixConfigured(configured);
        setPlatformSettings({ ...normalizePlatformSettings(raw), renewableMix: mix });
      },
      (error) => {
        console.warn('Unable to load platform settings:', error);
        setPlatformSettings(defaultPlatformSettings);
        setRenewableMixConfigured(false);
      },
    );

    return () => {
      unsubscribeAuth?.();
      unsubDevices?.();
      unsubCommands?.();
      unsubPlatform?.();
      telemetryUnsubsRef.current.forEach((unsub) => unsub());
      telemetryUnsubsRef.current.clear();
    };
  }, []);

  const tariffPerKwh = platformSettings.tariffPerKwh || TARIFF_TZS_PER_KWH;

  const allTelemetry = useMemo(() => {
    const fromSubcollections = Array.from(telemetryMap.values()).flat();
    const fallbacks = devices
      .filter((device) => device.latestReading)
      .map((device) => device.latestReading as TelemetryPoint);
    return dedupeTelemetryPoints([...fromSubcollections, ...fallbacks]);
  }, [telemetryMap, devices]);

  const recentTelemetry = useMemo(
    () => [...allTelemetry].sort((a, b) => b.ts - a.ts),
    [allTelemetry],
  );

  const deviceTelemetryIndex = useMemo(() => buildDeviceTelemetryIndex(allTelemetry), [allTelemetry]);

  const getPointKwh = useCallback(
    (point: TelemetryPoint) => rowKwhFromDeviceIndex(deviceTelemetryIndex, point),
    [deviceTelemetryIndex],
  );

  const getEmissionsSeries = useCallback(
    (timeRange: TimeRange) => emissionsSeries(allTelemetry, timeRange, GRID_EMISSION_FACTOR_KGCO2_PER_KWH),
    [allTelemetry],
  );

  const getEnergyChartSeriesForRange = useCallback(
    (range: EnergyChartRange) => getEnergyChartSeries(allTelemetry, range, tariffPerKwh),
    [allTelemetry, tariffPerKwh],
  );

  const getDeviceComparisonSeriesForRange = useCallback(
    (deviceIds: string[], startMs: number, endMs: number) =>
      getDeviceComparisonSeries(devices, telemetryMap, deviceIds, startMs, endMs),
    [devices, telemetryMap],
  );

  const consumptionSeries = useMemo(() => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000;
    const bucketMs = 60 * 60 * 1000;
    let buckets = bucketIntegratedKwh(allTelemetry, bucketMs, startMs, now, true).map(({ bucketStart, kwh }) => ({
      t: formatTelemetryTime(bucketStart),
      kwh: Number(kwh.toFixed(1)),
      cost: Number((kwh * tariffPerKwh).toFixed(1)),
    }));

    const allZero = buckets.length === 0 || buckets.every((bucket) => bucket.kwh === 0);
    const todayKwhTotal = devices.reduce((sum, device) => sum + Math.max(0, device.todayKwh), 0);

    if (allZero && todayKwhTotal > 0) {
      const timestamps = allTelemetry.length
        ? allTelemetry.map((point) => point.ts)
        : devices.filter((device) => device.lastSeenMs > 0).map((device) => device.lastSeenMs);

      if (timestamps.length > 0) {
        const hourWeights = new Map<number, number>();
        timestamps.forEach((ts) => {
          const hourStart = alignBucketStartEat(ts, bucketMs);
          hourWeights.set(hourStart, (hourWeights.get(hourStart) ?? 0) + 1);
        });
        const totalWeight = Array.from(hourWeights.values()).reduce((sum, weight) => sum + weight, 0);
        buckets = Array.from(hourWeights.entries())
          .sort(([a], [b]) => a - b)
          .map(([hourStart, weight]) => {
            const kwh = (todayKwhTotal * weight) / totalWeight;
            return {
              t: formatTelemetryTime(hourStart),
              kwh: Number(kwh.toFixed(1)),
              cost: Number((kwh * tariffPerKwh).toFixed(1)),
            };
          });
      } else {
        const currentHourStart = alignBucketStartEat(now, bucketMs);
        buckets = [{
          t: formatTelemetryTime(currentHourStart),
          kwh: Number(todayKwhTotal.toFixed(1)),
          cost: Number((todayKwhTotal * tariffPerKwh).toFixed(1)),
        }];
      }
    }

    return buckets;
  }, [allTelemetry, devices, tariffPerKwh]);

  const siteBreakdown = useMemo(() => {
    if (!devices.length) return [];
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000;
    const grouped = new Map<string, { site: string; kwh: number; cost: number }>();
    devices.forEach((device) => {
      const points = deviceTelemetryPoints(device);
      let kwh = points.length >= 2 ? integrateKwhBetween(points, startMs, now) : 0;
      if (kwh <= 0) kwh = device.todayKwh;
      const existing = grouped.get(device.site) ?? { site: device.site, kwh: 0, cost: 0 };
      existing.kwh += kwh;
      existing.cost += kwh * tariffPerKwh;
      grouped.set(device.site, existing);
    });
    return Array.from(grouped.values()).sort((a, b) => b.kwh - a.kwh);
  }, [devices, tariffPerKwh]);

  const costTrend = useMemo(
    () => buildCostTrend(allTelemetry, tariffPerKwh, platformSettings.monthlyBudget),
    [allTelemetry, tariffPerKwh, platformSettings.monthlyBudget],
  );

  const renewableMix = useMemo(() => {
    if (renewableMixConfigured && platformSettings.renewableMix.length) {
      return platformSettings.renewableMix;
    }
    const deviceShare = deriveDeviceEnergyShare(devices);
    if (deviceShare.length) return deviceShare;
    return deriveRenewableMixFromDevices(devices, Date.now());
  }, [renewableMixConfigured, platformSettings.renewableMix, devices]);

  const emissionsTrend = useMemo(
    () => getEmissionsSeries('day'),
    [getEmissionsSeries],
  );

  const recommendations = useMemo(() => {
    if (!devices.length) return [] as Recommendation[];

    const generated: Recommendation[] = [];

    devices.forEach((device) => {
      if (device.status === 'fault' || device.status === 'offline') {
        generated.push({
          id: `rec-${device.id}`,
          title: device.status === 'fault' ? 'Correct power quality at site' : 'Restore telemetry connectivity',
          detail: `${device.name} is ${device.status}. Review the relay and communications path to restore stable operation.`,
          device: `${device.id} · ${device.name}`,
          savingKwh: 0,
          savingTzs: 0,
          co2SavedKg: 0,
          priority: 'high',
          category: device.status === 'fault' ? 'Power quality' : 'Reliability',
        });
      }

      if (device.status === 'stale' && device.todayKwh > 0) {
        const savingKwh = Math.max(25, Math.round(device.todayKwh * 0.08));
        generated.push({
          id: `rec-${device.id}-schedule`,
          title: 'Reschedule idle overnight load',
          detail: `${device.name} has stale telemetry and some overnight draw. Confirm the schedule and avoid unnecessary off-hours consumption.`,
          device: `${device.id} · ${device.name}`,
          savingKwh,
          savingTzs: Math.max(15000, Math.round(savingKwh * tariffPerKwh)),
          co2SavedKg: Math.max(0, Math.round(savingKwh * GRID_EMISSION_FACTOR_KGCO2_PER_KWH)),
          priority: 'medium',
          category: 'Scheduling',
        });
      }

      if (device.power_factor > 0 && device.power_factor < 0.9) {
        const savingKwh = Math.max(10, Math.round(device.todayKwh * 0.05));
        generated.push({
          id: `rec-${device.id}-pf`,
          title: 'Improve power factor',
          detail: `${device.name} is operating below 0.9 PF. Add correction or reduce inductive load to cut losses.`,
          device: `${device.id} · ${device.name}`,
          savingKwh,
          savingTzs: Math.round(savingKwh * tariffPerKwh),
          co2SavedKg: Math.round(savingKwh * GRID_EMISSION_FACTOR_KGCO2_PER_KWH),
          priority: 'medium',
          category: 'Power quality',
        });
      }
    });

    return generated.slice(0, 4);
  }, [devices, tariffPerKwh]);

  const hourlyProfile = useMemo(() => {
    const now = Date.now();
    const startMs = now - 24 * 60 * 60 * 1000;
    let buckets = bucketIntegratedKwh(allTelemetry, 60 * 60 * 1000, startMs, now, true);

    const allZero = !buckets.length || buckets.every((b) => b.kwh === 0);
    const todayKwhTotal = devices.reduce((sum, d) => sum + Math.max(0, d.todayKwh), 0);

    if (allZero && todayKwhTotal > 0) {
      const hourStart = alignBucketStartEat(now, 60 * 60 * 1000);
      buckets = [{ bucketStart: hourStart, kwh: todayKwhTotal }];
    } else if (allTelemetry.length < 2 && todayKwhTotal > 0) {
      const ts = devices.find((d) => d.lastSeenMs)?.lastSeenMs ?? now;
      const hourStart = alignBucketStartEat(ts, 60 * 60 * 1000);
      buckets = [{ bucketStart: hourStart, kwh: todayKwhTotal }];
    }

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
  }, [allTelemetry, tariffPerKwh, devices]);

  const exportsHistory = useMemo((): ExportRecord[] => {
    return commands.slice(0, 10).map((cmd) => ({
      id: `export-${cmd.deviceId}-${cmd.createdAtMs}`,
      name: `Relay ${cmd.cmd} · ${cmd.deviceId}`,
      format: 'CSV',
      size: '—',
      created: formatRelativeTime(new Date(cmd.createdAtMs)),
      status: cmd.status === 'failed' ? 'Failed' : 'Ready',
    }));
  }, [commands]);

  const recentActivity = useMemo((): ActivityRecord[] => {
    return commands.slice(0, 20).map((cmd) => ({
      id: `act-${cmd.deviceId}-${cmd.createdAtMs}`,
      action: cmd.cmd === 'ON' ? 'Relay ON' : 'Relay OFF',
      target: cmd.deviceId,
      actor: 'Operator',
      time: formatRelativeTime(new Date(cmd.createdAtMs)),
      state: cmd.status,
    }));
  }, [commands]);

  return {
    devices,
    commands,
    consumptionSeries,
    siteBreakdown,
    costTrend,
    renewableMix,
    renewableMixConfigured,
    emissionsTrend,
    sustainabilityEquivalents: (() => {
      const co2TodayKg = devices.reduce((sum, device) => sum + Math.max(0, device.todayKwh), 0) * GRID_EMISSION_FACTOR_KGCO2_PER_KWH;
      return {
        trees: Math.max(0, Math.round(co2TodayKg * 0.22)),
        kmAvoided: Math.max(0, Math.round(co2TodayKg * 4.8)),
        homesPowered: Math.max(0, Math.round(co2TodayKg / 220)),
        phonesCharged: Math.max(0, Math.round(co2TodayKg * 420)),
      };
    })(),
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
    GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
    currency,
    touBands,
    periodOf,
    getTimeRangeHours,
  };
}
