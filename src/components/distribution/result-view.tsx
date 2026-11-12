import type { DistributionResult, OrderInput } from "@/lib/distribution";
import { fmt, fmtMinutes } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/kpi-card";

interface ResultViewProps {
  result: DistributionResult;
  orders: OrderInput[];
  /** Conversion d'estimation : minutes par article et par picker. */
  minutesPerArticle: number;
}

/** Affichage commun : résultat tout juste généré ou distribution de l'historique. */
export function ResultView({ result, orders, minutesPerArticle }: ResultViewProps) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const min = (units: number) => fmtMinutes(units * minutesPerArticle);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Commandes distribuées" value={result.totalOrders} />
        <KpiCard label="Articles distribués" value={result.totalArticles} />
        <KpiCard
          label="Articles par picker (moy.)"
          value={fmt(result.pickers.length ? result.totalArticles / result.pickers.length : 0)}
          hint={`${result.pickers.length} pickers`}
        />
        <KpiCard
          label="Fin estimée"
          value={min(result.makespan)}
          hint={`Borne théorique : ${min(result.lowerBound)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparaison des charges par picker</CardTitle>
          <CardDescription>
            Articles affectés au départ, puis articles réellement préparés une fois les renforts appliqués.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkloadBars result={result} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Affectation des commandes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Picker</TH>
                <TH>Commandes affectées</TH>
                <TH className="text-right">Articles affectés</TH>
              </TR>
            </THead>
            <TBody>
              {result.pickers.map((p) => (
                <TR key={p.picker}>
                  <TD className="font-medium">Picker {p.picker}</TD>
                  <TD>
                    {p.orderIds.length === 0 ? (
                      <span className="text-muted-foreground">Aucune commande (renfort)</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {p.orderIds.map((id) => (
                          <span key={id} className="rounded bg-muted px-2 py-0.5 text-xs">
                            {byId.get(id)?.reference ?? id} · {byId.get(id)?.articles ?? "?"}
                          </span>
                        ))}
                      </div>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{p.assignedArticles}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Séquence d'assistance suggérée</CardTitle>
          <CardDescription>
            Quand un picker termine ses commandes, il rejoint la commande qui a le plus d'articles restants par préparateur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.assists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune assistance nécessaire : les charges sont équilibrées.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {result.assists.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-[#7a5d2e]">
                    {i + 1}
                  </span>
                  <span>
                    À <strong>{min(a.time)}</strong> : <strong>Picker {a.helper}</strong> aide <strong>Picker {a.owner}</strong>{" "}
                    sur la commande <strong>{a.reference}</strong> ({fmt(a.remainingBefore)} articles restants).
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chronologie estimée</CardTitle>
          <CardDescription>Chaque ligne est un picker ; les blocs ambrés sont des renforts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline result={result} minutesPerArticle={minutesPerArticle} />
        </CardContent>
      </Card>
    </div>
  );
}

function WorkloadBars({ result }: { result: DistributionResult }) {
  const max = Math.max(1, ...result.pickers.flatMap((p) => [p.assignedArticles, p.workedArticles]));
  const avg = result.totalArticles / Math.max(1, result.pickers.length);
  const pct = (n: number) => `${(n / max) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-4">
        {result.pickers.map((p) => (
          <div key={p.picker} className="grid grid-cols-[5rem_1fr] items-center gap-3">
            <span className="text-sm font-medium">Picker {p.picker}</span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full rounded bg-stone-400 bar-grow" style={{ width: pct(p.assignedArticles) }} />
                </div>
                <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                  {p.assignedArticles} affectés
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-3 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: pct(p.workedArticles - p.assistArticles) }} />
                  <div className="h-full bg-accent" style={{ width: pct(p.assistArticles) }} />
                </div>
                <span className="w-24 text-right text-xs tabular-nums">{fmt(p.workedArticles)} préparés</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Legend color="bg-stone-400" label="Affectation initiale" />
        <Legend color="bg-primary" label="Préparé (commandes propres)" />
        <Legend color="bg-accent" label="Préparé en renfort" />
        <span>Charge moyenne idéale : {fmt(avg)} articles</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} /> {label}
    </span>
  );
}

function Timeline({ result, minutesPerArticle }: { result: DistributionResult; minutesPerArticle: number }) {
  const total = Math.max(result.makespan, 1e-9);
  const min = (units: number) => fmtMinutes(units * minutesPerArticle);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total);

  return (
    <div className="flex flex-col gap-2">
      {result.pickers.map((p) => (
        <div key={p.picker} className="grid grid-cols-[5rem_1fr] items-center gap-3">
          <span className="text-sm">Picker {p.picker}</span>
          <div className="relative h-7 rounded bg-muted">
            {result.segments
              .filter((s) => s.picker === p.picker)
              .map((s, i) => (
                <div
                  key={i}
                  title={`${s.reference} — ${s.kind === "assist" ? "renfort" : "commande propre"} (${min(s.start)} → ${min(s.end)})`}
                  className={`absolute top-0.5 bottom-0.5 overflow-hidden rounded px-1 text-[10px] leading-6 ${
                    s.kind === "assist" ? "bg-accent text-white" : "bg-primary text-primary-foreground"
                  }`}
                  style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }}
                >
                  {s.reference}
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <span />
        <div className="relative h-4 text-[10px] text-muted-foreground">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${(t / total) * 100}%` }}
            >
              {min(t)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
