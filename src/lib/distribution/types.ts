/**
 * Types du moteur de distribution.
 * Ce dossier est volontairement indépendant de React, Next.js et Prisma.
 */

export interface OrderInput {
  /** Identifiant unique (clé en base ou identifiant temporaire). */
  id: string;
  /** Référence affichée à l'utilisateur. */
  reference: string;
  /** Nombre d'articles (entier >= 1). */
  articles: number;
}

export interface DistributionOptions {
  /** Nombre de pickers disponibles (entier >= 1). */
  pickers: number;
  /**
   * Taille minimale (en articles) qu'un renfort doit pouvoir prendre en charge.
   * Un picker n'en rejoint un autre que si `restant / (aidants + 1) >= minAssistChunk`.
   * Évite la fragmentation inutile des commandes. Défaut : 5.
   */
  minAssistChunk?: number;
  /**
   * Nombre maximal de commandes attribuées à un même picker (défaut : illimité).
   * Contrainte stricte de la répartition initiale ; les renforts n'attribuent pas de commande.
   */
  maxOrdersPerPicker?: number;
}

/** Répartition initiale : un tableau par picker contenant les ids de commandes. */
export type Assignment = string[][];

export type Strategy = "best-fit" | "lpt" | "manual";

export interface AssistEvent {
  /** Instant (en unités d'articles : 1 picker = 1 article / unité de temps). */
  time: number;
  /** Numéro (1..n) du picker qui vient en renfort. */
  helper: number;
  /** Numéro du picker propriétaire de la commande aidée. */
  owner: number;
  orderId: string;
  reference: string;
  /** Articles restant à préparer sur la commande au moment du renfort. */
  remainingBefore: number;
}

export interface Segment {
  picker: number;
  orderId: string;
  reference: string;
  start: number;
  end: number;
  /** "own" = commande assignée au picker, "assist" = renfort. */
  kind: "own" | "assist";
}

export interface PickerResult {
  picker: number;
  orderIds: string[];
  assignedArticles: number;
  /** Articles réellement préparés par ce picker (propres + renforts). */
  workedArticles: number;
  /** Dont articles préparés en renfort sur la commande d'un autre picker. */
  assistArticles: number;
  /** Instant où le picker termine son dernier travail. */
  finishTime: number;
}

export interface DistributionResult {
  strategy: Strategy;
  pickers: PickerResult[];
  assists: AssistEvent[];
  segments: Segment[];
  totalOrders: number;
  totalArticles: number;
  /** Instant de fin estimé de l'ensemble (renforts inclus). */
  makespan: number;
  /** Borne basse théorique : total / nombre de pickers. */
  lowerBound: number;
}
