import { portalBase } from "@/lib/portal";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listSidebarStores } from "@/lib/permissions";
import { Sidebar } from "@/components/sidebar";
import { LiveStatus } from "@/components/live-status";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const base = await portalBase();
  const stores = await listSidebarStores(user);

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, role: user.role }} stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex h-[4.5rem] items-center justify-end border-b border-border/60 bg-background/80 px-10 backdrop-blur-xl">
          <LiveStatus showBell={user.role === "OPS_MASTER"} />
        </div>
        {user.mustChangePassword && (
          <div className="border-b border-accent/30 bg-accent/10 px-10 py-2.5 text-sm text-[#7a5d2e]">
            Votre mot de passe est temporaire.{" "}
            <Link href={`${base}/account`} className="font-medium underline underline-offset-2">
              Le modifier maintenant
            </Link>
            .
          </div>
        )}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-10 py-10">{children}</main>
      </div>
    </div>
  );
}
