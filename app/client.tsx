'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ask as confirmAsk } from '@/components/confirm-dialog';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ConvexError } from 'convex/values';
import { useAuthActions } from '@convex-dev/auth/react';
import { ArrowLeft, ArrowRight, BookHeart, Check, CheckCircle2, Circle, Flower2, KeyRound, LogOut, MessageCircleQuestion, Plus, PlayCircle, Sparkles, Trash2 } from 'lucide-react';
import { progressPercent, videoSource, type Lesson, type Role } from '../lib/kits';
import Loader from './loader';
import Brand from './brand';
import { MobileNav, type NavGroup } from '@/components/app-nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type Me = { _id: string; name: string; email: string; role: Role };
export type LessonView = Lesson & { videoFileUrl: string | null };
type MyKit = { kit: { _id: string; title: string; description: string; coverUrl: string; lessons: LessonView[] }; progress: { completed: string[]; notes: string; startedAt: number; updatedAt: number; finishedAt: number | null } };
type CatalogKit = { _id: string; title: string; description: string; coverUrl: string; lessonCount: number; stitches: string[]; needsCode: boolean; owned: boolean };
type Question = { _id: string; lessonId: string; authorName: string; body: string; createdAt: number; answer: string | null; answeredAt: number | null; mine: boolean };

export const errorText = (err: unknown, fallback: string) => err instanceof ConvexError && typeof err.data === 'string' ? err.data : fallback;
const dateFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const doneCount = (k: MyKit) => k.kit.lessons.filter(l => k.progress.completed.includes(l.id)).length;

export default function ClientSpace({ me }: { me: Me }) {
    const kits = useQuery(anyApi.kits.mine) as MyKit[] | undefined;
    const catalog = useQuery(anyApi.kits.catalog) as CatalogKit[] | undefined;
    const { signOut } = useAuthActions();
    const [view, setView] = useState<'kits' | 'catalogue'>('kits'), [kitId, setKitId] = useState<string | null>(null), [toast, setToast] = useState('');
    useEffect(() => { const p = new URLSearchParams(location.search); setKitId(p.get('kit')); if (p.get('vue') === 'catalogue') setView('catalogue'); }, []);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
    const go = (next: { view?: 'kits' | 'catalogue', kit?: string | null }) => {
        const v = next.view ?? 'kits', k = next.kit ?? null; setView(v); setKitId(k);
        history.replaceState(null, '', k ? '?kit=' + encodeURIComponent(k) : v === 'catalogue' ? '?vue=catalogue' : location.pathname); window.scrollTo(0, 0);
    };
    if (!kits || !catalog) return <Loader message="Préparation de votre carnet…" />;
    const firstName = me.name.split(/\s+/)[0] || 'brodeuse';
    const navGroups: NavGroup[] = [{ items: [{ label: 'Mes kits', icon: BookHeart }, { label: 'Ajouter un kit', icon: Plus }] }];
    const current = view === 'catalogue' ? 'Ajouter un kit' : 'Mes kits';
    const select = (label: string) => go({ view: label === 'Ajouter un kit' ? 'catalogue' : 'kits' });
    const open = kits.find(k => k.kit._id === kitId);
    const toDiscover = catalog.filter(k => !k.owned);
    return <div className="client">
        <header className="client-bar"><a className="brand" href="/"><Brand label="MON CARNET" /></a>
            <nav>{navGroups[0]!.items.map(({ label, icon: Icon }) => <Button key={label} type="button" variant="ghost" aria-current={current === label ? 'page' : undefined} className={cn('text-muted-foreground', current === label && 'bg-accent font-semibold text-accent-foreground')} onClick={() => select(label)}><Icon size={16} />{label}</Button>)}</nav>
            <div className="client-user"><span className="avatar">{firstName[0]!.toUpperCase()}</span><span className="client-name">{me.name || me.email}</span><Button variant="ghost" size="icon" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => void signOut()}><LogOut /></Button></div>
        </header>
        <MobileNav label="MON CARNET" title={open ? open.kit.title : current} groups={navGroups} current={open ? '' : current} onSelect={select} footer={<div className="flex flex-col gap-1"><div className="flex items-center gap-3 px-2 py-2"><span className="avatar">{firstName[0]!.toUpperCase()}</span><span className="truncate text-sm">{me.name || me.email}</span></div><Button variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={() => void signOut()}><LogOut />Déconnexion</Button></div>} />
        <main className="client-main">
            {open ? <KitView key={open.kit._id} item={open} onBack={() => go({ view: 'kits' })} onToast={setToast} />
                : view === 'catalogue' ? <Catalogue kits={toDiscover} onActivated={id => { setToast('Kit ajouté à votre carnet. Bonne broderie !'); go({ kit: id }); }} />
                    : <Dashboard firstName={firstName} kits={kits} hasCatalogue={toDiscover.length > 0} onOpen={id => go({ kit: id })} onAdd={() => go({ view: 'catalogue' })} />}
        </main>
        {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>;
}

