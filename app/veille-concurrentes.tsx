'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowLeft, ArrowUpRight, Building2, CalendarDays, Globe, Instagram, LayoutGrid, MapPin, Pencil, Plus, Search, ShoppingBag, Scissors, Star, Table2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ask } from '@/components/confirm-dialog';
import { competitorError, dateFr, emptyCompetitor, euros, followersFr, productFormatLabels, productFormats, shortTag, sortTimeline, timelineKinds, type CompetitorInput, type Link, type ProductFormat, type TimelineItem } from '../lib/veille';
import { errorText } from './client';
import { Avatar } from './veille';
import { GalleryImage } from './veille-more';

// Concurrentes de Faïença : marques de kits de broderie et de patrons PDF, en France et en Espagne.

type CompetitorRow = {
    _id: string; name: string; country: string; city: string; region: string; foundedDate: string; closedDate: string;
    founders: string[]; offers: string[]; styles: string[]; techniques: string[]; threads: string[]; summary: string; photoUrl: string;
    products: number; cover: string; revenue: { year: string; amount: number | null } | null; instagram: number | null;
};
type Competitor = CompetitorInput & { _id: string; authorName: string; updatedAt: number };
type Sort = 'name' | 'revenue' | 'instagram' | 'founded';

const newId = () => crypto.randomUUID();
const csv = (list: string[]) => list.join(', ');
const fromCsv = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean);
/** Dans la frise d'une concurrente, « œuvre » est un lancement de produit et « exposition » un salon. */
const competitorKinds: Record<TimelineItem['kind'], string> = { vie: 'Entreprise', formation: 'Formation', oeuvre: 'Lancement', exposition: 'Salon', residence: 'Collaboration', prix: 'Presse, prix', autre: 'Autre' };
const since = (c: { foundedDate: string; closedDate: string }) => c.foundedDate && c.closedDate ? `${c.foundedDate.slice(0, 4)} – ${c.closedDate.slice(0, 4)}` : c.foundedDate ? `depuis ${c.foundedDate.slice(0, 4)}` : c.closedDate ? `fermée en ${c.closedDate.slice(0, 4)}` : '';
const countryOf = (c: { country: string }) => c.country || 'Pays inconnu';
/** France, puis Espagne, puis le reste par ordre alphabétique. */
const countryRank = (c: string) => c === 'France' ? 0 : c === 'Espagne' ? 1 : 2;
const numberOrNull = (s: string) => { const n = Number(s.replace(/\s/g, '').replace(',', '.')); return s.trim() === '' || !Number.isFinite(n) ? null : Math.round(n); };

/** Le logo de la marque dans une case carrée : il se montre en entier ; sans logo, les initiales. */
function CompetitorLogo({ src, name }: { src: string, name: string }) {
    const [broken, setBroken] = useState(false);
    return <span className="comp-logo" aria-hidden>
        {src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
            : <span>{name.split(/\s+/).filter(w => /^[A-ZÀ-Ý]/.test(w)).map(w => w[0]).slice(0, 2).join('')}</span>}
    </span>;
}

