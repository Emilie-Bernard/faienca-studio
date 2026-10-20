'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowLeft, ArrowUpRight, CalendarDays, Clapperboard, Store, Globe, Instagram, LoaderCircle, MapPin, Newspaper, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ask } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { cardTags, dateFr, dollars, emptyNews, emptyPortrait, lifeDates, newsError, newsKinds, newsLabels, newsWhen, portraitError, sortTimeline, timelineKinds, timelineLabels, zoneLabels, zones, type Link, type NewsInput, type PortraitInput, type TimelineItem, type Work, type Zone } from '../lib/veille';
import { isoToday } from '../lib/model';
import { errorText } from './client';
import { Videos, WorkshopPage, Workshops } from './veille-more';

type Research = 'idle' | 'running' | 'error';
type ArtistRow = { _id: string; name: string; country: string; city: string; zone: Zone; birthDate: string; deathDate: string; techniques: string[]; summary: string; photoUrl: string; works: number; dates: number; research: Research; updatedAt: number };
type NewsRow = NewsInput & { _id: string; artistIds: string[]; artists: { _id: string; name: string }[]; source: 'manual' | 'agent'; authorName: string; createdAt: number };
type RunSummary = { status: 'running' | 'done' | 'error'; cost: number; model: string; finishedAt?: number };
type Artist = PortraitInput & { _id: string; research: Research; researchError?: string; researchHint?: string; researchedAt?: number; authorName: string; news: (NewsInput & { _id: string })[]; lastRun: RunSummary | null };
type AgentStatus = { available: boolean; model: string; scan: { status: 'running' | 'done' | 'error'; startedAt: number; finishedAt?: number; error?: string; cost: number } | null };

const newId = () => crypto.randomUUID();
const ago = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const place = (x: { city: string; country: string }) => [x.city, x.country].filter(Boolean).join(', ');
const span = (n: { startDate: string; endDate: string }) => n.startDate && n.endDate && n.endDate !== n.startDate ? `${dateFr(n.startDate)} → ${dateFr(n.endDate)}` : dateFr(n.startDate);
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/** Onglets de la veille ; dans le studio, l'onglet et la fiche ouverte font partie de l'adresse (/veille/ateliers, /veille/atelier/<id>…). */
const tabs = [['', 'Brodeuses et artistes', UserRound], ['ateliers', 'Ateliers', Store], ['nouvelles', 'Nouvelles du monde textile', Newspaper], ['videos', 'Documentaires et vidéos', Clapperboard]] as const;

/** Veille textile, identique dans le studio et dans l'espace stagiaire. */
export function Veille({ onToast, path, onNavigate }: { onToast: (s: string) => void, path?: string, onNavigate?: (path: string) => void }) {
    const [localPath, setLocalPath] = useState('');
    const current = onNavigate ? path ?? '' : localPath, go = onNavigate ?? setLocalPath;
    const status = useQuery(anyApi.veille.agentStatus) as AgentStatus | undefined;
    const tab = tabs.some(([id]) => id === current) ? current : current.startsWith('atelier/') ? 'ateliers' : '';
    const detail = tabs.some(([id]) => id === current) ? null : current;
    if (detail?.startsWith('atelier/')) return <WorkshopPage id={detail.slice('atelier/'.length)} onBack={() => go('ateliers')} onOpenArtist={id => go(id)} onToast={onToast} />;
    if (detail) return <Portrait id={detail} agent={!!status?.available} onBack={() => go('')} onToast={onToast} />;
    return <div className="veille">
        <div className="veille-tabs" role="tablist" aria-label="Veille textile">
            {tabs.map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => go(id)}><Icon size={16} />{label}</button>)}
        </div>
        {status && !status.available && (tab === '' || tab === 'nouvelles') && <div className="review-note"><Sparkles size={20} /><p>L’agent de recherche n’est pas encore branché (clé Exa ou OpenRouter manquante dans Convex). Tu peux déjà tout saisir à la main.</p></div>}
        {tab === '' ? <Artists agent={!!status?.available} onOpen={go} onToast={onToast} />
            : tab === 'ateliers' ? <Workshops onOpen={id => go('atelier/' + id)} onToast={onToast} />
            : tab === 'videos' ? <Videos onToast={onToast} />
            : <News status={status} onOpen={go} onToast={onToast} />}
    </div>;
}

