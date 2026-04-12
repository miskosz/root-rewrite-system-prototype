import type { Program } from "./types";

export interface Language {
  id: string;
  label: string;
  parse(source: string): Program;
  highlight(source: string): string;
  defaultProgram: string;
}

export { ParseError } from "./rrs1/tokenizer";