function Dashboard({ firstName, kits, hasCatalogue, onOpen, onAdd }: { firstName: string, kits: MyKit[], hasCatalogue: boolean, onOpen: (id: string) => void, onAdd: () => void }) {
    const finished = kits.filter(k => k.kit.lessons.length && doneCount(k) === k.kit.lessons.length);
    const stitches = new Set(kits.flatMap(k => k.kit.lessons.filter(l => l.stitch && k.progress.completed.includes(l.id)).map(l => l.stitch.toLowerCase())));
    return <>
        <div className="page-heading"><div><div className="eyebrow">MON CARNET DE BRODERIE</div><h1>Bonjour {firstName}.</h1><p>Reprenez votre ouvrage là où vous l’avez laissé.</p></div></div>
        <section className="stats"><Stat label="Kits en cours" value={kits.length - finished.length} /><Stat label="Kits terminés" value={finished.length} /><Stat label="Points appris" value={stitches.size} /><Stat label="Leçons brodées" value={kits.reduce((n, k) => n + doneCount(k), 0)} /></section>
        {kits.length ? <div className="kit-grid">{kits.map(k => { const done = doneCount(k), total = k.kit.lessons.length, next = k.kit.lessons.find(l => !k.progress.completed.includes(l.id)); return <button type="button" key={k.kit._id} className="kit-card" onClick={() => onOpen(k.kit._id)}>
            <Cover url={k.kit.coverUrl} />
            <div className="kit-card-body"><div className="card-top"><span className={'badge ' + (total && done === total ? 'green' : 'blue')}>{total && done === total ? 'Terminé' : done ? 'En cours' : 'À commencer'}</span><small>{done}/{total} leçons</small></div><h3>{k.kit.title}</h3><div className="progress"><span style={{ width: progressPercent(done, total) + '%' }} /></div><p>{next ? <>Prochaine étape : <strong>{next.title}</strong></> : 'Bravo, votre ouvrage est terminé !'}</p><span className="edit-link">{done ? 'Reprendre' : 'Commencer'} <ArrowRight size={15} /></span></div>
        </button>; })}</div>
            : <section className="panel client-empty"><Sparkles size={28} /><h2>Votre premier kit vous attend.</h2><p>Ajoutez-le avec le code glissé dans sa boîte pour accéder aux vidéos de chaque point.</p><Button onClick={onAdd}><Plus size={17} />Ajouter un kit</Button></section>}
        {kits.length > 0 && hasCatalogue && <Button type="button" variant="outline" className="add-kit-link" onClick={onAdd}><Plus size={16} />Ajouter un autre kit</Button>}
    </>;
}

