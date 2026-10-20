'use client';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ChevronDown, LoaderCircle, Newspaper, Search, Terminal, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dollars } from '../lib/veille';

type Run = {
    _id: string; kind: 'portrait' | 'news'; subject: string; startedBy: string; model: string;
    status: 'running' | 'done' | 'error'; startedAt: number; finishedAt?: number; error?: string;
    cost: number; inputTokens: number; outputTokens: number; searches: number; fetches: number;
    log: { at: number; level: 'info' | 'error'; text: string }[];
};
const when = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const clock = (t: number) => new Date(t).toLocaleTimeString('fr-FR');
const duration = (r: Run) => { const s = Math.round(((r.finishedAt ?? Date.now()) - r.startedAt) / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
const statusLabel = { running: 'En cours', done: 'Terminée', error: 'Échec' } as const;

/** Journal de l'agent de veille : chaque recherche, son déroulé pas à pas et ce qu'elle a coûté. */
export function AgentLog() {
    const runs = useQuery(anyApi.veille.runs) as Run[] | undefined;
    const [open, setOpen] = useState<string | null>(null), [search, setSearch] = useState('');
    if (!runs) return <p className="muted">Chargement du journal…</p>;
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = runs.filter(r => new Date(r.startedAt).toISOString().startsWith(month));
    const portraits = runs.filter(r => r.kind === 'portrait' && r.status === 'done');
    const sum = (list: Run[]) => list.reduce((s, r) => s + r.cost, 0);
    const q = search.trim().toLowerCase();
    const shown = runs.filter(r => !q || `${r.subject} ${r.startedBy} ${r.model} ${r.error ?? ''}`.toLowerCase().includes(q));
    return <div className="agent-log">
        <section className="product-kpis">
            <div className="product-kpi"><span>Ce mois-ci</span><strong>{dollars(sum(thisMonth))}</strong><small>{thisMonth.length} recherche{thisMonth.length > 1 ? 's' : ''}</small></div>
            <div className="product-kpi"><span>Depuis le début</span><strong>{dollars(sum(runs))}</strong><small>{runs.length} recherche{runs.length > 1 ? 's' : ''}</small></div>
            <div className="product-kpi"><span>Par portrait, en moyenne</span><strong>{portraits.length ? dollars(sum(portraits) / portraits.length) : '—'}</strong><small>{portraits.length} portrait{portraits.length > 1 ? 's' : ''} réussi{portraits.length > 1 ? 's' : ''}</small></div>
            <div className="product-kpi"><span>Recherches web</span><strong>{runs.reduce((s, r) => s + r.searches, 0)}</strong><small>{runs.reduce((s, r) => s + r.fetches, 0)} pages lues</small></div>
        </section>
        <p className="muted agent-log-note">Montants en dollars, tels que facturés par OpenRouter (modèle, recherches web et pages lues compris).</p>
        {runs.length > 0 && <label className="search"><Search size={16} /><input aria-label="Rechercher dans le journal" placeholder="Artiste, personne, modèle, erreur…" value={search} onChange={e => setSearch(e.target.value)} /></label>}
        {!runs.length ? <section className="panel client-empty"><Terminal size={28} /><p>Aucune recherche pour l’instant. Elles apparaîtront ici dès qu’une recherche sera lancée depuis la Veille textile.</p></section>
            : <ul className="agent-runs">{shown.map(r => {
                const expanded = open === r._id;
                return <li key={r._id} className={cn('agent-run', r.status)}>
                    <button type="button" className="agent-run-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r._id)}>
                        {r.kind === 'portrait' ? <UserRound size={16} /> : <Newspaper size={16} />}
                        <span className="agent-run-title"><strong>{r.subject}</strong><small>{when(r.startedAt)} · {r.startedBy} · {r.model.replace(/^.*\//, '')}</small></span>
                        <span className={cn('agent-run-status', r.status)}>{r.status === 'running' && <LoaderCircle size={12} className="spin" />}{statusLabel[r.status]}</span>
                        <span className="agent-run-figures"><span>{r.searches} rech. · {r.fetches} pages</span><span>{duration(r)}</span></span>
                        <strong className="agent-run-cost">{dollars(r.cost)}</strong>
                        <ChevronDown size={16} className="agent-run-chevron" />
                    </button>
                    {expanded && <div className="agent-console" role="log" aria-label={'Déroulé de la recherche ' + r.subject}>
                        {r.log.map((l, i) => <div key={i} className={l.level}><time>{clock(l.at)}</time><span>{l.text}</span></div>)}
                        <div className="agent-console-total"><time /><span>{r.inputTokens.toLocaleString('fr-FR')} jetons lus · {r.outputTokens.toLocaleString('fr-FR')} écrits · {dollars(r.cost)}</span></div>
                    </div>}
                </li>;
            })}</ul>}
    </div>;
}
