import { portalBase } from "@/lib/portal";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MarkAllRead } from "@/components/mark-all-read";

export default async function NotificationsPage() {
  const user = await requireUser();
  const base = await portalBase();
  if (user.role !== "OPS_MASTER" && user.role !== "SUPER_ADMIN") redirect(`${base}/`);

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { store: { select: { name: true } } },
  });
  const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Casablanca" });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Suivi" title="Notifications" description="Modifications du nombre de pickers par les Masters Magasin, et événements d'import.">
        <MarkAllRead disabled={items.every((n) => n.readAt)} />
      </PageHeader>
      <Card className="divide-y divide-border/70 overflow-hidden">
        {items.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted-foreground">Aucune notification.</p>}
        {items.map((n) => (
          <div key={n.id} className={cn("flex gap-4 px-6 py-4", !n.readAt && "bg-accent/[0.06]")}>
            <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-border" : "bg-accent")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{fmt.format(n.createdAt)}</time>
          </div>
        ))}
      </Card>
    </div>
  );
}
