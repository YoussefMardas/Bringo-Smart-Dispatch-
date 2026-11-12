import "server-only";
import { prisma } from "@/lib/prisma";

/** Envoie une notification à tous les Masters Opérations E-commerce. Ne bloque jamais l'action appelante. */
export async function notifyOps(input: {
  type: string;
  title: string;
  message: string;
  storeId?: string | null;
}): Promise<void> {
  try {
    const ops = await prisma.user.findMany({ where: { role: "OPS_MASTER" }, select: { id: true } });
    if (ops.length === 0) return;
    await prisma.notification.createMany({
      data: ops.map((u) => ({
        userId: u.id,
        storeId: input.storeId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
      })),
    });
  } catch {
    // Une notification perdue ne doit pas faire échouer la modification elle-même.
  }
}
