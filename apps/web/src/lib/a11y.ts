import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/** Moves focus to the page h1 after route changes so screen readers announce the new page. */
export function useFocusOnRoute() {
  const loc = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (loc.hash) return;
    const h = document.querySelector<HTMLElement>("main h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.hash]);
}

/** Traps Tab focus inside a container while mounted; restores focus to the trigger on unmount. */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const auto = el?.querySelector<HTMLElement>("[data-autofocus]");
      (auto ?? el?.querySelector<HTMLElement>(sel))?.focus();
    };
    requestAnimationFrame(focusFirst);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(sel)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (prev && document.contains(prev)) prev.focus(); };
  }, [active]);
  return ref;
}