// --- Brodeuses ---

function Artists({ agent, onOpen, onToast }: { agent: boolean, onOpen: (id: string) => void, onToast: (s: string) => void }) {
    const rows = useQuery(anyApi.veille.artists) as ArtistRow[] | undefined;
    const research = useMutation(anyApi.veille.research);
    const [name, setName] = useState(''), [hint, setHint] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [search, setSearch] = useState(''), [zone, setZone] = useState<Zone | ''>(''), [technique, setTechnique] = useState(''), [adding, setAdding] = useState(false);
    if (!rows) return <p className="muted">Chargement des portraits…</p>;
    const launch = async (e: FormEvent) => {
        e.preventDefault(); if (!name.trim()) return;
        setBusy(true); setError('');
        try { await research({ name: name.trim(), hint: hint.trim() }); onToast(`Recherche lancée sur ${name.trim()}`); setName(''); setHint(''); }
        catch (err) { setError(errorText(err, 'La recherche n’a pas pu démarrer.')); }
        setBusy(false);
    };
    const techniques = [...new Set(rows.flatMap(r => r.techniques))].sort((a, b) => a.localeCompare(b, 'fr'));
    const q = search.trim().toLowerCase();
    const shown = rows.filter(r => (!zone || r.zone === zone) && (!technique || r.techniques.includes(technique)) && (!q || `${r.name} ${r.city} ${r.country} ${r.summary} ${r.techniques.join(' ')}`.toLowerCase().includes(q)));
    // France d'abord, puis l'Europe, puis le reste du monde.
    const groups = zones.map(z => ({ zone: z, items: shown.filter(r => r.zone === z) })).filter(g => g.items.length);
    return <>
        <section className="panel veille-research">
            <div><h2><Sparkles size={18} />Rechercher une artiste</h2><p className="muted">L’agent la retrouve sur Internet, puis creuse chaque piste : créations, parcours, expositions, voyages, dates. Le portrait se remplit tout seul en quelques minutes.</p></div>
            <form onSubmit={launch}>
                <Input aria-label="Nom de l’artiste" placeholder="Ex. Aurélie Lanoiselée" maxLength={120} value={name} disabled={!agent || busy} onChange={e => setName(e.target.value)} />
                <Input aria-label="Indice pour l’agent" placeholder="Indice facultatif : ville, technique, une œuvre…" maxLength={500} value={hint} disabled={!agent || busy} onChange={e => setHint(e.target.value)} />
                <Button disabled={!agent || busy || !name.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}Lancer la recherche</Button>
            </form>
            {error && <p role="alert" className="error-inline">{error}</p>}
        </section>

        <div className="veille-toolbar">
            <label className="search"><Search size={16} /><input aria-label="Rechercher une artiste" placeholder="Nom, ville, technique…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="filter-field">Zone<select value={zone} onChange={e => setZone(e.target.value as Zone | '')}><option value="">Toutes</option>{zones.map(z => <option key={z} value={z}>{zoneLabels[z]}</option>)}</select></label>
            {techniques.length > 0 && <label className="filter-field">Technique<select value={technique} onChange={e => setTechnique(e.target.value)}><option value="">Toutes</option>{techniques.map(t => <option key={t}>{t}</option>)}</select></label>}
            <span className="spacer" />
            <Button type="button" variant="outline" onClick={() => setAdding(true)}><Plus size={16} />Ajouter à la main</Button>
        </div>

        {!rows.length ? <section className="panel client-empty"><UserRound size={28} /><p>Aucun portrait pour l’instant. Lance une première recherche ci-dessus.</p></section>
            : !shown.length ? <p className="muted">Aucune artiste ne correspond.</p>
            : groups.map(g => <section key={g.zone} className="veille-group">
                <h2>{zoneLabels[g.zone]} <span>{g.items.length}</span></h2>
                <ul className="veille-list">{g.items.map(r => <li key={r._id}>
                    <button type="button" className="veille-card person" onClick={() => onOpen(r._id)}>
                        <span className="veille-card-head">
                            <Avatar name={r.name} photo={r.photoUrl} />
                            <span><strong>{r.name}</strong><small>{[place(r), lifeDates(r)].filter(Boolean).join(' · ') || (r.research === 'running' ? 'Recherche en cours…' : 'À compléter')}</small></span>
                        </span>
                        <span className="veille-card-body">
                            {r.summary && <span className="veille-card-summary">{r.summary}</span>}
                            {r.techniques.length > 0 && <span className="veille-tags compact">{cardTags([], r.techniques).map(t => <span key={t} title={t}>{t}</span>)}</span>}
                        </span>
                        <span className="veille-card-foot">
                            {r.research === 'running' ? <span className="veille-status running"><LoaderCircle size={13} className="spin" />Recherche en cours</span>
                                : r.research === 'error' ? <span className="veille-status error">Recherche à relancer</span>
                                : <><span>{r.works} œuvre{r.works > 1 ? 's' : ''}</span><span>{r.dates} date{r.dates > 1 ? 's' : ''}</span></>}
                        </span>
                    </button>
                </li>)}</ul>
            </section>)}
        {adding && <PortraitDialog artist={null} onClose={() => setAdding(false)} onSaved={id => { setAdding(false); onOpen(id); }} onToast={onToast} />}
    </>;
}

