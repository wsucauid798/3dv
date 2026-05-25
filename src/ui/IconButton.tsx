import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Tooltip } from "./Tooltip";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
};

export function IconButton({
  className,
  icon,
  label,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        aria-label={label}
        className={cn("ui-icon-button", className)}
        type={type}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
