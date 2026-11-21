import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import type { Person } from "../../contract";
import { Icon } from "../../design/components";
import { useApp } from "../../app/store";
import { useFeatures } from "../../lib/features";
import { nativeName } from "../../lib/languages";
import "./game.css";

async function post(path: string, body: unknown) {
  return fetch(`/api/v1${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
interface Tr { text: string; lang: string; languageName: string }

/**
 * Per-message language tools, all on Google Cloud:
 *  - A colleague who speaks another language (Marco, Italian) is translated into your language automatically,
 *    and what you write to them is shown to them in their language.
 *  - If your interface is not English, any colleague message can be translated into it.
 *  - Listen reads a message aloud with Gemini speech.
 */
export function MessageTools({ seq, mine, spoke }: { seq: number; mine: boolean; spoke?: Person }) {
  const { missionId, id } = useParams();
  const mission = missionId ?? id;
  const f = useFeatures();
  const lang = useApp((s) => s.lang);
  const toast = useApp((s) => s.toast);
  const [tr, setTr] = useState<Tr | null>(null);
  const [busy, setBusy] = useState<"listen" | "tr" | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const foreign = !!spoke?.language;
  // What to translate into: a colleague's message goes into your language; your message goes into theirs.
  const target = mine ? spoke?.language : lang;
  const canTranslate = f.translate && !!mission && seq >= 1 && !!target && (mine ? foreign : foreign || lang !== "en");
  const auto = canTranslate && foreign && (mine || lang !== spoke?.language);

  const run = async () => {
    if (!mission || !target) return;
    setBusy("tr");
    try {
      const r = await post(`/missions/${encodeURIComponent(mission)}/translate`, { seq, lang: target });
      if (!r.ok) throw new Error("no translation");
      setTr((await r.json()) as Tr);
    } catch { if (!auto) toast("Translation is not available right now."); }
    finally { setBusy(null); }
  };
  useEffect(() => { if (auto && !tr) void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auto, seq, target]);

  const listen = async () => {
    if (!mission) return;
    setBusy("listen");
    try {
      const r = await post(`/missions/${encodeURIComponent(mission)}/speech`, { seq, ...(tr && !mine ? { lang: tr.lang } : {}) });
      if (!r.ok) throw new Error("no audio");
      audio.current?.pause();
      audio.current = new Audio(URL.createObjectURL(await r.blob()));
      await audio.current.play();
    } catch { toast("Audio is not available right now."); }
    finally { setBusy(null); }
  };

  if (!mission || seq < 1) return null;
  const showListen = f.speech && !mine;
  const showButton = canTranslate && !auto;
  if (!showListen && !showButton && !tr) return null;
  const name = tr?.languageName ?? "";
  return (
    <>
      <div className="msg-tools">
        {showListen && <button type="button" onClick={listen} disabled={busy !== null} aria-label="Listen to this message"><Icon name="volume_up" />{busy === "listen" ? "Loading…" : "Listen"}</button>}
        {showButton && <button type="button" onClick={() => (tr ? setTr(null) : run())} disabled={busy === "tr"} aria-label={`Translate this message to ${nativeName(lang)}`}><Icon name="translate" />{tr ? "Hide translation" : busy === "tr" ? "Translating…" : `Translate to ${nativeName(lang)}`}</button>}
      </div>
      {tr && (
        <div className="msg-translated" lang={tr.lang}>
          {tr.text}
          <small>{mine ? `Sent to ${spoke?.name} in ${name}` : foreign ? `Translated from ${spoke?.languageName}` : `Translated to ${name}`} by Google Cloud Translation.</small>
        </div>
      )}
    </>
  );
}
