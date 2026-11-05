"use client";

import { useActionState } from "react";
import { changePasswordAction, type PasswordState } from "@/app/(app)/account/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <Card className="max-w-md p-7">
      <form action={action} className="flex flex-col gap-5">
        {[
          ["current", "Mot de passe actuel", "current-password"],
          ["next", "Nouveau mot de passe", "new-password"],
          ["confirm", "Confirmer le nouveau mot de passe", "new-password"],
        ].map(([name, label, ac]) => (
          <div key={name} className="flex flex-col gap-2">
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} name={name} type="password" autoComplete={ac} required minLength={name === "current" ? undefined : 8} />
          </div>
        ))}
        {state.error && <p className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">{state.error}</p>}
        {state.success && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{state.success}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Mettre à jour"}</Button>
      </form>
    </Card>
  );
}
