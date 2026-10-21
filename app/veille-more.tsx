'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowLeft, ArrowUpRight, Award, CalendarDays, Clapperboard, Globe, GraduationCap, Instagram, MapPin, Pencil, Play, Plus, Search, Store, Trash2, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ask } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { cardTags, dateFr, emptyVideo, emptyWorkshop, platformLabels, platformOf, platforms, sortTimeline, timelineKinds, videoError, videoKindLabels, videoKinds, workshopError, youtubeId, type Link, type Person, type Platform, type TimelineItem, type VideoInput, type VideoKind, type WorkshopInput } from '../lib/veille';
import { isoToday } from '../lib/model';
import { errorText } from './client';
import { Avatar } from './veille';

// Ateliers de broderie d'art et vidéothèque de la Veille textile.

type WorkshopRow = { _id: string; name: string; city: string; region: string; foundedDate: string; closedDate: string; founders: string[]; techniques: string[]; labels: string[]; summary: string; photoUrl: string; website: string; people: number; works: number; cover: string };
type Workshop = WorkshopInput & { _id: string; authorName: string; founderLinks: { name: string; artistId: string | null }[]; peopleLinks: (Person & { artistId: string | null })[] };
type Video = VideoInput & { _id: string; authorName: string; createdAt: number };

const newId = () => crypto.randomUUID();
const csv = (list: string[]) => list.join(', ');
const fromCsv = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean);
/** Pour un atelier, la « vie » de la frise, c'est son histoire : création, reprise, déménagement. */
const workshopKinds: Record<TimelineItem['kind'], string> = { vie: 'Histoire', formation: 'Formation', oeuvre: 'Réalisation', exposition: 'Exposition', residence: 'Collaboration', prix: 'Distinction', autre: 'Autre' };
const years = (w: { foundedDate: string; closedDate: string }) => w.foundedDate && w.closedDate ? `${w.foundedDate.slice(0, 4)} – ${w.closedDate.slice(0, 4)}` : w.foundedDate ? `depuis ${w.foundedDate.slice(0, 4)}` : w.closedDate ? `fermé en ${w.closedDate.slice(0, 4)}` : '';

// --- Ateliers ---

export function Workshops({ onOpen, onToast }: { onOpen: (id: string) => void, onToast: (s: string) => void }) {
    const rows = useQuery(anyApi.veilleAteliers.list) as WorkshopRow[] | undefined;
    const [search, setSearch] = useState(''), [region, setRegion] = useState(''), [adding, setAdding] = useState(false);
    if (!rows) return <p className="muted">Chargement des ateliers…</p>;
    const regions = [...new Set(rows.map(r => r.region || 'Région inconnue'))].sort((a, b) => a.localeCompare(b, 'fr'));
    const q = search.trim().toLowerCase();
    const shown = rows.filter(r => (!region || (r.region || 'Région inconnue') === region) && (!q || `${r.name} ${r.city} ${r.region} ${r.summary} ${r.founders.join(' ')} ${r.techniques.join(' ')}`.toLowerCase().includes(q)));
    // Fermé : une date de fermeture, ou le label « Maison disparue » quand on ne connaît pas la date.
    const isClosed = (r: WorkshopRow) => !!r.closedDate || r.labels.some(l => /disparue|fermée/i.test(l));
    const open = shown.filter(r => !isClosed(r)), closed = shown.filter(isClosed);
    const card = (r: WorkshopRow) => {
        const tags = cardTags(r.labels, r.techniques);
        const foot = [r.founders.length ? 'Fondé par ' + r.founders.slice(0, 2).join(', ') : '', r.works ? `${r.works} réalisation${r.works > 1 ? 's' : ''}` : ''].filter(Boolean);
        return <li key={r._id}>
            <button type="button" className="veille-card" onClick={() => onOpen(r._id)}>
                <CardCover src={r.cover || r.photoUrl} name={r.name} />
                <span className="veille-card-body">
                    <strong>{r.name}</strong>
                    <small>{[r.city || r.region, years(r)].filter(Boolean).join(' · ')}</small>
                    {r.summary && <span className="veille-card-summary">{r.summary}</span>}
                    {tags.length > 0 && <span className="veille-tags compact">{tags.map(t => <span key={t} title={t}>{t}</span>)}</span>}
                </span>
                {foot.length > 0 && <span className="veille-card-foot">{foot.map(f => <span key={f}>{f}</span>)}</span>}
            </button>
        </li>;
    };
    return <>
        <div className="veille-toolbar">
            <label className="search"><Search size={16} /><input aria-label="Rechercher un atelier" placeholder="Atelier, ville, fondateur, technique…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            {regions.length > 1 && <label className="filter-field">Région<select value={region} onChange={e => setRegion(e.target.value)}><option value="">Toutes</option>{regions.map(r => <option key={r}>{r}</option>)}</select></label>}
            <span className="spacer" />
            <Button type="button" variant="outline" onClick={() => setAdding(true)}><Plus size={16} />Ajouter un atelier</Button>
        </div>
        {!rows.length ? <section className="panel client-empty"><Store size={28} /><p>Aucun atelier pour l’instant.</p></section>
            : !shown.length ? <p className="muted">Aucun atelier ne correspond.</p>
            : <>
                {open.length > 0 && <section className="veille-group"><h2>En activité <span>{open.length}</span></h2><ul className="veille-list">{open.map(card)}</ul></section>}
                {closed.length > 0 && <section className="veille-group"><h2>Maisons historiques <span>{closed.length}</span></h2><ul className="veille-list">{closed.map(card)}</ul></section>}
            </>}
        {adding && <WorkshopDialog workshop={null} onClose={() => setAdding(false)} onSaved={id => { setAdding(false); onOpen(id); }} onToast={onToast} />}
    </>;
}