function Catalogue({ kits, onActivated }: { kits: CatalogKit[], onActivated: (id: string) => void }) {
    return <>
        <div className="page-heading"><div><div className="eyebrow">AJOUTER UN KIT</div><h1>Activez votre kit.</h1><p>Le code se trouve sur la carte glissée dans votre boîte.</p></div></div>
        {kits.length ? <div className="kit-grid">{kits.map(k => <ActivateCard key={k._id} kit={k} onActivated={onActivated} />)}</div> : <section className="panel client-empty"><Flower2 size={28} /><p>Tous les kits disponibles sont déjà dans votre carnet.</p></section>}
    </>;
}

function ActivateCard({ kit, onActivated }: { kit: CatalogKit, onActivated: (id: string) => void }) {
    const activate = useMutation(anyApi.kits.activate); const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await activate({ kitId: kit._id, code }); onActivated(kit._id); } catch (err) { setError(errorText(err, 'L’activation a échoué. Réessayez.')); setBusy(false); } };
    return <article className="kit-card static"><Cover url={kit.coverUrl} /><div className="kit-card-body"><div className="card-top"><small>{kit.lessonCount} leçon{kit.lessonCount > 1 ? 's' : ''} vidéo</small></div><h3>{kit.title}</h3>{kit.description && <p>{kit.description}</p>}{kit.stitches.length > 0 && <div className="chips">{kit.stitches.map(s => <span key={s} className="chip">{s}</span>)}</div>}
        <form className="activate-form" onSubmit={submit}>{kit.needsCode && <label className="code-field"><KeyRound size={16} /><input value={code} onChange={e => setCode(e.target.value)} required placeholder="Code d’activation" aria-label={'Code d’activation pour ' + kit.title} autoComplete="off" autoCapitalize="characters" disabled={busy} /></label>}<Button disabled={busy}>{busy ? 'Activation…' : 'Ajouter à mes kits'}</Button></form>
        {error && <p role="alert" className="error">{error}</p>}</div></article>;
}

