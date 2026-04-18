import type { Language } from "./language";
import { rrs1 } from "./rrs1";
import { rrs2 } from "./rrs2";
import { rrs3 } from "./rrs3";

export const LANGUAGES: Language[] = [rrs3, rrs2, rrs1];

export function getLanguage(id: string): Language {
  const lang = LANGUAGES.find((l) => l.id === id);
  if (!lang) throw new Error(`Unknown language: ${id}`);
  return lang;
}
