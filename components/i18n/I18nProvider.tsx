'use client';

import { createContext } from 'react';

/* Plain data (a resolved dictionary object), not a function -- Server
   Components can't pass functions as props to Client Components, only
   Server Actions can cross that boundary. app/dashboard/layout.tsx computes
   this once per request via lib/i18n/server.ts's getDict() and hands it
   down; useT() (./useT) does the same key lookup client-side. */
export const I18nContext = createContext<Record<string, string>>({});

export function I18nProvider({
  dict,
  children,
}: {
  dict: Record<string, string>;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={dict}>{children}</I18nContext.Provider>;
}
