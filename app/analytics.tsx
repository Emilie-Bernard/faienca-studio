'use client';
import { Analytics as VercelAnalytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

/** Seule la vue (?vue=…) est gardée : les codes d'activation et identifiants de kits ne quittent pas le site. */
function stripQuery(event: BeforeSendEvent) {
    const url = new URL(event.url);
    const view = url.searchParams.get('vue');
    url.search = view ? '?vue=' + encodeURIComponent(view) : '';
    return { ...event, url: url.toString() };
}

/** Mesure d'audience Vercel, sans cookie. À activer dans l'onglet Analytics du projet Vercel. */
export default function Analytics() {
    return <><VercelAnalytics beforeSend={stripQuery} /><SpeedInsights /></>;
}
