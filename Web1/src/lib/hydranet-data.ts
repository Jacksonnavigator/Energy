export type DeviceStatus = "online" | "offline" | "fault" | "stale";

export type CommandState = "idle" | "pending" | "confirmed" | "failed";

export type Device = {
  id: string;
  name: string;
  site: string;
  status: DeviceStatus;
  relay: boolean;
  load: number; // kW
  voltage: number;
  current: number; // A
  power_factor: number;
  todayKwh: number;
  lastSeen: string;
  command: CommandState;
};

export const TARIFF_TZS_PER_KWH = 292;
export const TIMEZONE = "Africa/Dar_es_Salaam (UTC+3)";

export const devices: Device[] = [
  { id: "HN-1042", name: "Chiller Plant A", site: "Dar es Salaam HQ", status: "online", relay: true, load: 84.2, voltage: 415, current: 121.4, power_factor: 0.96, todayKwh: 612, lastSeen: "12s ago", command: "idle" },
  { id: "HN-1043", name: "Cold Room 2", site: "Dar es Salaam HQ", status: "online", relay: true, load: 31.7, voltage: 412, current: 46.9, power_factor: 0.94, todayKwh: 244, lastSeen: "8s ago", command: "confirmed" },
  { id: "HN-2210", name: "Pump Station West", site: "Kibaha Industrial", status: "fault", relay: false, load: 0, voltage: 398, current: 0, power_factor: 0.71, todayKwh: 87, lastSeen: "4m ago", command: "failed" },
  { id: "HN-2211", name: "Compressor Line 1", site: "Kibaha Industrial", status: "online", relay: true, load: 56.4, voltage: 414, current: 85.2, power_factor: 0.92, todayKwh: 401, lastSeen: "21s ago", command: "pending" },
  { id: "HN-3301", name: "HVAC Rooftop", site: "Arusha Depot", status: "stale", relay: false, load: 12.1, voltage: 410, current: 19.7, power_factor: 0.89, todayKwh: 96, lastSeen: "18m ago", command: "idle" },
  { id: "HN-3302", name: "Conveyor Drive", site: "Arusha Depot", status: "offline", relay: false, load: 0, voltage: 0, current: 0, power_factor: 0, todayKwh: 0, lastSeen: "2h ago", command: "idle" },
  { id: "HN-4110", name: "Lighting Circuit B", site: "Mwanza Yard", status: "online", relay: true, load: 8.9, voltage: 240, current: 37.9, power_factor: 0.98, todayKwh: 61, lastSeen: "5s ago", command: "idle" },
  { id: "HN-4111", name: "Backup Generator", site: "Mwanza Yard", status: "online", relay: false, load: 0.4, voltage: 415, current: 0.6, power_factor: 0.99, todayKwh: 3, lastSeen: "17s ago", command: "idle" },
];

export const consumptionSeries = [
  { t: "00:00", kwh: 118, cost: 34.5 },
  { t: "03:00", kwh: 96, cost: 28.0 },
  { t: "06:00", kwh: 164, cost: 47.9 },
  { t: "09:00", kwh: 268, cost: 78.3 },
  { t: "12:00", kwh: 312, cost: 91.1 },
  { t: "15:00", kwh: 289, cost: 84.4 },
  { t: "18:00", kwh: 341, cost: 99.6 },
  { t: "21:00", kwh: 205, cost: 59.9 },
];

export const siteBreakdown = [
  { site: "Dar es Salaam HQ", kwh: 856, cost: 249952 },
  { site: "Kibaha Industrial", kwh: 488, cost: 142496 },
  { site: "Arusha Depot", kwh: 96, cost: 28032 },
  { site: "Mwanza Yard", kwh: 64, cost: 18688 },
];

export const costTrend = [
  { m: "Mar", cost: 6248000, budget: 7000000 },
  { m: "Apr", cost: 6745000, budget: 7000000 },
  { m: "May", cost: 6439000, budget: 7000000 },
  { m: "Jun", cost: 7475000, budget: 7000000 },
  { m: "Jul", cost: 7060000, budget: 7300000 },
  { m: "Aug", cost: 5802000, budget: 7300000 },
];

export type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  device: string;
  time: string;
  acknowledged: boolean;
};

export const alerts: Alert[] = [
  { id: "A-9021", severity: "critical", title: "Phase imbalance detected", device: "HN-2210 · Pump Station West", time: "4 min ago", acknowledged: false },
  { id: "A-9020", severity: "warning", title: "Load above 85% of rated capacity", device: "HN-1042 · Chiller Plant A", time: "26 min ago", acknowledged: false },
  { id: "A-9019", severity: "warning", title: "Telemetry stale for over 15 minutes", device: "HN-3301 · HVAC Rooftop", time: "18 min ago", acknowledged: false },
  { id: "A-9018", severity: "warning", title: "Power factor below 0.90", device: "HN-3301 · HVAC Rooftop", time: "1 hr ago", acknowledged: true },
  { id: "A-9016", severity: "info", title: "Relay command pending confirmation", device: "HN-2211 · Compressor Line 1", time: "2 min ago", acknowledged: false },
  { id: "A-9015", severity: "info", title: "Relay switched off by schedule", device: "HN-4111 · Backup Generator", time: "3 hrs ago", acknowledged: true },
  { id: "A-9011", severity: "critical", title: "Device unreachable", device: "HN-3302 · Conveyor Drive", time: "2 hrs ago", acknowledged: false },
  { id: "A-9007", severity: "info", title: "Firmware 4.2.1 installed", device: "HN-1043 · Cold Room 2", time: "Yesterday", acknowledged: true },
];

