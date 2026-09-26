import type { Language } from "../language";
import { en, type Dictionary } from "./en";
import { id } from "./id";

const DICTIONARIES: Readonly<Record<Language, Dictionary>> = { en, id };

export function getDictionary(language: Language): Dictionary {
  return DICTIONARIES[language];
}
