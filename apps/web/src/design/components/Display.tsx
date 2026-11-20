import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

export function Icon({ name, className = "", fill = false, label, style }: { name: string; className?: string; fill?: boolean; label?: string; style?: CSSProperties }) {
  return <span className={`icon ${fill ? "fill" : ""} ${className}`} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} style={style}>{name}</span>;
}

export type ChipTone = "default" | "tonal" | "primary" | "success" | "warning" | "error" | "purple" | "planned";
export function Chip({ children, icon, tone = "default", title, className = "" }: { children: ReactNode; icon?: string; tone?: ChipTone; title?: string; className?: string }) {
  return <span className={`chip ${tone === "default" ? "" : tone} ${className}`} title={title}>{icon && <Icon name={icon} />}{children}</span>;
}

export function IconTile({ icon, color, size = "md" }: { icon: string; color: string; size?: "md" | "sm" }) {
  return (
    <span className={`icon-tile ${size === "sm" ? "sm" : ""}`} style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

export function initials(name: string) {
  const p = name.replace(/^(Dr|Mr|Ms|Mrs)\.\s*/i, "").split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
export function Avatar({ name, hue, size = "md", presence }: { name: string; hue: number; size?: "sm" | "md" | "lg"; presence?: "online" | "busy" | "away" }) {
  return (
    <span className={`avatar ${size === "md" ? "" : size}`} style={{ background: `hsl(${hue} 52% 40%)` }} aria-hidden="true">
      {initials(name)}
      {presence && <span className={`presence ${presence}`} />}
    </span>
  );
}

export function Bar({ value, max = 100, marker, color, thin, label }: { value: number; max?: number; marker?: number; color?: string; thin?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={`bar ${thin ? "thin" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="fill" style={{ width: `${pct}%`, background: color }} />
      {marker !== undefined && <span className="marker" style={{ left: `calc(${Math.max(0, Math.min(100, (marker / (max || 1)) * 100))}% - 1px)` }} />}
    </div>
  );
}

export interface TabDef { id: string; label: ReactNode; icon?: string; dot?: boolean }
/** Accessible tablist: arrow keys move between tabs, Home/End jump. */
export function Tabs({ tabs, value, onChange, label, idPrefix }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string; idPrefix: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n >= 0) { e.preventDefault(); onChange(tabs[n].id); refs.current[n]?.focus(); }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }} className="tab" role="tab" id={`${idPrefix}-tab-${t.id}`} aria-controls={`${idPrefix}-panel-${t.id}`}
          aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.icon && <Icon name={t.icon} className="sm" />}{t.label}{t.dot && <span className="badge-dot" aria-label="new" />}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ id, idPrefix, children, className = "" }: { id: string; idPrefix: string; children: ReactNode; className?: string }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className={className} tabIndex={0} style={{ outline: "none" }}>{children}</div>;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((s, i) => (
        <li key={s} className="row gap-8" style={{ flex: i < steps.length - 1 ? 1 : "none" }} aria-current={i === current ? "step" : undefined}>
          <span className={`step ${i === current ? "active" : i < current ? "done" : ""}`}>
            <span className="num">{i < current ? <Icon name="check" className="sm" /> : i + 1}</span><span className="lbl">{s}</span>
          </span>
          {i < steps.length - 1 && <span className="line" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/** Back control: uses history when the previous entry is inside the app, else goes to `to`. */
export function BackLink({ to, label }: { to: string; label: string }) {
  const nav = useNavigate();
  return (
    <a className="back-link" href={to} onClick={(e) => {
      e.preventDefault();
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) nav(-1); else nav(to);
    }}>
      <Icon name="arrow_back" /> {label}
    </a>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="row gap-4">
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
          {i < items.length - 1 && <Icon name="chevron_right" className="xs" />}
        </span>
      ))}
    </nav>
  );
}
