import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm shadow-xs outline-none transition-all duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => <input ref={ref} type={type} className={cn(field, className)} {...props} />,
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(field, "pr-8", className)} {...props} />,
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground", className)} {...props} />
  );
}
