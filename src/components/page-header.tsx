import type { ReactNode } from "react";

/** En-tête de page : repère (magasin), titre en police d'affichage, description et actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-border/70 pb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
            <span className="h-px w-6 bg-accent/60" /> {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[2rem] font-light leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-end gap-3">{children}</div>}
    </header>
  );
}
