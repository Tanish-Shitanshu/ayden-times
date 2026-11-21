import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Logo, Icon, IconButton, Button, Dialog, ConfirmDialog, MenuButton, TextField, Drawer } from "../design/components";
import { useApp } from "./store";
import { useT, errorText } from "../lib/i18n";
import { api } from "../api/client";
import { content } from "../content";
import { useFocusOnRoute } from "../lib/a11y";
import type { I18nKey } from "../i18n/en";
import type { Lang } from "../contract";
import { UI_LANGUAGES } from "../lib/languages";

const NAV: { to: string; key: I18nKey; icon: string }[] = [
  { to: "/roles", key: "nav.roles", icon: "work" },
  { to: "/progress", key: "nav.progress", icon: "timeline" },
  { to: "/how-it-works", key: "nav.how", icon: "schema" },
  { to: "/privacy", key: "nav.privacy", icon: "shield_person" },
];

export function LangToggle() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  return (
    <label className="lang-select">
      <Icon name="translate" className="sm" />
      <span className="sr-only">{t("lang.label")}</span>
      <select value={lang} onChange={(e) => void setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
        {UI_LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.native}</option>)}
      </select>
    </label>
  );
}

export function AccountMenu() {
  const t = useT();
  const nav = useNavigate();
  const me = useApp((s) => s.me);
  const setMe = useApp((s) => s.setMe);
  const ensure = useApp((s) => s.ensureSession);
  const toast = useApp((s) => s.toast);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const display = me?.displayName ?? t("account.guest");

  const saveName = async () => {
    const n = name.trim();
    if (!n) { setErr(t("account.nameLabel")); return; }
    setBusy(true); setErr("");
    try { await ensure(); const m = await api.updateMe({ displayName: n }); setMe(m); setEdit(false); toast(t("common.saved")); }
    catch (e) { setErr(errorText(t, e)); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true);
    try { if (me) await api.deleteMe(); setMe(null); setDel(false); nav("/"); toast(t("account.delete")); }
    catch (e) { toast(errorText(t, e)); } finally { setBusy(false); }
  };
  return (
    <>
      <MenuButton label={t("account.menu")} items={[
        { id: "name", label: t("account.editName"), icon: "edit", sub: display, onSelect: () => { setName(me?.displayName ?? ""); setErr(""); setEdit(true); } },
        { id: "privacy", label: t("account.privacy"), icon: "shield_person", onSelect: () => nav("/privacy") },
        { id: "delete", label: t("account.delete"), icon: "delete", danger: true, onSelect: () => setDel(true), disabled: !me ? t("progress.empty") : false },
      ]} trigger={(p) => (
        <button type="button" className="account-chip" aria-label={`${t("account.menu")}: ${display}`} {...p}>
          <span className="avatar sm" style={{ background: "var(--primary)", color: "var(--on-primary)" }} aria-hidden="true">{display.replace(/^Guest\s*/, "G").slice(0, 2).toUpperCase()}</span>
          <span className="account-name">{display}</span>
          <Icon name="expand_more" className="sm" />
        </button>
      )} />
      <Dialog open={edit} onClose={() => setEdit(false)} title={t("account.editName")} actions={<><Button variant="text" onClick={() => setEdit(false)}>{t("common.cancel")}</Button><Button loading={busy} onClick={saveName}>{t("common.save")}</Button></>}>
        <TextField label={t("account.nameLabel")} value={name} onChange={setName} helper={t("account.nameHelp")} error={err || undefined} maxLength={40} onSurface autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveName(); }} />
      </Dialog>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={doDelete} title={t("account.deleteTitle")} body={t("account.deleteBody")} confirmLabel={t("common.delete")} danger loading={busy} />
    </>
  );
}

function Header() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <IconButton icon="menu" label={t("nav.menu")} className="only-mobile" onClick={() => setOpen(true)} />
        <Link to="/" className="logo-link" aria-label={t("nav.home")}><Logo /></Link>
        <nav className="main-nav hide-mobile" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className="nav-link">{t(n.key)}</NavLink>)}
        </nav>
        <span className="spacer" />
        <div className="row gap-4 hide-mobile"><LangToggle /></div>
        <AccountMenu />
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={<Logo size={24} />} side="left" sheet={false}>
        <nav className="stack gap-4" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="drawer-link" onClick={() => setOpen(false)}><Icon name={n.icon} />{t(n.key)}</NavLink>
          ))}
          <NavLink to="/cohort" className="drawer-link" onClick={() => setOpen(false)}><Icon name="groups" />{t("nav.cohort")}</NavLink>
        </nav>
        <hr className="divider" style={{ margin: "16px 0" }} />
        <div className="stack gap-16">
          <div className="row gap-12"><span className="t-bm t-secondary grow">{t("lang.label")}</span><LangToggle /></div>
        </div>
      </Drawer>
    </header>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="stack gap-8">
          <Logo size={22} />
          <p className="t-bm t-secondary">{t("footer.mvp")}</p>
          <p className="t-label t-secondary">{t("footer.built")}: Gemini API · Cloud Run · Firestore</p>
        </div>
        <nav className="row gap-16 wrap" aria-label="Footer">
          <Link to="/privacy">{t("nav.privacy")}</Link>
          <Link to="/how-it-works">{t("nav.how")}</Link>
          <Link to="/cohort">{t("nav.cohort")}</Link>
          {content.feedbackUrl && <a href={content.feedbackUrl} target="_blank" rel="noopener noreferrer">{t("footer.feedback")}</a>}
        </nav>
      </div>
    </footer>
  );
}

/** Global header + footer layout for every screen except the workspace. */
export function Shell() {
  const t = useT();
  useFocusOnRoute();
  const loadMe = useApp((s) => s.loadMe);
  const meChecked = useApp((s) => s.meChecked);
  useEffect(() => { if (!meChecked) loadMe().catch(() => undefined); }, [meChecked, loadMe]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">{t("skip")}</a>
      <Header />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
