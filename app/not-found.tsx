import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page introuvable · Faïença Studio' };

/** Un panneau de carreaux de faïence où il manque une pièce : la page demandée. */
const TILES = 16, MISSING = 6;

export default function NotFound() {
    return <main className="not-found">
        <section className="not-found-text">
            <Link href="/" className="not-found-brand"><img src="/brand/logo-horizontal.svg" alt="Faïença, accueil" /></Link>
            <div className="eyebrow">ERREUR 404</div>
            <h1>Il manque<br />un carreau.</h1>
            <p>Cette page s’est détachée du motif. Elle a peut-être été déplacée, ou le lien contient une petite erreur.</p>
            <div className="not-found-actions">
                <Button asChild size="lg"><Link href="/"><ArrowLeft />Revenir à l’atelier</Link></Button>
                <Button asChild size="lg" variant="outline"><a href="https://faienca.fr" target="_blank" rel="noreferrer">Découvrir les kits<ArrowUpRight /></a></Button>
            </div>
            <footer>Le Sud dans les idées. Le fil entre les mains.</footer>
        </section>
        <div className="not-found-tiles" aria-hidden="true">
            {Array.from({ length: TILES }, (_, i) => i === MISSING
                ? <span key={i} className="not-found-gap"><strong>404</strong></span>
                : <img key={i} src="/brand/carreau.svg" alt="" />)}
        </div>
    </main>;
}
