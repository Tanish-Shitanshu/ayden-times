import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Display";
import { Button } from "./Button";
import { useApp } from "../../app/store";
import { errorText, useT } from "../../lib/i18n";
import { copyText } from "../../lib/hooks";

export function Banner({ kind = "info", icon, children, actions }: { kind?: "info" | "warning" | "error" | "success"; icon?: string; children: ReactNode; actions?: ReactNode }) {
  const def = { info: "info", warning: "warning", error: "error", success: "check_circle" }[kind];
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon name={icon ?? def} />
      <div className="grow">{children}</div>
      {actions && <div className="banner-actions">{actions}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r, style }: { h?: number | string; w?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function SkeletonPage({ cards = 3 }: { cards?: number }) {
  const t = useT();
  return (
    <div className="stack gap-16" aria-busy="true" aria-label={t("common.loading")}>
      <Skeleton h={36} w="55%" r={10} />
      <Skeleton h={18} w="80%" />
      <div className="grid grid-3" style={{ marginTop: 16 }}>
        {Array.from({ length: cards }, (_, i) => <Skeleton key={i} h={180} r={16} />)}
      </div>
    </div>
  );
}

/** Shows "Still working…" after 8 seconds of loading. */
export function SlowNote({ active }: { active: boolean }) {
  const t = useT();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) { setSlow(false); return; }
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, [active]);
  if (!slow) return null;
  return <p className="t-bm t-secondary row gap-8" role="status" style={{ justifyContent: "center", marginTop: 16 }}><PendingDots /> {t("common.slow")}</p>;
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state-card">
      <div className="state-icon"><Icon name={icon} /></div>
      <h2 className="t-tl">{title}</h2>
      {body && <p className="t-bm t-secondary measure">{body}</p>}
      {action && <div className="row gap-8 wrap" style={{ justifyContent: "center", marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry, extra }: { error: unknown; retry?: () => void; extra?: ReactNode }) {
  const t = useT();
  return (
    <div className="state-card error" role="alert">
      <div className="state-icon"><Icon name="error" /></div>
      <h2 className="t-tl">{t("err.title")}</h2>
      <p className="t-bm t-secondary measure">{errorText(t, error)}</p>
      <div className="row gap-8 wrap" style={{ justifyContent: "center", marginTop: 8 }}>
        {retry && <Button icon="refresh" onClick={retry}>{t("common.retry")}</Button>}
        {extra}
      </div>
    </div>
  );
}

export function PendingDots() {
  return <span className="dots" aria-hidden="true"><span /><span /><span /></span>;
}

export function SnackbarHost() {
  const snacks = useApp((s) => s.snacks);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="snackbar-host" aria-live="polite" aria-atomic="false">
      {snacks.map((s) => (
        <div key={s.id} className="snackbar" role="status">
          <span className="grow">{s.text}</span>
          {s.action && <Button variant="text" size="sm" onClick={() => { s.action!.run(); dismiss(s.id); }}>{s.action.label}</Button>}
        </div>
      ))}
    </div>
  );
}

export function CopyDiagnostics({ extra }: { extra?: Record<string, unknown> }) {
  const t = useT();
  const toast = useApp((s) => s.toast);
  return (
    <Button variant="outlined" icon="content_copy" onClick={async () => {
      const diag = { url: location.href, time: new Date().toISOString(), userAgent: navigator.userAgent, ...extra };
      await copyText(JSON.stringify(diag, null, 2));
      toast(t("common.copied"));
    }}>{t("common.copyDiagnostics")}</Button>
  );
}
