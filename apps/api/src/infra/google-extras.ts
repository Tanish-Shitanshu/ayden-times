import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";
import { error as logError, info } from "./log.js";
import type { Store } from "./store.js";

/**
 * Extra Google services that sit on the request path:
 *  - Vertex AI (Gemini image model): generates one badge illustration per skill.
 *  - Cloud Storage: caches those illustrations so each one is generated once.
 *  - Cloud Translation: translates a colleague's message into Hindi on request.
 *  - Gemini speech (TTS): reads a colleague's message aloud.
 * Each one is optional. When its env flag is off, or a call fails, the feature quietly disappears from the UI.
 */

const env = process.env;
export const extrasConfig = {
  artBucket: env.ART_BUCKET ?? "",
  vertexLocation: env.VERTEX_LOCATION ?? "us-central1",
  imageModel: env.MODEL_IMAGE ?? "gemini-2.5-flash-image",
  ttsModel: env.MODEL_TTS ?? "gemini-3.8-flash-lite-tts",
  translate: env.TRANSLATE === "on",
  speech: env.SPEECH === "on",
};

const VOICES = ["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda"];
const voiceFor = (personId: string) => VOICES[parseInt(createHash("md5").update(personId).digest("hex").slice(0, 4), 16) % VOICES.length]!;

/** Strip markdown so speech and translation read naturally. */
export const plainText = (s: string) =>
  s.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().slice(0, 700);