export function Competitors({ onOpen, onToast }: { onOpen: (id: string) => void, onToast: (s: string) => void }) {
    const rows = useQuery(anyApi.veilleConcurrentes.list) as CompetitorRow[] | undefined;
    const [search, setSearch] = useState(''), [country, setCountry] = useState(''), [offer, setOffer] = useState(''), [thread, setThread] = useState('');
    const [sort, setSort] = useState<Sort>('name'), [table, setTable] = useState(false), [adding, setAdding] = useState(false);
    if (!rows) return <p className="muted">Chargement des concurrentes…</p>;
    const countries = [...new Set(rows.map(countryOf))].sort((a, b) => countryRank(a) - countryRank(b) || a.localeCompare(b, 'fr'));
    const offers = [...new Set(rows.flatMap(r => r.offers))].sort((a, b) => a.localeCompare(b, 'fr'));
    const threads = [...new Set(rows.flatMap(r => r.threads.map(shortTag)))].sort((a, b) => a.localeCompare(b, 'fr'));
    const q = search.trim().toLowerCase();
    const shown = rows.filter(r => (!country || countryOf(r) === country) && (!offer || r.offers.includes(offer)) && (!thread || r.threads.some(t => shortTag(t) === thread))
        && (!q || `${r.name} ${r.city} ${r.region} ${r.summary} ${r.founders.join(' ')} ${r.styles.join(' ')} ${r.techniques.join(' ')} ${r.threads.join(' ')}`.toLowerCase().includes(q)));
    // Un chiffre inconnu passe toujours après les chiffres connus.
    const by: Record<Sort, (a: CompetitorRow, b: CompetitorRow) => number> = {
        name: (a, b) => a.name.localeCompare(b.name, 'fr'),
        revenue: (a, b) => (b.revenue?.amount ?? -1) - (a.revenue?.amount ?? -1),
        instagram: (a, b) => (b.instagram ?? -1) - (a.instagram ?? -1),
        founded: (a, b) => (a.foundedDate || '9999').localeCompare(b.foundedDate || '9999'),
    };
    const sorted = [...shown].sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name, 'fr'));
    const groups = countries.map(c => ({ country: c, items: sorted.filter(r => countryOf(r) === c) })).filter(g => g.items.length);
    const card = (r: CompetitorRow) => {
        const tags = [...new Set([...r.offers, ...r.styles].map(shortTag))].slice(0, 3);
        const foot = [r.revenue?.amount != null ? `CA ${r.revenue.year} : ${euros(r.revenue.amount)}` : '', r.instagram !== null ? `${followersFr(r.instagram)} abonnés` : '', r.products ? `${r.products} produit${r.products > 1 ? 's' : ''}` : ''].filter(Boolean);
        return <li key={r._id}>
            <button type="button" className="comp-card" onClick={() => onOpen(r._id)}>
                <CompetitorLogo src={r.photoUrl} name={r.name} />
                <span className="comp-main">
                    <strong>{r.name}</strong>
                    <small>{[r.city || r.region, since(r)].filter(Boolean).join(' · ')}</small>
                    {r.summary && <span className="veille-card-summary">{r.summary}</span>}
                    {tags.length > 0 && <span className="veille-tags compact">{tags.map(t => <span key={t} title={t}>{t}</span>)}</span>}
                    {foot.length > 0 && <span className="comp-stats">{foot.map(f => <span key={f}>{f}</span>)}</span>}
                </span>
            </button>
        </li>;
    };
    return <>
        <div className="veille-toolbar comp-toolbar">
            <label className="search"><Search size={16} /><input aria-label="Rechercher une concurrente" placeholder="Marque, ville, créatrice, style, fil…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            {countries.length > 1 && <label className="filter-field">Pays<select value={country} onChange={e => setCountry(e.target.value)}><option value="">Tous</option>{countries.map(c => <option key={c}>{c}</option>)}</select></label>}
            {offers.length > 0 && <label className="filter-field">Vend<select value={offer} onChange={e => setOffer(e.target.value)}><option value="">Tout</option>{offers.map(o => <option key={o}>{o}</option>)}</select></label>}
            {threads.length > 0 && <label className="filter-field">Fils<select value={thread} onChange={e => setThread(e.target.value)}><option value="">Tous</option>{threads.map(t => <option key={t}>{t}</option>)}</select></label>}
            <label className="filter-field">Trier<select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="name">Nom</option><option value="revenue">Chiffre d’affaires</option><option value="instagram">Abonnés Instagram</option><option value="founded">Ancienneté</option></select></label>
            <span className="spacer" />
            <Button type="button" variant="outline" size="icon" aria-label={table ? 'Voir en cartes' : 'Voir en tableau'} title={table ? 'Voir en cartes' : 'Comparer en tableau'} onClick={() => setTable(!table)}>{table ? <LayoutGrid size={16} /> : <Table2 size={16} />}</Button>
            <Button type="button" variant="outline" onClick={() => setAdding(true)}><Plus size={16} />Ajouter une concurrente</Button>
        </div>
        {!rows.length ? <section className="panel client-empty"><ShoppingBag size={28} /><p>Aucune concurrente pour l’instant.</p></section>
            : !shown.length ? <p className="muted">Aucune concurrente ne correspond.</p>
            : table ? <div className="table-scroll"><table className="competitors-table"><thead><tr>{['Marque', 'Pays', 'Création', 'Vend', 'Fils', 'Chiffre d’affaires', 'Instagram'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{sorted.map(r => <tr key={r._id}>
                    <td><button type="button" className="veille-inline-link" onClick={() => onOpen(r._id)}>{r.name}</button><small>{r.city || r.region}</small></td>
                    <td>{r.country || '—'}</td>
                    <td>{r.foundedDate ? r.foundedDate.slice(0, 4) : '—'}</td>
                    <td>{r.offers.length ? r.offers.join(', ') : '—'}</td>
                    <td>{r.threads.length ? r.threads.map(shortTag).join(', ') : '—'}</td>
                    <td className="num">{r.revenue?.amount != null ? <>{euros(r.revenue.amount)}<small>{r.revenue.year}</small></> : '—'}</td>
                    <td className="num">{r.instagram !== null ? followersFr(r.instagram) : '—'}</td>
                </tr>)}</tbody></table></div>
            : groups.map(g => <section key={g.country} className="veille-group comp-group"><h2>{g.country} <span>{g.items.length}</span></h2><ul className="veille-list comp-list">{g.items.map(card)}</ul></section>)}
        {adding && <CompetitorDialog competitor={null} onClose={() => setAdding(false)} onSaved={id => { setAdding(false); onOpen(id); }} onToast={onToast} />}
    </>;
}

export function CompetitorPage({ id, onBack, onToast }: { id: string, onBack: () => void, onToast: (s: string) => void }) {
    const c = useQuery(anyApi.veilleConcurrentes.get, { id }) as Competitor | null | undefined;
    const remove = useMutation(anyApi.veilleConcurrentes.remove);
    const [editing, setEditing] = useState(false);
    if (c === undefined) return <p className="muted">Chargement de la fiche…</p>;
    if (c === null) return <><Button type="button" variant="ghost" onClick={onBack}><ArrowLeft size={16} />Toutes les concurrentes</Button><p className="muted">Cette fiche a été supprimée.</p></>;
    const erase = async () => {
        if (!await ask({ title: `Supprimer la fiche de ${c.name} ?`, description: 'Elle disparaîtra de la veille pour tout le monde.', confirmLabel: 'Supprimer', destructive: true })) return;
        await remove({ id: c._id }); onToast('Fiche supprimée'); onBack();
    };
    const timeline = sortTimeline(c.timeline);
    // Meilleures ventes d'abord, puis les produits avec une image.
    const products = [...c.products].sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || Number(!!b.imageUrl) - Number(!!a.imageUrl));
    const company = [c.legalName, c.legalForm, c.registrationId && (c.country === 'Espagne' ? 'NIF ' : 'SIREN ') + c.registrationId].filter(Boolean);
    const materials = ([['Fils', c.threads], ['Tissus', c.fabrics], ['Techniques', c.techniques], ['Styles', c.styles]] as const).filter(([, l]) => l.length);
    return <article className="veille-portrait">
        <div className="veille-portrait-bar">
            <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft size={16} />Toutes les concurrentes</Button>
            <span className="spacer" />
            <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil size={15} />Modifier</Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Supprimer la fiche" onClick={() => void erase()}><Trash2 size={16} /></Button>
        </div>
        <header className="veille-portrait-head">
            <Avatar name={c.name} photo={c.photoUrl} large />
            <div>
                <div className="eyebrow">CONCURRENTE{c.country ? ' · ' + c.country.toUpperCase() : ''}</div>
                <h2>{c.name}</h2>
                <p className="veille-portrait-facts">
                    {since(c) && <span><CalendarDays size={15} />{since(c)}</span>}
                    {(c.city || c.region) && <span><MapPin size={15} />{[c.city, c.region].filter(Boolean).join(', ')}</span>}
                    {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer"><Globe size={15} />Site<ArrowUpRight size={13} /></a>}
                    {c.instagram && <a href={c.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={15} />Instagram<ArrowUpRight size={13} /></a>}
                    {c.etsy && <a href={c.etsy} target="_blank" rel="noopener noreferrer"><ShoppingBag size={15} />Etsy<ArrowUpRight size={13} /></a>}
                </p>
                {c.offers.length > 0 && <p className="veille-tags">{c.offers.map(t => <span key={t}>{t}</span>)}</p>}
                {c.summary && <p className="veille-summary">{c.summary}</p>}
            </div>
        </header>
        <div className="veille-portrait-grid">
            <div>
                {products.length > 0 && <section className="panel"><h3>Produits phares <span className="muted">{products.length}</span></h3>
                    <ul className="veille-gallery">{products.map(p => <li key={p.id}>
                        {p.imageUrl ? <a className="veille-gallery-image" href={p.url || p.imageUrl} target="_blank" rel="noopener noreferrer"><GalleryImage src={p.imageUrl} alt={p.title} /></a> : null}
                        <div>
                            <strong>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}<ArrowUpRight size={12} /></a> : p.title}</strong>
                            <small>{[productFormatLabels[p.format], p.price].filter(Boolean).join(' · ')}{p.bestseller && <span className="veille-bestseller"><Star size={11} />Best-seller</span>}</small>
                            {p.description && <p>{p.description}</p>}
                        </div>
                    </li>)}</ul>
                </section>}
                {materials.length > 0 && <section className="panel veille-facts"><h3><Scissors size={17} />Ce qu’elle utilise</h3>
                    {materials.map(([label, list]) => <div key={label}><h4>{label}</h4><p className="veille-tags">{list.map(t => <span key={t}>{t}</span>)}</p></div>)}
                </section>}
                {c.history && <section className="panel veille-bio"><h3>Histoire</h3>{c.history.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</section>}
                {c.positioning && <section className="panel veille-bio"><h3>Positionnement</h3>{c.positioning.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</section>}
            </div>
            <aside>
                {(company.length > 0 || c.founders.length > 0 || c.financials.length > 0) && <section className="panel veille-facts">
                    <h3><Building2 size={17} />L’entreprise</h3>
                    {c.founders.length > 0 && <div><h4>{c.founders.length > 1 ? 'Fondatrices' : 'Fondatrice'}</h4><p>{c.founders.join(', ')}</p></div>}
                    {company.length > 0 && <div><h4>Société</h4><p>{company.join(' · ')}</p></div>}
                    {c.financials.length > 0 && <div><h4>Chiffres publiés</h4>
                        <table className="veille-figures"><thead><tr><th>Année</th><th>CA</th><th>Résultat</th><th>Effectif</th></tr></thead>
                            <tbody>{c.financials.map(f => <tr key={f.id} title={f.source}><td>{f.year}</td><td>{euros(f.revenue) || '—'}</td><td>{euros(f.netIncome) || '—'}</td><td>{f.employees || '—'}</td></tr>)}</tbody></table>
                    </div>}
                </section>}
                {(c.audience.length > 0 || c.salesChannels.length > 0 || c.priceRange || c.languages.length > 0) && <section className="panel veille-facts">
                    {c.audience.length > 0 && <div><h3>Audience</h3><ul className="veille-audience">{c.audience.map(a => <li key={a.id}>
                        {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.platform}<ArrowUpRight size={12} /></a> : <span>{a.platform}</span>}
                        <strong>{followersFr(a.followers) || '—'}</strong>{a.date && <small>{dateFr(a.date)}</small>}
                    </li>)}</ul></div>}
                    {c.priceRange && <div><h4>Prix</h4><p>{c.priceRange}</p></div>}
                    {c.salesChannels.length > 0 && <div><h4>Où elle vend</h4><p>{c.salesChannels.join(', ')}</p></div>}
                    {c.languages.length > 0 && <div><h4>Langues</h4><p>{c.languages.join(', ')}</p></div>}
                </section>}
                {timeline.length > 0 && <section className="panel"><h3>Frise chronologique</h3>
                    <ol className="veille-timeline">{timeline.map(t => <li key={t.id} className={'kind-' + t.kind}><time>{dateFr(t.date)}</time><span className="veille-kind">{competitorKinds[t.kind]}</span><p>{t.label}</p></li>)}</ol>
                </section>}
                {c.sources.length > 0 && <section className="panel"><h3>Sources</h3>
                    <ul className="veille-sources">{c.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label || s.url.replace(/^https:\/\/(www\.)?/, '').split('/')[0]}<ArrowUpRight size={12} /></a></li>)}</ul>
                </section>}
                {c.researchNotes && <section className="panel veille-notes"><h3>À vérifier</h3>{c.researchNotes.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</section>}
                <p className="muted veille-credit">Ajoutée par {c.authorName} · mise à jour le {new Date(c.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </aside>
        </div>
        {editing && <CompetitorDialog competitor={c} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} onToast={onToast} />}
    </article>;
}

const listKeys = ['founders', 'offers', 'styles', 'techniques', 'threads', 'fabrics', 'salesChannels', 'languages'] as const;
type ListKey = typeof listKeys[number];

function CompetitorDialog({ competitor, onClose, onSaved, onToast }: { competitor: Competitor | null, onClose: () => void, onSaved: (id: string) => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.veilleConcurrentes.save);
    const [data, setData] = useState<CompetitorInput>(() => {
        const base = emptyCompetitor();
        if (!competitor) return base;
        return Object.fromEntries(Object.keys(base).map(k => [k, (competitor as unknown as Record<string, unknown>)[k] ?? base[k as keyof CompetitorInput]])) as unknown as CompetitorInput;
    });
    const [lists, setLists] = useState(() => Object.fromEntries(listKeys.map(k => [k, csv(data[k])])) as Record<ListKey, string>);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<CompetitorInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const setList = (k: ListKey, value: string) => { setLists(l => ({ ...l, [k]: value })); setDirty(true); };
    const close = async () => { if (!busy && (!dirty || await ask('Fermer sans enregistrer cette fiche ?'))) onClose(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const input: CompetitorInput = {
            ...data, ...Object.fromEntries(listKeys.map(k => [k, fromCsv(lists[k])])),
            products: data.products.filter(p => p.title.trim()), financials: data.financials.filter(f => f.year.trim()), audience: data.audience.filter(a => a.platform.trim()),
            timeline: data.timeline.filter(t => t.label.trim() || t.date), sources: data.sources.filter(s => s.url.trim()),
        };
        const problem = competitorError(input); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { const id = await save({ data: input, ...(competitor ? { id: competitor._id } : {}) }) as string; onToast(competitor ? 'Fiche mise à jour' : 'Concurrente ajoutée'); onSaved(id); }
        catch (err) { setError(errorText(err, 'La fiche n’a pas été enregistrée.')); setBusy(false); }
    };
    const row = <K extends 'products' | 'financials' | 'audience' | 'timeline' | 'sources'>(key: K) => ({
        update: (i: number, patch: Partial<CompetitorInput[K][number]>) => set({ [key]: data[key].map((x, j) => j === i ? { ...x, ...patch } : x) } as Partial<CompetitorInput>),
        remove: (i: number) => set({ [key]: data[key].filter((_, j) => j !== i) } as Partial<CompetitorInput>),
    });
    const products = row('products'), financials = row('financials'), audience = row('audience'), timeline = row('timeline'), sources = row('sources');
    const listField = (k: ListKey, label: string, placeholder = '') => <div className="full"><Label htmlFor={'c-' + k}>{label}</Label><Input id={'c-' + k} placeholder={placeholder} value={lists[k]} onChange={e => setList(k, e.target.value)} /></div>;
    return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
        <DialogContent className="expense-dialog veille-dialog" onInteractOutside={e => e.preventDefault()}>
            <form onSubmit={submit}>
                <header><span className="eyebrow">CONCURRENTE</span><DialogTitle>{competitor ? `Modifier ${competitor.name}` : 'Nouvelle concurrente'}</DialogTitle><DialogDescription className="muted">Dates au format AAAA. Les listes se séparent par des virgules, les montants sont en euros.</DialogDescription></header>
                {error && <div role="alert" className="error">{error}</div>}
                <div className="expense-grid">
                    <div className="full"><Label htmlFor="c-name">Marque</Label><Input id="c-name" required maxLength={160} value={data.name} onChange={e => set({ name: e.target.value })} /></div>
                    <div><Label htmlFor="c-country">Pays</Label><Input id="c-country" list="c-countries" maxLength={80} value={data.country} onChange={e => set({ country: e.target.value })} /><datalist id="c-countries"><option value="France" /><option value="Espagne" /></datalist></div>
                    <div><Label htmlFor="c-city">Ville</Label><Input id="c-city" maxLength={80} value={data.city} onChange={e => set({ city: e.target.value })} /></div>
                    <div><Label htmlFor="c-region">Région</Label><Input id="c-region" maxLength={80} value={data.region} onChange={e => set({ region: e.target.value })} /></div>
                    <div><Label htmlFor="c-founded">Création</Label><Input id="c-founded" placeholder="AAAA" maxLength={10} value={data.foundedDate} onChange={e => set({ foundedDate: e.target.value.trim() })} /></div>
                    {listField('founders', 'Fondatrices')}
                    <div><Label htmlFor="c-legal">Raison sociale</Label><Input id="c-legal" maxLength={200} value={data.legalName} onChange={e => set({ legalName: e.target.value })} /></div>
                    <div><Label htmlFor="c-form">Forme juridique</Label><Input id="c-form" placeholder="SAS, micro-entreprise, S.L.…" maxLength={80} value={data.legalForm} onChange={e => set({ legalForm: e.target.value })} /></div>
                    <div><Label htmlFor="c-reg">SIREN ou NIF</Label><Input id="c-reg" maxLength={40} value={data.registrationId} onChange={e => set({ registrationId: e.target.value })} /></div>
                    <div><Label htmlFor="c-closed">Fermeture</Label><Input id="c-closed" placeholder="Vide si en activité" maxLength={10} value={data.closedDate} onChange={e => set({ closedDate: e.target.value.trim() })} /></div>
                    {listField('offers', 'Ce qu’elle vend', 'Kits de broderie, Patrons PDF, Box…')}
                    {listField('threads', 'Fils', 'DMC Mouliné spécial 25, Anchor…')}
                    {listField('fabrics', 'Tissus', 'Lin, coton…')}
                    {listField('techniques', 'Techniques', 'Broderie traditionnelle, punch needle…')}
                    {listField('styles', 'Styles', 'Botanique, minimaliste…')}
                    {listField('salesChannels', 'Où elle vend', 'Site, Etsy, boutiques…')}
                    {listField('languages', 'Langues')}
                    <div className="full"><Label htmlFor="c-price">Prix</Label><Input id="c-price" placeholder="Kits de 35 à 55 €, PDF de 6 à 12 €" maxLength={300} value={data.priceRange} onChange={e => set({ priceRange: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="c-summary">En une phrase</Label><Textarea id="c-summary" rows={2} maxLength={600} value={data.summary} onChange={e => set({ summary: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="c-history">Histoire</Label><Textarea id="c-history" rows={6} maxLength={20000} value={data.history} onChange={e => set({ history: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="c-pos">Positionnement</Label><Textarea id="c-pos" rows={4} maxLength={6000} value={data.positioning} onChange={e => set({ positioning: e.target.value })} /></div>
                    <div><Label htmlFor="c-site">Site</Label><Input id="c-site" type="url" placeholder="https://…" value={data.website} onChange={e => set({ website: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="c-insta">Instagram</Label><Input id="c-insta" type="url" placeholder="https://instagram.com/…" value={data.instagram} onChange={e => set({ instagram: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="c-etsy">Etsy</Label><Input id="c-etsy" type="url" placeholder="https://www.etsy.com/shop/…" value={data.etsy} onChange={e => set({ etsy: e.target.value.trim() })} /></div>
                    <div><Label htmlFor="c-photo">Logo ou photo</Label><Input id="c-photo" type="url" placeholder="https://…" value={data.photoUrl} onChange={e => set({ photoUrl: e.target.value.trim() })} /></div>
                </div>
                <fieldset className="veille-rows"><legend>Produits phares</legend>
                    {data.products.map((p, i) => <div key={p.id} className="veille-row products">
                        <Input aria-label="Nom du produit" placeholder="Nom" value={p.title} onChange={e => products.update(i, { title: e.target.value })} />
                        <select aria-label="Format" className="expense-select" value={p.format} onChange={e => products.update(i, { format: e.target.value as ProductFormat })}>{productFormats.map(f => <option key={f} value={f}>{productFormatLabels[f]}</option>)}</select>
                        <Input aria-label="Prix" placeholder="Prix" value={p.price} onChange={e => products.update(i, { price: e.target.value })} />
                        <label className="veille-check"><input type="checkbox" checked={p.bestseller} onChange={e => products.update(i, { bestseller: e.target.checked })} />Best-seller</label>
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer le produit" onClick={() => products.remove(i)}><X size={15} /></Button>
                        <Input aria-label="Lien du produit" type="url" placeholder="Page : https://…" value={p.url} onChange={e => products.update(i, { url: e.target.value.trim() })} />
                        <Input aria-label="Lien de l’image" type="url" placeholder="Image : https://…" value={p.imageUrl} onChange={e => products.update(i, { imageUrl: e.target.value.trim() })} />
                        <Textarea aria-label="Description" rows={1} placeholder="Contenu du kit, fils, taille…" value={p.description} onChange={e => products.update(i, { description: e.target.value })} />
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ products: [...data.products, { id: newId(), title: '', format: 'kit', price: '', bestseller: false, description: '', url: '', imageUrl: '' }] })}><Plus size={14} />Ajouter un produit</Button>
                </fieldset>
                <fieldset className="veille-rows"><legend>Chiffres publiés</legend>
                    {data.financials.map((f, i) => <div key={f.id} className="veille-row figures">
                        <Input aria-label="Année" placeholder="AAAA" maxLength={4} value={f.year} onChange={e => financials.update(i, { year: e.target.value.trim() })} />
                        <Input aria-label="Chiffre d’affaires" inputMode="numeric" placeholder="CA en €" value={f.revenue ?? ''} onChange={e => financials.update(i, { revenue: numberOrNull(e.target.value) })} />
                        <Input aria-label="Résultat" inputMode="numeric" placeholder="Résultat en €" value={f.netIncome ?? ''} onChange={e => financials.update(i, { netIncome: numberOrNull(e.target.value) })} />
                        <Input aria-label="Effectif" placeholder="Effectif" value={f.employees} onChange={e => financials.update(i, { employees: e.target.value })} />
                        <Input aria-label="Source" placeholder="Source" value={f.source} onChange={e => financials.update(i, { source: e.target.value })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer l’année" onClick={() => financials.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ financials: [...data.financials, { id: newId(), year: '', revenue: null, netIncome: null, employees: '', source: '' }] })}><Plus size={14} />Ajouter une année</Button>
                </fieldset>
                <fieldset className="veille-rows"><legend>Audience</legend>
                    {data.audience.map((a, i) => <div key={a.id} className="veille-row audience">
                        <Input aria-label="Plateforme" placeholder="Instagram, Etsy (ventes)…" value={a.platform} onChange={e => audience.update(i, { platform: e.target.value })} />
                        <Input aria-label="Nombre" inputMode="numeric" placeholder="Nombre" value={a.followers ?? ''} onChange={e => audience.update(i, { followers: numberOrNull(e.target.value) })} />
                        <Input aria-label="Relevé le" placeholder="AAAA-MM" value={a.date} onChange={e => audience.update(i, { date: e.target.value.trim() })} />
                        <Input aria-label="Lien" type="url" placeholder="https://…" value={a.url} onChange={e => audience.update(i, { url: e.target.value.trim() })} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer l’audience" onClick={() => audience.remove(i)}><X size={15} /></Button>
                    </div>)}
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ audience: [...data.audience, { id: newId(), platform: '', followers: null, date: '', url: '' }] })}><Plus size={14} />Ajouter une audience</Button>
                </fieldset>
                <fieldset className="veille-rows"><legend>Frise chronologique</legend>
                    {data.timeline.map((t, i) => <div key={t.id} className="veille-row timeline">
                        <Input aria-label="Date" placeholder="AAAA" value={t.date} onChange={e => timeline.update(i, { date: e.target.value.trim() })} />
                        <select aria-label="Type" className="expense-select" value={t.kind} onChange={e => timeline.update(i, { kind: e.target.value as TimelineItem['kind'] })}>{timelineKinds.map(k => <option key={k} value={k}>{competitorKinds[k]}</option>)}</select>
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
                <div className="expense-grid"><div className="full"><Label htmlFor="c-notes">À vérifier</Label><Textarea id="c-notes" rows={3} maxLength={4000} value={data.researchNotes} onChange={e => set({ researchNotes: e.target.value })} /></div></div>
                <footer>
                    <span className="spacer" />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Annuler</Button>
                    <Button disabled={busy}>{busy ? 'Enregistrement…' : competitor ? 'Enregistrer' : 'Ajouter la concurrente'}</Button>
                </footer>
            </form>
        </DialogContent>
    </Dialog>;
}
