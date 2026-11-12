"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { createStoreAction, createUserAction, type FormState } from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p className="text-sm text-success">{state.success}</p>;
  return null;
}

export function StoreForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createStoreAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="store-name">Nom</Label>
        <Input id="store-name" name="name" required className="w-56" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="store-code">Code</Label>
        <Input id="store-code" name="code" required className="w-28" placeholder="MAG-04" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="store-city">Ville</Label>
        <Input id="store-city" name="city" className="w-40" />
      </div>
      <Button type="submit" disabled={pending}>
        Ajouter le magasin
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function UserForm({ stores }: { stores: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createUserAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="u-name">Nom</Label>
        <Input id="u-name" name="name" required className="w-48" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="u-email">E-mail</Label>
        <Input id="u-email" name="email" type="email" required className="w-56" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="u-password">Mot de passe (8+)</Label>
        <Input id="u-password" name="password" type="password" minLength={8} required className="w-44" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="u-role">Rôle</Label>
        <Select id="u-role" name="role" defaultValue="STORE_MASTER" className="w-56">
          <option value="STORE_MASTER">Master Magasin</option>
          <option value="OPS_MASTER">Master Opérations E-commerce</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="u-store">Magasin (Master Magasin)</Label>
        <Select id="u-store" name="storeId" defaultValue="" className="w-48">
          <option value="">—</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        Créer l'utilisateur
      </Button>
      <Feedback state={state} />
    </form>
  );
}
