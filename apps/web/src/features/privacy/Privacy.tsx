import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../api/client";
import { useApp } from "../../app/store";
import { useT, errorText } from "../../lib/i18n";
import { useAsync } from "../../lib/hooks";
import { BackLink, Banner, Button, Dialog, ErrorState, Icon, Skeleton, Switch, TextField } from "../../design/components";

const STORE = ["Your display name and language", "Your consent choices and when you gave them", "Your self-ratings for each role you try", "Your messages, files and written work inside rehearsals", "Your reports, badges and progress"];
const WHO: [string, string, string, string][] = [
  ["Your report, quotes and scores", "Yes", "No", "No"],
  ["Your messages and work", "Yes", "No", "No"],
  ["That you joined their group", "Yes", "Yes", "No"],
  ["Anonymous group patterns (5 or more people)", "Yes", "Only if you allow it", "No"],
];

export default function Privacy() {
  const t = useT();
  const nav = useNavigate();
  const toast = useApp((s) => s.toast);
  const setMe = useApp((s) => s.setMe);
  const loadMe = useApp((s) => s.loadMe);
  const me = useAsync(() => loadMe(), []);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState("");
  const c = me.data?.consent;

  const toggleShare = async (v: boolean) => {
    if (!c) return;
    setSaving(true);
    try { const m = await api.updateConsent({ age18: c.age18, storeWork: c.storeWork, shareAnonymousPatterns: v }); setMe(m); me.setData(m); toast(t("common.saved")); }
    catch (e) { toast(errorText(t, e)); } finally { setSaving(false); }
  };
  const doExport = async () => {
    setExporting(true);
    try {
      const data = await api.exportMe();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "ayden-export.json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("ayden-export.json");
    } catch (e) { toast(errorText(t, e)); } finally { setExporting(false); }
  };
  const doDelete = async () => {
    setDeleting(true); setDelErr("");
    try { await api.deleteMe(); setMe(null); setDelOpen(false); toast(t("privacy.delete")); nav("/"); }
    catch (e) { setDelErr(errorText(t, e)); } finally { setDeleting(false); }
  };

  return (
    <div className="container page" style={{ maxWidth: 880 }}>
      <div className="page-head">
        <div className="back-row"><BackLink to="/" label={t("back.home")} /></div>
        <h1 className="t-hl page-title">{t("privacy.title")}</h1>
        <p className="t-bl t-secondary measure">Practice should feel safe. Here is exactly what we keep, who can see it, and how to take it with you or delete it.</p>
      </div>
      <div className="stack gap-24">
        <section className="card" style={{ padding: 28 }} aria-labelledby="ws-h">
          <h2 id="ws-h" className="t-tl">What we store</h2>
          <ul className="stack gap-8" style={{ margin: "16px 0 0", paddingLeft: 0, listStyle: "none" }}>{STORE.map((s) => <li key={s} className="row gap-12 t-bl"><Icon name="check" className="sm" style={{ color: "var(--success)" }} />{s}</li>)}</ul>
          <p className="t-bm t-secondary" style={{ marginTop: 12 }}>We do not store passwords, and you can use Ayden as a guest.</p>
        </section>

        <section className="card" style={{ padding: 28 }} aria-labelledby="who-h">
          <h2 id="who-h" className="t-tl" style={{ marginBottom: 16 }}>Who sees what</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="who-h">
            <table className="data-table">
              <thead><tr><th scope="col">Data</th><th scope="col">You</th><th scope="col">Your group lead</th><th scope="col">Anyone else</th></tr></thead>
              <tbody>{WHO.map((r) => <tr key={r[0]}><th scope="row" style={{ fontWeight: 400, position: "static", background: "transparent" }}>{r[0]}</th>{r.slice(1).map((c2, i) => <td key={i}><span className="row gap-4"><Icon name={c2 === "No" ? "block" : "check_circle"} className="xs" style={{ color: c2 === "No" ? "var(--text-secondary)" : "var(--success)" }} />{c2}</span></td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ padding: 28 }} aria-labelledby="ch-h">
          <h2 id="ch-h" className="t-tl">Your choices</h2>
          {me.error ? <ErrorState error={me.error} retry={me.reload} /> : me.loading ? <Skeleton h={160} style={{ marginTop: 16 }} /> : !c ? (
            <p className="t-bm t-secondary" style={{ marginTop: 12 }}>You have not given consent yet. You will be asked before your first rehearsal.</p>
          ) : (
            <div className="stack gap-16" style={{ marginTop: 16 }}>
              {([["age18", t("onb.c1"), true], ["storeWork", t("onb.c2"), true], ["shareAnonymousPatterns", t("onb.c3"), false]] as const).map(([k, label, req]) => (
                <div key={k} className="row gap-16" style={{ alignItems: "flex-start" }}>
                  <div className="grow stack gap-4">
                    <span className="t-bl">{label}</span>
                    {req && <span id={`h-${k}`} className="t-label t-secondary">Needed to run a rehearsal; delete your data to withdraw.</span>}
                  </div>
                  <Switch checked={c[k]} onChange={(v) => toggleShare(v)} label={label} disabled={req || saving} describedBy={req ? `h-${k}` : undefined} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" style={{ padding: 28 }} aria-labelledby="ex-h">
          <div className="row gap-16 wrap"><div className="grow stack gap-4" style={{ minWidth: 220 }}><h2 id="ex-h" className="t-tl">{t("privacy.export")}</h2><p className="t-bm t-secondary">A JSON file with your profile, rehearsals, messages and reports.</p></div>
            <Button variant="outlined" icon="download" loading={exporting} disabledReason={!me.data ? t("progress.empty") : false} onClick={doExport}>{t("privacy.export")}</Button></div>
        </section>

        <section className="card" style={{ padding: 28 }} aria-labelledby="ai-h">
          <h2 id="ai-h" className="t-tl">How the AI is used</h2>
          <p className="t-bl" style={{ marginTop: 12 }}>Your AI colleagues are Gemini models acting through tools that our engine checks before you see anything. A separate Gemini judge reads your work after the mission and may only quote your exact words. We log which model answered and how long it took, not your message text.</p>
          <Link to="/how-it-works#security" className="row gap-4 t-bm" style={{ marginTop: 12, fontWeight: 500, minHeight: 44 }}><Icon name="security" className="sm" />Security summary</Link>
        </section>

        <section className="card" style={{ padding: 28, borderColor: "color-mix(in srgb, var(--error) 40%, var(--outline))" }} aria-labelledby="del-h">
          <div className="row gap-16 wrap"><div className="grow stack gap-4" style={{ minWidth: 220 }}><h2 id="del-h" className="t-tl" style={{ color: "var(--error)" }}>{t("privacy.delete")}</h2><p className="t-bm t-secondary">{t("account.deleteBody")}</p></div>
            <Button variant="danger-outlined" icon="delete_forever" disabledReason={!me.data ? t("progress.empty") : false} onClick={() => { setTyped(""); setDelErr(""); setDelOpen(true); }}>{t("privacy.delete")}</Button></div>
        </section>
      </div>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title={t("account.deleteTitle")} icon="warning"
        actions={<><Button variant="text" onClick={() => setDelOpen(false)}>{t("common.cancel")}</Button><Button variant="danger" loading={deleting} disabledReason={typed !== "DELETE" ? t("privacy.typeDelete") : false} onClick={doDelete}>{t("common.delete")}</Button></>}>
        <p className="t-bm t-secondary" style={{ marginBottom: 16 }}>{t("account.deleteBody")}</p>
        <TextField label={t("privacy.typeDelete")} value={typed} onChange={setTyped} onSurface autoFocus mono />
        {delErr && <div style={{ marginTop: 12 }}><Banner kind="error">{delErr}</Banner></div>}
      </Dialog>
    </div>
  );
}
