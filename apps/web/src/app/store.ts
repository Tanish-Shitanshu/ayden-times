import { create } from "zustand";
import type { Lang, Me } from "../contract";
import { api, ApiFailure } from "../api/client";
import { fetchDictionary } from "../lib/dict";
import { RTL, isHandWritten, UI_LANGUAGES } from "../lib/languages";

export interface Snack { id: number; text: string; action?: { label: string; run: () => void } }

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };

interface AppState {
  lang: Lang;
  me: Me | null;
  meChecked: boolean;
  sessionExpired: boolean;
  snacks: Snack[];
  setLang: (l: Lang) => Promise<void>;
  /** Re-applies a saved non-English language after a page load. */
  bootLanguage: () => void;
  setMe: (me: Me | null) => void;
  /** Loads the current user without creating one. */
  loadMe: () => Promise<Me | null>;
  /** Returns the current user, creating a guest session if needed. */
  ensureSession: () => Promise<Me>;
  toast: (text: string, action?: Snack["action"]) => void;
  dismiss: (id: number) => void;
  expireSession: () => void;
  clearExpired: () => void;
}

let ensuring: Promise<Me> | null = null;
let snackId = 0;

export const useApp = create<AppState>((set, get) => ({
  lang: read("ayden_lang") === "hi" ? "hi" : read("ayden_lang") === "te" ? "te" : "en",
  me: null,
  meChecked: false,
  sessionExpired: false,
  snacks: [],
  setLang: async (lang) => {
    if (!isHandWritten(lang)) {
      const before = get().lang;
      get().toast("Translating the interface with Google Cloud Translation…");
      try { await get().ensureSession(); } catch { /* handled below */ }
      const ok = await fetchDictionary(lang);
      if (!ok) { get().toast("Could not translate the interface right now. Keeping the current language."); set({ lang: before }); return; }
    }
    write("ayden_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
    set({ lang });
    if (get().me) api.updateMe({ language: lang }).then((me) => set({ me })).catch(() => undefined);
  },
  bootLanguage: () => {
    const saved = read("ayden_lang") as Lang | null;
    if (saved && !isHandWritten(saved) && UI_LANGUAGES.some((l) => l.code === saved)) void get().setLang(saved);
  },
  setMe: (me) => set({ me, meChecked: true }),
  loadMe: async () => {
    try {
      const me = await api.getMe({ silent401: true });
      set({ me, meChecked: true });
      return me;
    } catch (e) {
      set({ meChecked: true });
      if (e instanceof ApiFailure && e.code === "unauthenticated") { set({ me: null }); return null; }
      throw e;
    }
  },
  ensureSession: () => {
    const me = get().me;
    if (me) return Promise.resolve(me);
    if (!ensuring) {
      ensuring = (async () => {
        const existing = await get().loadMe();
        if (existing) return existing;
        const created = await api.createGuest();
        set({ me: created.me, meChecked: true, sessionExpired: false });
        return created.me;
      })().finally(() => { ensuring = null; });
    }
    return ensuring;
  },
  toast: (text, action) => {
    const id = ++snackId;
    set((s) => ({ snacks: [...s.snacks.slice(-2), { id, text, action }] }));
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set((s) => ({ snacks: s.snacks.filter((x) => x.id !== id) })),
  expireSession: () => { if (get().me) set({ sessionExpired: true, me: null }); },
  clearExpired: () => set({ sessionExpired: false }),
}));
