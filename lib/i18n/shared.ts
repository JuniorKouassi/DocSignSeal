import localeIndex from '../../locales/index.json';

export const LOCALE_COOKIE = 'dss_locale';

export type LocaleInfo = { code: string; native: string };

const SUPPORTED: LocaleInfo[] = localeIndex.supported;
const SUPPORTED_CODES = new Set(SUPPORTED.map((l) => l.code));

export function isSupportedLocale(value: string | null | undefined): boolean {
  return !!value && SUPPORTED_CODES.has(value);
}

export function supportedLocales(): LocaleInfo[] {
  return SUPPORTED;
}

export const DEFAULT_LOCALE = localeIndex.primary;
