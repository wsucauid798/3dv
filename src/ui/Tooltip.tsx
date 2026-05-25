import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

type TooltipProps = {
  children: ReactNode;
  content: string;
};

type TooltipProviderProps = {
  children: ReactNode;
};

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="ui-tooltip" sideOffset={8}>
          {content}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function TooltipProvider({ children }: TooltipProviderProps) {
  return <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>;
}
