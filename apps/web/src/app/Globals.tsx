import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { Banner, Button, Dialog, SnackbarHost } from "../design/components";
import { useApp } from "./store";
import { useT, errorText } from "../lib/i18n";
import { useOnline } from "../lib/hooks";
import { setUnauthenticatedHandler } from "../api/client";

export function OfflineBanner() {
  const t = useT();
  const online = useOnline();
  if (online) return null;
  return <div className="offline-banner"><Banner kind="warning" icon="cloud_off">{t("offline.banner")}</Banner></div>;
}

export function SessionExpiredDialog() {
  const t = useT();
  const nav = useNavigate();
  const expired = useApp((s) => s.sessionExpired);
  const clear = useApp((s) => s.clearExpired);
  const ensure = useApp((s) => s.ensureSession);
  const expire = useApp((s) => s.expireSession);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>();
  useEffect(() => { setUnauthenticatedHandler(() => expire()); return () => setUnauthenticatedHandler(null); }, [expire]);
  return (
    <Dialog open={expired} onClose={() => { clear(); nav("/"); }} title={t("session.title")} icon="schedule"
      actions={<><Button variant="text" onClick={() => { clear(); nav("/"); }}>{t("common.home")}</Button>
        <Button loading={busy} onClick={async () => { setBusy(true); setErr(undefined); try { await ensure(); clear(); nav("/roles"); } catch (e) { setErr(e); } finally { setBusy(false); } }}>{t("session.new")}</Button></>}>
      <p className="t-bm t-secondary">{t("session.body")}</p>
      {err !== undefined && <p className="t-bm" style={{ color: "var(--error)", marginTop: 12 }} role="alert">{errorText(t, err)}</p>}
    </Dialog>
  );
}

export function Globals() {
  const boot = useApp((s) => s.bootLanguage);
  useEffect(() => { boot(); }, [boot]);
  return (<><OfflineBanner /><SessionExpiredDialog /><SnackbarHost /></>);
}
