import type {
  Assignment,
  AssistEvent,
  DistributionOptions,
  DistributionResult,
  OrderInput,
  PickerResult,
  Segment,
  Strategy,
} from "./types";

/**
 * Moteur de distribution des commandes entre pickers.
 *
 * Principe
 * --------
 * 1. Répartition initiale : chaque commande est confiée à UN seul picker.
 *    Deux heuristiques sont construites, puis la meilleure est retenue :
 *      - "best-fit"  : remplissage vers la charge cible (total / pickers).
 *                      Les grosses commandes (>= cible) restent seules, les petites
 *                      sont regroupées pour atteindre la cible sans la dépasser.
 *      - "lpt"       : « plus grosse commande d'abord » sur le picker le moins chargé.
 * 2. Simulation avec renforts : tous les pickers ont la même productivité
 *    (1 article par unité de temps). Dès qu'un picker a fini sa file, il rejoint la
 *    commande en cours qui a le plus d'articles restants par préparateur, tant que
 *    chaque participant garde au moins `minAssistChunk` articles à traiter.
 * 3. Choix : plan au temps de fin estimé le plus court (à un lot d'assistance près),
 *    puis moins de renforts (moins de fragmentation), puis charge initiale maximale
 *    la plus faible.
 *
 * Aucune dépendance à l'UI ni à la base de données.
 */

const EPS = 1e-9;
export const DEFAULT_MIN_ASSIST_CHUNK = 5;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(orders: OrderInput[], pickers: number, cap = Infinity): void {
  if (!Number.isInteger(pickers) || pickers < 1) {
    throw new Error("Le nombre de pickers doit être un entier supérieur ou égal à 1.");
  }
  if (cap !== Infinity && (!Number.isInteger(cap) || cap < 1)) {
    throw new Error("La limite de commandes par picker doit être un entier supérieur ou égal à 1.");
  }
  if (orders.length > pickers * cap) {
    throw new Error(
      `${orders.length} commandes pour ${pickers} picker(s) : impossible avec ${cap} commandes maximum par picker. ` +
        `Prévoyez au moins ${Math.ceil(orders.length / cap)} pickers.`,
    );
  }
  const ids = new Set<string>();
  for (const o of orders) {
    if (!Number.isInteger(o.articles) || o.articles < 1) {
      throw new Error(`La commande « ${o.reference} » doit contenir au moins 1 article (entier).`);
    }
    if (ids.has(o.id)) throw new Error(`Identifiant de commande en double : ${o.id}`);
    ids.add(o.id);
  }
}

function validateAssignment(orders: OrderInput[], assignment: Assignment): void {
  const seen = new Set<string>();
  const known = new Set(orders.map((o) => o.id));
  for (const ids of assignment) {
    for (const id of ids) {
      if (!known.has(id)) throw new Error(`Commande inconnue dans la répartition : ${id}`);
      if (seen.has(id)) throw new Error(`Commande affectée plusieurs fois : ${id}`);
      seen.add(id);
    }
  }
  if (seen.size !== known.size) {
    throw new Error("Toutes les commandes doivent être affectées à un picker.");
  }
}

// ---------------------------------------------------------------------------
// Répartitions initiales
// ---------------------------------------------------------------------------

function sortedDesc(orders: OrderInput[]): OrderInput[] {
  // Tri stable : à taille égale, l'ordre de saisie est conservé.
  return orders
    .map((o, index) => ({ o, index }))
    .sort((a, b) => b.o.articles - a.o.articles || a.index - b.index)
    .map((x) => x.o);
}

/** Best-fit decreasing vers la charge cible total / pickers. */
export function buildBestFitAssignment(orders: OrderInput[], pickers: number, cap = Infinity): Assignment {
  validate(orders, pickers, cap);
  const total = orders.reduce((s, o) => s + o.articles, 0);
  const target = total / pickers;
  const loads: number[] = Array(pickers).fill(0);
  const result: Assignment = Array.from({ length: pickers }, () => []);

  for (const order of sortedDesc(orders)) {
    let chosen = -1;
    for (let p = 0; p < pickers; p++) {
      if (result[p].length >= cap) continue;
      if (loads[p] + order.articles <= target + EPS) {
        // Parmi les pickers où la commande « tient », on prend le plus rempli.
        if (chosen === -1 || loads[p] > loads[chosen] + EPS) chosen = p;
      }
    }
    if (chosen === -1) {
      // Aucune place sous la cible : picker le moins chargé qui peut encore recevoir une commande.
      for (let p = 0; p < pickers; p++) {
        if (result[p].length >= cap) continue;
        if (chosen === -1 || loads[p] + EPS < loads[chosen]) chosen = p;
      }
    }
    result[chosen].push(order.id);
    loads[chosen] += order.articles;
  }
  return result;
}

