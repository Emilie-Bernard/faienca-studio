'use client';
import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { Library as LibraryIcon, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ask } from '@/components/confirm-dialog';
import { groupByCategory } from '../lib/library';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';

type Item = { _id: string; title: string; category: string; description: string; authorName: string; createdAt: number; file: FileView; canRemove: boolean };
const dayFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Bibliothèque partagée, affichée à l'identique dans le studio et dans l'espace stagiaire. */
export function Library({ onToast }: { onToast: (s: string) => void }) {
    const items = useQuery(anyApi.library.list) as Item[] | undefined;
    const add = useMutation(anyApi.library.add), remove = useMutation(anyApi.library.remove), uploadUrl = useMutation(anyApi.library.generateUploadUrl);
    const [category, setCategory] = useState(''), [description, setDescription] = useState(''), [search, setSearch] = useState(''), [error, setError] = useState('');
    if (!items) return <p className="muted">Chargement de la bibliothèque…</p>;
    const categories = [...new Set(items.map(d => d.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const q = search.trim().toLowerCase();
    const shown = items.filter(d => !q || `${d.title} ${d.category} ${d.description} ${d.authorName}`.toLowerCase().includes(q));
    const erase = async (d: Item) => {
        if (!await ask(`Retirer « ${d.title} » de la bibliothèque ?`)) return;
        setError('');
        try { await remove({ id: d._id }); onToast('Document retiré'); } catch (err) { setError(errorText(err, 'Le document n’a pas été retiré.')); }
    };
    return <div className="library">
        <section className="panel library-add">
            <h2>Ajouter à la bibliothèque</h2>
            <p className="muted">Guides, modèles, inspirations, tutoriels : tout ce qui peut servir à l’atelier et aux stagiaires.</p>
            <div className="stage-form-row">
                <label className="library-field">Catégorie<Input list="library-categories" maxLength={60} placeholder="Ex. Techniques, Inspiration…" value={category} onChange={e => setCategory(e.target.value)} /></label>
                <datalist id="library-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
                <label className="library-field">Description (facultatif)<Textarea rows={1} maxLength={2000} placeholder="À quoi sert ce document ?" value={description} onChange={e => setDescription(e.target.value)} /></label>
            </div>
            <FileAdder what="document" upload={() => uploadUrl() as Promise<string>} onAdd={async file => {
                try { await add({ title: file.label, category, description, file }); setDescription(''); onToast('Ajouté à la bibliothèque'); }
                catch (err) { throw new Error(errorText(err, 'Le document n’a pas été ajouté.')); }
            }} />
        </section>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        {items.length > 0 && <div className="filters"><label className="search"><Search size={16} /><input aria-label="Rechercher dans la bibliothèque" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} /></label><span className="muted">{shown.length} document{shown.length > 1 ? 's' : ''}</span></div>}
        {!items.length ? <section className="panel client-empty"><LibraryIcon size={28} /><p>La bibliothèque est vide. Ajoutez le premier document ci-dessus.</p></section>
            : !shown.length ? <p className="muted">Aucun document ne correspond à cette recherche.</p>
            : groupByCategory(shown).map(g => <section key={g.category} className="stage-phase"><h2>{g.category}</h2>
                <ul className="library-items">{g.items.map(d => <li key={d._id} className="panel">
                    <FileLinks files={[{ ...d.file, label: d.title }]} onRemove={d.canRemove ? () => void erase(d) : undefined} />
                    {d.description && <p className="library-description">{d.description}</p>}
                    <small className="muted">Ajouté par {d.authorName} · {dayFr(d.createdAt)}</small>
                </li>)}</ul></section>)}
    </div>;
}
