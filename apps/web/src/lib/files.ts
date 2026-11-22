/**
 * Excel and PDF in the browser. Nothing here leaves the learner's device: a spreadsheet is built or read locally, and an
 * uploaded .xlsx is turned into plain text (one row per line, cells separated by " | ") before it is submitted.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "ayden";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadXlsx(title: string, columns: string[], rows: (string | number)[][]) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = columns.map((c) => ({ value: c, fontWeight: "bold" as const }));
  const body = rows.map((r) => r.map((c) => (typeof c === "number" ? { value: c, type: Number } : { value: String(c), type: String })));
  const blob = await writeExcelFile([head, ...body] as never).toBlob();
  save(blob, `${safeName(title)}.xlsx`);
}

/** Read an uploaded .xlsx into the text format the server reads. Rejects macro files and anything over 2 MB. */
export async function readXlsx(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Please choose an .xlsx file (Excel or Google Sheets download). Macro files are not accepted.");
  if (file.size > MAX_BYTES) throw new Error("That file is over 2 MB. Please send a smaller sheet.");
  const { readSheet } = await import("read-excel-file/browser");
  const data = (await readSheet(file)) as unknown[][];
  const lines = data
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""))
    .slice(0, 200)
    .map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).replace(/\s+/g, " ").replace(/\|/g, "/").trim())).join(" | "));
  return `[xlsx: ${file.name.slice(0, 60)}]\n${lines.join("\n")}\n`;
}

const stripMarkdown = (md: string) =>
  md
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");

export async function downloadPdf(title: string, text: string, isMarkdown = false) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const height = doc.internal.pageSize.getHeight() - margin;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  for (const l of doc.splitTextToSize(title, width) as string[]) { doc.text(l, margin, y); y += 20; }
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const plain = (isMarkdown ? stripMarkdown(text) : text).replace(/₹/g, "Rs ").replace(/[^\x09\x0a\x0d\x20-\x7e•]/g, "");
  for (const para of plain.split("\n")) {
    const lines = (para.trim() ? doc.splitTextToSize(para, width) : [""]) as string[];
    for (const l of lines) {
      if (y > height) { doc.addPage(); y = margin; }
      doc.text(l, margin, y);
      y += 15;
    }
  }
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Training scenario. Fictional company and numbers. Made with Ayden.", margin, doc.internal.pageSize.getHeight() - 24);
  save(doc.output("blob"), `${safeName(title)}.pdf`);
}
