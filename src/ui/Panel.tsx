import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("ui-panel", className)} {...props} />;
}
