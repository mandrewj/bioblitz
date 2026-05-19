"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("nature-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-cream-300 px-4 py-3", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-bold tracking-tight text-forest-800", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-[0.2em] text-moss-600">{label}</span>
      <span className="text-2xl font-bold leading-tight text-forest-800 tabular-nums">
        {value}
      </span>
      {sub ? <span className="text-xs text-moss-600">{sub}</span> : null}
    </div>
  );
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "ghost" | "outline";
    size?: "sm" | "md";
  }
>(function Button({ className, variant = "default", size = "md", ...props }, ref) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "h-8 px-2.5 text-xs", md: "h-9 px-3 text-sm" };
  const variants = {
    default: "bg-forest-600 text-white hover:bg-forest-700",
    ghost: "text-forest-800 hover:bg-cream-200",
    outline:
      "border border-cream-300 bg-cream-50 text-forest-800 hover:bg-cream-100",
  };
  return <button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...props} />;
});

export function Toggle({
  pressed,
  onPressedChange,
  children,
  className,
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition",
        pressed
          ? "border-forest-600 bg-forest-600 text-white hover:bg-forest-700"
          : "border-cream-300 bg-cream-50 text-forest-800 hover:bg-cream-100",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 rounded-md border border-cream-300 bg-cream-50 px-2 text-xs text-bark-600",
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Drawer({
  open,
  onOpenChange,
  children,
  title,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: React.ReactNode;
  title?: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  // Rendered through a Portal directly to document.body. Without this,
  // ancestors like the lg:sticky sidebar or Leaflet's transformed panes
  // can establish a containing block that traps `position: fixed`, so the
  // map renders over the drawer regardless of z-index.
  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <div
        className="absolute inset-0 bg-bark-700/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-cream-50 shadow-leaf">
        <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
          <div className="text-sm font-bold text-forest-800">{title}</div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
