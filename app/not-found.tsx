import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MESSAGES } from '../lib/i18n';
import { getLocale } from '../lib/locale-server';
import { LanguageSwitcher, Lines } from './i18n';

export async function generateMetadata(): Promise<Metadata> { return { title: MESSAGES[await getLocale()].meta.notFound }; }

/** Un panneau de carreaux de faïence où il manque une pièce : la page demandée. */
const TILES = 16, MISSING = 6;

export default async function NotFound() {
    const all = MESSAGES[await getLocale()], t = all.notFound;
    return <main className="not-found">
        <section className="not-found-text">
            <Link href="/" className="not-found-brand"><img src="/brand/logo-horizontal.svg" alt={t.home} /></Link>
            <LanguageSwitcher className="not-found-lang" />
            <div className="eyebrow">{t.eyebrow}</div>
            <h1><Lines text={t.title} /></h1>
            <p>{t.body}</p>
            <div className="not-found-actions">
                <Button asChild size="lg"><Link href="/"><ArrowLeft />{t.back}</Link></Button>
                <Button asChild size="lg" variant="outline"><a href="https://faienca.fr" target="_blank" rel="noreferrer">{t.kits}<ArrowUpRight /></a></Button>
            </div>
            <footer>{all.tagline}</footer>
        </section>
        <div className="not-found-tiles" aria-hidden="true">
            {Array.from({ length: TILES }, (_, i) => i === MISSING
                ? <span key={i} className="not-found-gap"><strong>404</strong></span>
                : <img key={i} src="/brand/carreau.svg" alt="" />)}
        </div>
    </main>;
}
