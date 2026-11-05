import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-primary/8 text-primary ring-primary/15",
        muted: "bg-muted text-muted-foreground ring-border",
        warning: "bg-accent/12 text-[#8a6a35] ring-accent/30",
        success: "bg-success/10 text-success ring-success/25",
        destructive: "bg-destructive/8 text-destructive ring-destructive/20",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
