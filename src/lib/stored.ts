import type { DistributionResult } from "@/lib/distribution";

/** Payload JSON stocké dans Distribution.result (instantané : commandes + résultat). */
export interface StoredDistribution {
  version: 1;
  minAssistChunk: number;
  minutesPerArticle: number;
  orders: { id: string; reference: string; articles: number }[];
  result: DistributionResult;
}