/** Wrap raw 16-bit PCM in a WAV header so browsers can play it. */
export function pcmToWav(pcm: Buffer, rate = 24000, channels = 1): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export class GoogleExtras {
  private auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  private inflight = new Map<string, Promise<Buffer | null>>();
  private coolDown = new Map<string, number>();
  private translations = new Map<string, string>();
  private speeches = new Map<string, Buffer>();

  constructor(private store: Store) {}

  get artEnabled() { return !!extrasConfig.artBucket && !!config.project; }
  get translateEnabled() { return extrasConfig.translate && !!config.project; }
  get speechEnabled() { return extrasConfig.speech && !!config.geminiKey; }

  private async token() {
    // Local development only: lets a developer test against real Google APIs with their own gcloud token.
    if (!config.isProd && process.env.DEV_ACCESS_TOKEN) return process.env.DEV_ACCESS_TOKEN;
    const t = await this.auth.getAccessToken();
    if (!t) throw new Error("no access token");
    return t;
  }

  /* ───────── badge art: Vertex AI image generation, cached in Cloud Storage ───────── */

  private obj(id: string) { return encodeURIComponent(`badges/${id}.png`); }

  private async fromBucket(id: string): Promise<Buffer | null> {
    const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${extrasConfig.artBucket}/o/${this.obj(id)}?alt=media`, { headers: { authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`storage read ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }

  private async toBucket(id: string, png: Buffer) {
    const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${extrasConfig.artBucket}/o?uploadType=media&name=${this.obj(id)}`, { method: "POST", headers: { authorization: `Bearer ${await this.token()}`, "content-type": "image/png" }, body: new Uint8Array(png), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`storage write ${r.status}`);
  }

  private async generate(prompt: string): Promise<Buffer> {
    const loc = extrasConfig.vertexLocation;
    const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${config.project}/locations/${loc}/publishers/google/models/${extrasConfig.imageModel}:generateContent`;
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
      signal: AbortSignal.timeout(55000),
    });
    if (!r.ok) throw new Error(`vertex image ${r.status}`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string } }[] } }[] };
    const data = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error("vertex image: no image returned");
    return Buffer.from(data, "base64");
  }

  /** Returns the badge illustration PNG, generating and caching it on first use. Null if unavailable. */
  async badgeArt(id: string, title: string, role: string): Promise<Buffer | null> {
    if (!this.artEnabled) return null;
    if ((this.coolDown.get(id) ?? 0) > Date.now()) return null;
    const existing = this.inflight.get(id);
    if (existing) return existing;
    const job = (async () => {
      try {
        const cached = await this.fromBucket(id);
        if (cached) return cached;
        const prompt = `A flat, friendly vector badge icon that symbolises "${title}" for a new hire in a ${role} job. Rounded geometric shapes, deep indigo (#2F5FD0) with warm amber accents, a single clear central symbol, soft shadow, centered on a plain off-white background. No text, no letters, no numbers.`;
        const png = await this.generate(prompt);
        await this.toBucket(id, png).catch((e) => logError("badge art upload failed", { error: String(e).slice(0, 120) }));
        await this.store.incr("badgeArt");
        info("badge art generated", { id });
        return png;
      } catch (e) {
        this.coolDown.set(id, Date.now() + 5 * 60_000);
        logError("badge art failed", { id, error: String(e).slice(0, 160) });
        return null;
      } finally {
        this.inflight.delete(id);
      }
    })();
    this.inflight.set(id, job);
    return job;
  }

  /* ───────── Cloud Translation ───────── */

  async translate(text: string, target: string): Promise<string | null> {
    if (!this.translateEnabled) return null;
    const key = `${target}:${createHash("sha1").update(text).digest("hex")}`;
    const hit = this.translations.get(key);
    if (hit) return hit;
    try {
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2`, {
        method: "POST",
        headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json", "x-goog-user-project": config.project },
        body: JSON.stringify({ q: text, target, format: "text" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`translate ${r.status}`);
      const j = (await r.json()) as { data?: { translations?: { translatedText: string }[] } };
      const out = j.data?.translations?.[0]?.translatedText;
      if (!out) return null;
      if (this.translations.size > 500) this.translations.clear();
      this.translations.set(key, out);
      await this.store.incr("translations");
      return out;
    } catch (e) {
      logError("translate failed", { error: String(e).slice(0, 160) });
      return null;
    }
  }

  /* ───────── interface translation (whole UI dictionary, cached in Cloud Storage) ───────── */

  private uiCache = new Map<string, Record<string, string>>();

  private async v2(q: string[], target: string): Promise<string[]> {
    const r = await fetch(`https://translation.googleapis.com/language/translate/v2`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json", "x-goog-user-project": config.project },
      body: JSON.stringify({ q, source: "en", target, format: "html" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`translate ${r.status}`);
    const j = (await r.json()) as { data?: { translations?: { translatedText: string }[] } };
    return (j.data?.translations ?? []).map((t) => t.translatedText);
  }

  /** Translates a key->English dictionary. {placeholders} are protected so they survive. */
  async translateDictionary(strings: Record<string, string>, target: string): Promise<Record<string, string> | null> {
    if (!this.translateEnabled) return null;
    const hash = createHash("sha1").update(JSON.stringify(strings)).digest("hex").slice(0, 12);
    const key = `${target}-${hash}`;
    const mem = this.uiCache.get(key);
    if (mem) return mem;
    try {
      if (extrasConfig.artBucket) {
        const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${extrasConfig.artBucket}/o/${encodeURIComponent(`i18n/${key}.json`)}?alt=media`, { headers: { authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(8000) });
        if (r.ok) { const d = (await r.json()) as Record<string, string>; this.uiCache.set(key, d); return d; }
      }
      const keys = Object.keys(strings);
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{(\w+)\}/g, '<span translate="no">{$1}</span>');
      const unesc = (t: string) => t.replace(/<span[^>]*translate="no"[^>]*>(\{\w+\})<\/span>/g, "$1").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      const out: Record<string, string> = {};
      for (let i = 0; i < keys.length; i += 60) {
        const chunk = keys.slice(i, i + 60);
        const res = await this.v2(chunk.map((k) => esc(strings[k]!)), target);
        chunk.forEach((k, n) => { out[k] = unesc(res[n] ?? strings[k]!); });
      }
      await this.store.incr("translations", keys.length);
      this.uiCache.set(key, out);
      if (extrasConfig.artBucket) {
        await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${extrasConfig.artBucket}/o?uploadType=media&name=${encodeURIComponent(`i18n/${key}.json`)}`, { method: "POST", headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" }, body: JSON.stringify(out), signal: AbortSignal.timeout(15000) }).catch(() => undefined);
      }
      return out;
    } catch (e) {
      logError("ui translation failed", { target, error: String(e).slice(0, 160) });
      return null;
    }
  }

  /* ───────── Gemini speech ───────── */

  async speak(text: string, personId: string): Promise<Buffer | null> {
    if (!this.speechEnabled) return null;
    const key = createHash("sha1").update(personId + text).digest("hex");
    const hit = this.speeches.get(key);
    if (hit) return hit;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${extrasConfig.ttsModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": config.geminiKey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceFor(personId) } } } },
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) throw new Error(`tts ${r.status}`);
      const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[] };
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!part) return null;
      const raw = Buffer.from(part.data, "base64");
      const wav = /wav/i.test(part.mimeType) ? raw : pcmToWav(raw, Number(/rate=(\d+)/i.exec(part.mimeType)?.[1] ?? 24000));
      if (this.speeches.size > 60) this.speeches.clear();
      this.speeches.set(key, wav);
      await this.store.incr("speech");
      return wav;
    } catch (e) {
      logError("speech failed", { error: String(e).slice(0, 160) });
      return null;
    }
  }
}
