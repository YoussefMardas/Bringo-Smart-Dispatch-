import { Card } from "@/components/ui/card";

/** Carte indicateur : `index` décale l'animation d'entrée pour une apparition en cascade. */
export function KpiCard({
  label,
  value,
  hint,
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  index?: number;
}) {
  return (
    <Card
      className="animate-rise group relative overflow-hidden p-5 hover:shadow-lift"
      style={{ ["--d" as string]: `${index * 70}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-4xl font-light leading-none tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-2.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
