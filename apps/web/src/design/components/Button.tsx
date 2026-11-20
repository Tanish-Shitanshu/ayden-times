import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "./Display";

type Variant = "filled" | "tonal" | "outlined" | "text" | "danger" | "danger-outlined";
interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: Variant; size?: "sm" | "md" | "lg"; icon?: string; iconRight?: boolean; loading?: boolean; block?: boolean;
  /** Disabled with a reason: stays focusable, announces why. */
  disabledReason?: string | false; disabled?: boolean; children?: ReactNode;
}

export function Button({ variant = "filled", size = "md", icon, iconRight, loading, block, disabled, disabledReason, children, className = "", onClick, type = "button", ...rest }: BtnProps) {
  const off = !!disabled || !!disabledReason || !!loading;
  return (
    <button type={type} className={`btn btn-${variant} ${size !== "md" ? `btn-${size}` : ""} ${block ? "btn-block" : ""} ${iconRight ? "icon-right" : ""} ${className}`}
      aria-disabled={off || undefined} aria-busy={loading || undefined} title={disabledReason || undefined}
      onClick={(e) => { if (off) { e.preventDefault(); return; } onClick?.(e); }} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && !iconRight ? <Icon name={icon} /> : null}
      {children}
      {!loading && icon && iconRight && <Icon name={icon} />}
    </button>
  );
}

export function LinkButton({ to, variant = "filled", size = "md", icon, iconRight, children, className = "", external }: { to: string; variant?: Variant; size?: "sm" | "md" | "lg"; icon?: string; iconRight?: boolean; children: ReactNode; className?: string; external?: boolean }) {
  const cls = `btn btn-${variant} ${size !== "md" ? `btn-${size}` : ""} ${iconRight ? "icon-right" : ""} ${className}`;
  const inner = <>{icon && !iconRight && <Icon name={icon} />}{children}{icon && iconRight && <Icon name={icon} />}</>;
  if (external) return <a className={cls} href={to} target="_blank" rel="noopener noreferrer">{inner}</a>;
  return <Link className={cls} to={to}>{inner}</Link>;
}

export function IconButton({ icon, label, onClick, variant, selected, disabled, className = "", fill, ...rest }: { icon: string; label: string; onClick?: () => void; variant?: "filled" | "tonal"; selected?: boolean; disabled?: boolean; className?: string; fill?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button type="button" className={`icon-btn ${variant ?? ""} ${selected ? "selected" : ""} ${className}`} aria-label={label} title={label} disabled={disabled} onClick={onClick} {...rest}>
      <Icon name={icon} fill={fill} />
    </button>
  );
}