export const recentActivity = [
  { id: "EV-771", action: "Relay ON sent", target: "HN-2211 · Compressor Line 1", actor: "j.wambali", time: "2 min ago", state: "Pending" },
  { id: "EV-770", action: "Relay OFF confirmed", target: "HN-1043 · Cold Room 2", actor: "scheduler", time: "26 min ago", state: "Confirmed" },
  { id: "EV-769", action: "Command failed — no ack", target: "HN-2210 · Pump Station West", actor: "j.wambali", time: "41 min ago", state: "Failed" },
  { id: "EV-768", action: "Threshold updated to 85%", target: "Fleet policy", actor: "admin", time: "3 hrs ago", state: "Confirmed" },
  { id: "EV-767", action: "Tariff set to 292 TZS/kWh", target: "Billing settings", actor: "admin", time: "Yesterday", state: "Confirmed" },
];

export const exportsHistory = [
  { id: "EX-3312", name: "August consumption — all sites", format: "CSV", size: "1.4 MB", created: "Aug 12, 09:20", status: "Ready" },
  { id: "EX-3309", name: "Relay command log — Kibaha Industrial", format: "XLSX", size: "620 KB", created: "Aug 10, 17:02", status: "Ready" },
  { id: "EX-3305", name: "Q2 cost allocation report", format: "PDF", size: "2.1 MB", created: "Jul 01, 08:00", status: "Ready" },
  { id: "EX-3301", name: "Device roster snapshot", format: "CSV", size: "310 KB", created: "Jun 24, 11:45", status: "Archived" },
];

export const currency = (n: number) =>
  new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);

// ---------------------------------------------------------------------------
// Sustainability & carbon accounting
// Tanzania grid emission factor (kg CO₂ per kWh) — national mix average.
// Source basis: TANESCO generation mix (hydro + gas + diesel + imports).
export const GRID_EMISSION_FACTOR_KGCO2_PER_KWH = 0.43;

export const renewableMix = [
  { source: "Hydro", pct: 32, color: "var(--chart-3)" },
  { source: "Solar PV", pct: 18, color: "var(--chart-1)" },
  { source: "Thermal (gas/diesel)", pct: 44, color: "var(--chart-2)" },
  { source: "Biogas", pct: 6, color: "var(--chart-4)" },
];

// Monthly fleet emissions (tCO₂) vs a no-action baseline, plus CO₂ avoided.
export const emissionsTrend = [
  { m: "Mar", co2: 2680, baseline: 3100, avoided: 420 },
  { m: "Apr", co2: 2902, baseline: 3180, avoided: 278 },
  { m: "May", co2: 2769, baseline: 3120, avoided: 351 },
  { m: "Jun", co2: 3214, baseline: 3210, avoided: -4 },
  { m: "Jul", co2: 3036, baseline: 3250, avoided: 214 },
  { m: "Aug", co2: 2497, baseline: 3140, avoided: 643 },
];

