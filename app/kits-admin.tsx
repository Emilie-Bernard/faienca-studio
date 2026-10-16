'use client';
import { useEffect, useState, type FormEvent, type MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Flower2, GripVertical, MessageCircleQuestion, Package, PlayCircle, Plus, RotateCcw, Trash2, Upload, Users } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragCancelEvent, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { ask } from '@/components/confirm-dialog';
import { emptyKit, kitError, kitStatus, newLesson, statusFields, type KitInput, type KitStatus, type KitLanguage, type KitText, type Lesson, type LessonText, type Role } from '../lib/kits';
import { VideoPlayer, errorText, type LessonView } from './client';
import { clearDraft, useLocalDraft } from './local-draft';

type AdminKit = Omit<KitInput, 'lessons'> & { _id: string; revision: number; updatedAt: number; lessons: LessonView[]; stats: { clientes: number; finished: number; openQuestions: number; waiting: number } };
type AdminQuestion = { _id: string; kitTitle: string; lessonTitle: string; authorName: string; authorEmail: string; body: string; createdAt: number; answer: string | null; answeredAt: number | null };
type AccountKit = { kitId: string; title: string; status: KitStatus; source: 'code' | 'admin'; done: number; total: number; startedAt: number; updatedAt: number; finishedAt: number | null; awaitingRelease: boolean; notifiedAt: number | null };
type Account = { _id: string; name: string; email: string; role: Role; locked: boolean; createdAt: number; lastSeenAt: number | null; visits: number; kits: AccountKit[] };
const dateFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const inputOf = (k: AdminKit): KitInput => ({ title: k.title, description: k.description, coverUrl: k.coverUrl, accessCode: k.accessCode, published: k.published, upcoming: !!k.upcoming, lessons: k.lessons.map(lessonInput), ...(k.translations ? { translations: k.translations } : {}) });
const lessonInput = ({ id, title, stitch, videoUrl, videoStorageId, notes, translations }: Lesson): Lesson => ({ id, title, stitch, videoUrl, notes, ...(videoStorageId ? { videoStorageId } : {}), ...(translations ? { translations } : {}) });
/** Langue du contenu en cours d'édition : le français d'origine ou l'une de ses traductions. */
type EditLanguage = 'fr' | KitLanguage;
const EDIT_LANGUAGES: { id: EditLanguage, label: string }[] = [{ id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }];
const STATUS: Record<KitStatus, { label: string, badge: string }> = { draft: { label: 'Brouillon', badge: 'orange' }, upcoming: { label: 'À venir', badge: 'blue' }, published: { label: 'Publié', badge: 'green' } };
function StatusBadge({ status }: { status: KitStatus }) { return <span className={'badge ' + STATUS[status].badge}>{STATUS[status].label}</span>; }
function Empty({ text }: { text: string }) { return <div className="empty"><Flower2 size={28} /><p>{text}</p></div>; }

export type LeaveGuard = MutableRefObject<() => Promise<boolean>>;

/** Liste des kits, ou page d'édition d'un kit quand l'URL contient ?kit=<id|new>. */
export function KitsAdmin({ kitId, onOpenKit, leaveGuard, onToast }: { kitId: string | null, onOpenKit: (id: string | null, replace?: boolean) => void, leaveGuard: LeaveGuard, onToast: (s: string) => void }) {
    const kits = useQuery(anyApi.kits.adminList) as AdminKit[] | undefined;
    if (!kits) return <p className="muted">Chargement des kits…</p>;
    if (kitId) {
        const kit = kitId === 'new' ? null : kits.find(k => k._id === kitId);
        if (kit === undefined) return <section className="panel"><Empty text="Ce kit n’existe plus ou a été supprimé." /><div className="flex justify-center"><Button variant="outline" onClick={() => onOpenKit(null)}><ArrowLeft />Retour aux kits</Button></div></section>;
        return <KitPage key={kitId} kit={kit} leaveGuard={leaveGuard} onBack={() => onOpenKit(null)} onCreated={id => onOpenKit(id, true)} onToast={onToast} />;
    }
    return <KitList kits={kits} onOpenKit={onOpenKit} />;
}

const noVideo = (k: { lessons: Lesson[] }) => k.lessons.filter(l => !l.videoUrl && !l.videoStorageId).length;

