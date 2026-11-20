import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api } from "../../api/client";
import type { Experience, RoleId } from "../../contract";
import { useAsync } from "../../lib/hooks";
import { useT, errorText } from "../../lib/i18n";
import { useApp } from "../../app/store";
import { BackLink, Banner, Button, Checkbox, Chip, ErrorState, Icon, IconTile, RadioCard, Skeleton, Slider, Stepper } from "../../design/components";
import type { I18nKey } from "../../i18n/en";

export default function Onboarding() {
  const { roleId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const demo = params.get("demo") === "1";
  const t = useT();
  const nav = useNavigate();
  const ensure = useApp((s) => s.ensureSession);
  const me = useApp((s) => s.me);
  const setMe = useApp((s) => s.setMe);
  const role = useAsync(() => api.getRole(roleId), [roleId]);
  const session = useAsync(() => ensure(), []);
  const hasConsent = !!(me?.consent?.age18 && me.consent.storeWork);
  const prior = me?.onboardings.find((o) => o.roleId === roleId);
  const [exp, setExp] = useState<Experience | null>(prior?.experience ?? (demo ? "some" : null));
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>();

  const lastStep = hasConsent ? 2 : 3;
  const defaultStep = demo ? lastStep : 1;
  const step = Math.min(lastStep, Math.max(1, Number(params.get("step") ?? defaultStep)));
  const go = (n: number) => { const p = new URLSearchParams(params); p.set("step", String(n)); setParams(p); };

  useEffect(() => {
    if (!role.data) return;
    setRatings((r) => {
      const next = { ...r };
      for (const s of role.data!.skills) if (next[s.id] === undefined) next[s.id] = (prior?.selfRatings[s.id] as number | undefined) ?? 3;
      return next;
    });
  }, [role.data, prior]);

  const start = async () => {
    setErr(undefined);
    try {
      await ensure();
      if (!hasConsent) { setBusy("consent"); setMe(await api.updateConsent({ age18: c1, storeWork: c2, shareAnonymousPatterns: c3 })); }
      setBusy("onboarding");
      const selfRatings = Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, Math.min(5, Math.max(1, v)) as 1 | 2 | 3 | 4 | 5]));
      setMe(await api.saveOnboarding({ roleId: roleId as RoleId, experience: exp ?? "none", selfRatings }));
      setBusy("mission");
      const m = await api.createMission({ roleId: roleId as RoleId, mode: "quick" });
      nav(`/mission/${m.id}`);
    } catch (e) { setErr(e); setBusy(null); }
  };

  if (role.error || session.error) return <div className="container page"><BackLink to={`/roles/${roleId}`} label={t("back.role")} /><ErrorState error={role.error ?? session.error} retry={() => { role.reload(); session.reload(); }} /></div>;
  const r = role.data;
  const canStart = hasConsent || (c1 && c2);
  const steps = [t("onb.step1"), t("onb.step2"), ...(hasConsent ? [] : [t("onb.step3")])];
  const startBtn = (
    <Button size="lg" icon="play_arrow" loading={!!busy} disabledReason={!canStart ? t("onb.needBoth") : false} onClick={start}>
      {busy ? t("onb.starting") : t("role.start")}
    </Button>
  );

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div className="back-row"><BackLink to={`/roles/${roleId}`} label={r?.title ?? t("back.role")} /></div>
        <div className="row gap-16">
          {r ? <IconTile icon={r.icon} color={r.accentHex} /> : <Skeleton h={48} w={48} r={14} />}
          <div className="stack gap-4"><h1 className="t-hm page-title">{t("onb.title")}</h1>{r && <p className="t-bm t-secondary">{r.title} · {r.company}</p>}</div>
        </div>
        <div style={{ marginTop: 16 }}><Stepper steps={steps} current={step - 1} /></div>
      </div>

      {!r || session.loading ? <div className="stack gap-12"><Skeleton h={72} r={16} /><Skeleton h={72} r={16} /><Skeleton h={72} r={16} /></div> : (
        <div className="card" style={{ padding: 28 }}>
          {step === 1 && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack gap-12">
              <legend className="t-tl" style={{ marginBottom: 16 }}>{t("onb.expQ")}</legend>
              {(["none", "some", "internship"] as Experience[]).map((e, i) => (
                <RadioCard key={e} name="exp" value={e} checked={exp === e} onChange={(v) => setExp(v as Experience)} title={t(`onb.exp.${e}` as I18nKey)} icon={<Icon name={["eco", "construction", "work_history"][i]} style={{ color: "var(--primary)" }} />} />
              ))}
            </fieldset>
          )}
          {step === 2 && (
            <div className="stack gap-24">
              <div><h2 className="t-tl">{t("onb.confQ")}</h2><p className="t-bm t-secondary row gap-8" style={{ marginTop: 6 }}><Icon name="lock" className="xs" />{t("onb.confHelp")}</p></div>
              {r.skills.map((s) => {
                const v = ratings[s.id] ?? 3;
                const vt = t("onb.levelText", { n: v, label: t(`onb.level.${v}` as I18nKey) });
                return (
                  <div key={s.id} className="stack gap-4">
                    <div className="row gap-12 wrap"><label htmlFor={`sl-${s.id}`} className="t-tm grow">{s.label}</label><Chip tone="primary">{vt}</Chip></div>
                    <p className="t-bm t-secondary">{s.description}</p>
                    <Slider id={`sl-${s.id}`} value={v} onChange={(n) => setRatings((x) => ({ ...x, [s.id]: n }))} label={s.label} valueText={vt} />
                  </div>
                );
              })}
            </div>
          )}
          {step === 3 && !hasConsent && (
            <div className="stack gap-8">
              <h2 className="t-tl">{t("onb.consentQ")}</h2>
              <div className="stack gap-4" style={{ marginTop: 8 }}>
                <Checkbox checked={c1} onChange={setC1} sub={t("onb.required")}>{t("onb.c1")}</Checkbox>
                <Checkbox checked={c2} onChange={setC2} sub={t("onb.required")}>{t("onb.c2")}</Checkbox>
                <Checkbox checked={c3} onChange={setC3} sub={t("onb.optional")}>{t("onb.c3")}</Checkbox>
              </div>
              <Link to="/privacy" className="t-bm row gap-4" style={{ fontWeight: 500, minHeight: 44, marginLeft: 12 }}><Icon name="info" className="sm" />{t("onb.dataLink")}</Link>
            </div>
          )}
          {hasConsent && step === lastStep && <div style={{ marginTop: 24 }}><Banner kind="success" icon="verified_user">{t("onb.consentSaved")} <Link to="/privacy">{t("account.privacy")}</Link></Banner></div>}
          {err !== undefined && <div style={{ marginTop: 20 }}><Banner kind="error" actions={<Button variant="text" size="sm" onClick={start}>{t("common.retry")}</Button>}>{errorText(t, err)}</Banner></div>}

          <div className="row gap-8 wrap" style={{ marginTop: 32, justifyContent: "space-between" }}>
            <Button variant="text" icon="arrow_back" onClick={() => (step === 1 ? nav(`/roles/${roleId}`) : go(step - 1))}>{t("common.back")}</Button>
            {step < lastStep
              ? <Button iconRight icon="arrow_forward" disabledReason={step === 1 && !exp ? t("onb.expQ") : false} onClick={() => go(step + 1)}>{t("common.next")}</Button>
              : startBtn}
          </div>
          {step === lastStep && !canStart && <p className="t-label t-secondary" style={{ textAlign: "right", marginTop: 8 }} aria-live="polite">{t("onb.needBoth")}</p>}
        </div>
      )}
    </div>
  );
}
