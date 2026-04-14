import type { Language } from "./language";
import { rrs1 } from "./rrs1";
import { rrs2 } from "./rrs2";

export const LANGUAGES: Language[] = [rrs2, rrs1];

export function getLanguage(id: string): Language {
  const lang = LANGUAGES.find((l) => l.id === id);
  if (!lang) throw new Error(`Unknown language: ${id}`);
  return lang;
}
