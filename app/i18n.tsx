'use client';
import { createContext, Fragment, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConvexError } from 'convex/values';
import { formatDate, LOCALE_COOKIE, LOCALE_NAMES, LOCALES, MESSAGES, translateServerMessage, type Locale } from '../lib/i18n';
import { cn } from '@/lib/utils';

const LocaleContext = createContext<{ locale: Locale, setLocale: (l: Locale) => void }>({ locale: 'fr', setLocale: () => {} });

/** Langue de l'interface : choisie côté serveur (cookie ou navigateur), modifiable par le sélecteur. */
export function LocaleProvider({ initial, children }: { initial: Locale, children: React.ReactNode }) {
    const [locale, set] = useState(initial); const router = useRouter();
    const setLocale = (l: Locale) => {
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = l; set(l); router.refresh();
    };
    return <LocaleContext value={{ locale, setLocale }}>{children}</LocaleContext>;
}

export function useI18n() {
    const { locale, setLocale } = useContext(LocaleContext);
    return {
        locale, setLocale, t: MESSAGES[locale],
        date: (t: number) => formatDate(t, locale),
        /** Message d'une ConvexError (traduit s'il est connu), sinon le message de repli. */
        error: (err: unknown, fallback: string) => err instanceof ConvexError && typeof err.data === 'string' ? translateServerMessage(err.data, locale) : fallback,
        server: (message: string) => translateServerMessage(message, locale),
    };
}

/** Titre sur plusieurs lignes : « | » marque le retour à la ligne. */
export const Lines = ({ text }: { text: string }) => <>{text.split('|').map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</>;

export function LanguageSwitcher({ className }: { className?: string }) {
    const { locale, setLocale, t } = useI18n();
    return <div role="group" aria-label={t.language} className={cn('lang-switch', className)}>
        {LOCALES.map(l => <button key={l} type="button" lang={l} title={LOCALE_NAMES[l]} aria-label={LOCALE_NAMES[l]} aria-pressed={l === locale} onClick={() => l !== locale && setLocale(l)}>{l.toUpperCase()}</button>)}
    </div>;
}
