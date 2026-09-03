'use client';

import { useContext } from 'react';
import { I18nContext } from './I18nProvider';

/* Client-component counterpart to lib/i18n/server.ts's getT() -- same
   lookup/fallback/interpolation logic, reading from the dictionary the
   nearest I18nProvider was given rather than resolving locale itself. */
export function useT() {
  const dict = useContext(I18nContext);
  return (key: string, vars?: Record<string, string | number>): string => {
    let value = dict[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
}
