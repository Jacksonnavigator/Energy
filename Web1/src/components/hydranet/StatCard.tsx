import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  unit,
  delta,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: string; direction: "up" | "down"; good?: boolean; context?: string };
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "warning";
}) {
  return (
    <div className="card-surface min-h-28 p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <p className="label-eyebrow">{label}</p>
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md border border-transparent",
            tone === "primary" && "bg-accent text-accent-foreground",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "neutral" && "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </p>
      {delta && (
        <p
          className={cn(
            "mt-2 flex items-center gap-1 text-xs font-medium",
            delta.good === false ? "text-destructive" : "text-success",
          )}
        >
          {delta.direction === "up" ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {delta.value}
          {delta.context && (
            <span className="font-normal text-muted-foreground">{delta.context}</span>
          )}
        </p>
      )}
    </div>
  );
}
