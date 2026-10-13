'use client';
import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { Check, CircleAlert, CloudUpload, File, FileArchive, FileSpreadsheet, FileText, Film, ImageIcon, Library as LibraryIcon, Link2, LoaderCircle, Presentation, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ask } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { categoryOf, groupByCategory } from '../lib/library';
import { newFile, type MissionFile } from '../lib/stage';
import { errorText } from './client';
import type { FileView } from './stage-files';

type Item = { _id: string; title: string; category: string; description: string; authorName: string; createdAt: number; file: FileView; canRemove: boolean };
type Upload = { id: string; name: string; progress: number; state: 'waiting' | 'sending' | 'done' | 'error'; error?: string };
const dayFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const MAX_BYTES = 50 * 1024 * 1024, MAX_FILES = 20, PARALLEL = 3;

const kinds = {
    pdf: { label: 'PDF', Icon: FileText, ext: ['pdf'] },
    image: { label: 'Image', Icon: ImageIcon, ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'avif'] },
    video: { label: 'Vidéo', Icon: Film, ext: ['mp4', 'mov', 'webm', 'm4v'] },
    sheet: { label: 'Tableur', Icon: FileSpreadsheet, ext: ['xls', 'xlsx', 'csv', 'ods', 'numbers'] },
    slides: { label: 'Présentation', Icon: Presentation, ext: ['ppt', 'pptx', 'key', 'odp'] },
    doc: { label: 'Document', Icon: FileText, ext: ['doc', 'docx', 'odt', 'txt', 'rtf', 'pages', 'md'] },
    archive: { label: 'Archive', Icon: FileArchive, ext: ['zip', 'rar', '7z'] },
    link: { label: 'Lien', Icon: Link2, ext: [] },
    file: { label: 'Fichier', Icon: File, ext: [] },
} as const;
type Kind = keyof typeof kinds;

/** Devine le type d'un document à partir de l'extension de son nom de fichier ou de son lien. */
function kindOf(f: MissionFile): Kind {
    if (!f.storageId && /youtu\.?be|vimeo\.com/i.test(f.url)) return 'video';
    const ext = (f.storageId ? f.label : f.url.split(/[?#]/)[0]!).match(/\.([a-z0-9]{2,7})$/i)?.[1]?.toLowerCase();
    const found = (Object.keys(kinds) as Kind[]).find(k => ext && (kinds[k].ext as readonly string[]).includes(ext));
    return found ?? (f.storageId ? 'file' : 'link');
}
const withoutExtension = (name: string) => name.replace(/\.[a-z0-9]{2,7}$/i, '') || name;

/** Téléverse un fichier vers Convex en suivant la progression. */
function send(url: string, file: globalThis.File, onProgress: (p: number) => void) {
    return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
        xhr.onload = () => { try { if (xhr.status < 300) return resolve((JSON.parse(xhr.responseText) as { storageId: string }).storageId); } catch { /* réponse illisible */ } reject(new Error('Le téléversement a échoué.')); };
        xhr.onerror = () => reject(new Error('Connexion interrompue.'));
        xhr.send(file);
    });
}

/** Bibliothèque partagée, affichée à l'identique dans le studio et dans l'espace stagiaire. */
export function Library({ onToast }: { onToast: (s: string) => void }) {
    const items = useQuery(anyApi.library.list) as Item[] | undefined;
    const remove = useMutation(anyApi.library.remove);
    const [search, setSearch] = useState(''), [filter, setFilter] = useState(''), [error, setError] = useState('');
    if (!items) return <p className="muted">Chargement de la bibliothèque…</p>;
    const categories = groupByCategory(items).map(g => ({ name: g.category, count: g.items.length }));
    const q = search.trim().toLowerCase();
    const shown = items.filter(d => (!filter || categoryOf(d) === filter) && (!q || `${d.title} ${d.category} ${d.description} ${d.authorName}`.toLowerCase().includes(q)));
    const erase = async (d: Item) => {
        if (!await ask({ title: `Retirer « ${d.title} » ?`, description: 'Le document sera retiré de la bibliothèque pour tout le monde.', confirmLabel: 'Retirer', destructive: true })) return;
        setError('');
        try { await remove({ id: d._id }); onToast('Document retiré'); } catch (err) { setError(errorText(err, 'Le document n’a pas été retiré.')); }
    };
    return <div className="library">
        <LibraryAdder categories={categories.map(c => c.name).filter(c => c !== 'Divers')} onToast={onToast} />
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        {items.length > 0 && <div className="library-toolbar">
            <label className="search"><Search size={16} /><input aria-label="Rechercher dans la bibliothèque" placeholder="Rechercher un document…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            {categories.length > 1 && <div className="library-chips" role="group" aria-label="Catégorie">
                {[{ name: '', count: items.length }, ...categories].map(c => <button key={c.name} type="button" aria-pressed={filter === c.name} onClick={() => setFilter(c.name)}>{c.name || 'Tout'} <span>{c.count}</span></button>)}
            </div>}
        </div>}
        {!items.length ? <section className="panel client-empty"><LibraryIcon size={28} /><p>La bibliothèque est vide. Dépose le premier document ci-dessus.</p></section>
            : !shown.length ? <p className="muted">Aucun document ne correspond à cette recherche.</p>
            : groupByCategory(shown).map(g => <section key={g.category} className="library-group">
                <h2>{g.category} <span>{g.items.length}</span></h2>
                <ul className="library-grid">{g.items.map(d => <LibraryCard key={d._id} d={d} onRemove={d.canRemove ? () => void erase(d) : undefined} />)}</ul>
            </section>)}
    </div>;
}