function KitList({ kits, onOpenKit }: { kits: AdminKit[], onOpenKit: (id: string | null) => void }) {
    const [filter, setFilter] = useState<'all' | KitStatus>('all');
    const count = { all: kits.length, published: kits.filter(k => kitStatus(k) === 'published').length, upcoming: kits.filter(k => kitStatus(k) === 'upcoming').length, draft: kits.filter(k => kitStatus(k) === 'draft').length };
    const shown = kits.filter(k => filter === 'all' || kitStatus(k) === filter);
    return <>
        <div className="filters product-filters">
            <div className="segmented" role="group" aria-label="Filtrer les kits">{([['all', 'Tous'], ['published', 'Publiés'], ['upcoming', 'À venir'], ['draft', 'Brouillons']] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{label} <span className="muted">{count[v]}</span></button>)}</div>
            <span className="spacer" /><Button type="button" onClick={() => onOpenKit('new')}><Plus size={16} />Nouveau kit</Button>
        </div>
        <p className="muted kit-list-help">Une leçon vidéo par point. Seuls les kits publiés sont visibles des clientes ; un kit « À venir » s’affiche sans ses leçons et peut déjà être activé avec son code. Le code d’activation se glisse dans la boîte.</p>
        {shown.length ? <div className="product-list">{shown.map(k => { const missing = noVideo(k); return <a key={k._id} href={'?vue=Kits&kit=' + k._id} className="product-card" onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onOpenKit(k._id); }}>
            {/^https:\/\//.test(k.coverUrl) ? <img className="product-cover" src={k.coverUrl} alt="" loading="lazy" /> : <div className="product-cover placeholder"><Flower2 size={26} /></div>}
            <div className="product-card-body">
                <div className="card-top"><span className="eyebrow">{k.accessCode ? 'CODE ' + k.accessCode.toUpperCase() : 'ACCÈS LIBRE'}</span><StatusBadge status={kitStatus(k)} /></div>
                <h3>{k.title}</h3>
                <p className="product-card-meta"><span>{k.lessons.length} leçon{k.lessons.length > 1 ? 's' : ''}</span>{missing > 0 && <span className="kit-warn">{missing} sans vidéo</span>}</p>
                <p className="kit-card-stats"><span><strong>{k.stats.clientes}</strong> cliente{k.stats.clientes > 1 ? 's' : ''}</span><span><strong>{k.stats.finished}</strong> terminé{k.stats.finished > 1 ? 's' : ''}</span>{k.stats.waiting > 0 && <span><strong>{k.stats.waiting}</strong> en attente</span>}{k.stats.openQuestions > 0 && <span className="pending-count">{k.stats.openQuestions} question{k.stats.openQuestions > 1 ? 's' : ''}</span>}</p>
            </div>
        </a>; })}</div>
            : <section className="panel"><Empty text={kits.length ? 'Aucun kit dans cette catégorie.' : 'Créez votre premier kit pour ouvrir l’espace des brodeuses.'} /></section>}
    </>;
}