export function WorkshopPage({ id, onBack, onOpenArtist, onToast }: { id: string, onBack: () => void, onOpenArtist: (id: string) => void, onToast: (s: string) => void }) {
    const w = useQuery(anyApi.veilleAteliers.get, { id }) as Workshop | null | undefined;
    const remove = useMutation(anyApi.veilleAteliers.remove);
    const [editing, setEditing] = useState(false);
    if (w === undefined) return <p className="muted">Chargement de l’atelier…</p>;
    if (w === null) return <><Button type="button" variant="ghost" onClick={onBack}><ArrowLeft size={16} />Tous les ateliers</Button><p className="muted">Cette fiche a été supprimée.</p></>;
    const erase = async () => {
        if (!await ask({ title: `Supprimer la fiche de ${w.name} ?`, description: 'Elle disparaîtra de la veille pour tout le monde.', confirmLabel: 'Supprimer', destructive: true })) return;
        await remove({ id: w._id }); onToast('Fiche supprimée'); onBack();
    };
    const person = (name: string, artistId: string | null) => artistId ? <button type="button" className="veille-inline-link" onClick={() => onOpenArtist(artistId)}>{name}<UserRound size={12} /></button> : <span>{name}</span>;
    const timeline = sortTimeline(w.timeline);
    return <article className="veille-portrait">
        <div className="veille-portrait-bar">
            <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft size={16} />Tous les ateliers</Button>
            <span className="spacer" />
            <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil size={15} />Modifier</Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Supprimer la fiche" onClick={() => void erase()}><Trash2 size={16} /></Button>
        </div>
        <header className="veille-portrait-head">
            <Avatar name={w.name} photo={w.photoUrl} large />
            <div>
                <div className="eyebrow">ATELIER{w.closedDate ? ' · MAISON HISTORIQUE' : ''}</div>
                <h2>{w.name}</h2>
                <p className="veille-portrait-facts">
                    {years(w) && <span><CalendarDays size={15} />{years(w)}</span>}
                    {(w.city || w.region) && <span><MapPin size={15} />{[w.city, w.region].filter(Boolean).join(', ')}</span>}
                    {w.website && <a href={w.website} target="_blank" rel="noopener noreferrer"><Globe size={15} />Site<ArrowUpRight size={13} /></a>}
                    {w.instagram && <a href={w.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={15} />Instagram<ArrowUpRight size={13} /></a>}
                </p>
                {w.techniques.length > 0 && <p className="veille-tags">{w.techniques.map(t => <span key={t}>{t}</span>)}</p>}
                {w.summary && <p className="veille-summary">{w.summary}</p>}
            </div>
        </header>
        <div className="veille-portrait-grid">
            <div>
                {w.works.length > 0 && <section className="panel"><h3>Réalisations <span className="muted">{w.works.length}</span></h3>
                    <ul className="veille-gallery">{[...w.works].sort((a, b) => Number(!!b.imageUrl) - Number(!!a.imageUrl)).map(x => <li key={x.id}>
                        {x.imageUrl ? <a className="veille-gallery-image" href={x.url || x.imageUrl} target="_blank" rel="noopener noreferrer"><GalleryImage src={x.imageUrl} alt={x.title} /></a> : null}
                        <div>
                            <strong>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}<ArrowUpRight size={12} /></a> : x.title}</strong>
                            <small>{[x.year, x.technique].filter(Boolean).join(' · ')}</small>
                            {x.description && <p>{x.description}</p>}
                        </div>
                    </li>)}</ul>
                </section>}
                {w.history && <section className="panel veille-bio"><h3>Histoire</h3>{w.history.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</section>}
                {(w.founderLinks.length > 0 || w.peopleLinks.length > 0) && <section className="panel"><h3>Les personnes</h3>
                    {w.founderLinks.length > 0 && <p className="veille-founders"><strong>{w.founderLinks.length > 1 ? 'Fondé par' : 'Fondé par'}</strong> {w.founderLinks.map((f, i) => <span key={f.name}>{i > 0 && ', '}{person(f.name, f.artistId)}</span>)}</p>}
                    {w.peopleLinks.length > 0 && <ul className="veille-people">{w.peopleLinks.map(p => <li key={p.name}>{person(p.name, p.artistId)}{p.role && <small>{p.role}</small>}</li>)}</ul>}
                </section>}
                {(w.clients.length > 0 || w.labels.length > 0 || w.training) && <section className="panel veille-facts">
                    {w.labels.length > 0 && <div><h3><Award size={17} />Labels et distinctions</h3><p className="veille-tags">{w.labels.map(t => <span key={t}>{t}</span>)}</p></div>}
                    {w.clients.length > 0 && <div><h3>Maisons et clients</h3><p>{w.clients.join(', ')}</p></div>}
                    {w.training && <div><h3><GraduationCap size={17} />Formations, visites</h3><p>{w.training}</p></div>}
                </section>}
            </div>
            <aside>
                {timeline.length > 0 && <section className="panel"><h3>Frise chronologique</h3>
                    <ol className="veille-timeline">{timeline.map(t => <li key={t.id} className={'kind-' + t.kind}><time>{dateFr(t.date)}</time><span className="veille-kind">{workshopKinds[t.kind]}</span><p>{t.label}</p></li>)}</ol>
                </section>}
                {w.sources.length > 0 && <section className="panel"><h3>Sources</h3>
                    <ul className="veille-sources">{w.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label || s.url.replace(/^https:\/\/(www\.)?/, '').split('/')[0]}<ArrowUpRight size={12} /></a></li>)}</ul>
                </section>}
                {w.researchNotes && <section className="panel veille-notes"><h3>À vérifier</h3>{w.researchNotes.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</section>}
                <p className="muted veille-credit">Ajouté par {w.authorName}</p>
            </aside>
        </div>
        {editing && <WorkshopDialog workshop={w} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} onToast={onToast} />}
    </article>;
}