export const sustainabilityEquivalents = {
  trees: 312, // mature trees absorbing CO₂ for one year
  kmAvoided: 14600, // car km equivalent to avoided emissions
  homesPowered: 4, // homes powered for a month by renewable share
  phonesCharged: 612000, // smartphones charged by renewable energy
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

export const recommendations: Recommendation[] = [
  {
    id: "R-01",
    title: "Install power-factor correction at Kibaha",
    detail: "Pump Station West runs at PF 0.71 — a capacitor bank lifts it above 0.95 and removes reactive-power penalties from the TANESCO bill.",
    device: "HN-2210 · Pump Station West",
    savingKwh: 0,
    savingTzs: 184000,
    co2SavedKg: 0,
    priority: "high",
    category: "Power quality",
  },
  {
    id: "R-02",
    title: "Shift chiller pre-cooling off-peak",
    detail: "Moving Chiller Plant A start to 05:00 avoids the TANESCO peak-demand band and trims the monthly maximum-demand charge.",
    device: "HN-1042 · Chiller Plant A",
    savingKwh: 980,
    savingTzs: 285000,
    co2SavedKg: 421,
    priority: "high",
    category: "Peak shaving",
  },
  {
    id: "R-03",
    title: "Attach occupancy schedule to Arusha HVAC",
    detail: "3.4 kWh of overnight draw with no schedule attached — automate the relay off outside occupancy hours.",
    device: "HN-3301 · HVAC Rooftop",
    savingKwh: 412,
    savingTzs: 120000,
    co2SavedKg: 177,
    priority: "medium",
    category: "Scheduling",
  },
  {
    id: "R-04",
    title: "Restore Conveyor Drive connectivity",
    detail: "Device offline for 2h — verify the gateway uplink and re-establish telemetry to recover visibility and control.",
    device: "HN-3302 · Conveyor Drive",
    savingKwh: 0,
    savingTzs: 0,
    co2SavedKg: 0,
    priority: "high",
    category: "Reliability",
  },
  {
    id: "R-05",
    title: "Enable rooftop solar PV offset at Mwanza Yard",
    detail: "Rooftop PV could cover ~40% of daytime lighting load, cutting grid draw and carbon intensity at the site.",
    device: "HN-4110 · Lighting Circuit B",
    savingKwh: 1240,
    savingTzs: 361000,
    co2SavedKg: 533,
    priority: "medium",
    category: "Renewables",
  },
];

// ---------------------------------------------------------------------------
// Reliability, SLA & safety
export const reliabilityMetrics = {
  uptime: 99.62, // % fleet uptime, rolling 30 days
  mttr: "14 min", // mean time to recover
  incidents30d: 3, // unresolved/active incidents last 30 days
  avgResponse: "2m 40s", // mean time to detect & acknowledge
  slaTarget: 99.5, // contracted SLA
  compliance: true,
};

export const uptimeBySite = [
  { site: "Dar es Salaam HQ", uptime: 99.81, sla: 99.5 },
  { site: "Kibaha Industrial", uptime: 98.74, sla: 99.0 },
  { site: "Arusha Depot", uptime: 99.4, sla: 99.0 },
  { site: "Mwanza Yard", uptime: 99.97, sla: 99.5 },
];

export type Incident = {
  id: string;
  title: string;
  device: string;
  severity: "critical" | "warning" | "info";
  detected: string;
  duration: string;
  rootCause: string;
};

export const incidentHistory: Incident[] = [
  { id: "INC-441", title: "Phase imbalance", device: "HN-2210 · Pump Station West", severity: "critical", detected: "Aug 12, 19:11", duration: "Ongoing", rootCause: "Suspected loose neutral · under inspection" },
  { id: "INC-440", title: "Device unreachable", device: "HN-3302 · Conveyor Drive", severity: "critical", detected: "Aug 12, 17:09", duration: "2h 06m", rootCause: "Gateway uplink failure · restarted" },
  { id: "INC-438", title: "Telemetry stale", device: "HN-3301 · HVAC Rooftop", severity: "warning", detected: "Aug 12, 18:53", duration: "18m", rootCause: "Sensor polling timeout · auto-recovered" },
  { id: "INC-435", title: "Overload threshold breach", device: "HN-1042 · Chiller Plant A", severity: "warning", detected: "Aug 12, 18:49", duration: "9m", rootCause: "Compressor staging lag · cleared after load shed" },
  { id: "INC-431", title: "Relay command timeout", device: "HN-2210 · Pump Station West", severity: "warning", detected: "Aug 12, 18:34", duration: "41m", rootCause: "No ack from endpoint · command reissued" },
  { id: "INC-427", title: "Scheduled relay OFF", device: "HN-4111 · Backup Generator", severity: "info", detected: "Aug 12, 16:15", duration: "—", rootCause: "Planned · maintenance window" },
];

export const safetyStatus = {
  relaySafelyControlled: 6, // assets under supervised relay control
  faultProtectionArmed: 8, // assets with protection logic enabled
  overloadProtected: 7, // assets within safe load envelope
  groundFaults: 0, // active ground-fault events
  lastSafetyAudit: "Aug 09, 2026",
};

// ---------------------------------------------------------------------------
// Time-of-use (TANESCO bands, East Africa Time UTC+3)
export type TouPeriod = "peak" | "standard" | "offpeak";

export const touBands: { id: TouPeriod; label: string; window: string; multiplier: number }[] = [
  { id: "peak", label: "Peak", window: "18:00 – 22:00", multiplier: 1.35 },
  { id: "standard", label: "Standard", window: "06:00 – 18:00", multiplier: 1.0 },
  { id: "offpeak", label: "Off-peak", window: "22:00 – 06:00", multiplier: 0.72 },
];

export const periodOf = (hour: number): TouPeriod =>
  hour >= 18 && hour < 22 ? "peak" : hour >= 6 && hour < 18 ? "standard" : "offpeak";

const hourlyKwh = [
  41, 36, 33, 32, 34, 39, 58, 74, 92, 104, 112, 118,
  121, 116, 109, 103, 108, 126, 142, 149, 138, 121, 79, 54,
];

export const hourlyProfile = hourlyKwh.map((kwh, hour) => {
  const period = periodOf(hour);
  const band = touBands.find((b) => b.id === period)!;
  return {
    hour,
    t: `${String(hour).padStart(2, "0")}:00`,
    kwh,
    period,
    kw: Math.round(kwh * 0.94 * 10) / 10,
    cost: Math.round(kwh * TARIFF_TZS_PER_KWH * band.multiplier),
  };
});