function KitPage({ kit, leaveGuard, onBack, onCreated, onToast }: { kit: AdminKit | null, leaveGuard: LeaveGuard, onBack: () => void, onCreated: (id: string) => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.kits.saveKit), remove = useMutation(anyApi.kits.removeKit), uploadUrl = useMutation(anyApi.kits.generateUploadUrl);
    const [data, setData] = useState<KitInput>(() => kit ? inputOf(kit) : emptyKit());
    // Révision de départ : un enregistrement fait ailleurs entre-temps sera signalé au lieu d'être écrasé.
    const [revision, setRevision] = useState(kit?.revision);
    const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(''), [error, setError] = useState(''), [dirty, setDirty] = useState(false), [confirm, setConfirm] = useState(false);
    // Leçons dépliées : toutes repliées pour un kit existant, la nouvelle leçon s'ouvre.
    const [open, setOpen] = useState<Set<string>>(() => new Set());
    const [removed, setRemoved] = useState<{ lesson: Lesson, index: number } | null>(null);
    const [lang, setLang] = useState<EditLanguage>('fr');
    const products = useQuery(anyApi.products.list) as { _id: string; title: string; linkedKitId: string }[] | undefined;
    const draftKey = 'faienca-kit-draft:' + (kit?._id ?? 'new');
    const { restored, forget } = useLocalDraft({ key: draftKey, revision: kit?.revision ?? null, data, dirty, onRestore: d => { setData(d); setDirty(true); } });
    useEffect(() => { if (!removed) return; const t = setTimeout(() => setRemoved(null), 10000); return () => clearTimeout(t); }, [removed]);
    const release = () => { leaveGuard.current = async () => true; };
    useEffect(() => {
        leaveGuard.current = async () => { if (!dirty) return true; const ok = await ask({ title: 'Quitter sans enregistrer ?', description: 'Les modifications de ce kit seront perdues.', confirmLabel: 'Quitter sans enregistrer', destructive: true }); if (ok) { clearDraft(draftKey); release(); } return ok; };
        return release;
    });
    useEffect(() => { if (!dirty) return; const before = (e: BeforeUnloadEvent) => e.preventDefault(); addEventListener('beforeunload', before); return () => removeEventListener('beforeunload', before); }, [dirty]);
    const set = (patch: Partial<KitInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const text = (field: keyof KitText) => lang === 'fr' ? data[field] : data.translations?.[lang]?.[field] ?? '';
    const setText = (field: keyof KitText, value: string) => lang === 'fr' ? set({ [field]: value }) : set({ translations: { ...data.translations, [lang]: { title: '', description: '', ...data.translations?.[lang], [field]: value } } });
    const setLessons = (fn: (lessons: Lesson[]) => Lesson[]) => { setData(d => ({ ...d, lessons: fn(d.lessons) })); setDirty(true); };
    const setLesson = (id: string, patch: Partial<Lesson>) => setLessons(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
    const toggle = (id: string, force?: boolean) => setOpen(o => { const n = new Set(o); if (force ?? !n.has(id)) n.add(id); else n.delete(id); return n; });
    const addLesson = () => { const l = newLesson(); setLessons(ls => [...ls, l]); toggle(l.id, true); requestAnimationFrame(() => document.getElementById('lesson-' + l.id)?.focus()); };
    const removeLesson = (id: string) => {
        const index = data.lessons.findIndex(l => l.id === id); const lesson = data.lessons[index]; if (!lesson) return;
        setLessons(ls => ls.filter(l => l.id !== id)); setRemoved({ lesson, index });
        // Le focus passe à la leçon suivante (ou précédente), puis au bouton d'ajout.
        const next = data.lessons[index + 1] ?? data.lessons[index - 1];
        requestAnimationFrame(() => (next ? document.querySelector<HTMLElement>(`[data-lesson="${next.id}"] .lesson-card-summary`) : document.getElementById('add-lesson'))?.focus());
    };
    const undoRemove = () => { if (!removed) return; const { lesson, index } = removed; setLessons(ls => [...ls.slice(0, index), lesson, ...ls.slice(index)]); setRemoved(null); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-lesson="${lesson.id}"] .lesson-card-summary`)?.focus()); };
    const back = async () => { if (busy || uploading) return; if (await leaveGuard.current()) onBack(); };
    const existingFile = (l: Lesson) => { const saved = kit?.lessons.find(x => x.id === l.id); return saved && saved.videoStorageId === l.videoStorageId ? saved.videoFileUrl : null; };
    const upload = async (id: string, file: File) => {
        if (!file.type.startsWith('video/')) { setError('Choisissez un fichier vidéo (MP4, MOV, WebM).'); return; }
        setUploading(id); setError('');
        try {
            const res = await fetch(await uploadUrl(), { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
            if (!res.ok) throw new Error();
            const { storageId } = await res.json() as { storageId: string };
            setLesson(id, { videoStorageId: storageId });
        } catch { setError('Le téléversement a échoué. Vérifiez votre connexion puis réessayez.'); } finally { setUploading(''); }
    };
    const submit = async (e: FormEvent) => {
        e.preventDefault(); const problem = kitError(data);
        if (problem) { setError(problem); data.lessons.filter(l => !l.title.trim()).forEach(l => toggle(l.id, true)); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        setBusy(true); setError('');
        try {
            const id = await save({ data: { ...data, lessons: data.lessons.map(lessonInput) }, ...(kit ? { id: kit._id, revision } : {}) }) as string;
            clearDraft(draftKey); setDirty(false); setBusy(false); setRemoved(null);
            if (kit) { setRevision(r => (r ?? 0) + 1); onToast('Kit enregistré'); }
            else { release(); onToast('Kit créé'); onCreated(id); }
        } catch (err) { setError(errorText(err, 'Impossible d’enregistrer. Vos modifications restent sur la page.')); setBusy(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    };
    const erase = async () => { if (!kit) return; setBusy(true); try { await remove({ id: kit._id, revision }); clearDraft(draftKey); release(); onToast('Kit supprimé'); onBack(); } catch (err) { setError(errorText(err, 'La suppression a échoué.')); setBusy(false); setConfirm(false); } };
    const fieldLabel = 'text-xs font-semibold text-muted-foreground';
    const discard = async () => { if (!await ask({ title: 'Annuler les modifications ?', description: 'Le kit revient à sa dernière version enregistrée.', confirmLabel: 'Annuler les modifications', destructive: true })) return; forget(); setDirty(false); setRemoved(null); if (kit) setData(inputOf(kit)); else { release(); onBack(); } };
    const missing = noVideo(data), linked = products?.filter(p => kit && p.linkedKitId === kit._id) ?? [];
    return <form className="kit-page" onSubmit={submit}>
        <div className="kit-page-bar">
            <Button type="button" variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => void back()}><ArrowLeft />Kits</Button>
            <div className="kit-page-title"><span className="eyebrow">{kit ? 'MODIFIER LE KIT' : 'NOUVEAU KIT'}</span><h1>{data.title.trim() || 'Sans titre'}</h1></div>
            <StatusBadge status={kitStatus(data)} />
            <span className="spacer" />
            {dirty && <span className="kit-page-dirty" role="status">Modifications non enregistrées</span>}
            {dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => void discard()}><RotateCcw size={16} />Annuler</Button>}
            <Button disabled={busy || !!uploading || (!!kit && !dirty)}>{busy ? 'Enregistrement…' : kit ? 'Enregistrer' : 'Créer le kit'}</Button>
        </div>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        {restored && <p className="product-restored" role="status"><RotateCcw size={15} />Vos modifications non enregistrées ont été retrouvées. Enregistrez-les ou annulez-les.</p>}
        <section className="product-kpis">
            <div className="product-kpi"><span>Leçons</span><strong>{data.lessons.length}</strong><small>{[...new Set(data.lessons.map(l => l.stitch.trim()).filter(Boolean))].length} points différents</small></div>
            <div className={cn('product-kpi', missing > 0 && 'warn')}><span>Vidéos</span><strong>{data.lessons.length - missing}/{data.lessons.length}</strong><small>{missing ? `${missing} leçon${missing > 1 ? 's' : ''} sans vidéo` : 'Toutes les leçons ont leur vidéo'}</small></div>
            {kit && <div className="product-kpi"><span>Clientes</span><strong>{kit.stats.clientes}</strong><small>{kit.stats.finished} kit{kit.stats.finished > 1 ? 's' : ''} terminé{kit.stats.finished > 1 ? 's' : ''}</small></div>}
            {kit && <div className={cn('product-kpi', kit.stats.openQuestions > 0 && 'warn')}><span>Questions</span><strong>{kit.stats.openQuestions}</strong><small>en attente de réponse</small></div>}
        </section>
        <div className="kit-page-grid">
            <div className="kit-page-main">
                <section className="kit-languages"><div className="kit-languages-row"><span className={fieldLabel}>Langue du contenu</span><div className="segmented" role="group" aria-label="Langue du contenu">{EDIT_LANGUAGES.map(l => <button key={l.id} type="button" lang={l.id} aria-pressed={lang === l.id} className={lang === l.id ? 'selected' : ''} onClick={() => setLang(l.id)}>{l.label}</button>)}</div></div>
                    {lang !== 'fr' && <p className="muted kit-page-help">Traduction affichée aux clientes qui consultent le site dans cette langue. Un champ vide reprend le texte français, indiqué en gris.</p>}
                </section>
                <section className="panel"><div className="panel-title"><h2>Informations</h2></div><div className="grid gap-5">
                    <div className="grid gap-1.5"><Label htmlFor="kit-title" className={fieldLabel}>Titre</Label><Input id="kit-title" lang={lang} required={lang === 'fr'} maxLength={200} value={text('title')} placeholder={lang === 'fr' ? 'Le vase aux citrons' : data.title} className="h-11 bg-card text-base" onChange={e => setText('title', e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label htmlFor="kit-description" className={fieldLabel}>Description</Label><Textarea id="kit-description" lang={lang} rows={4} maxLength={5000} value={text('description')} placeholder={lang === 'fr' ? 'Ce que contient le kit, le niveau, le temps de broderie…' : data.description} className="bg-card text-base" onChange={e => setText('description', e.target.value)} /></div>
                </div></section>
                <section className="panel"><div className="panel-title"><h2>Leçons</h2><div className="flex items-center gap-3"><span className="muted">{data.lessons.length} leçon{data.lessons.length > 1 ? 's' : ''}</span>{data.lessons.length > 1 && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(o => o.size ? new Set() : new Set(data.lessons.map(l => l.id)))}>{open.size ? 'Tout replier' : 'Tout déplier'}</Button>}</div></div>
                    <p className="muted kit-page-help">Une leçon par point ou par étape. Glissez la poignée <GripVertical className="inline size-3.5 align-[-2px]" /> pour changer l’ordre, ou utilisez les flèches.</p>
                    <LessonList lessons={data.lessons} lang={lang} open={open} uploading={uploading} existingFile={existingFile}
                        onReorder={lessons => setLessons(() => lessons)} onToggle={toggle} onChange={setLesson} onRemove={removeLesson} onUpload={(id, f) => void upload(id, f)} />
                    {removed && <div className="lesson-undo" role="status">Leçon « {removed.lesson.title || 'sans titre'} » supprimée.<Button type="button" variant="link" className="h-auto p-0 font-semibold text-yellow-cream" onClick={undoRemove}>Annuler</Button></div>}
                    <Button id="add-lesson" type="button" variant="outline" className="mt-3 w-full border-dashed" onClick={addLesson}><Plus />Ajouter une leçon</Button>
                </section>
            </div>
            <aside className="kit-page-side">
                <section className="panel"><div className="panel-title"><h2>Publication</h2></div>
                    <div className="segmented kit-status" role="radiogroup" aria-label="Statut du kit">{(['draft', 'upcoming', 'published'] as const).map(st => <button key={st} type="button" role="radio" aria-checked={kitStatus(data) === st} className={kitStatus(data) === st ? 'selected' : ''} onClick={() => set(statusFields(st))}>{STATUS[st].label}</button>)}</div>
                    <p className="muted kit-page-help mt-2">{kitStatus(data) === 'draft' ? 'Invisible des clientes.' : kitStatus(data) === 'upcoming' ? 'Visible dans le catalogue sans ses leçons. Les clientes peuvent déjà saisir leur code ; elles recevront un e-mail à la publication.' : 'Visible et activable par les clientes.'}</p>
                    {kit && kit.stats.waiting > 0 && <ReleaseNotice kit={kit} willPublish={!kit.published && data.published} onToast={onToast} />}
                    <div className="mt-5 grid gap-1.5"><Label htmlFor="kit-code" className={fieldLabel}>Codes d’activation</Label><Input id="kit-code" maxLength={300} value={data.accessCode} placeholder="Vide = accès libre" autoComplete="off" className="h-11 bg-card font-mono tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case" onChange={e => set({ accessCode: e.target.value })} /><small>Plusieurs codes possibles, séparés par des virgules (par exemple le code du lien Shopify et celui du livret). Majuscules, espaces et tirets ne comptent pas.</small></div>
                </section>
                <section className="panel"><div className="panel-title"><h2>Couverture</h2></div>
                    {data.coverUrl && /^https:\/\//.test(data.coverUrl) ? <img className="kit-page-cover" src={data.coverUrl} alt="" /> : <div className="kit-page-cover kit-cover placeholder"><Flower2 size={30} /></div>}
                    <div className="mt-4 grid gap-1.5"><Label htmlFor="kit-cover" className={fieldLabel}>Lien de l’image (https)</Label><Input id="kit-cover" type="url" value={data.coverUrl} placeholder="https://…" className="h-11 bg-card" onChange={e => set({ coverUrl: e.target.value })} /></div>
                </section>
                {kit && <section className="panel"><div className="panel-title"><h2>Produit boutique</h2></div>
                    {linked.length ? <ul className="kit-linked">{linked.map(p => <li key={p._id}><a className="edit-link" href={'?vue=Produits&produit=' + p._id}><Package size={15} />{p.title}</a></li>)}</ul>
                        : <p className="muted">Aucun produit relié. Dans <a className="edit-link" href="?vue=Produits">Produits</a>, choisissez ce kit dans « Leçons vidéo » pour relier sa fiche.</p>}
                    <small className="mt-3 block">Modifié le {dateFr(kit.updatedAt)}</small>
                </section>}
                {kit && <section className="panel kit-page-danger"><div className="panel-title"><h2>Supprimer le kit</h2></div>
                    {confirm ? <><p>La progression de {kit.stats.clientes} cliente{kit.stats.clientes > 1 ? 's' : ''}, les questions et les vidéos téléversées seront effacées. Pour le masquer simplement, désactivez la publication.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Annuler</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void erase()}>Supprimer définitivement</Button></div></>
                        : <><p>Efface le kit, la progression des clientes et leurs questions.</p><Button type="button" variant="outline" className="mt-3 text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirm(true)}><Trash2 />Supprimer…</Button></>}
                </section>}
            </aside>
        </div>
    </form>;
}

/** Clientes qui ont ajouté le kit avant sa sortie : l'e-mail part à l'enregistrement du kit publié. */
function ReleaseNotice({ kit, willPublish, onToast }: { kit: AdminKit, willPublish: boolean, onToast: (s: string) => void }) {
    const notify = useMutation(anyApi.kits.notifyRelease); const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const n = kit.stats.waiting, who = `${n} cliente${n > 1 ? 's' : ''}`;
    const send = async () => { setBusy(true); setError(''); try { await notify({ kitId: kit._id }); onToast('E-mails en cours d’envoi'); } catch (err) { setError(errorText(err, 'L’envoi n’a pas démarré.')); } finally { setBusy(false); } };
    return <div className="kit-waiting" role="status">
        <p><strong>{who}</strong> {n > 1 ? 'attendent' : 'attend'} ce kit. {kit.published ? 'L’e-mail de sortie ne leur est pas encore parvenu.' : `${n > 1 ? 'Elles recevront' : 'Elle recevra'} ${willPublish ? 'l’e-mail de sortie dès l’enregistrement.' : 'un e-mail quand vous le publierez.'}`}</p>
        {kit.published && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send()}>{busy ? 'Envoi…' : 'Envoyer l’e-mail de sortie'}</Button>}
        {error && <p role="alert" className="error">{error}</p>}
    </div>;
}

const dndAnnouncements = (lessons: Lesson[]) => {
    const name = (id: string | number) => { const i = lessons.findIndex(l => l.id === id); return `la leçon ${i + 1}${lessons[i]?.title ? ' « ' + lessons[i]!.title + ' »' : ''}`; };
    const pos = (id: string | number | undefined) => lessons.findIndex(l => l.id === id) + 1;
    return {
        onDragStart: ({ active }: DragStartEvent) => `Vous avez saisi ${name(active.id)}.`,
        onDragOver: ({ active, over }: DragOverEvent) => over ? `${name(active.id)} est en position ${pos(over.id)} sur ${lessons.length}.` : `${name(active.id)} n’est plus au-dessus d’une position.`,
        onDragEnd: ({ active, over }: DragEndEvent) => over ? `${name(active.id)} a été déposée en position ${pos(over.id)}.` : `${name(active.id)} a été relâchée.`,
        onDragCancel: ({ active }: DragCancelEvent) => `Déplacement annulé : ${name(active.id)} reste à sa place.`,
    };
};

/** Liste des leçons, réordonnable à la souris, au doigt ou au clavier. */
function LessonList({ lessons, lang, open, uploading, existingFile, onReorder, onToggle, onChange, onRemove, onUpload }: {
    lessons: Lesson[], lang: EditLanguage, open: Set<string>, uploading: string, existingFile: (l: Lesson) => string | null,
    onReorder: (lessons: Lesson[]) => void, onToggle: (id: string) => void, onChange: (id: string, patch: Partial<Lesson>) => void, onRemove: (id: string) => void, onUpload: (id: string, f: File) => void,
}) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    const [moved, setMoved] = useState('');
    useEffect(() => { if (!moved) return; const t = setTimeout(() => setMoved(''), 900); return () => clearTimeout(t); }, [moved]);
    const move = (id: string, step: -1 | 1) => {
        const i = lessons.findIndex(l => l.id === id), j = i + step;
        if (j < 0 || j >= lessons.length) return;
        onReorder(arrayMove(lessons, i, j)); setMoved(id);
        // On garde le focus sur la même carte : même flèche si elle reste utilisable, sinon l'autre.
        requestAnimationFrame(() => {
            const card = document.querySelector<HTMLElement>(`[data-lesson="${id}"]`); if (!card) return;
            const same = card.querySelector<HTMLButtonElement>(`[data-move="${step}"]`), other = card.querySelector<HTMLButtonElement>(`[data-move="${-step}"]`);
            (same && !same.disabled ? same : other)?.focus();
            card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    };
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        onReorder(arrayMove(lessons, lessons.findIndex(l => l.id === active.id), lessons.findIndex(l => l.id === over.id))); setMoved(String(active.id));
    };
    return <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}
        accessibility={{ announcements: dndAnnouncements(lessons), screenReaderInstructions: { draggable: 'Pour déplacer une leçon, appuyez sur Espace ou Entrée, utilisez les flèches haut et bas, puis Espace ou Entrée pour la déposer. Échap annule.' } }}>
        <SortableContext items={lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
            <ol className="lesson-list-edit">{lessons.map((l, i) => <LessonCard key={l.id} lesson={l} lang={lang} index={i} count={lessons.length} open={open.has(l.id)} highlighted={moved === l.id}
                file={l.videoStorageId ? existingFile(l) : null} uploading={uploading}
                onToggle={() => onToggle(l.id)} onMove={step => move(l.id, step)} onChange={patch => onChange(l.id, patch)} onRemove={() => onRemove(l.id)} onUpload={f => onUpload(l.id, f)} />)}</ol>
        </SortableContext>
    </DndContext>;
}

function LessonCard({ lesson: l, lang, index, count, open, highlighted, file, uploading, onToggle, onMove, onChange, onRemove, onUpload }: {
    lesson: Lesson, lang: EditLanguage, index: number, count: number, open: boolean, highlighted: boolean, file: string | null, uploading: string,
    onToggle: () => void, onMove: (step: -1 | 1) => void, onChange: (patch: Partial<Lesson>) => void, onRemove: () => void, onUpload: (f: File) => void,
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: l.id });
    const hasVideo = !!(l.videoUrl || l.videoStorageId);
    const text = (field: keyof LessonText) => lang === 'fr' ? l[field] : l.translations?.[lang]?.[field] ?? '';
    const setText = (field: keyof LessonText, value: string) => onChange(lang === 'fr' ? { [field]: value } : { translations: { ...l.translations, [lang]: { title: '', stitch: '', notes: '', ...l.translations?.[lang], [field]: value } } });
    return <li ref={setNodeRef} data-lesson={l.id} style={{ transform: CSS.Translate.toString(transform), transition }}
        className={cn('lesson-card', open && 'open', isDragging && 'dragging', highlighted && 'moved')}>
        <div className="lesson-card-head">
            <button type="button" ref={setActivatorNodeRef} className="lesson-grip" aria-label={`Déplacer la leçon ${index + 1}`} {...attributes} {...listeners}><GripVertical /></button>
            <span className="lesson-num">{index + 1}</span>
            <button type="button" className="lesson-card-summary" aria-expanded={open} aria-controls={'lesson-body-' + l.id} onClick={onToggle}>
                <span className="lesson-card-title">{l.title.trim() || <em>Leçon sans titre</em>}</span>
                <span className="lesson-card-meta">{l.stitch && <span className="chip">{l.stitch}</span>}{hasVideo ? <span className="lesson-card-video"><PlayCircle />Vidéo</span> : <span className="lesson-card-novideo">Sans vidéo</span>}</span>
            </button>
            <div className="lesson-card-tools">
                <Button type="button" variant="ghost" size="icon-sm" data-move="-1" aria-label={`Monter la leçon ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" data-move="1" aria-label={`Descendre la leçon ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Supprimer la leçon ${index + 1}`} onClick={onRemove}><Trash2 /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={open ? 'Replier la leçon' : 'Déplier la leçon'} aria-expanded={open} onClick={onToggle}><ChevronDown className={cn('transition-transform', open && 'rotate-180')} /></Button>
            </div>
        </div>
        {open && <div className="lesson-card-body" id={'lesson-body-' + l.id}><div className="form-grid">
            <label>Titre<input id={'lesson-' + l.id} lang={lang} required={lang === 'fr'} maxLength={200} value={text('title')} placeholder={lang === 'fr' ? 'Le contour du vase' : l.title} onChange={e => setText('title', e.target.value)} /></label>
            <label>Point brodé<input lang={lang} maxLength={120} value={text('stitch')} placeholder={lang === 'fr' ? 'Point de tige' : l.stitch} onChange={e => setText('stitch', e.target.value)} /></label>
            <label className="full">Lien vidéo (YouTube, Vimeo ou fichier .mp4)<input type="url" value={l.videoUrl} placeholder="https://youtu.be/…" disabled={!!l.videoStorageId} onChange={e => onChange({ videoUrl: e.target.value })} /></label>
            <div className="full upload-row">{l.videoStorageId ? <><span className="chip">{file ? 'Fichier vidéo joint' : 'Nouveau fichier prêt à enregistrer'}</span><Button type="button" variant="outline" onClick={() => onChange({ videoStorageId: undefined })}>Retirer le fichier</Button></> : <Button asChild variant="outline"><label className="upload-button"><Upload />{uploading === l.id ? 'Téléversement…' : 'Téléverser une vidéo'}<input type="file" accept="video/*" hidden disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} /></label></Button>}</div>
            {(file || l.videoUrl) && <div className="full lesson-preview"><VideoPlayer lesson={{ title: l.title, videoUrl: l.videoUrl, videoFileUrl: file }} /></div>}
            <label className="full">Conseils affichés sous la vidéo<textarea lang={lang} rows={3} maxLength={5000} value={text('notes')} placeholder={lang === 'fr' ? undefined : l.notes} onChange={e => setText('notes', e.target.value)} /></label>
        </div></div>}
    </li>;
}

export function QuestionsAdmin({ onToast }: { onToast: (s: string) => void }) {
    const questions = useQuery(anyApi.kits.adminQuestions) as AdminQuestion[] | undefined;
    const [filter, setFilter] = useState<'open' | 'all'>('open');
    if (!questions) return <p className="muted">Chargement des questions…</p>;
    const open = questions.filter(q => !q.answer);
    const shown = filter === 'open' ? open : questions;
    return <>
        <div className="filters"><div className="segmented"><button type="button" className={filter === 'open' ? 'selected' : ''} onClick={() => setFilter('open')}>À répondre ({open.length})</button><button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>Toutes ({questions.length})</button></div><span className="muted">Vos réponses sont visibles par toutes les clientes du kit.</span></div>
        {shown.length ? <div className="admin-questions">{shown.map(q => <AnswerCard key={q._id} q={q} onToast={onToast} />)}</div> : <section className="panel"><Empty text={filter === 'open' ? 'Aucune question en attente. Tout est à jour !' : 'Aucune question pour le moment.'} /></section>}
    </>;
}

function AnswerCard({ q, onToast }: { q: AdminQuestion, onToast: (s: string) => void }) {
    const answer = useMutation(anyApi.kits.answer), remove = useMutation(anyApi.kits.removeQuestion);
    const [text, setText] = useState(q.answer ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await answer({ id: q._id, answer: text }); onToast(text.trim() ? 'Réponse publiée' : 'Réponse retirée'); } catch (err) { setError(errorText(err, 'La réponse n’a pas été enregistrée.')); } finally { setBusy(false); } };
    return <article className="panel answer-card"><div className="qa-meta"><span className={'badge ' + (q.answer ? 'green' : 'orange')}>{q.answer ? 'Répondu' : 'À répondre'}</span><small>{q.kitTitle}{q.lessonTitle ? ' · ' + q.lessonTitle : ''}</small><span className="spacer" /><Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Supprimer la question" onClick={async () => { if (await ask('Supprimer définitivement cette question ?')) void remove({ id: q._id }).then(() => onToast('Question supprimée')); }}><Trash2 size={15} /></Button></div>
        <p className="answer-author"><strong>{q.authorName}</strong> <small>{q.authorEmail} · {dateFr(q.createdAt)}</small></p><p className="answer-body">{q.body}</p>
        <form onSubmit={submit}><textarea rows={3} maxLength={4000} value={text} onChange={e => setText(e.target.value)} placeholder="Votre réponse…" aria-label={'Réponse à ' + q.authorName} disabled={busy} />{error && <p role="alert" className="error">{error}</p>}<div className="answer-actions"><Button disabled={busy || text.trim() === (q.answer ?? '')}>{busy ? 'Envoi…' : q.answer ? 'Mettre à jour' : 'Répondre'}</Button></div></form></article>;
}