function LibraryCard({ d, onRemove }: { d: Item, onRemove?: () => void }) {
    const kind = kindOf(d.file), { Icon, label } = kinds[kind], href = d.file.fileUrl ?? d.file.url;
    const [broken, setBroken] = useState(false);
    const thumb = kind === 'image' && d.file.fileUrl && !broken;
    return <li className="library-card">
        <a className={cn('library-thumb', 'kind-' + kind)} href={href || undefined} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden>
            {thumb ? <img src={d.file.fileUrl!} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon size={22} />}
        </a>
        <div className="library-card-body">
            {href ? <a className="library-card-title" href={href} target="_blank" rel="noopener noreferrer">{d.title}</a> : <span className="library-card-title muted">{d.title}</span>}
            {d.description && <p>{d.description}</p>}
            <small>{label} · {d.authorName} · {dayFr(d.createdAt)}</small>
        </div>
        {onRemove && <Button type="button" variant="ghost" size="icon" className="library-remove" aria-label={'Retirer ' + d.title} onClick={onRemove}><Trash2 size={15} /></Button>}
    </li>;
}

/** Dépôt de plusieurs fichiers à la fois, ou d'un lien, dans la catégorie choisie. */
function LibraryAdder({ categories, onToast }: { categories: string[], onToast: (s: string) => void }) {
    const add = useMutation(anyApi.library.add), uploadUrl = useMutation(anyApi.library.generateUploadUrl);
    const [category, setCategory] = useState(''), [uploads, setUploads] = useState<Upload[]>([]), [over, setOver] = useState(false);
    const [linkLabel, setLinkLabel] = useState(''), [url, setUrl] = useState(''), [linkError, setLinkError] = useState(''), [linkBusy, setLinkBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null), depth = useRef(0);
    const busy = uploads.some(u => u.state === 'waiting' || u.state === 'sending');
    const patch = (id: string, p: Partial<Upload>) => setUploads(list => list.map(u => u.id === id ? { ...u, ...p } : u));

    const start = async (files: globalThis.File[]) => {
        if (!files.length) return;
        const cat = category.trim();
        const batch = files.slice(0, MAX_FILES).map(file => ({ file, up: { id: crypto.randomUUID(), name: file.name, progress: 0, state: 'waiting' } as Upload }));
        const tooBig = batch.filter(b => b.file.size > MAX_BYTES);
        for (const b of tooBig) Object.assign(b.up, { state: 'error', error: 'Plus de 50 Mo : ajoute plutôt un lien (Drive, WeTransfer…).' });
        setUploads(list => [...list.filter(u => u.state === 'sending' || u.state === 'waiting'), ...batch.map(b => b.up)]);
        const queue = batch.filter(b => b.file.size <= MAX_BYTES);
        let added = 0;
        const worker = async () => {
            for (let b = queue.shift(); b; b = queue.shift()) {
                const { file, up } = b;
                patch(up.id, { state: 'sending' });
                try {
                    const storageId = await send(await uploadUrl() as string, file, progress => patch(up.id, { progress }));
                    await add({ title: withoutExtension(file.name).slice(0, 120), category: cat, description: '', file: { ...newFile(), label: file.name.slice(0, 120), url: '', storageId } });
                    patch(up.id, { state: 'done', progress: 1 }); added++;
                } catch (err) { patch(up.id, { state: 'error', error: errorText(err, 'Le fichier n’a pas été ajouté.') }); }
            }
        };
        await Promise.all(Array.from({ length: PARALLEL }, worker));
        if (added) onToast(added > 1 ? `${added} documents ajoutés` : 'Document ajouté');
        if (files.length > MAX_FILES) onToast(`${MAX_FILES} fichiers au maximum par envoi : dépose la suite ensuite.`);
    };
    const addLink = async () => {
        const link = url.trim();
        if (!/^https:\/\//i.test(link)) { setLinkError('Le lien doit commencer par https://.'); return; }
        setLinkBusy(true); setLinkError('');
        try {
            await add({ title: (linkLabel.trim() || link).slice(0, 120), category: category.trim(), description: '', file: { ...newFile(), label: linkLabel.trim().slice(0, 120), url: link } });
            setLinkLabel(''); setUrl(''); onToast('Lien ajouté');
        } catch (err) { setLinkError(errorText(err, 'Le lien n’a pas été ajouté.')); }
        setLinkBusy(false);
    };
    const drop = (e: DragEvent) => { e.preventDefault(); depth.current = 0; setOver(false); void start([...e.dataTransfer.files]); };
    const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');

    return <section className="panel library-add">
        <div className="library-add-head">
            <div><h2>Ajouter des documents</h2><p className="muted">Guides, modèles, inspirations, tutoriels : tout ce qui peut servir à l’atelier et aux stagiaires.</p></div>
            <label className="library-field">Ranger dans la catégorie<Input list="library-categories" maxLength={60} placeholder="Ex. Techniques, Inspiration…" value={category} onChange={e => setCategory(e.target.value)} /></label>
            <datalist id="library-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div role="button" tabIndex={0} aria-label="Choisir des fichiers à ajouter" className={cn('library-drop', over && 'over')}
            onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
            onDragEnter={e => { if (!hasFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); }}
            onDragOver={e => { if (hasFiles(e)) e.preventDefault(); }}
            onDragLeave={() => { if (--depth.current <= 0) { depth.current = 0; setOver(false); } }}
            onDrop={drop}>
            <input ref={input} type="file" multiple hidden onChange={e => { void start([...(e.target.files ?? [])]); e.target.value = ''; }} />
            <CloudUpload size={30} />
            <strong>{over ? 'Lâche les fichiers ici' : 'Glisse tes fichiers ici'}</strong>
            <span>ou <u>clique pour les choisir</u> · plusieurs à la fois, 50 Mo maximum chacun</span>
        </div>
        {uploads.length > 0 && <ul className="library-uploads" aria-live="polite">
            {uploads.map(u => <li key={u.id} className={u.state}>
                {u.state === 'done' ? <Check size={15} /> : u.state === 'error' ? <CircleAlert size={15} /> : <LoaderCircle size={15} className={u.state === 'sending' ? 'spin' : ''} />}
                <span className="name">{u.name}</span>
                {u.state === 'error' ? <span className="why">{u.error}</span> : <span className="bar"><span style={{ width: Math.round(u.progress * 100) + '%' }} /></span>}
            </li>)}
            {!busy && <li className="clear"><Button type="button" variant="ghost" size="sm" onClick={() => setUploads([])}><X size={14} />Effacer la liste</Button></li>}
        </ul>}
        <div className="library-link">
            <Link2 size={16} className="muted" />
            <Input aria-label="Nom du lien" placeholder="Nom du lien (facultatif)" maxLength={120} value={linkLabel} disabled={linkBusy} onChange={e => setLinkLabel(e.target.value)} />
            <Input aria-label="Lien https" type="url" placeholder="Ou colle un lien : https://…" value={url} disabled={linkBusy} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addLink(); } }} />
            <Button type="button" variant="outline" disabled={linkBusy || !url.trim()} onClick={() => void addLink()}>Ajouter le lien</Button>
        </div>
        {linkError && <p role="alert" className="error-inline">{linkError}</p>}
    </section>;
}
