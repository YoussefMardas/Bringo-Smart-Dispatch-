"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "@/app/(app)/notifications/actions";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={disabled || pending} onClick={() => start(() => markAllReadAction())}>
      <Check size={14} /> Tout marquer comme lu
    </Button>
  );
}
