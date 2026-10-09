import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, pickLocale, type Locale } from './i18n';

/** Langue de la requête : cookie du sélecteur, sinon en-tête Accept-Language. */
export async function getLocale(): Promise<Locale> {
    const [c, h] = await Promise.all([cookies(), headers()]);
    return pickLocale(c.get(LOCALE_COOKIE)?.value, h.get('accept-language'));
}
