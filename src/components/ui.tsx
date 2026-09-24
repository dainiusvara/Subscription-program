import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink",
  ghost: "border border-line bg-transparent",
  danger: "bg-warn text-surface",
};

const SIZES: Record<ButtonSize, string> = {
  md: "rounded-[10px] px-4 py-2.5",
  sm: "rounded-lg px-2.5 py-1.5 text-[13px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx("font-semibold", VARIANTS[variant], SIZES[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...props} />;
}

/** The small text buttons on each subscription row. */
export function LinkButton({
  danger,
  className,
  ...props
}: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "rounded-md px-1.5 py-0.5 text-xs hover:bg-surface-2 pointer-coarse:px-2 pointer-coarse:py-1.5",
        danger ? "text-warn" : "text-muted hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Panel({
  title,
  subtitle,
  titleId,
  className,
  children,
  id,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  titleId?: string;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cx("rounded-2xl border border-line bg-surface p-[18px]", className)}
    >
      <h2 id={titleId} className="mb-1 font-display text-xl font-bold tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mb-3.5 text-[13px] text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

export function Tag({ tone = "warn", children }: { tone?: "warn" | "good"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "rounded-full px-[7px] py-px text-[11px] font-semibold",
        tone === "warn" ? "bg-warn-soft text-warn" : "bg-good-soft text-good",
      )}
    >
      {children}
    </span>
  );
}
