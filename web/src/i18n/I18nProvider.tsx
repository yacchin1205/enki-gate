import { useMemo, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { defaultLocale, messages, supportedLocales, type AppLocale } from "./messages";

function isSupportedLocale(value: string): value is AppLocale {
  return supportedLocales.includes(value as AppLocale);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useMemo(() => {
    for (const language of navigator.languages) {
      const baseLocale = language.split("-")[0];
      if (isSupportedLocale(baseLocale)) {
        return baseLocale;
      }
    }

    return defaultLocale;
  }, []);

  return (
    <IntlProvider locale={locale} messages={messages[locale]}>
      {children}
    </IntlProvider>
  );
}