export function Avatar({ name, photo, large }: { name: string, photo: string, large?: boolean }) {
    const [broken, setBroken] = useState(false);
    return <span className={cn('veille-avatar', large && 'large')} aria-hidden>
        {photo && !broken ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : initials(name)}
    </span>;
}

// --- Portrait ---

function Portrait({ id, agent, onBack, onToast }: { id: string, agent: boolean, onBack: () => void, onToast: (s: string) => void }) {
    const a = useQuery(anyApi.veille.artist, { id }) as Artist | null | undefined;
    const research = useMutation(anyApi.veille.research), remove = useMutation(anyApi.veille.removeArtist);
    const [editing, setEditing] = useState(false), [error, setError] = useState('');
    if (a === undefined) return <p className="muted">Chargement du portrait…</p>;
    if (a === null) return <><Button type="button" variant="ghost" onClick={onBack}><ArrowLeft size={16} />Toutes les artistes</Button><p className="muted">Ce portrait a été supprimé.</p></>;
    const relaunch = async () => {
        setError('');
        try { await research({ id: a._id }); onToast('Recherche relancée'); } catch (err) { setError(errorText(err, 'La recherche n’a pas pu démarrer.')); }
    };
    const erase = async () => {
        if (!await ask({ title: `Supprimer le portrait de ${a.name} ?`, description: 'Ses œuvres, sa frise et ses sources disparaîtront de la veille. Les nouvelles restent.', confirmLabel: 'Supprimer', destructive: true })) return;
        await remove({ id: a._id }); onToast('Portrait supprimé'); onBack();
    };
    const timeline = sortTimeline(a.timeline);
    const empty = !a.biography && !a.works.length && !timeline.length;
    return <article className="veille-portrait">
        <div className="veille-portrait-bar">
            <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft size={16} />Toutes les artistes</Button>
            <span className="spacer" />
            {agent && <Button type="button" variant="outline" disabled={a.research === 'running'} onClick={() => void relaunch()}><RefreshCw size={15} />{a.researchedAt ? 'Relancer la recherche' : 'Lancer la recherche'}</Button>}
            <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil size={15} />Modifier</Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Supprimer le portrait" onClick={() => void erase()}><Trash2 size={16} /></Button>
        </div>
        {error && <div role="alert" className="error">{error}</div>}
        {a.research === 'running' && <div className="review-note veille-running"><LoaderCircle size={20} className="spin" /><p><strong>L’agent fait ses recherches.</strong> Il retrouve {a.name}, puis creuse chaque piste. Le portrait se remplira ici tout seul, en quelques minutes : tu peux quitter la page.</p></div>}
        {a.research === 'error' && <div role="alert" className="error">{a.researchError || 'La recherche n’a pas abouti.'}</div>}

        <header className="veille-portrait-head">
            <Avatar name={a.name} photo={a.photoUrl} large />
            <div>
                <div className="eyebrow">PORTRAIT · {zoneLabels[a.zone].toUpperCase()}</div>
                <h2>{a.name}</h2>
                <p className="veille-portrait-facts">
                    {lifeDates(a) && <span><CalendarDays size={15} />{lifeDates(a)}</span>}
                    {place(a) && <span><MapPin size={15} />{place(a)}</span>}
                    {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer"><Globe size={15} />Site<ArrowUpRight size={13} /></a>}
                    {a.instagram && <a href={a.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={15} />Instagram<ArrowUpRight size={13} /></a>}
                </p>
                {a.techniques.length > 0 && <p className="veille-tags">{a.techniques.map(t => <span key={t}>{t}</span>)}</p>}
                {a.summary && <p className="veille-summary">{a.summary}</p>}
            </div>
        </header>

        {empty && a.research !== 'running' && <section className="panel client-empty"><Sparkles size={28} /><p>Ce portrait est encore vide. {agent ? 'Lance la recherche, ou complète-le à la main.' : 'Complète-le avec « Modifier ».'}</p></section>}

        <div className="veille-portrait-grid">
            <div>
                {a.biography && <section className="panel veille-bio"><h3>Parcours</h3>{a.biography.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</section>}
                {a.works.length > 0 && <section className="panel"><h3>Créations <span className="muted">{a.works.length}</span></h3>
                    <ul className="veille-works">{a.works.map(w => <li key={w.id}>
                        {w.imageUrl && <WorkImage src={w.imageUrl} />}
                        <div>
                            <strong>{w.url ? <a href={w.url} target="_blank" rel="noopener noreferrer">{w.title}<ArrowUpRight size={13} /></a> : w.title}</strong>
                            <small>{[w.year, w.technique].filter(Boolean).join(' · ')}</small>
                            {w.description && <p>{w.description}</p>}
                        </div>
                    </li>)}</ul>
                </section>}
                {a.news.length > 0 && <section className="panel"><h3>Dans l’actualité</h3>
                    <ul className="veille-mini-news">{a.news.map(n => <li key={n._id}><span className="veille-kind">{newsLabels[n.kind]}</span><div><strong>{n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> : n.title}</strong><small>{[span(n), n.place, place(n)].filter(Boolean).join(' · ')}</small></div></li>)}</ul>
                </section>}
            </div>
            <aside>
                {timeline.length > 0 && <section className="panel"><h3>Frise chronologique</h3>
                    <ol className="veille-timeline">{timeline.map(t => <li key={t.id} className={'kind-' + t.kind}><time>{dateFr(t.date)}</time><span className="veille-kind">{timelineLabels[t.kind]}</span><p>{t.label}</p></li>)}</ol>
                </section>}
                {a.sources.length > 0 && <section className="panel"><h3>Sources</h3>
                    <ul className="veille-sources">{a.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label || new URL(s.url).hostname}<ArrowUpRight size={12} /></a></li>)}</ul>
                </section>}
                {a.researchNotes && <section className="panel veille-notes"><h3>À vérifier</h3>{a.researchNotes.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</section>}
                <p className="muted veille-credit">Ajouté par {a.authorName}{a.researchedAt ? ` · recherche du ${ago(a.researchedAt)}` : ''}{a.lastRun && a.lastRun.status !== 'running' ? ` · dernière recherche : ${dollars(a.lastRun.cost)} (${a.lastRun.model.replace(/^.*\//, '')})` : ''}</p>
            </aside>
        </div>
        {editing && <PortraitDialog artist={a} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} onToast={onToast} />}
    </article>;
}

function WorkImage({ src }: { src: string }) {
    const [broken, setBroken] = useState(false);
    return broken ? null : <a className="veille-work-image" href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /></a>;
}

function PortraitDialog({ artist, onClose, onSaved, onToast }: { artist: Artist | null, onClose: () => void, onSaved: (id: string) => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.veille.saveArtist);
    const [data, setData] = useState<PortraitInput>(() => {
        if (!artist) return emptyPortrait();
        const { name, country, city, zone, birthDate, deathDate, techniques, summary, biography, website, instagram, photoUrl, works, timeline, sources, researchNotes } = artist;
        return { name, country, city, zone, birthDate, deathDate, techniques, summary, biography, website, instagram, photoUrl, works, timeline: sortTimeline(timeline), sources, researchNotes };
    });
    const [techniques, setTechniques] = useState(data.techniques.join(', '));
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<PortraitInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const close = async () => { if (!busy && (!dirty || await ask('Fermer sans enregistrer ce portrait ?'))) onClose(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const input = { ...data, techniques: techniques.split(',').map(t => t.trim()).filter(Boolean), works: data.works.filter(w => w.title.trim()), timeline: data.timeline.filter(t => t.label.trim() || t.date), sources: data.sources.filter(s => s.url.trim()) };
        const problem = portraitError(input); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { const id = await save({ data: input, ...(artist ? { id: artist._id } : {}) }) as string; onToast(artist ? 'Portrait mis à jour' : 'Portrait ajouté'); onSaved(id); }
        catch (err) { setError(errorText(err, 'Le portrait n’a pas été enregistré.')); setBusy(false); }
    };
    const editList = <K extends 'works' | 'timeline' | 'sources'>(key: K) => ({
        update: (i: number, patch: Partial<PortraitInput[K][number]>) => set({ [key]: data[key].map((x, j) => j === i ? { ...x, ...patch } : x) } as Partial<PortraitInput>),
        remove: (i: number) => set({ [key]: data[key].filter((_, j) => j !== i) } as Partial<PortraitInput>),
    });
    const works = editList('works'), timeline = editList('timeline'), sources = editList('sources');
    return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
        <DialogContent className="expense-dialog veille-dialog" onInteractOutside={e => e.preventDefault()}>
            <form onSubmit={submit}>
                <header><span className="eyebrow">PORTRAIT</span><DialogTitle>{artist ? `Modifier ${artist.name}` : 'Nouvelle artiste'}</DialogTitle><DialogDescription className="muted">Dates au format AAAA, AAAA-MM ou AAAA-MM-JJ. Laisse vide ce qu’on ne sait pas.</DialogDescription></header>
                {error && <div role="alert" className="error">{error}</div>}
                <div className="expense-grid">
                    <div><Label htmlFor="v-name">Nom</Label><Input id="v-name" required maxLength={120} value={data.name} onChange={e => set({ name: e.target.value })} /></div>
                    <div><Label htmlFor="v-zone">Zone</Label><select id="v-zone" className="expense-select" value={data.zone} onChange={e => set({ zone: e.target.value as Zone })}>{zones.map(z => <option key={z} value={z}>{zoneLabels[z]}</option>)}</select></div>
                    <div><Label htmlFor="v-city">Ville ou région</Label><Input id="v-city" maxLength={80} value={data.city} onChange={e => set({ city: e.target.value })} /></div>
                    <div><Label htmlFor="v-country">Pays</Label><Input id="v-country" maxLength={80} value={data.country} onChange={e => set({ country: e.target.value })} /></div>
                    <div><Label htmlFor="v-birth">Naissance</Label><Input id="v-birth" placeholder="AAAA" maxLength={10} value={data.birthDate} onChange={e => set({ birthDate: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="v-death">Décès</Label><Input id="v-death" placeholder="Vide si vivante" maxLength={10} value={data.deathDate} onChange={e => set({ deathDate: e.target.value.trim() })} /></div>
                    <div className="full"><Label htmlFor="v-tech">Techniques (séparées par des virgules)</Label><Input id="v-tech" placeholder="Broderie d’or, Lunéville, perlage…" value={techniques} onChange={e => { setTechniques(e.target.value); setDirty(true); }} /></div>
                    <div className="full"><Label htmlFor="v-summary">En une phrase</Label><Textarea id="v-summary" rows={2} maxLength={600} value={data.summary} onChange={e => set({ summary: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="v-bio">Parcours</Label><Textarea id="v-bio" rows={8} maxLength={20000} value={data.biography} onChange={e => set({ biography: e.target.value })} /></div>
                    <div><Label htmlFor="v-site">Site</Label><Input id="v-site" type="url" placeholder="https://…" value={data.website} onChange={e => set({ website: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="v-insta">Instagram</Label><Input id="v-insta" type="url" placeholder="https://instagram.com/…" value={data.instagram} onChange={e => set({ instagram: e.target.value.trim() })} /></div>
                    <div className="full"><Label htmlFor="v-photo">Photo (lien vers l’image)</Label><Input id="v-photo" type="url" placeholder="https://…" value={data.photoUrl} onChange={e => set({ photoUrl: e.target.value.trim() })} /></div>
                </div>

                <fieldset className="veille-rows"><legend>Créations</legend>
                    {data.works.map((w, i) => <div key={w.id} className="veille-row works">
                        <Input aria-label="Titre de l’œuvre" placeholder="Titre" value={w.title} onChange={e => works.update(i, { title: e.target.value })} />
                        <Input aria-label="Année" placeholder="Année" value={w.year} onChange={e => works.update(i, { year: e.target.value })} />
                        <Input aria-label="Technique" placeholder="Technique" value={w.technique} onChange={e => works.update(i, { technique: e.target.value })} />
                        <Input aria-label="Lien" type="url" placeholder="https://…" value={w.url} onChange={e => works.update(i, { url: e.target.value.trim() })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer l’œuvre" onClick={() => works.remove(i)}><X size={15} /></Button>
                        <Textarea aria-label="Description" rows={1} placeholder="Description" value={w.description} onChange={e => works.update(i, { description: e.target.value })} />
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ works: [...data.works, { id: newId(), title: '', year: '', technique: '', description: '', url: '', imageUrl: '' } satisfies Work] })}><Plus size={14} />Ajouter une création</Button>
                </fieldset>

                <fieldset className="veille-rows"><legend>Frise chronologique</legend>
                    {data.timeline.map((t, i) => <div key={t.id} className="veille-row timeline">
                        <Input aria-label="Date" placeholder="AAAA" value={t.date} onChange={e => timeline.update(i, { date: e.target.value.trim() })} />
                        <select aria-label="Type" className="expense-select" value={t.kind} onChange={e => timeline.update(i, { kind: e.target.value as TimelineItem['kind'] })}>{timelineKinds.map(k => <option key={k} value={k}>{timelineLabels[k]}</option>)}</select>
                        <Input aria-label="Ce qui s’est passé" placeholder="Ce qui s’est passé" value={t.label} onChange={e => timeline.update(i, { label: e.target.value })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la date" onClick={() => timeline.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ timeline: [...data.timeline, { id: newId(), date: '', kind: 'oeuvre', label: '' }] })}><Plus size={14} />Ajouter une date</Button>
                </fieldset>

                <fieldset className="veille-rows"><legend>Sources</legend>
                    {data.sources.map((s, i) => <div key={i} className="veille-row sources">
                        <Input aria-label="Nom de la source" placeholder="Nom" value={s.label} onChange={e => sources.update(i, { label: e.target.value })} />
                        <Input aria-label="Lien de la source" type="url" placeholder="https://…" value={s.url} onChange={e => sources.update(i, { url: e.target.value.trim() })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la source" onClick={() => sources.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ sources: [...data.sources, { label: '', url: '' } satisfies Link] })}><Plus size={14} />Ajouter une source</Button>
                </fieldset>

                <div className="expense-grid"><div className="full"><Label htmlFor="v-notes">À vérifier</Label><Textarea id="v-notes" rows={3} maxLength={4000} value={data.researchNotes} onChange={e => set({ researchNotes: e.target.value })} /></div></div>
                <footer>
                    <span className="spacer" />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Annuler</Button>
                    <Button disabled={busy}>{busy ? 'Enregistrement…' : artist ? 'Enregistrer' : 'Ajouter le portrait'}</Button>
                </footer>
            </form>
        </DialogContent>
    </Dialog>;
}

// --- Nouvelles ---

function News({ status, onOpen, onToast }: { status: AgentStatus | undefined, onOpen: (id: string) => void, onToast: (s: string) => void }) {
    const rows = useQuery(anyApi.veille.news) as NewsRow[] | undefined;
    const scan = useMutation(anyApi.veille.scanNews), remove = useMutation(anyApi.veille.removeNews);
    const [zone, setZone] = useState<Zone | ''>(''), [kind, setKind] = useState(''), [search, setSearch] = useState(''), [past, setPast] = useState(false);
    const [editing, setEditing] = useState<NewsRow | 'new' | null>(null), [error, setError] = useState('');
    if (!rows) return <p className="muted">Chargement des nouvelles…</p>;
    const today = isoToday(), scanning = status?.scan?.status === 'running';
    const launch = async () => { setError(''); try { await scan({}); onToast('L’agent cherche les nouvelles'); } catch (err) { setError(errorText(err, 'La recherche n’a pas pu démarrer.')); } };
    const erase = async (n: NewsRow) => { if (await ask({ title: `Retirer « ${n.title} » ?`, description: 'Elle disparaîtra de la veille pour tout le monde.', confirmLabel: 'Retirer', destructive: true })) { await remove({ id: n._id }); onToast('Nouvelle retirée'); } };
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(n => (!zone || n.zone === zone) && (!kind || n.kind === kind) && (!q || `${n.title} ${n.summary} ${n.place} ${n.city} ${n.artists.map(a => a.name).join(' ')}`.toLowerCase().includes(q)));
    const when = (n: NewsRow) => newsWhen(n, today);
    // Les événements datés à venir d'abord, par date ; puis les nouvelles sans date, les plus récentes d'abord.
    const live = filtered.filter(n => when(n) !== 'past').sort((a, b) => (a.startDate ? 0 : 1) - (b.startDate ? 0 : 1) || a.startDate.localeCompare(b.startDate) || b.createdAt - a.createdAt);
    const gone = filtered.filter(n => when(n) === 'past').sort((a, b) => (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));
    const card = (n: NewsRow) => <li key={n._id} className={cn('veille-news-card', when(n))}>
        <div className="veille-news-head">
            <span className="veille-kind">{newsLabels[n.kind]}</span>
            {when(n) === 'current' && <span className="veille-status running">En ce moment</span>}
            {n.zone !== 'france' && <span className="veille-zone">{zoneLabels[n.zone]}</span>}
            <span className="spacer" />
            <Button type="button" variant="ghost" size="icon" aria-label={'Modifier ' + n.title} onClick={() => setEditing(n)}><Pencil size={14} /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + n.title} onClick={() => void erase(n)}><Trash2 size={14} /></Button>
        </div>
        <h3>{n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}<ArrowUpRight size={14} /></a> : n.title}</h3>
        <p className="veille-news-where">{[span(n), n.place, place(n)].filter(Boolean).join(' · ')}</p>
        {n.summary && <p>{n.summary}</p>}
        {n.artists.length > 0 && <p className="veille-tags">{n.artists.map(a => <button key={a._id} type="button" onClick={() => onOpen(a._id)}><UserRound size={12} />{a.name}</button>)}</p>}
    </li>;
    return <>
        <section className="panel veille-research">
            <div><h2><Sparkles size={18} />Actualités du monde textile</h2><p className="muted">Expositions, salons, techniques, actualités des brodeuses : l’agent fait le tour, la France et l’Europe d’abord, et n’ajoute que ce qui manque.</p>
                {status?.scan && <p className="muted veille-scan">{scanning ? <><LoaderCircle size={14} className="spin" />Recherche en cours…</> : status.scan.status === 'error' ? `Dernière recherche interrompue : ${status.scan.error ?? 'à relancer'}` : `Dernière recherche le ${ago(status.scan.finishedAt ?? status.scan.startedAt)}, pour ${dollars(status.scan.cost)}.`}</p>}
            </div>
            <div className="veille-research-actions">
                <Button type="button" disabled={!status?.available || scanning} onClick={() => void launch()}>{scanning ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}Chercher des nouvelles</Button>
                <Button type="button" variant="outline" onClick={() => setEditing('new')}><Plus size={16} />Ajouter à la main</Button>
            </div>
            {error && <p role="alert" className="error-inline">{error}</p>}
        </section>
        <div className="veille-toolbar">
            <label className="search"><Search size={16} /><input aria-label="Rechercher une nouvelle" placeholder="Exposition, lieu, artiste…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="filter-field">Zone<select value={zone} onChange={e => setZone(e.target.value as Zone | '')}><option value="">Toutes</option>{zones.map(z => <option key={z} value={z}>{zoneLabels[z]}</option>)}</select></label>
            <label className="filter-field">Type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Tous</option>{newsKinds.map(k => <option key={k} value={k}>{newsLabels[k]}</option>)}</select></label>
        </div>
        {!rows.length ? <section className="panel client-empty"><Newspaper size={28} /><p>Aucune nouvelle pour l’instant.</p></section>
            : <>
                <section className="veille-group"><h2>En cours et à venir <span>{live.length}</span></h2>
                    {live.length ? <ul className="veille-news">{live.map(card)}</ul> : <p className="muted">Rien à venir pour ces filtres.</p>}
                </section>
                {gone.length > 0 && <section className="veille-group">
                    <h2><button type="button" className="veille-toggle" aria-expanded={past} onClick={() => setPast(!past)}>Passées <span>{gone.length}</span></button></h2>
                    {past && <ul className="veille-news">{gone.map(card)}</ul>}
                </section>}
            </>}
        {editing && <NewsDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onToast={onToast} />}
    </>;
}

function NewsDialog({ item, onClose, onToast }: { item: NewsRow | null, onClose: () => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.veille.saveNews);
    const people = useQuery(anyApi.veille.artists) as ArtistRow[] | undefined;
    const [data, setData] = useState<NewsInput>(() => {
        if (!item) return emptyNews();
        const { kind, title, summary, place, city, country, zone, startDate, endDate, url } = item;
        return { kind, title, summary, place, city, country, zone, startDate, endDate, url };
    });
    const [artistIds, setArtistIds] = useState<string[]>(item?.artistIds ?? []);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<NewsInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const close = async () => { if (!busy && (!dirty || await ask('Fermer sans enregistrer ?'))) onClose(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const problem = newsError(data); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { await save({ data, artistIds, ...(item ? { id: item._id } : {}) }); onToast(item ? 'Nouvelle mise à jour' : 'Nouvelle ajoutée'); onClose(); }
        catch (err) { setError(errorText(err, 'La nouvelle n’a pas été enregistrée.')); setBusy(false); }
    };
    return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
        <DialogContent className="expense-dialog" onInteractOutside={e => e.preventDefault()}>
            <form onSubmit={submit}>
                <header><span className="eyebrow">NOUVELLE</span><DialogTitle>{item ? 'Modifier la nouvelle' : 'Nouvelle du monde textile'}</DialogTitle><DialogDescription className="muted">Une exposition, un salon, une technique, une actualité.</DialogDescription></header>
                {error && <div role="alert" className="error">{error}</div>}
                <div className="expense-grid">
                    <div className="full"><Label htmlFor="n-title">Titre</Label><Input id="n-title" required maxLength={200} value={data.title} onChange={e => set({ title: e.target.value })} /></div>
                    <div><Label htmlFor="n-kind">Type</Label><select id="n-kind" className="expense-select" value={data.kind} onChange={e => set({ kind: e.target.value as NewsInput['kind'] })}>{newsKinds.map(k => <option key={k} value={k}>{newsLabels[k]}</option>)}</select></div>
                    <div><Label htmlFor="n-zone">Zone</Label><select id="n-zone" className="expense-select" value={data.zone} onChange={e => set({ zone: e.target.value as Zone })}>{zones.map(z => <option key={z} value={z}>{zoneLabels[z]}</option>)}</select></div>
                    <div><Label htmlFor="n-start">Début</Label><Input id="n-start" type="date" value={data.startDate.length === 10 ? data.startDate : ''} onChange={e => set({ startDate: e.target.value })} /></div>
                    <div><Label htmlFor="n-end">Fin</Label><Input id="n-end" type="date" value={data.endDate.length === 10 ? data.endDate : ''} onChange={e => set({ endDate: e.target.value })} /></div>
                    <div><Label htmlFor="n-place">Lieu</Label><Input id="n-place" maxLength={200} placeholder="Musée, galerie…" value={data.place} onChange={e => set({ place: e.target.value })} /></div>
                    <div><Label htmlFor="n-city">Ville</Label><Input id="n-city" maxLength={80} value={data.city} onChange={e => set({ city: e.target.value })} /></div>
                    <div><Label htmlFor="n-country">Pays</Label><Input id="n-country" maxLength={80} value={data.country} onChange={e => set({ country: e.target.value })} /></div>
                    <div><Label htmlFor="n-url">Lien</Label><Input id="n-url" type="url" placeholder="https://…" value={data.url} onChange={e => set({ url: e.target.value.trim() })} /></div>
                    <div className="full"><Label htmlFor="n-summary">Ce qu’on y voit</Label><Textarea id="n-summary" rows={4} maxLength={4000} value={data.summary} onChange={e => set({ summary: e.target.value })} /></div>
                    {people && people.length > 0 && <div className="full"><Label>Artistes concernées</Label>
                        <div className="library-chips" role="group" aria-label="Artistes concernées">{people.map(p => <button key={p._id} type="button" aria-pressed={artistIds.includes(p._id)} onClick={() => { setArtistIds(ids => ids.includes(p._id) ? ids.filter(x => x !== p._id) : [...ids, p._id]); setDirty(true); }}>{p.name}</button>)}</div>
                    </div>}
                </div>
                <footer>
                    <span className="spacer" />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Annuler</Button>
                    <Button disabled={busy}>{busy ? 'Enregistrement…' : item ? 'Enregistrer' : 'Ajouter'}</Button>
                </footer>
            </form>
        </DialogContent>
    </Dialog>;
}
