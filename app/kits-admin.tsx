'use client';
import { useEffect, useState, type FormEvent, type MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpenCheck, ChevronDown, Flower2, GripVertical, MessageCircleQuestion, PlayCircle, Plus, Trash2, Upload, Users } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragCancelEvent, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { ask } from '@/components/confirm-dialog';
import { emptyKit, kitError, newLesson, type KitInput, type KitLanguage, type KitText, type Lesson, type LessonText, type Role } from '../lib/kits';
import { VideoPlayer, errorText, type LessonView } from './client';

type AdminKit = Omit<KitInput, 'lessons'> & { _id: string; revision: number; updatedAt: number; lessons: LessonView[]; stats: { clientes: number; finished: number; openQuestions: number } };
type AdminQuestion = { _id: string; kitTitle: string; lessonTitle: string; authorName: string; authorEmail: string; body: string; createdAt: number; answer: string | null; answeredAt: number | null };
type Account = { _id: string; name: string; email: string; role: Role; locked: boolean; createdAt: number; kits: number };
const dateFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const inputOf = (k: AdminKit): KitInput => ({ title: k.title, description: k.description, coverUrl: k.coverUrl, accessCode: k.accessCode, published: k.published, lessons: k.lessons.map(lessonInput), ...(k.translations ? { translations: k.translations } : {}) });
const lessonInput = ({ id, title, stitch, videoUrl, videoStorageId, notes, translations }: Lesson): Lesson => ({ id, title, stitch, videoUrl, notes, ...(videoStorageId ? { videoStorageId } : {}), ...(translations ? { translations } : {}) });
/** Langue du contenu en cours d'édition : le français d'origine ou l'une de ses traductions. */
type EditLanguage = 'fr' | KitLanguage;
const EDIT_LANGUAGES: { id: EditLanguage, label: string }[] = [{ id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }];
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
    return <>
        <div className="page-tools"><div className="review-note"><BookOpenCheck size={22} /><p>Une leçon par point, avec sa vidéo : lien YouTube non répertorié, Vimeo, ou fichier téléversé. Le code d’activation se glisse dans la boîte ; laissez-le vide pour un accès libre. Seuls les kits publiés sont visibles des clientes.</p></div><div className="filters"><span className="muted">{kits.length} kit{kits.length > 1 ? 's' : ''}</span><span className="spacer" /><Button type="button" onClick={() => onOpenKit('new')}><Plus size={18} />Nouveau kit</Button></div></div>
        {kits.length ? <div className="strategy-grid">{kits.map(k => <button type="button" className="strategy-card admin-kit-card" key={k._id} onClick={() => onOpenKit(k._id)}><div className="card-top"><span className={'badge ' + (k.published ? 'green' : 'orange')}>{k.published ? 'Publié' : 'Brouillon'}</span><small>{k.lessons.length} leçon{k.lessons.length > 1 ? 's' : ''}</small></div><h2>{k.title}</h2><p>{k.description || 'Sans description'}</p><small className="kit-stats"><span>{k.stats.clientes} cliente{k.stats.clientes > 1 ? 's' : ''}</span><span>{k.stats.finished} terminé{k.stats.finished > 1 ? 's' : ''}</span>{k.stats.openQuestions > 0 && <span className="pending-count">{k.stats.openQuestions} question{k.stats.openQuestions > 1 ? 's' : ''} en attente</span>}</small><small>{k.accessCode ? 'Code : ' + k.accessCode : 'Accès libre'}</small></button>)}</div>
            : <section className="panel"><Empty text="Créez votre premier kit pour ouvrir l’espace des brodeuses." /></section>}
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
    useEffect(() => { if (!removed) return; const t = setTimeout(() => setRemoved(null), 10000); return () => clearTimeout(t); }, [removed]);
    const release = () => { leaveGuard.current = async () => true; };
    useEffect(() => {
        leaveGuard.current = async () => { if (!dirty) return true; const ok = await ask({ title: 'Quitter sans enregistrer ?', description: 'Les modifications de ce kit seront perdues.', confirmLabel: 'Quitter sans enregistrer', destructive: true }); if (ok) release(); return ok; };
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
            setDirty(false); setBusy(false); setRemoved(null);
            if (kit) { setRevision(r => (r ?? 0) + 1); onToast('Kit enregistré'); }
            else { release(); onToast('Kit créé'); onCreated(id); }
        } catch (err) { setError(errorText(err, 'Impossible d’enregistrer. Vos modifications restent sur la page.')); setBusy(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    };
    const erase = async () => { if (!kit) return; setBusy(true); try { await remove({ id: kit._id, revision }); release(); onToast('Kit supprimé'); onBack(); } catch (err) { setError(errorText(err, 'La suppression a échoué.')); setBusy(false); setConfirm(false); } };
    const fieldLabel = 'text-xs font-semibold text-muted-foreground';
    return <form className="kit-page" onSubmit={submit}>
        <div className="kit-page-bar">
            <Button type="button" variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => void back()}><ArrowLeft />Kits</Button>
            <div className="kit-page-title"><span className="eyebrow">{kit ? 'MODIFIER LE KIT' : 'NOUVEAU KIT'}</span><h1>{data.title.trim() || 'Sans titre'}</h1></div>
            <span className={'badge ' + (data.published ? 'green' : 'orange')}>{data.published ? 'Publié' : 'Brouillon'}</span>
            <span className="spacer" />
            {dirty && <span className="kit-page-dirty" role="status">Modifications non enregistrées</span>}
            <Button type="button" variant="outline" className="max-[760px]:hidden" disabled={busy} onClick={() => void back()}>{dirty ? 'Annuler' : 'Fermer'}</Button>
            <Button disabled={busy || !!uploading || (!!kit && !dirty)}>{busy ? 'Enregistrement…' : kit ? 'Enregistrer' : 'Créer le kit'}</Button>
        </div>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        <div className="kit-page-grid">
            <div className="kit-page-main">
                <section className="panel kit-languages"><div className="panel-title"><h2>Langue du contenu</h2><div className="segmented" role="group" aria-label="Langue du contenu">{EDIT_LANGUAGES.map(l => <button key={l.id} type="button" lang={l.id} aria-pressed={lang === l.id} className={lang === l.id ? 'selected' : ''} onClick={() => setLang(l.id)}>{l.label}</button>)}</div></div>
                    <p className="muted kit-page-help">{lang === 'fr' ? 'Le titre, la description et le texte des leçons en français. Choisissez English ou Español pour les traduire.' : 'Traduction affichée aux clientes qui consultent le site dans cette langue. Un champ vide reprend le texte français, indiqué en gris.'}</p>
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
                    <div className="flex items-center justify-between gap-4"><Label htmlFor="kit-published" className="leading-snug font-normal">Visible et activable par les clientes</Label><Switch id="kit-published" checked={data.published} onCheckedChange={v => set({ published: v })} /></div>
                    <div className="mt-5 grid gap-1.5"><Label htmlFor="kit-code" className={fieldLabel}>Code d’activation</Label><Input id="kit-code" maxLength={60} value={data.accessCode} placeholder="Vide = accès libre" autoComplete="off" className="h-11 bg-card font-mono tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case" onChange={e => set({ accessCode: e.target.value })} /><small>À imprimer sur la carte glissée dans la boîte. Majuscules, espaces et tirets ne comptent pas.</small></div>
                </section>
                <section className="panel"><div className="panel-title"><h2>Couverture</h2></div>
                    {data.coverUrl && /^https:\/\//.test(data.coverUrl) ? <img className="kit-page-cover" src={data.coverUrl} alt="" /> : <div className="kit-page-cover kit-cover placeholder"><Flower2 size={30} /></div>}
                    <div className="mt-4 grid gap-1.5"><Label htmlFor="kit-cover" className={fieldLabel}>Lien de l’image (https)</Label><Input id="kit-cover" type="url" value={data.coverUrl} placeholder="https://…" className="h-11 bg-card" onChange={e => set({ coverUrl: e.target.value })} /></div>
                </section>
                {kit && <section className="panel"><div className="panel-title"><h2>Suivi</h2></div><dl className="kit-page-stats"><div><dt>Clientes</dt><dd>{kit.stats.clientes}</dd></div><div><dt>Terminés</dt><dd>{kit.stats.finished}</dd></div><div><dt>Questions en attente</dt><dd>{kit.stats.openQuestions}</dd></div></dl><small>Modifié le {dateFr(kit.updatedAt)}</small></section>}
                {kit && <section className="panel kit-page-danger"><div className="panel-title"><h2>Supprimer le kit</h2></div>
                    {confirm ? <><p>La progression de {kit.stats.clientes} cliente{kit.stats.clientes > 1 ? 's' : ''}, les questions et les vidéos téléversées seront effacées. Pour le masquer simplement, désactivez la publication.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Annuler</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void erase()}>Supprimer définitivement</Button></div></>
                        : <><p>Efface le kit, la progression des clientes et leurs questions.</p><Button type="button" variant="outline" className="mt-3 text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirm(true)}><Trash2 />Supprimer…</Button></>}
                </section>}
            </aside>
        </div>
    </form>;
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

export function ClientsAdmin({ onToast }: { onToast: (s: string) => void }) {
    const accounts = useQuery(anyApi.users.list) as Account[] | undefined; const me = useQuery(anyApi.users.me) as { _id: string } | null | undefined;
    const setRole = useMutation(anyApi.users.setRole); const [error, setError] = useState('');
    if (!accounts) return <p className="muted">Chargement des comptes…</p>;
    const change = async (a: Account, role: Role) => { if (role === 'admin' && !await ask(`Donner l’accès complet à l’atelier à ${a.email || a.name} ?`)) return; setError(''); try { await setRole({ userId: a._id, role }); onToast('Rôle mis à jour'); } catch (err) { setError(errorText(err, 'Le rôle n’a pas été modifié.')); } };
    return <>
        <div className="filters"><Users size={18} /><span className="muted">{accounts.filter(a => a.role === 'cliente').length} cliente{accounts.filter(a => a.role === 'cliente').length > 1 ? 's' : ''} · {accounts.filter(a => a.role === 'admin').length} admin</span></div>
        {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Fermer</button></div>}
        <div className="table-scroll"><table><thead><tr>{['Nom', 'E-mail', 'Rôle', 'Kits', 'Inscription'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{accounts.length ? accounts.map(a => <tr key={a._id}><td>{a.name || (a.locked ? 'Compte atelier' : '—')}</td><td>{a.email || '—'}</td><td><select aria-label={'Rôle de ' + (a.email || a.name)} value={a.role} disabled={a.locked || a._id === me?._id} onChange={e => void change(a, e.target.value as Role)}><option value="cliente">Cliente</option><option value="admin">Admin</option></select></td><td>{a.kits}</td><td>{dateFr(a.createdAt)}</td></tr>) : <tr><td colSpan={5}><Empty text="Aucun compte pour le moment." /></td></tr>}</tbody></table></div>
        <p className="muted help"><MessageCircleQuestion size={14} /> Un compte Admin accède à tout l’atelier (calendrier, newsletter, kits). Le compte atelier reste toujours administrateur.</p>
    </>;
}
