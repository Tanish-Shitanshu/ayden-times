import { useRef, useState } from "react";
import qrcode from "qrcode-generator";
import type { WorkSample } from "../../api/client";
import { Button } from "../../design/components";
import { copyText } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { BadgeArt } from "../game/BadgeArt";
import "./share.css";

const W = 1200;
const H = 850;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif";

export const sampleUrl = (token: string) => `${window.location.origin}/s/${encodeURIComponent(token)}`;

function qrCells(text: string): { n: number; dark: [number, number][] } {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const dark: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dark.push([r, c]);
  return { n, dark };
}

/** Greedy line wrap for SVG text (no auto-wrapping in SVG). */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > max) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** The certificate as one SVG, so what is previewed, printed and downloaded is exactly the same. */
export function CertificateSvg({ s, url, svgRef }: { s: WorkSample; url: string; svgRef?: React.Ref<SVGSVGElement> }) {
  const accent = s.accentHex || "#2f5fd0";
  const strong = s.skills.filter((k) => k.state === "strong");
  const listed = (strong.length ? strong : s.skills).slice(0, 5);
  const qr = qrCells(url);
  const cell = 5;
  const nameSize = s.name.length > 28 ? 52 : s.name.length > 20 ? 62 : 74;
  const title = wrap(s.roleTitle, 44);
  const badges = s.badges.slice(0, 4);
  const bx = W / 2 - ((badges.length - 1) * 110) / 2;
  const skillText = (strong.length ? "Skills shown at target: " : "Skills in progress: ") + listed.map((k) => k.label).join("  ·  ");
  const skillLines = listed.length ? wrap(skillText, 74).slice(0, 2) : [];
  const sy = 556 + (title.length - 1) * 36;
  const by = sy + skillLines.length * 26 + 2;
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Certificate of completion for ${s.name}`} className="cert-svg">
      <rect width={W} height={H} fill="#fffdf8" />
      <rect x="28" y="28" width={W - 56} height={H - 56} fill="none" stroke={accent} strokeWidth="6" rx="6" />
      <rect x="44" y="44" width={W - 88} height={H - 88} fill="none" stroke="#d9ac4a" strokeWidth="2" rx="3" />
      <rect x="28" y="28" width={W - 56} height="14" fill={accent} opacity=".12" />
      {/* mark */}
      <g transform="translate(560 72)"><rect width="80" height="80" rx="20" fill={accent} /><path d="M40 20l18 40h-8l-4-9H34l-4 9h-8zM40 36l-5 12h10z" fill="#fff" /></g>
      <text x={W / 2} y="190" textAnchor="middle" fontFamily={SANS} fontSize="22" letterSpacing="6" fill="#5b6678">AYDEN · FIRST 90 DAYS SIMULATOR</text>
      <text x={W / 2} y="262" textAnchor="middle" fontFamily={SERIF} fontSize="56" fill="#1d2433">Certificate of Completion</text>
      <text x={W / 2} y="314" textAnchor="middle" fontFamily={SANS} fontSize="22" fill="#5b6678">This certifies that</text>
      <text x={W / 2} y="398" textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={nameSize} fill={accent}>{s.name}</text>
      <line x1="300" y1="420" x2="900" y2="420" stroke="#d9ac4a" strokeWidth="2" />
      <text x={W / 2} y="462" textAnchor="middle" fontFamily={SANS} fontSize="22" fill="#3c4658">completed a practice workplace simulation as</text>
      {title.map((l, i) => <text key={i} x={W / 2} y={508 + i * 36} textAnchor="middle" fontFamily={SANS} fontSize="30" fontWeight="600" fill="#1d2433">{l}</text>)}
      {skillLines.map((l, i) => <text key={i} x={W / 2} y={sy + i * 26} textAnchor="middle" fontFamily={SANS} fontSize="18" fill="#3c4658">{l}</text>)}
      {badges.map((b, i) => (
        <g key={b.id} transform={`translate(${bx + i * 110 - 42} ${by})`}><BadgeArt roleId={s.roleId} skillId={b.skillId} title={b.title} size={84} tier="earned" /></g>
      ))}
      {/* footer */}
      <text x="96" y="752" fontFamily={SANS} fontSize="18" fill="#3c4658">Issued {fmt(s.issuedAt)}</text>
      <text x="96" y="778" fontFamily={SANS} fontSize="18" fill="#3c4658">Certificate ID {s.certificateId}</text>
      <text x="96" y="800" fontFamily={SANS} fontSize="13" fill="#7b8390">A practice simulation. Not an accredited qualification or a hiring score.</text>
      <text x={W - 96 - (qr.n * cell) / 2} y="796" textAnchor="middle" fontFamily={SANS} fontSize="12" fill="#7b8390">Scan to see the evidence</text>
      <g transform={`translate(${W - 96 - qr.n * cell} ${774 - qr.n * cell})`}>
        <rect x="-6" y="-6" width={qr.n * cell + 12} height={qr.n * cell + 12} fill="#fff" stroke="#e1e4ea" />
        {qr.dark.map(([r, c]) => <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#1d2433" />)}
      </g>
    </svg>
  );
}

/** Preview with download (PNG) and print (PDF). */
export function Certificate({ sample }: { sample: WorkSample }) {
  const t = useT();
  const ref = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const url = sampleUrl(sample.token);

  const toPng = async (): Promise<Blob | null> => {
    const node = ref.current;
    if (!node) return null;
    const xml = new XMLSerializer().serializeToString(node);
    const href = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("render")); i.src = href; });
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    } finally {
      URL.revokeObjectURL(href);
    }
  };

  const download = async () => {
    setBusy(true);
    setErr("");
    try {
      const out = await toPng();
      if (!out) throw new Error("png");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `Ayden-certificate-${sample.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      setErr("Your browser could not make the image. Use Print and choose Save as PDF instead.");
    } finally {
      setBusy(false);
    }
  };

  const d = new Date(sample.issuedAt);
  const text = `I completed the "${sample.roleTitle}" first-90-days simulation on Ayden. Here is the evidence, in my own words:`;
  const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");
  const links = {
    // LinkedIn's own "Add to profile" form, pre-filled. The learner confirms it on LinkedIn.
    profile: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(`${sample.roleTitle}: practice simulation`)}&organizationName=${encodeURIComponent("Ayden")}&issueYear=${d.getFullYear()}&issueMonth=${d.getMonth() + 1}&certUrl=${encodeURIComponent(url)}&certId=${encodeURIComponent(sample.certificateId)}`,
    post: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  };
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const nativeShare = async () => {
    try {
      const png = await toPng();
      const file = png ? new File([png], "Ayden-certificate.png", { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, url });
      else await navigator.share({ text, url });
    } catch { /* the learner closed the sheet */ }
  };
  const copy = async () => { await copyText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); };

  return (
    <div className="cert-block">
      <div className="cert-wrap"><CertificateSvg s={sample} url={url} svgRef={ref} /></div>
      <div className="row gap-12 wrap cert-actions">
        <Button icon="download" loading={busy} onClick={download}>{t("cert.download")}</Button>
        <Button variant="outlined" icon="print" onClick={() => window.print()}>{t("cert.print")}</Button>
      </div>
      <div className="share-row" role="group" aria-label="Share your certificate">
        <span className="t-label t-secondary">{t("cert.shareIn")}</span>
        <Button size="sm" variant="tonal" icon="work" onClick={() => open(links.profile)}>{t("cert.linkedinProfile")}</Button>
        <Button size="sm" variant="tonal" icon="share" onClick={() => open(links.post)}>{t("cert.linkedinPost")}</Button>
        <Button size="sm" variant="tonal" icon="chat" onClick={() => open(links.whatsapp)}>WhatsApp</Button>
        <Button size="sm" variant="tonal" icon="alternate_email" onClick={() => open(links.x)}>X</Button>
        {canNative && <Button size="sm" variant="tonal" icon="ios_share" onClick={nativeShare}>{t("cert.shareImage")}</Button>}
        <Button size="sm" variant="text" icon={copied ? "check" : "link"} onClick={copy}>{copied ? t("common.copied") : t("share.copyLink")}</Button>
      </div>
      {err && <p className="t-bm" role="alert" style={{ color: "var(--error)" }}>{err}</p>}
    </div>
  );
}