/** Image de tête d'une carte d'atelier ; sans image, un aplat avec les initiales. */
export function CardCover({ src, name }: { src: string, name: string }) {
    const [broken, setBroken] = useState(false);
    return <span className="veille-card-cover" aria-hidden>
        {src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{name.split(/\s+/).filter(w => /^[A-ZÀ-Ý]/.test(w)).map(w => w[0]).slice(0, 2).join('')}</span>}
    </span>;
}

/** Une image qui ne se charge plus disparaît au lieu de laisser un cadre vide. */
export function GalleryImage({ src, alt }: { src: string, alt: string }) {
    const [broken, setBroken] = useState(false);
    return broken ? <span className="veille-gallery-missing">Image indisponible</span> : <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function WorkshopDialog({ workshop, onClose, onSaved, onToast }: { workshop: Workshop | null, onClose: () => void, onSaved: (id: string) => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.veilleAteliers.save);
    const [data, setData] = useState<WorkshopInput>(() => {
        if (!workshop) return emptyWorkshop();
        const { _id, authorName, founderLinks, peopleLinks, ...rest } = workshop as Workshop & { _creationTime?: number; nameKey?: string; createdAt?: number; updatedAt?: number };
        void _id; void authorName; void founderLinks; void peopleLinks;
        const base = emptyWorkshop();
        return Object.fromEntries(Object.keys(base).map(k => [k, (rest as Record<string, unknown>)[k] ?? base[k as keyof WorkshopInput]])) as unknown as WorkshopInput;
    });
    const [lists, setLists] = useState(() => ({ founders: csv(data.founders), techniques: csv(data.techniques), clients: csv(data.clients), labels: csv(data.labels) }));
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<WorkshopInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const setList = (k: keyof typeof lists, value: string) => { setLists(l => ({ ...l, [k]: value })); setDirty(true); };
    const close = async () => { if (!busy && (!dirty || await ask('Fermer sans enregistrer cette fiche ?'))) onClose(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const input: WorkshopInput = { ...data, works: data.works.filter(x => x.title.trim()), founders: fromCsv(lists.founders), techniques: fromCsv(lists.techniques), clients: fromCsv(lists.clients), labels: fromCsv(lists.labels), people: data.people.filter(p => p.name.trim()), timeline: data.timeline.filter(t => t.label.trim() || t.date), sources: data.sources.filter(s => s.url.trim()) };
        const problem = workshopError(input); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { const id = await save({ data: input, ...(workshop ? { id: workshop._id } : {}) }) as string; onToast(workshop ? 'Fiche mise à jour' : 'Atelier ajouté'); onSaved(id); }
        catch (err) { setError(errorText(err, 'La fiche n’a pas été enregistrée.')); setBusy(false); }
    };
    const row = <K extends 'people' | 'timeline' | 'sources' | 'works'>(key: K) => ({
        update: (i: number, patch: Partial<WorkshopInput[K][number]>) => set({ [key]: data[key].map((x, j) => j === i ? { ...x, ...patch } : x) } as Partial<WorkshopInput>),
        remove: (i: number) => set({ [key]: data[key].filter((_, j) => j !== i) } as Partial<WorkshopInput>),
    });
    const people = row('people'), timeline = row('timeline'), sources = row('sources'), works = row('works');
    return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
        <DialogContent className="expense-dialog veille-dialog" onInteractOutside={e => e.preventDefault()}>
            <form onSubmit={submit}>
                <header><span className="eyebrow">ATELIER</span><DialogTitle>{workshop ? `Modifier ${workshop.name}` : 'Nouvel atelier'}</DialogTitle><DialogDescription className="muted">Dates au format AAAA. Les listes se séparent par des virgules.</DialogDescription></header>
                {error && <div role="alert" className="error">{error}</div>}
                <div className="expense-grid">
                    <div className="full"><Label htmlFor="w-name">Nom</Label><Input id="w-name" required maxLength={160} value={data.name} onChange={e => set({ name: e.target.value })} /></div>
                    <div><Label htmlFor="w-city">Ville</Label><Input id="w-city" maxLength={80} value={data.city} onChange={e => set({ city: e.target.value })} /></div>
                    <div><Label htmlFor="w-region">Région</Label><Input id="w-region" maxLength={80} value={data.region} onChange={e => set({ region: e.target.value })} /></div>
                    <div><Label htmlFor="w-founded">Création</Label><Input id="w-founded" placeholder="AAAA" maxLength={10} value={data.foundedDate} onChange={e => set({ foundedDate: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="w-closed">Fermeture</Label><Input id="w-closed" placeholder="Vide si en activité" maxLength={10} value={data.closedDate} onChange={e => set({ closedDate: e.target.value.trim() })} /></div>
                    <div className="full"><Label htmlFor="w-founders">Fondé par</Label><Input id="w-founders" value={lists.founders} onChange={e => setList('founders', e.target.value)} /></div>
                    <div className="full"><Label htmlFor="w-tech">Techniques</Label><Input id="w-tech" placeholder="Lunéville, or, perlage…" value={lists.techniques} onChange={e => setList('techniques', e.target.value)} /></div>
                    <div className="full"><Label htmlFor="w-clients">Maisons et clients</Label><Input id="w-clients" value={lists.clients} onChange={e => setList('clients', e.target.value)} /></div>
                    <div className="full"><Label htmlFor="w-labels">Labels et distinctions</Label><Input id="w-labels" placeholder="Entreprise du Patrimoine Vivant, Maître d’art…" value={lists.labels} onChange={e => setList('labels', e.target.value)} /></div>
                    <div className="full"><Label htmlFor="w-summary">En une phrase</Label><Textarea id="w-summary" rows={2} maxLength={600} value={data.summary} onChange={e => set({ summary: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="w-history">Histoire</Label><Textarea id="w-history" rows={8} maxLength={20000} value={data.history} onChange={e => set({ history: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="w-training">Formations, visites, stages</Label><Textarea id="w-training" rows={2} maxLength={2000} value={data.training} onChange={e => set({ training: e.target.value })} /></div>
                    <div><Label htmlFor="w-site">Site</Label><Input id="w-site" type="url" placeholder="https://…" value={data.website} onChange={e => set({ website: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="w-insta">Instagram</Label><Input id="w-insta" type="url" placeholder="https://instagram.com/…" value={data.instagram} onChange={e => set({ instagram: e.target.value.trim() })} /></div>
                    <div className="full"><Label htmlFor="w-photo">Photo (lien vers l’image)</Label><Input id="w-photo" type="url" placeholder="https://…" value={data.photoUrl} onChange={e => set({ photoUrl: e.target.value.trim() })} /></div>
                </div>
                <fieldset className="veille-rows"><legend>Les personnes qui y travaillent</legend>
                    {data.people.map((p, i) => <div key={i} className="veille-row sources">
                        <Input aria-label="Nom" placeholder="Nom" value={p.name} onChange={e => people.update(i, { name: e.target.value })} />
                        <Input aria-label="Rôle" placeholder="Rôle : directrice artistique, brodeuse…" value={p.role} onChange={e => people.update(i, { role: e.target.value })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la personne" onClick={() => people.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ people: [...data.people, { name: '', role: '' }] })}><Plus size={14} />Ajouter une personne</Button>
                </fieldset>
                <fieldset className="veille-rows"><legend>Réalisations</legend>
                    {data.works.map((x, i) => <div key={x.id} className="veille-row works">
                        <Input aria-label="Titre de la réalisation" placeholder="Titre" value={x.title} onChange={e => works.update(i, { title: e.target.value })} />
                        <Input aria-label="Année" placeholder="Année" value={x.year} onChange={e => works.update(i, { year: e.target.value })} />
                        <Input aria-label="Client et technique" placeholder="Client · technique" value={x.technique} onChange={e => works.update(i, { technique: e.target.value })} />
                        <Input aria-label="Lien de l’image" type="url" placeholder="Image : https://…" value={x.imageUrl} onChange={e => works.update(i, { imageUrl: e.target.value.trim() })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la réalisation" onClick={() => works.remove(i)}><X size={15} /></Button>
                        <Textarea aria-label="Description" rows={1} placeholder="Description" value={x.description} onChange={e => works.update(i, { description: e.target.value })} />
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ works: [...data.works, { id: newId(), title: '', year: '', technique: '', description: '', url: '', imageUrl: '' }] })}><Plus size={14} />Ajouter une réalisation</Button>
                </fieldset>
                <fieldset className="veille-rows"><legend>Frise chronologique</legend>
                    {data.timeline.map((t, i) => <div key={t.id} className="veille-row timeline">
                        <Input aria-label="Date" placeholder="AAAA" value={t.date} onChange={e => timeline.update(i, { date: e.target.value.trim() })} />
                        <select aria-label="Type" className="expense-select" value={t.kind} onChange={e => timeline.update(i, { kind: e.target.value as TimelineItem['kind'] })}>{timelineKinds.map(k => <option key={k} value={k}>{workshopKinds[k]}</option>)}</select>
                        <Input aria-label="Ce qui s’est passé" placeholder="Ce qui s’est passé" value={t.label} onChange={e => timeline.update(i, { label: e.target.value })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la date" onClick={() => timeline.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ timeline: [...data.timeline, { id: newId(), date: '', kind: 'vie', label: '' }] })}><Plus size={14} />Ajouter une date</Button>
                </fieldset>
                <fieldset className="veille-rows"><legend>Sources</legend>
                    {data.sources.map((s, i) => <div key={i} className="veille-row sources">
                        <Input aria-label="Nom de la source" placeholder="Nom" value={s.label} onChange={e => sources.update(i, { label: e.target.value })} />
                        <Input aria-label="Lien de la source" type="url" placeholder="https://…" value={s.url} onChange={e => sources.update(i, { url: e.target.value.trim() })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la source" onClick={() => sources.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ sources: [...data.sources, { label: '', url: '' } satisfies Link] })}><Plus size={14} />Ajouter une source</Button>
                </fieldset>
                <div className="expense-grid"><div className="full"><Label htmlFor="w-notes">À vérifier</Label><Textarea id="w-notes" rows={3} maxLength={4000} value={data.researchNotes} onChange={e => set({ researchNotes: e.target.value })} /></div></div>
                <footer>
                    <span className="spacer" />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Annuler</Button>
                    <Button disabled={busy}>{busy ? 'Enregistrement…' : workshop ? 'Enregistrer' : 'Ajouter l’atelier'}</Button>
                </footer>
            </form>
        </DialogContent>
    </Dialog>;
}

// --- Documentaires et vidéos ---

export function Videos({ onToast }: { onToast: (s: string) => void }) {
    const rows = useQuery(anyApi.veilleVideos.list) as Video[] | undefined;
    const remove = useMutation(anyApi.veilleVideos.remove);
    const [search, setSearch] = useState(''), [lang, setLang] = useState<'' | 'fr' | 'en'>(''), [kind, setKind] = useState(''), [technique, setTechnique] = useState(''), [cap, setCap] = useState(false);
    const [editing, setEditing] = useState<Video | 'new' | null>(null);
    if (!rows) return <p className="muted">Chargement des vidéos…</p>;
    const today = isoToday();
    const techniques = [...new Set(rows.flatMap(r => r.techniques))].sort((a, b) => a.localeCompare(b, 'fr'));
    const q = search.trim().toLowerCase();
    const shown = rows.filter(r => (!lang || r.language === lang) && (!kind || r.kind === kind) && (!technique || r.techniques.includes(technique)) && (!cap || r.forCap)
        && (!q || `${r.title} ${r.channel} ${r.summary} ${r.people.join(' ')} ${r.techniques.join(' ')}`.toLowerCase().includes(q)));
    // Les vidéos pour le CAP d'abord, puis en français, puis les plus récentes.
    const sorted = [...shown].sort((a, b) => Number(b.forCap) - Number(a.forCap) || (a.language === b.language ? 0 : a.language === 'fr' ? -1 : 1) || (b.year || '').localeCompare(a.year || ''));
    const erase = async (v: Video) => { if (await ask({ title: `Retirer « ${v.title} » ?`, description: 'La vidéo disparaîtra de la vidéothèque pour tout le monde.', confirmLabel: 'Retirer', destructive: true })) { await remove({ id: v._id }); onToast('Vidéo retirée'); } };
    return <>
        <div className="veille-toolbar">
            <label className="search"><Search size={16} /><input aria-label="Rechercher une vidéo" placeholder="Titre, technique, atelier…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="filter-field">Langue<select value={lang} onChange={e => setLang(e.target.value as '' | 'fr' | 'en')}><option value="">Toutes</option><option value="fr">Français</option><option value="en">Anglais</option></select></label>
            <label className="filter-field">Type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Tous</option>{videoKinds.map(k => <option key={k} value={k}>{videoKindLabels[k]}</option>)}</select></label>
            {techniques.length > 0 && <label className="filter-field">Technique<select value={technique} onChange={e => setTechnique(e.target.value)}><option value="">Toutes</option>{techniques.map(t => <option key={t}>{t}</option>)}</select></label>}
            <div className="library-chips"><button type="button" aria-pressed={cap} onClick={() => setCap(!cap)}><GraduationCap size={13} /> Pour le CAP</button></div>
            <span className="spacer" />
            <Button type="button" variant="outline" onClick={() => setEditing('new')}><Plus size={16} />Ajouter une vidéo</Button>
        </div>
        {!rows.length ? <section className="panel client-empty"><Clapperboard size={28} /><p>Aucune vidéo pour l’instant.</p></section>
            : !sorted.length ? <p className="muted">Aucune vidéo ne correspond.</p>
            : <ul className="veille-videos">{sorted.map(v => {
                const yt = youtubeId(v.url), expired = !!v.availableUntil && v.availableUntil < today;
                return <li key={v._id} className={cn('veille-video', expired && 'expired')}>
                    <a className="veille-video-thumb" href={v.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden>
                        {yt ? <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" /> : <span className={'veille-platform ' + v.platform}>{platformLabels[v.platform]}</span>}
                        <span className="veille-video-play"><Play size={18} /></span>
                        {v.duration && <span className="veille-video-duration">{v.duration}</span>}
                    </a>
                    <div className="veille-video-body">
                        <div className="veille-news-head">
                            <span className="veille-kind">{videoKindLabels[v.kind]}</span>
                            <span className="veille-zone">{v.language === 'fr' ? 'FR' : 'EN'} · {platformLabels[v.platform]}</span>
                            {v.forCap && <span className="veille-status"><GraduationCap size={12} />CAP</span>}
                            <span className="spacer" />
                            <Button type="button" variant="ghost" size="icon" aria-label={'Modifier ' + v.title} onClick={() => setEditing(v)}><Pencil size={14} /></Button>
                            <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + v.title} onClick={() => void erase(v)}><Trash2 size={14} /></Button>
                        </div>
                        <h3><a href={v.url} target="_blank" rel="noopener noreferrer">{v.title}<ArrowUpRight size={14} /></a></h3>
                        <p className="veille-news-where">{[v.channel, v.year].filter(Boolean).join(' · ')}</p>
                        {v.summary && <p>{v.summary}</p>}
                        {v.availableUntil && <p className={cn('veille-until', expired && 'error-inline')}>{expired ? 'N’est plus disponible depuis le ' : 'Disponible jusqu’au '}{dateFr(v.availableUntil)}</p>}
                        {v.techniques.length > 0 && <p className="veille-tags">{v.techniques.map(t => <span key={t}>{t}</span>)}</p>}
                    </div>
                </li>;
            })}</ul>}
        {editing && <VideoDialog video={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onToast={onToast} />}
    </>;
}

function VideoDialog({ video, onClose, onToast }: { video: Video | null, onClose: () => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.veilleVideos.save);
    const [data, setData] = useState<VideoInput>(() => {
        if (!video) return emptyVideo();
        const { title, url, platform, language, kind, channel, year, duration, summary, techniques, people, forCap, availableUntil } = video;
        return { title, url, platform, language, kind, channel, year, duration, summary, techniques, people, forCap, availableUntil };
    });
    const [lists, setLists] = useState({ techniques: csv(data.techniques), people: csv(data.people) });
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<VideoInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const close = async () => { if (!busy && (!dirty || await ask('Fermer sans enregistrer ?'))) onClose(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const input = { ...data, techniques: fromCsv(lists.techniques), people: fromCsv(lists.people) };
        const problem = videoError(input); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { await save({ data: input, ...(video ? { id: video._id } : {}) }); onToast(video ? 'Vidéo mise à jour' : 'Vidéo ajoutée'); onClose(); }
        catch (err) { setError(errorText(err, 'La vidéo n’a pas été enregistrée.')); setBusy(false); }
    };
    return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
        <DialogContent className="expense-dialog" onInteractOutside={e => e.preventDefault()}>
            <form onSubmit={submit}>
                <header><span className="eyebrow">VIDÉO</span><DialogTitle>{video ? 'Modifier la vidéo' : 'Nouvelle vidéo'}</DialogTitle><DialogDescription className="muted">Un documentaire, un reportage, une démonstration de technique.</DialogDescription></header>
                {error && <div role="alert" className="error">{error}</div>}
                <div className="expense-grid">
                    <div className="full"><Label htmlFor="v-url">Lien</Label><Input id="v-url" type="url" required placeholder="https://www.youtube.com/watch?v=…" value={data.url} onChange={e => { const url = e.target.value.trim(); set({ url, platform: platformOf(url) }); }} /></div>
                    <div className="full"><Label htmlFor="v-title">Titre</Label><Input id="v-title" required maxLength={200} value={data.title} onChange={e => set({ title: e.target.value })} /></div>
                    <div><Label htmlFor="v-kind">Type</Label><select id="v-kind" className="expense-select" value={data.kind} onChange={e => set({ kind: e.target.value as VideoKind })}>{videoKinds.map(k => <option key={k} value={k}>{videoKindLabels[k]}</option>)}</select></div>
                    <div><Label htmlFor="v-lang">Langue</Label><select id="v-lang" className="expense-select" value={data.language} onChange={e => set({ language: e.target.value as 'fr' | 'en' })}><option value="fr">Français</option><option value="en">Anglais</option></select></div>
                    <div><Label htmlFor="v-platform">Plateforme</Label><select id="v-platform" className="expense-select" value={data.platform} onChange={e => set({ platform: e.target.value as Platform })}>{platforms.map(p => <option key={p} value={p}>{platformLabels[p]}</option>)}</select></div>
                    <div><Label htmlFor="v-channel">Chaîne ou producteur</Label><Input id="v-channel" maxLength={120} value={data.channel} onChange={e => set({ channel: e.target.value })} /></div>
                    <div><Label htmlFor="v-year">Année</Label><Input id="v-year" placeholder="AAAA" maxLength={4} value={data.year} onChange={e => set({ year: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="v-duration">Durée</Label><Input id="v-duration" placeholder="Ex. 52 min" maxLength={30} value={data.duration} onChange={e => set({ duration: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="v-summary">Ce qu’on y voit</Label><Textarea id="v-summary" rows={3} maxLength={2000} value={data.summary} onChange={e => set({ summary: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="v-tech">Techniques (séparées par des virgules)</Label><Input id="v-tech" value={lists.techniques} onChange={e => { setLists(l => ({ ...l, techniques: e.target.value })); setDirty(true); }} /></div>
                    <div className="full"><Label htmlFor="v-people">Brodeuses, ateliers qu’on y voit</Label><Input id="v-people" value={lists.people} onChange={e => { setLists(l => ({ ...l, people: e.target.value })); setDirty(true); }} /></div>
                    <div><Label htmlFor="v-until">Disponible jusqu’au</Label><Input id="v-until" type="date" value={data.availableUntil} onChange={e => set({ availableUntil: e.target.value })} /></div>
                    <label className="veille-check"><input type="checkbox" checked={data.forCap} onChange={e => set({ forCap: e.target.checked })} />Utile pour préparer le CAP</label>
                </div>
                <footer>
                    <span className="spacer" />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Annuler</Button>
                    <Button disabled={busy}>{busy ? 'Enregistrement…' : video ? 'Enregistrer' : 'Ajouter'}</Button>
                </footer>
            </form>
        </DialogContent>
    </Dialog>;
}
