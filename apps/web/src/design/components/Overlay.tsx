import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../lib/a11y";
import { IconButton, Button } from "./Button";
import { Icon } from "./Display";
import { useT } from "../../lib/i18n";

function useEsc(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); ref.current(); } };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [open]);
}

export function Dialog({ open, onClose, title, children, actions, wide, icon }: { open: boolean; onClose: () => void; title: string; children?: ReactNode; actions?: ReactNode; wide?: boolean; icon?: string }) {
  const t = useT();
  const id = useId();
  const ref = useFocusTrap<HTMLDivElement>(open);
  useEsc(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="dialog-head">
          {icon && <Icon name={icon} style={{ color: "var(--primary)", marginTop: 6 }} />}
          <h2 id={id} className="t-tl">{title}</h2>
          <IconButton icon="close" label={t("common.close")} onClick={onClose} />
        </div>
        {children}
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, cancelLabel, danger, loading, swap }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; loading?: boolean; swap?: boolean }) {
  const t = useT();
  const confirm = <Button key="c" variant={danger ? "danger" : swap ? "text" : "filled"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>;
  const cancel = <Button key="x" variant={swap ? "filled" : "text"} onClick={onClose} data-autofocus>{cancelLabel ?? t("common.cancel")}</Button>;
  return (
    <Dialog open={open} onClose={onClose} title={title} actions={swap ? [confirm, cancel] : [cancel, confirm]}>
      <div className="t-bm t-secondary">{body}</div>
    </Dialog>
  );
}

export function Drawer({ open, onClose, title, children, headExtra, pinned, side = "right", sheet = true, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; headExtra?: ReactNode; pinned?: boolean; side?: "right" | "left"; sheet?: boolean; labelledBy?: string }) {
  const t = useT();
  const id = useId();
  const ref = useFocusTrap<HTMLDivElement>(open && !pinned);
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      {!pinned && <div className="drawer-scrim" onClick={onClose} />}
      <aside ref={ref} className={`drawer ${side === "left" ? "left" : ""} ${sheet ? "sheet" : ""} ${pinned ? "pinned" : ""}`} role={pinned ? "complementary" : "dialog"} aria-modal={pinned ? undefined : true} aria-labelledby={labelledBy ?? id}>
        <div className="drawer-head">
          <h2 id={id} className="t-tm grow">{title}</h2>
          {headExtra}
          <IconButton icon="close" label={t("common.close")} onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

export interface MenuItem { id: string; label: string; icon?: string; sub?: string; onSelect?: () => void; disabled?: string | false; danger?: boolean }
/** Button that opens a keyboard-navigable menu. */
export function MenuButton({ trigger, items, label, align = "right" }: { trigger: (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; id: string }) => ReactNode; items: MenuItem[]; label: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEsc(open, () => { setOpen(false); (wrap.current?.querySelector("button") as HTMLElement | null)?.focus(); });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    if (e.key === "Tab") setOpen(false);
  };
  return (
    <div ref={wrap} style={{ position: "relative", display: "inline-flex" }}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu", id })}
      {open && (
        <div ref={menu} className="menu" role="menu" aria-label={label} aria-labelledby={id} onKeyDown={onKey} style={{ top: "calc(100% + 4px)", [align]: 0 }}>
          {items.map((it) => (
            <button key={it.id} type="button" role="menuitem" className={`menu-item ${it.danger ? "danger" : ""}`} aria-disabled={!!it.disabled || undefined} title={it.disabled || undefined}
              onClick={() => { if (it.disabled) return; setOpen(false); it.onSelect?.(); }}>
              {it.icon && <Icon name={it.icon} />}
              <span><span>{it.label}</span>{(it.disabled || it.sub) && <span className="menu-sub">{it.disabled || it.sub}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Popover({ open, onClose, children, anchorRef, label }: { open: boolean; onClose: () => void; children: ReactNode; anchorRef: React.RefObject<HTMLElement | null>; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEsc(open, () => { onClose(); anchorRef.current?.querySelector<HTMLElement>("button")?.focus(); });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", close);
    requestAnimationFrame(() => ref.current?.focus());
    return () => document.removeEventListener("mousedown", close);
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return <div ref={ref} className="popover" role="dialog" aria-label={label} tabIndex={-1} style={{ top: "calc(100% + 8px)", right: 0 }}>{children}</div>;
}

export function Tooltip({ text, children, below }: { text: string; children: ReactNode; below?: boolean }) {
  const id = useId();
  return (
    <span className="tip-wrap" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className={`tip ${below ? "below" : ""} ${text.length > 40 ? "wrap-text" : ""}`}>{text}</span>
    </span>
  );
}
