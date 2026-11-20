import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/** Markdown-lite to sanitised HTML. Links open in a new tab. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "img", "iframe", "form", "input"] });
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

export function headingsOf(md: string): { level: number; text: string; id: string }[] {
  return md.split("\n").filter((l) => /^#{1,3} /.test(l)).map((l) => {
    const level = l.match(/^#+/)![0].length;
    const text = l.replace(/^#+ /, "").replace(/[*`_]/g, "");
    return { level, text, id: slug(text) };
  });
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
