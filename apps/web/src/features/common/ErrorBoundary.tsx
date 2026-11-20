import { Logo, Button, CopyDiagnostics, Icon } from "../../design/components";
import { useT } from "../../lib/i18n";

export function ErrorBoundaryCard({ error }: { error: unknown }) {
  const t = useT();
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "statusText" in error ? String((error as { statusText: unknown }).statusText) : String(error);
  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <a href="/" aria-label={t("nav.home")}><Logo /></a>
      <div className="card" style={{ marginTop: 32, padding: 32 }} role="alert">
        <div className="state-icon" style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--error-bg)", color: "var(--error)" }}><Icon name="sentiment_dissatisfied" /></div>
        <h1 className="t-hm" style={{ marginTop: 16 }}>{t("eb.title")}</h1>
        <p className="t-bl t-secondary" style={{ marginTop: 8 }}>{t("eb.body")}</p>
        <div className="row gap-8 wrap" style={{ marginTop: 24 }}>
          <Button icon="refresh" onClick={() => location.reload()}>{t("common.reload")}</Button>
          <CopyDiagnostics extra={{ error: message }} />
          <Button variant="text" onClick={() => { location.href = import.meta.env.VITE_ROUTER === "hash" ? "#/" : "/"; }}>{t("common.home")}</Button>
        </div>
      </div>
    </div>
  );
}
