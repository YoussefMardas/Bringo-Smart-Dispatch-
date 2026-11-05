"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-primary/60 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#8a6a35] font-display text-xl text-white shadow-lg shadow-black/30">
            B
          </span>
          <span className="font-display text-xl font-light tracking-wide">Bringo</span>
        </div>
        <div className="relative max-w-md animate-rise">
          <p className="mb-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-accent">
            <span className="h-px w-8 bg-accent/70" /> Smart Dispatch
          </p>
          <h2 className="font-display text-5xl font-light leading-[1.1] tracking-tight">
            Chaque commande,
            <br />
            au bon picker.
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-white/60">
            Une répartition équilibrée, des renforts anticipés et des données toujours à jour, magasin par magasin.
          </p>
        </div>
        <p className="relative text-xs text-white/35">© Bringo — Opérations E-commerce</p>
      </section>

      <section className="flex items-center justify-center p-8">
        <div className="animate-rise w-full max-w-sm" style={{ ["--d" as string]: "120ms" }}>
          <h1 className="font-display text-3xl font-light tracking-tight">Connexion</h1>
          <p className="mt-2 text-sm text-muted-foreground">Accédez à votre espace de dispatch.</p>
          <form action={action} className="mt-10 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {state.error && <p className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending} className="mt-1 h-11">
              {pending ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
