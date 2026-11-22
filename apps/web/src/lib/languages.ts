import type { Lang } from "../contract";

/** Interface languages. English, Hindi and Telugu are written by hand; the rest are translated by Google Cloud Translation. */
export const UI_LANGUAGES: { code: Lang; native: string; english: string }[] = [
  { code: "en", native: "English", english: "English" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "ur", native: "اردو", english: "Urdu" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "or", native: "ଓଡ଼ିଆ", english: "Odia" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "as", native: "অসমীয়া", english: "Assamese" },
];
export const isHandWritten = (l: string) => l === "en" || l === "hi" || l === "te";
export const RTL = new Set(["ur"]);
export const nativeName = (code: string) => UI_LANGUAGES.find((l) => l.code === code)?.native ?? code;
