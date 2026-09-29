import { useSyncExternalStore } from "react";
import {
  INVOICE_SEARCH_TERMS,
  LOCALES,
  translations,
  type Locale,
} from "./locales";

export type { Locale } from "./locales";
export { INVOICE_SEARCH_TERMS, LOCALES };

let currentLocale: Locale = "en";
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function detectLocale(language = navigator.language): Locale {
  const tag = language.toLowerCase();
  if (tag.startsWith("cs")) return "cs";
  if (tag.startsWith("sk")) return "sk";
  if (tag.startsWith("vi")) return "vi";
  return "en";
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "cs" || value === "sk" || value === "vi";
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  emit();
}

export function t(key: string, locale: Locale = currentLocale): string {
  return translations[locale][key] ?? translations.en[key] ?? key;
}

export function invoiceTermsFor(locale: Locale = currentLocale): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of [
    ...INVOICE_SEARCH_TERMS[locale],
    ...INVOICE_SEARCH_TERMS.cs,
    ...INVOICE_SEARCH_TERMS.en,
    ...INVOICE_SEARCH_TERMS.sk,
    ...INVOICE_SEARCH_TERMS.vi,
  ]) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
  }
  return terms;
}

function foldMarks(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function looksLikeInvoiceQuery(query: string): boolean {
  const haystack = foldMarks(query);
  return invoiceTermsFor().some((term) => haystack.includes(foldMarks(term)));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useI18n(): { locale: Locale; t: (key: string) => string } {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { locale, t: (key: string) => t(key, locale) };
}