/** LPT : plus grosse commande d'abord sur le picker le moins chargé. */
export function buildLptAssignment(orders: OrderInput[], pickers: number, cap = Infinity): Assignment {
  validate(orders, pickers, cap);
  const loads: number[] = Array(pickers).fill(0);
  const result: Assignment = Array.from({ length: pickers }, () => []);
  for (const order of sortedDesc(orders)) {
    let chosen = -1;
    for (let p = 0; p < pickers; p++) {
      if (result[p].length >= cap) continue;
      if (chosen === -1 || loads[p] + EPS < loads[chosen]) chosen = p;
    }
    result[chosen].push(order.id);
    loads[chosen] += order.articles;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Simulation avec renforts
// ---------------------------------------------------------------------------

/**
 * Évalue une répartition initiale (générée ou ajustée manuellement) en simulant
 * l'exécution avec renforts. Fonction pure et déterministe.
 */
export function evaluateAssignment(
  orders: OrderInput[],
  assignment: Assignment,
  options: Partial<DistributionOptions> = {},
  strategy: Strategy = "manual",
): DistributionResult {
  const P = assignment.length;
  const cap = options.maxOrdersPerPicker ?? Infinity;
  validate(orders, P, cap);
  validateAssignment(orders, assignment);
  assignment.forEach((ids, p) => {
    if (ids.length > cap) throw new Error(`Le picker ${p + 1} a ${ids.length} commandes (maximum ${cap}).`);
  });
  const minChunk = Math.max(0, options.minAssistChunk ?? DEFAULT_MIN_ASSIST_CHUNK);

  const order = new Map(orders.map((o, index) => [o.id, { ...o, index }]));
  // Dans une file, les grosses commandes démarrent d'abord : elles restent ainsi
  // disponibles plus longtemps pour recevoir des renforts.
  const queues = assignment.map((ids) =>
    ids
      .map((id) => order.get(id)!)
      .sort((a, b) => b.articles - a.articles || a.index - b.index),
  );

  const remaining = new Map<string, number>(orders.map((o) => [o.id, o.articles]));
  const workers = new Map<string, Set<number>>(); // uniquement les commandes en cours
  const ownerOf = new Map<string, number>();
  const active: (string | null)[] = Array(P).fill(null);
  const segStart: number[] = Array(P).fill(0);
  const segKind: ("own" | "assist")[] = Array(P).fill("own");
  const worked: number[] = Array(P).fill(0);
  const finish: number[] = Array(P).fill(0);
  const assists: AssistEvent[] = [];
  const segments: Segment[] = [];
  let t = 0;

  const begin = (p: number, id: string, kind: "own" | "assist") => {
    active[p] = id;
    segStart[p] = t;
    segKind[p] = kind;
    workers.get(id)!.add(p);
  };

  const assignIdle = () => {
    // 1) Les pickers libres démarrent la commande suivante de leur propre file.
    for (let p = 0; p < P; p++) {
      if (active[p] === null && queues[p].length > 0) {
        const next = queues[p].shift()!;
        workers.set(next.id, new Set());
        ownerOf.set(next.id, p);
        begin(p, next.id, "own");
      }
    }
    // 2) Les pickers sans travail viennent en renfort sur la commande la plus chargée
    //    (articles restants par préparateur), sans fragmenter en dessous du seuil.
    for (let p = 0; p < P; p++) {
      if (active[p] !== null || queues[p].length > 0) continue;
      let best: string | null = null;
      let bestScore = -1;
      for (const [id, ws] of workers) {
        const rem = remaining.get(id)!;
        if (rem <= EPS) continue;
        if (rem / (ws.size + 1) + EPS < minChunk) continue;
        const score = rem / ws.size;
        if (score > bestScore + EPS) {
          best = id;
          bestScore = score;
        }
      }
      if (best !== null) {
        assists.push({
          time: t,
          helper: p + 1,
          owner: ownerOf.get(best)! + 1,
          orderId: best,
          reference: order.get(best)!.reference,
          remainingBefore: remaining.get(best)!,
        });
        begin(p, best, "assist");
      }
    }
  };

  assignIdle();
  while (workers.size > 0) {
    // Prochain événement : fin de la première commande en cours.
    let dt = Infinity;
    for (const [id, ws] of workers) dt = Math.min(dt, remaining.get(id)! / ws.size);
    t += dt;
    for (const [id, ws] of workers) {
      remaining.set(id, remaining.get(id)! - dt * ws.size);
      for (const p of ws) worked[p] += dt;
    }
    for (const [id, ws] of [...workers]) {
      if (remaining.get(id)! > EPS) continue;
      remaining.set(id, 0);
      for (const p of ws) {
        segments.push({
          picker: p + 1,
          orderId: id,
          reference: order.get(id)!.reference,
          start: round4(segStart[p]),
          end: round4(t),
          kind: segKind[p],
        });
        finish[p] = t;
        active[p] = null;
      }
      workers.delete(id);
    }
    assignIdle();
  }

  const pickersResult: PickerResult[] = assignment.map((ids, p) => {
    const orderIds = ids
      .map((id) => order.get(id)!)
      .sort((a, b) => b.articles - a.articles || a.index - b.index)
      .map((o) => o.id);
    const assistArticles = segments
      .filter((s) => s.picker === p + 1 && s.kind === "assist")
      .reduce((sum, s) => sum + (s.end - s.start), 0);
    return {
      picker: p + 1,
      orderIds,
      assignedArticles: ids.reduce((s, id) => s + order.get(id)!.articles, 0),
      workedArticles: round4(worked[p]),
      assistArticles: round4(assistArticles),
      finishTime: round4(finish[p]),
    };
  });

  const totalArticles = orders.reduce((s, o) => s + o.articles, 0);
  return {
    strategy,
    pickers: pickersResult,
    assists: assists.map((a) => ({
      ...a,
      time: round4(a.time),
      remainingBefore: round4(a.remainingBefore),
    })),
    segments: segments.sort((a, b) => a.start - b.start || a.picker - b.picker),
    totalOrders: orders.length,
    totalArticles,
    makespan: round4(t),
    lowerBound: round4(totalArticles / P),
  };
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

/**
 * Génère la meilleure distribution (répartition initiale + renforts suggérés).
 */
export function distributeOrders(
  orders: OrderInput[],
  options: DistributionOptions,
): DistributionResult {
  const cap = options.maxOrdersPerPicker ?? Infinity;
  validate(orders, options.pickers, cap);

  const candidates: DistributionResult[] = [
    evaluateAssignment(orders, buildBestFitAssignment(orders, options.pickers, cap), options, "best-fit"),
    evaluateAssignment(orders, buildLptAssignment(orders, options.pickers, cap), options, "lpt"),
  ];

  // Deux plans dont les temps de fin diffèrent de moins d'un « lot d'assistance »
  // sont considérés équivalents : le modèle ne peut pas être plus précis que cette
  // granularité. On préfère alors le plan avec le moins de renforts (moins de
  // fragmentation), puis la charge initiale maximale la plus faible, puis l'ordre
  // des candidats (best-fit d'abord : regroupe les petites commandes).
  const minChunk = Math.max(0, options.minAssistChunk ?? DEFAULT_MIN_ASSIST_CHUNK);
  const bestTime = Math.min(...candidates.map((c) => c.makespan));
  const maxLoad = (r: DistributionResult) => Math.max(0, ...r.pickers.map((p) => p.assignedArticles));
  const eligible = candidates.filter((c) => c.makespan <= bestTime + minChunk + EPS);
  eligible.sort(
    (a, b) => a.assists.length - b.assists.length || maxLoad(a) - maxLoad(b),
  );
  return eligible[0];
}