function KitView({ item, onBack, onToast }: { item: MyKit, onBack: () => void, onToast: (s: string) => void }) {
    const { kit, progress } = item; const setLesson = useMutation(anyApi.kits.setLesson);
    const [current, setCurrent] = useState(() => (kit.lessons.find(l => !progress.completed.includes(l.id)) ?? kit.lessons[0])?.id ?? '');
    const [error, setError] = useState('');
    const lesson = kit.lessons.find(l => l.id === current) ?? kit.lessons[0];
    const index = lesson ? kit.lessons.indexOf(lesson) : -1;
    const done = doneCount(item), total = kit.lessons.length, percent = progressPercent(done, total);
    const toggle = async (id: string, value: boolean) => { setError(''); try { await setLesson({ kitId: kit._id, lessonId: id, done: value }); if (value && kit.lessons.every(l => l.id === id || progress.completed.includes(l.id))) onToast('Ouvrage terminé. Bravo !'); } catch (err) { setError(errorText(err, 'La progression n’a pas été enregistrée. Réessayez.')); } };
    const markAndNext = async () => { if (!lesson) return; await toggle(lesson.id, true); const next = kit.lessons.slice(index + 1).find(l => !progress.completed.includes(l.id)) ?? kit.lessons[index + 1]; if (next) { setCurrent(next.id); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    return <>
        <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={16} />Mes kits</button>
        <div className="page-heading kit-heading"><div><div className="eyebrow">{progress.finishedAt ? 'OUVRAGE TERMINÉ · ' + dateFr(progress.finishedAt).toUpperCase() : 'COMMENCÉ LE ' + dateFr(progress.startedAt).toUpperCase()}</div><h1>{kit.title}</h1>{kit.description && <p>{kit.description}</p>}</div><div className="kit-meter" aria-label={`Progression : ${percent} %`}><strong>{percent}<small>%</small></strong><span>{done}/{total} leçons</span><div className="progress"><span style={{ width: percent + '%' }} /></div></div></div>
        {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Fermer</button></div>}
        {lesson ? <div className="lesson-layout">
            <section className="lesson-main panel"><VideoPlayer lesson={lesson} /><div className="lesson-info"><div className="card-top"><span className="eyebrow">LEÇON {index + 1} / {total}</span>{lesson.stitch && <span className="chip">{lesson.stitch}</span>}</div><h2>{lesson.title}</h2>{lesson.notes && <p className="lesson-notes">{lesson.notes}</p>}
                <div className="lesson-actions">{progress.completed.includes(lesson.id) ? <Button type="button" variant="outline" onClick={() => void toggle(lesson.id, false)}><CheckCircle2 size={17} />Brodé · annuler</Button> : <Button type="button" onClick={() => void markAndNext()}><Check size={17} />J’ai brodé ce point</Button>}<span className="spacer" /><Button type="button" variant="outline" disabled={index <= 0} onClick={() => setCurrent(kit.lessons[index - 1]!.id)}><ArrowLeft size={16} />Précédente</Button><Button type="button" variant="outline" disabled={index >= total - 1} onClick={() => setCurrent(kit.lessons[index + 1]!.id)}>Suivante<ArrowRight size={16} /></Button></div></div></section>
            <aside className="lesson-list panel"><div className="panel-title"><h2>Les points</h2><span className="muted">{done}/{total}</span></div><ol>{kit.lessons.map((l, i) => { const ok = progress.completed.includes(l.id); return <li key={l.id} className={(l.id === lesson.id ? 'current ' : '') + (ok ? 'done' : '')}><button type="button" className="lesson-check" aria-label={(ok ? 'Marquer comme à faire : ' : 'Marquer comme brodé : ') + l.title} aria-pressed={ok} onClick={() => void toggle(l.id, !ok)}>{ok ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button><button type="button" className="lesson-link" onClick={() => setCurrent(l.id)}><small>{String(i + 1).padStart(2, '0')}{l.stitch ? ' · ' + l.stitch : ''}</small><span>{l.title}</span></button>{l.id === lesson.id && <PlayCircle size={16} className="lesson-playing" />}</li>; })}</ol></aside>
        </div> : <section className="panel client-empty"><p>Les leçons de ce kit arrivent très bientôt.</p></section>}
        <Notes kitId={kit._id} initial={progress.notes} />
        <QuestionsPanel kitId={kit._id} lessons={kit.lessons} currentLesson={lesson?.id ?? ''} />
    </>;
}

function Notes({ kitId, initial }: { kitId: string, initial: string }) {
    const save = useMutation(anyApi.kits.saveNotes); const [notes, setNotes] = useState(initial), [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('');
    const persist = async () => { if (notes === initial) return; setState('saving'); try { await save({ kitId, notes }); setState('saved'); } catch { setState('error'); } };
    return <section className="panel notes-panel"><div className="panel-title"><h2>Mes notes</h2><span className="muted" role="status">{state === 'saving' ? 'Enregistrement…' : state === 'saved' ? 'Enregistré' : state === 'error' ? 'Non enregistré, réessayez' : 'Enregistrées automatiquement'}</span></div><textarea rows={4} maxLength={5000} value={notes} placeholder="Fils utilisés, tension, idées pour la suite…" aria-label="Mes notes sur ce kit" onChange={e => { setNotes(e.target.value); setState(''); }} onBlur={() => void persist()} /></section>;
}

function QuestionsPanel({ kitId, lessons, currentLesson }: { kitId: string, lessons: LessonView[], currentLesson: string }) {
    const questions = useQuery(anyApi.kits.questions, { kitId }) as Question[] | undefined;
    const ask = useMutation(anyApi.kits.ask), remove = useMutation(anyApi.kits.removeQuestion);
    const [body, setBody] = useState(''), [lessonId, setLessonId] = useState(currentLesson), [filter, setFilter] = useState<'all' | 'lesson'>('all'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => setLessonId(currentLesson), [currentLesson]);
    const title = (id: string) => lessons.find(l => l.id === id)?.title;
    const shown = (questions ?? []).filter(q => filter === 'all' || q.lessonId === currentLesson);
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await ask({ kitId, lessonId, body }); setBody(''); } catch (err) { setError(errorText(err, 'Votre question n’a pas été envoyée. Réessayez.')); } finally { setBusy(false); } };
    return <section className="panel qa-panel" id="questions"><div className="panel-title"><h2><MessageCircleQuestion size={19} />Questions et réponses</h2><div className="segmented"><button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>Tout le kit</button><button type="button" className={filter === 'lesson' ? 'selected' : ''} onClick={() => setFilter('lesson')}>Cette leçon</button></div></div>
        <form className="ask-form" onSubmit={submit}><textarea rows={3} maxLength={2000} required value={body} onChange={e => setBody(e.target.value)} placeholder="Un point qui résiste ? Posez votre question, Émilie vous répond." aria-label="Votre question" disabled={busy} /><div className="ask-row"><label className="filter-field">Leçon<select value={lessonId} onChange={e => setLessonId(e.target.value)}><option value="">Tout le kit</option>{lessons.map((l, i) => <option key={l.id} value={l.id}>{i + 1}. {l.title}</option>)}</select></label><Button disabled={busy || body.trim().length < 3}>{busy ? 'Envoi…' : 'Poser ma question'}</Button></div>{error && <p role="alert" className="error">{error}</p>}</form>
        {!questions ? <p className="muted">Chargement des questions…</p> : shown.length ? <ul className="qa-list">{shown.map(q => <li key={q._id} className="qa-item">
            <div className="qa-question"><div className="qa-meta"><strong>{q.mine ? 'Vous' : q.authorName}</strong><small>{dateFr(q.createdAt)}{q.lessonId && title(q.lessonId) ? ' · ' + title(q.lessonId) : ''}</small>{q.mine && !q.answer && <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Supprimer ma question" onClick={async () => { if (await confirmAsk('Supprimer cette question ?')) void remove({ id: q._id }); }}><Trash2 size={15} /></Button>}</div><p>{q.body}</p></div>
            {q.answer ? <div className="qa-answer"><div className="qa-meta"><strong><img className="qa-symbol" src="/brand/symbole.svg" alt="" />Émilie · Faïença</strong>{q.answeredAt && <small>{dateFr(q.answeredAt)}</small>}</div><p>{q.answer}</p></div> : <p className="qa-pending">En attente de réponse</p>}
        </li>)}</ul> : <p className="muted qa-empty">{filter === 'lesson' ? 'Aucune question sur cette leçon pour l’instant.' : 'Aucune question pour l’instant. Soyez la première !'}</p>}
    </section>;
}

export function VideoPlayer({ lesson }: { lesson: { title: string, videoUrl: string, videoFileUrl: string | null } }) {
    if (lesson.videoFileUrl) return <div className="video-frame"><video key={lesson.videoFileUrl} src={lesson.videoFileUrl} controls preload="metadata" playsInline /></div>;
    const source = lesson.videoUrl ? videoSource(lesson.videoUrl) : null;
    if (source?.type === 'iframe') return <div className="video-frame"><iframe key={source.src} src={source.src} title={'Vidéo : ' + lesson.title} loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>;
    if (source?.type === 'video') return <div className="video-frame"><video key={source.src} src={source.src} controls preload="metadata" playsInline /></div>;
    return <div className="video-frame video-empty"><PlayCircle size={34} />{lesson.videoUrl ? <a href={lesson.videoUrl} target="_blank" rel="noreferrer">Ouvrir la vidéo dans un nouvel onglet</a> : <span>Vidéo bientôt disponible</span>}</div>;
}

function Cover({ url }: { url: string }) { return url ? <img className="kit-cover" src={url} alt="" loading="lazy" /> : <div className="kit-cover placeholder"><Flower2 size={34} /></div>; }
function Stat({ label, value }: { label: string, value: number }) { return <div className="stat"><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div>; }
