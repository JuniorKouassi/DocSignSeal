import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getContextOrNull } from '../auth/dal';
import { dictionaries, type MessageKey } from './dictionaries';
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE } from './shared';

/* Memoized with cache(), same per-request pattern as lib/db/client.ts and
   lib/auth/dal.ts -- resolved once per request, safely called from many
   components without re-reading the session or the cookie jar each time.

   Resolution order: the logged-in user's saved preference (users.locale)
   first, since that's the durable choice; the dss_locale cookie next, which
   is the only signal available on /login and /signup where there's no
   session yet; English otherwise. */
export const getLocale = cache(async (): Promise<string> => {
  const context = await getContextOrNull();
  if (context && isSupportedLocale(context.user.locale)) return context.user.locale;

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(cookieLocale)) return cookieLocale as string;

  return DEFAULT_LOCALE;
});

export const getDict = cache(async (): Promise<Record<string, string>> => {
  const locale = await getLocale();
  return dictionaries[locale] ?? dictionaries.en;
});

export const getT = cache(async () => {
  const dict = await getDict();
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    let value = dict[key] ?? dictionaries.en[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
});
