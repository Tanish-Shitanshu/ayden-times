import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { Button, LinkButton, LogoGlyph, Icon } from "../../design/components";

/** One-click judge entry: creates a guest session, then opens onboarding in demo mode. */
export default function Demo() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const ensure = useApp((s) => s.ensureSession);
  const [err, setErr] = useState<unknown>();
  const [tick, setTick] = useState(0);
  const role = params.get("role") || "software-engineer";
  useEffect(() => {
    let alive = true;
    setErr(undefined);
    ensure().then(() => { if (alive) nav(`/onboarding/${encodeURIComponent(role)}?demo=1`, { replace: true }); }).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [tick, role, ensure, nav]);
  return (
    <div className="container page" style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div className="card" style={{ width: "min(440px, 100%)", textAlign: "center", padding: 40 }} aria-live="polite">
        {err === undefined ? (
          <>
            <div className="demo-glyph"><LogoGlyph size={56} /></div>
            <h1 className="t-tl" style={{ marginTop: 24 }}>{t("demo.setting")}</h1>
            <p className="t-bm t-secondary" style={{ marginTop: 8 }}>{t("demo.sub")}</p>
            <div className="bar thin" style={{ marginTop: 24, overflow: "hidden" }}><div className="fill indeterminate" /></div>
          </>
        ) : (
          <>
            <Icon name="error" className="xl" style={{ color: "var(--error)" }} />
            <h1 className="t-tl" style={{ marginTop: 16 }}>{t("err.title")}</h1>
            <p className="t-bm t-secondary" style={{ marginTop: 8 }} role="alert">{errorText(t, err)}</p>
            <div className="row gap-8 wrap" style={{ justifyContent: "center", marginTop: 24 }}>
              <Button icon="refresh" onClick={() => setTick((x) => x + 1)}>{t("common.retry")}</Button>
              <LinkButton to="/" variant="outlined">{t("back.home")}</LinkButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