const DAY = 86400000;
const dateTimeFr = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** « Il y a 3 h », « Hier », « Il y a 12 j »… puis la date au-delà de deux mois. */
function ago(t: number) {
    const d = Date.now() - t, min = Math.round(d / 60000);
    if (min < 5) return 'À l’instant';
    if (min < 60) return `Il y a ${min} min`;
    if (min < 24 * 60) return `Il y a ${Math.round(min / 60)} h`;
    const days = Math.round(d / DAY);
    return days <= 1 ? 'Hier' : days < 60 ? `Il y a ${days} j` : dateFr(t);
}
type SortKey = 'lastSeen' | 'created' | 'name';

export function ClientsAdmin({ onToast }: { onToast: (s: string) => void }) {
    const accounts = useQuery(anyApi.users.list) as Account[] | undefined; const me = useQuery(anyApi.users.me) as { _id: string } | null | undefined;
    const kits = useQuery(anyApi.kits.adminList) as AdminKit[] | undefined;
    const setRole = useMutation(anyApi.users.setRole); const [error, setError] = useState('');
    const [search, setSearch] = useState(''), [roleFilter, setRoleFilter] = useState<'all' | Role>('all'), [sort, setSort] = useState<SortKey>('lastSeen'), [openId, setOpenId] = useState<string | null>(null);
    if (!accounts) return <p className="muted">Chargement des comptes…</p>;
    const change = async (a: Account, role: Role) => { if (role === 'admin' && !await ask(`Donner l’accès complet à l’atelier à ${a.email || a.name} ?`)) return; setError(''); try { await setRole({ userId: a._id, role }); onToast('Rôle mis à jour'); } catch (err) { setError(errorText(err, 'Le rôle n’a pas été modifié.')); } };
    const now = Date.now(), n = (r: Role) => accounts.filter(a => a.role === r).length;
    const q = search.trim().toLowerCase();
    const shown = accounts.filter(a => (roleFilter === 'all' || a.role === roleFilter) && (!q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.kits.some(k => k.title.toLowerCase().includes(q))))
        .sort((a, b) => sort === 'name' ? (a.name || a.email).localeCompare(b.name || b.email, 'fr') : sort === 'created' ? b.createdAt - a.createdAt : (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
    const clientes = accounts.filter(a => a.role === 'cliente');
    const within = (t: number | null, days: number) => !!t && now - t < days * DAY;
    return <>
        <section className="product-kpis">
            <div className="product-kpi"><span>Clientes</span><strong>{clientes.length}</strong><small>{n('stagiaire')} stagiaire{n('stagiaire') > 1 ? 's' : ''} · {n('admin')} admin</small></div>
            <div className="product-kpi"><span>Actives sur 7 jours</span><strong>{clientes.filter(a => within(a.lastSeenAt, 7)).length}</strong><small>{clientes.filter(a => within(a.lastSeenAt, 30)).length} sur 30 jours</small></div>
            <div className="product-kpi"><span>Inscriptions sur 30 jours</span><strong>{clientes.filter(a => within(a.createdAt, 30)).length}</strong><small>{clientes.filter(a => within(a.createdAt, 7)).length} cette semaine</small></div>
            <div className="product-kpi"><span>Kits dans les carnets</span><strong>{clientes.reduce((s, a) => s + a.kits.length, 0)}</strong><small>{clientes.reduce((s, a) => s + a.kits.filter(k => k.awaitingRelease).length, 0)} en attente de sortie</small></div>
        </section>
        <div className="filters accounts-filters">
            <Users size={18} />
            <Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, e-mail ou kit…" aria-label="Rechercher un compte" className="h-10 max-w-xs bg-card" />
            <div className="segmented" role="group" aria-label="Filtrer par rôle">{([['all', 'Tous'], ['cliente', 'Clientes'], ['stagiaire', 'Stagiaires'], ['admin', 'Admins']] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={roleFilter === v} className={roleFilter === v ? 'selected' : ''} onClick={() => setRoleFilter(v)}>{label}</button>)}</div>
            <span className="spacer" />
            <label className="filter-field">Trier par<select value={sort} onChange={e => setSort(e.target.value as SortKey)}><option value="lastSeen">Dernière connexion</option><option value="created">Inscription</option><option value="name">Nom</option></select></label>
        </div>
        {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Fermer</button></div>}
        <div className="table-scroll"><table className="accounts-table"><thead><tr>{['Nom', 'E-mail', 'Rôle', 'Kits', 'Inscription', 'Dernière connexion', 'Visites', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{shown.length ? shown.flatMap(a => {
            const open = openId === a._id, label = a.name || a.email || 'Compte atelier';
            const row = <tr key={a._id} className={open ? 'open' : undefined}>
                <td>{a.name || (a.locked ? 'Compte atelier' : '—')}</td><td>{a.email || '—'}</td>
                <td><select aria-label={'Rôle de ' + label} value={a.role} disabled={a.locked || a._id === me?._id} onChange={e => void change(a, e.target.value as Role)}><option value="cliente">Cliente</option><option value="stagiaire">Stagiaire</option><option value="admin">Admin</option></select></td>
                <td>{a.kits.length ? <div className="chips">{a.kits.slice(0, 2).map(k => <span key={k.kitId} className="chip">{k.title}</span>)}{a.kits.length > 2 && <span className="chip">+{a.kits.length - 2}</span>}</div> : <span className="muted">—</span>}</td>
                <td>{dateFr(a.createdAt)}</td>
                <td>{a.lastSeenAt ? <span title={dateTimeFr(a.lastSeenAt)} className={within(a.lastSeenAt, 7) ? 'seen-recent' : undefined}>{ago(a.lastSeenAt)}</span> : <span className="muted" title="Aucune ouverture de l’espace depuis la mise en place du suivi">—</span>}</td>
                <td>{a.visits || '—'}</td>
                <td><Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={'account-' + a._id} onClick={() => setOpenId(open ? null : a._id)}>Gérer<ChevronDown className={cn('transition-transform', open && 'rotate-180')} /></Button></td>
            </tr>;
            return open ? [row, <tr key={a._id + '-kits'} className="account-detail"><td colSpan={8} id={'account-' + a._id}><AccountKits account={a} kits={kits} onToast={onToast} /></td></tr>] : [row];
        }) : <tr><td colSpan={8}><Empty text={accounts.length ? 'Aucun compte ne correspond à cette recherche.' : 'Aucun compte pour le moment.'} /></td></tr>}</tbody></table></div>
        <p className="muted help"><MessageCircleQuestion size={14} /> La dernière connexion est relevée à chaque ouverture de l’espace (au plus toutes les 5 minutes) ; une nouvelle visite compte après 30 minutes d’absence. Un compte Admin accède à tout l’atelier. Le compte atelier reste toujours administrateur.</p>
    </>;
}

/** Kits du carnet d'une cliente : progression, origine, ajout et retrait depuis l'atelier. */
function AccountKits({ account: a, kits, onToast }: { account: Account, kits: AdminKit[] | undefined, onToast: (s: string) => void }) {
    const grant = useMutation(anyApi.kits.grant), revoke = useMutation(anyApi.kits.revoke);
    const [pick, setPick] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const owned = new Set(a.kits.map(k => k.kitId)), available = (kits ?? []).filter(k => !owned.has(k._id));
    const who = a.name || a.email;
    const add = async (e: FormEvent) => {
        e.preventDefault(); const kit = available.find(k => k._id === pick); if (!kit) return;
        setBusy(true); setError('');
        try { await grant({ userId: a._id, kitId: kit._id }); setPick(''); onToast(kitStatus(kit) === 'published' ? `Kit ajouté au carnet de ${who}` : `Kit réservé pour ${who} : e-mail à la publication`); }
        catch (err) { setError(errorText(err, 'Le kit n’a pas été ajouté.')); } finally { setBusy(false); }
    };
    const remove = async (k: AccountKit) => {
        if (!await ask({ title: `Retirer « ${k.title} » ?`, description: `Le kit disparaît du carnet de ${who}, avec sa progression et ses notes. Ses questions restent visibles.`, confirmLabel: 'Retirer le kit', destructive: true })) return;
        setError(''); try { await revoke({ userId: a._id, kitId: k.kitId }); onToast('Kit retiré'); } catch (err) { setError(errorText(err, 'Le kit n’a pas été retiré.')); }
    };
    return <div className="account-kits">
        {a.kits.length ? <ul>{a.kits.map(k => <li key={k.kitId}>
            <div className="account-kit-main"><strong>{k.title}</strong><StatusBadge status={k.status} /><span className="chip">{k.source === 'admin' ? 'Offert par l’atelier' : 'Code saisi'}</span></div>
            <div className="account-kit-meta">
                {k.status === 'published' && <span>{k.finishedAt ? `Terminé le ${dateFr(k.finishedAt)}` : `${k.done}/${k.total} leçon${k.total > 1 ? 's' : ''}`}{k.total > 0 && <span className="progress account-progress"><span style={{ width: Math.round(k.done / k.total * 100) + '%' }} /></span>}</span>}
                <span>Ajouté le {dateFr(k.startedAt)}{k.updatedAt - k.startedAt > 60000 ? ` · dernière activité ${ago(k.updatedAt).toLowerCase()}` : ''}</span>
                {k.awaitingRelease ? <span className="kit-warn">E-mail à la publication</span> : k.notifiedAt ? <span>Prévenue le {dateFr(k.notifiedAt)}</span> : null}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Retirer ${k.title} du carnet de ${who}`} onClick={() => void remove(k)}><Trash2 /></Button>
        </li>)}</ul> : <p className="muted">Aucun kit dans ce carnet.</p>}
        <form className="account-grant" onSubmit={add}>
            <label className="filter-field">Ajouter un kit<select value={pick} onChange={e => setPick(e.target.value)} disabled={busy || !available.length}><option value="">{kits ? available.length ? 'Choisir un kit…' : 'Tous les kits sont déjà dans ce carnet' : 'Chargement…'}</option>{available.map(k => <option key={k._id} value={k._id}>{k.title} · {STATUS[kitStatus(k)].label}</option>)}</select></label>
            <Button size="sm" disabled={busy || !pick}><Plus />{busy ? 'Ajout…' : 'Ajouter sans code'}</Button>
        </form>
        <small className="muted">Un kit « À venir » ou en brouillon s’affiche dans son carnet à sa sortie, avec l’e-mail de notification.</small>
        {error && <p role="alert" className="error">{error}</p>}
    </div>;
}
