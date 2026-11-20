import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "../../api/client";
import type { Cohort } from "../../contract";
import { useApp } from "../../app/store";
import { useT } from "../../lib/i18n";
import { ErrorState, Icon, LinkButton, PendingDots } from "../../design/components";

export function JoinSuccess({ c }: { c: Cohort }) {
  const t = useT();
  return (
    <div className="card" style={{ maxWidth: 560, padding: 32 }} role="status">
      <span className="icon-tile" style={{ background: "var(--success-bg)", color: "var(--success)" }}><Icon name="task_alt" /></span>
      <h2 className="t-tl" style={{ marginTop: 16 }}>{c.name}</h2>
      <p className="t-bl t-secondary" style={{ marginTop: 8 }}>{t("cohort.joined", { name: c.name })}</p>
      <div className="row gap-8 wrap" style={{ marginTop: 24 }}>
        <LinkButton to="/privacy" icon="shield_person">{t("cohort.openPrivacy")}</LinkButton>
        <LinkButton to="/roles" variant="outlined">{t("back.roles")}</LinkButton>
      </div>
    </div>
  );
}

export default function Join() {
  const { code = "" } = useParams();
  const t = useT();
  const ensure = useApp((s) => s.ensureSession);
  const [c, setC] = useState<Cohort | null>(null);
  const [err, setErr] = useState<unknown>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(undefined);
    ensure().then(() => api.joinCohort({ code })).then((x) => alive && setC(x)).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [code, tick, ensure]);
  return (
    <div className="container page">
      <h1 className="t-hl page-title" style={{ marginBottom: 24 }}>{t("cohort.title")}</h1>
      {err !== undefined ? <ErrorState error={err} retry={() => setTick((x) => x + 1)} extra={<LinkButton to="/cohort?tab=join" variant="outlined">{t("cohort.join")}</LinkButton>} />
        : c ? <JoinSuccess c={c} />
        : <p className="t-bl t-secondary row gap-8" role="status"><PendingDots />{t("cohort.joining", { code })}</p>}
    </div>
  );
}
