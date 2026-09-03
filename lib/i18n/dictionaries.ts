import en from '../../locales/en.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';

/* Only en/fr/de have real translations today. The other locales listed in
   locales/index.json are structurally supported (selectable in the language
   sheet, persisted to users.locale) but fall back to English text until
   someone translates them -- see dictionaries[locale] ?? dictionaries.en
   in lib/i18n/server.ts and components/i18n/useT.ts. */
export const dictionaries: Record<string, Record<string, string>> = { en, fr, de };

export type MessageKey = keyof typeof en;
