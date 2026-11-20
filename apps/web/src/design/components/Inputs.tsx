import { useId, type ReactNode } from "react";

export function TextField({ label, value, onChange, helper, error, multiline, rows = 4, onSurface, maxLength, autoFocus, type = "text", inputMode, onKeyDown, mono }: { label: string; value: string; onChange: (v: string) => void; helper?: string; error?: string; multiline?: boolean; rows?: number; onSurface?: boolean; maxLength?: number; autoFocus?: boolean; type?: string; inputMode?: "text" | "numeric"; onKeyDown?: (e: React.KeyboardEvent) => void; mono?: boolean }) {
  const id = useId();
  const hid = `${id}-h`;
  const common = { id, value, placeholder: " ", maxLength, autoFocus, "aria-invalid": !!error || undefined, "aria-describedby": helper || error ? hid : undefined, onKeyDown, className: mono ? "mono" : undefined, "data-autofocus": autoFocus ? true : undefined };
  return (
    <div className={`field ${onSurface ? "on-surface" : ""} ${error ? "invalid" : ""}`}>
      {multiline ? <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} /> : <input {...common} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />}
      <label htmlFor={id}>{label}</label>
      {(error || helper) && <span id={hid} className="helper">{error || helper}</span>}
    </div>
  );
}

export function Checkbox({ checked, onChange, children, sub }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="stack gap-4"><span className="t-bl">{children}</span>{sub && <span className="t-label t-secondary">{sub}</span>}</span>
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled, describedBy }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describedBy?: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} aria-describedby={describedBy} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" /><span className="thumb" />
    </span>
  );
}

export function Slider({ value, onChange, min = 1, max = 5, label, valueText, id }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; valueText: string; id?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <input id={id} className="slider" type="range" min={min} max={max} step={1} value={value} aria-label={label} aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))} style={{ ["--pct" as string]: `${pct}%` }} />
      <div className="slider-ticks" aria-hidden="true">{Array.from({ length: max - min + 1 }, (_, i) => <span key={i}>{min + i}</span>)}</div>
    </div>
  );
}

export function RadioCard({ name, value, checked, onChange, title, sub, icon }: { name: string; value: string; checked: boolean; onChange: (v: string) => void; title: string; sub?: string; icon?: ReactNode }) {
  return (
    <label className="radio-card">
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      {icon}
      <span className="stack gap-4"><span className="t-tm">{title}</span>{sub && <span className="t-bm t-secondary">{sub}</span>}</span>
    </label>
  );
}
