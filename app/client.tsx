'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ask as confirmAsk } from '@/components/confirm-dialog';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ConvexError } from 'convex/values';
import { useAuthActions } from '@convex-dev/auth/react';
import { ArrowLeft, ArrowRight, BookHeart, Check, CheckCircle2, Circle, Clock3, Flower2, KeyRound, Mail, MessageCircleQuestion, Plus, PlayCircle, Send, Sparkles, Trash2 } from 'lucide-react';
import { localizeKit, localizeLesson, progressPercent, videoSource, type KitLanguage, type KitText, type Lesson, type Role, type Translations } from '../lib/kits';
import { takePendingKit, type PendingKit } from '../lib/pending-kit';
import Loader from './loader';
import { AppShell, type NavGroup } from '@/components/app-nav';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { richTextToPlain, sanitizeRichText } from '../lib/rich-text';
import { cn } from '@/lib/utils';
import { fill } from '../lib/i18n';
import { LanguageSwitcher, useI18n } from './i18n';

export type Me = { _id: string; name: string; email: string; role: Role };
export type LessonView = Lesson & { videoFileUrl: string | null };
type MyKit = { kit: { _id: string; title: string; description: string; coverUrl: string; translations?: Translations<KitText>; upcoming?: boolean; lessons: LessonView[] }; progress: { completed: string[]; notes: string; startedAt: number; updatedAt: number; finishedAt: number | null } };
type CatalogKit = { _id: string; title: string; description: string; coverUrl: string; translations?: Translations<KitText>; lessonCount: number; stitches: string[]; stitchTranslations?: Partial<Record<KitLanguage, string[]>>; needsCode: boolean; owned: boolean; upcoming?: boolean };
type Prefill = PendingKit & { error: string };
type Question = { _id: string; lessonId: string; authorName: string; body: string; createdAt: number; answer: string | null; answeredAt: number | null; mine: boolean };

export const errorText = (err: unknown, fallback: string) => err instanceof ConvexError && typeof err.data === 'string' ? err.data : fallback;
const doneCount = (k: MyKit) => k.kit.lessons.filter(l => k.progress.completed.includes(l.id)).length;

export default function ClientSpace({ me }: { me: Me }) {
    const { signOut } = useAuthActions(); const { t: { client: t, loader }, error: errorOf, locale } = useI18n();
    // Contenu des kits dans la langue de l'interface (le français si la traduction manque).
    const kits = (useQuery(anyApi.kits.mine) as MyKit[] | undefined)?.map(k => ({ ...k, kit: { ...localizeKit(k.kit, locale), lessons: k.kit.lessons.map(l => localizeLesson(l, locale)) } }));
    const catalog = (useQuery(anyApi.kits.catalog) as CatalogKit[] | undefined)?.map(k => ({ ...localizeKit(k, locale), stitches: k.stitchTranslations?.[locale as KitLanguage] ?? k.stitches }));
    const [view, setView] = useState<'kits' | 'catalogue'>('kits'), [kitId, setKitId] = useState<string | null>(null), [toast, setToast] = useState('');
    // Lien d’un e-mail (/?kit=<id>) : le kit s’ouvre une fois, puis l’adresse redevient « / ».
    useEffect(() => { const k = new URLSearchParams(location.search).get('kit'); if (k) { setKitId(k); history.replaceState(null, '', location.pathname); } }, []);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
    const go = (next: { view?: 'kits' | 'catalogue', kit?: string | null }) => {
        setView(next.view ?? 'kits'); setKitId(next.kit ?? null); window.scrollTo(0, 0);
    };
    // Lien « Vidéos du kit » de la boutique : active le kit mis de côté, puis l'ouvre.
    const activate = useMutation(anyApi.kits.activate);
    const [prefill, setPrefill] = useState<Prefill | null>(null);
    const pendingHandled = useRef(false);
    // Un kit « À venir » rejoint le carnet sans s'ouvrir : la cliente sera prévenue à sa sortie.
    const added = (id: string) => { if (catalog?.find(k => k._id === id)?.upcoming) { setToast(t.kitReserved); go({ view: 'kits' }); } else { setToast(t.kitAdded); go({ kit: id }); } };
    useEffect(() => {
        if (!kits || !catalog || pendingHandled.current) return;
        pendingHandled.current = true;
        const pending = takePendingKit();
        if (!pending) return;
        if (kits.some(k => k.kit._id === pending.kitId)) { go(kits.some(k => k.kit._id === pending.kitId && k.kit.upcoming) ? { view: 'kits' } : { kit: pending.kitId }); return; }
        activate({ kitId: pending.kitId, code: pending.code })
            .then(() => added(pending.kitId))
            .catch(err => { setPrefill({ ...pending, error: errorOf(err, t.kitAddFailed) }); go({ view: 'catalogue' }); });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, quand le carnet est chargé
    }, [kits, catalog]);
    if (!kits || !catalog) return <Loader message={loader.notebook} />;
    const firstName = me.name.split(/\s+/)[0] || t.defaultName;
    const navGroups: NavGroup[] = [{ items: [{ label: t.myKits, icon: BookHeart }, { label: t.addKit, icon: Plus }] }];
    const current = view === 'catalogue' ? t.addKit : t.myKits;
    const select = (label: string) => go({ view: label === t.addKit ? 'catalogue' : 'kits' });
    const open = kits.find(k => k.kit._id === kitId && !k.kit.upcoming);
    const toDiscover = catalog.filter(k => !k.owned);
    return <AppShell navbar label={t.space} groups={navGroups} current={open ? '' : current} onSelect={select} title={open ? open.kit.title : current} aside={<LanguageSwitcher />}
        user={{ name: me.name || me.email }} onSignOut={() => void signOut()} signOutLabel={t.logout}>
        <main className="client-main">
            {open ? <KitView key={open.kit._id} item={open} onBack={() => go({ view: 'kits' })} onToast={setToast} />
                : view === 'catalogue' ? <Catalogue kits={toDiscover} prefill={prefill} onActivated={added} />
                    : <Dashboard firstName={firstName} kits={kits} hasCatalogue={toDiscover.length > 0} onOpen={id => go({ kit: id })} onAdd={() => go({ view: 'catalogue' })} />}
        </main>
        {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </AppShell>;
}

function Dashboard({ firstName, kits, hasCatalogue, onOpen, onAdd }: { firstName: string, kits: MyKit[], hasCatalogue: boolean, onOpen: (id: string) => void, onAdd: () => void }) {
    const { t: { client: t } } = useI18n();
    const upcoming = kits.filter(k => k.kit.upcoming), ready = kits.filter(k => !k.kit.upcoming);
    const finished = ready.filter(k => k.kit.lessons.length && doneCount(k) === k.kit.lessons.length);
    const stitches = new Set(kits.flatMap(k => k.kit.lessons.filter(l => l.stitch && k.progress.completed.includes(l.id)).map(l => l.stitch.toLowerCase())));
    return <>
        <div className="page-heading"><div><div className="eyebrow">{t.dashboardEyebrow}</div><h1>{fill(t.hello, { name: firstName })}</h1><p>{t.resume}</p></div></div>
        <section className="stats"><Stat label={t.statInProgress} value={ready.length - finished.length} /><Stat label={t.statFinished} value={finished.length} /><Stat label={t.statStitches} value={stitches.size} /><Stat label={t.statLessons} value={kits.reduce((n, k) => n + doneCount(k), 0)} /></section>
        {kits.length ? <div className="kit-grid">{ready.map(k => { const done = doneCount(k), total = k.kit.lessons.length, next = k.kit.lessons.find(l => !k.progress.completed.includes(l.id)); return <button type="button" key={k.kit._id} className="kit-card" onClick={() => onOpen(k.kit._id)}>
            <Cover url={k.kit.coverUrl} />
            <div className="kit-card-body"><div className="card-top"><span className={'badge ' + (total && done === total ? 'green' : 'blue')}>{total && done === total ? t.finished : done ? t.inProgress : t.notStarted}</span><small>{fill(t.lessonsCount, { done, total })}</small></div><h3>{k.kit.title}</h3><div className="progress"><span style={{ width: progressPercent(done, total) + '%' }} /></div><p>{next ? <>{t.nextStep} <strong>{next.title}</strong></> : t.allDone}</p><span className="edit-link">{done ? t.continue : t.start} <ArrowRight size={15} /></span></div>
        </button>; })}{upcoming.map(k => <article key={k.kit._id} className="kit-card static upcoming">
            <Cover url={k.kit.coverUrl} />
            <div className="kit-card-body"><div className="card-top"><span className="badge orange">{t.upcoming}</span></div><h3>{k.kit.title}</h3><p>{t.upcomingOwned}</p></div>
        </article>)}</div>
            : <section className="panel client-empty"><Sparkles size={28} /><h2>{t.firstKitTitle}</h2><p>{t.firstKitBody}</p><Button onClick={onAdd}><Plus size={17} />{t.addKit}</Button></section>}
        {kits.length > 0 && hasCatalogue && <Button type="button" variant="outline" className="add-kit-link" onClick={onAdd}><Plus size={16} />{t.addAnotherKit}</Button>}
    </>;
}

function Catalogue({ kits, prefill, onActivated }: { kits: CatalogKit[], prefill: Prefill | null, onActivated: (id: string) => void }) {
    const { t: { client: t } } = useI18n();
    const requests = useQuery(anyApi.kitRequests.mine) as Record<string, RequestStatus> | undefined;
    // Un lien d'activation (code dans l'adresse) ouvre directement la fiche du kit concerné.
    const [openId, setOpenId] = useState<string | null>(prefill?.kitId ?? null);
    const open = kits.find(k => k._id === openId);
    return <>
        <div className="page-heading"><div><div className="eyebrow">{t.catalogEyebrow}</div><h1>{t.catalogTitle}</h1><p>{t.catalogBody}</p></div></div>
        {kits.length ? <div className="kit-grid">{kits.map(k => <CatalogCard key={k._id} kit={k} request={requests?.[k._id]} onOpen={() => setOpenId(k._id)} />)}</div> : <section className="panel client-empty"><Flower2 size={28} /><p>{t.catalogEmpty}</p></section>}
        {open && <ActivateDialog key={open._id} kit={open} request={requests?.[open._id]} prefill={prefill?.kitId === open._id ? prefill : null} onClose={() => setOpenId(null)} onActivated={onActivated} />}
    </>;
}

type RequestStatus = 'pending' | 'accepted' | 'refused';

/** Carte du catalogue : le début de la description ; la fiche complète s'ouvre au clic. */
function CatalogCard({ kit, request, onOpen }: { kit: CatalogKit, request?: RequestStatus, onOpen: () => void }) {
    const { t: { client: t } } = useI18n();
    const excerpt = richTextToPlain(kit.description);
    return <button type="button" className="kit-card catalog-card" aria-label={fill(t.kitDetails, { title: kit.title })} onClick={onOpen}><Cover url={kit.coverUrl} /><div className="kit-card-body"><div className="card-top">{kit.upcoming && <span className="badge orange">{t.upcoming}</span>}<small>{t.videoLessons(kit.lessonCount)}</small></div><h3>{kit.title}</h3>{excerpt && <p className="kit-excerpt">{excerpt}</p>}
        {request === 'pending' && <p className="request-state"><Clock3 size={14} />{t.requestPending}</p>}
        <span className="edit-link">{t.readMore} <ArrowRight size={15} /></span></div></button>;
}

/** Description mise en forme dans l'atelier (ou texte brut des anciens kits). */
export function RichText({ html, className }: { html: string, className?: string }) {
    return <div className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />;
}

function KitDialogShell({ kit, onClose, top, children }: { kit: { title: string, coverUrl: string, description: string }, onClose: () => void, top?: ReactNode, children?: ReactNode }) {
    const { t: { client: t } } = useI18n();
    return <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="kit-dialog bg-card" closeLabel={t.close} aria-describedby={undefined}>
            {kit.coverUrl ? <img className="kit-dialog-cover" src={kit.coverUrl} alt="" /> : <div className="kit-dialog-cover kit-cover placeholder"><Flower2 size={34} /></div>}
            <div className="kit-dialog-body">
                {top && <div className="card-top">{top}</div>}
                <DialogTitle className="kit-dialog-title">{kit.title}</DialogTitle>
                {kit.description && <RichText html={kit.description} />}
                {children}
            </div>
        </DialogContent>
    </Dialog>;
}

function ActivateDialog({ kit, request, prefill, onClose, onActivated }: { kit: CatalogKit, request?: RequestStatus, prefill: Prefill | null, onClose: () => void, onActivated: (id: string) => void }) {
    const activate = useMutation(anyApi.kits.activate), sendRequest = useMutation(anyApi.kitRequests.request);
    const [code, setCode] = useState(prefill?.code ?? ''), [busy, setBusy] = useState<'' | 'code' | 'request'>(''), [error, setError] = useState(prefill?.error ?? '');
    const [asking, setAsking] = useState(false), [message, setMessage] = useState(''), [sent, setSent] = useState(false);
    const { t: { client: t }, error: errorOf } = useI18n();
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy('code'); setError(''); try { await activate({ kitId: kit._id, code }); onActivated(kit._id); } catch (err) { setError(errorOf(err, t.activationFailed)); setBusy(''); } };
    const submitRequest = async (e: FormEvent) => { e.preventDefault(); setBusy('request'); setError(''); try { await sendRequest({ kitId: kit._id, message }); setSent(true); setAsking(false); } catch (err) { setError(errorOf(err, t.requestFailed)); } finally { setBusy(''); } };
    const pending = sent || request === 'pending';
    return <KitDialogShell kit={kit} onClose={onClose} top={<>{kit.upcoming && <span className="badge orange">{t.upcoming}</span>}<small>{t.videoLessons(kit.lessonCount)}</small></>}>
        {kit.stitches.length > 0 && <div className="chips">{kit.stitches.map(s => <span key={s} className="chip">{s}</span>)}</div>}
        {kit.upcoming && <p className="upcoming-hint">{t.upcomingHint}</p>}
        <div className="kit-dialog-actions">
            <form className="activate-form" onSubmit={submit}>{kit.needsCode && <label className="code-field"><KeyRound size={16} /><input value={code} onChange={e => setCode(e.target.value)} required placeholder={t.activationCode} aria-label={fill(t.activationCodeFor, { title: kit.title })} autoComplete="off" autoCapitalize="characters" disabled={!!busy} /></label>}<Button disabled={!!busy}>{busy === 'code' ? t.activating : t.addToMyKits}</Button></form>
            {error && <p role="alert" className="error">{error}</p>}
            {kit.needsCode && <div className="kit-request">
                {pending ? <p className="request-state" role="status"><Clock3 size={15} />{sent ? t.requestSent : t.requestPending}</p>
                    : asking ? <form className="kit-request-form" onSubmit={submitRequest}>
                        <label htmlFor={'request-' + kit._id}>{t.requestMessage}</label>
                        <textarea id={'request-' + kit._id} rows={3} maxLength={1000} value={message} placeholder={t.requestPlaceholder} disabled={!!busy} autoFocus onChange={e => setMessage(e.target.value)} />
                        <div className="kit-request-row"><Button type="button" variant="ghost" disabled={!!busy} onClick={() => setAsking(false)}>{t.requestCancel}</Button><Button variant="outline" disabled={!!busy}><Send size={15} />{busy === 'request' ? t.requestSending : t.requestSend}</Button></div>
                    </form>
                    : <><p><strong>{t.noCodeTitle}</strong> {t.noCodeBody}</p>{request === 'refused' && <p className="muted">{t.requestRefused}</p>}<Button type="button" variant="outline" onClick={() => { setAsking(true); setError(''); }}><Mail size={15} />{t.requestActivation}</Button></>}
            </div>}
        </div>
    </KitDialogShell>;
}

function KitView({ item, onBack, onToast }: { item: MyKit, onBack: () => void, onToast: (s: string) => void }) {
    const { kit, progress } = item; const setLesson = useMutation(anyApi.kits.setLesson);
    const [current, setCurrent] = useState(() => (kit.lessons.find(l => !progress.completed.includes(l.id)) ?? kit.lessons[0])?.id ?? '');
    const [error, setError] = useState(''), [about, setAbout] = useState(false); const { t: { client: t }, error: errorOf, date } = useI18n();
    const lesson = kit.lessons.find(l => l.id === current) ?? kit.lessons[0];
    const index = lesson ? kit.lessons.indexOf(lesson) : -1;
    const done = doneCount(item), total = kit.lessons.length, percent = progressPercent(done, total);
    const toggle = async (id: string, value: boolean) => { setError(''); try { await setLesson({ kitId: kit._id, lessonId: id, done: value }); if (value && kit.lessons.every(l => l.id === id || progress.completed.includes(l.id))) onToast(t.workFinished); } catch (err) { setError(errorOf(err, t.progressFailed)); } };
    const markAndNext = async () => { if (!lesson) return; await toggle(lesson.id, true); const next = kit.lessons.slice(index + 1).find(l => !progress.completed.includes(l.id)) ?? kit.lessons[index + 1]; if (next) { setCurrent(next.id); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    return <>
        <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={16} />{t.myKits}</button>
        <div className="page-heading kit-heading"><div><div className="eyebrow">{progress.finishedAt ? fill(t.finishedOn, { date: date(progress.finishedAt).toUpperCase() }) : fill(t.startedOn, { date: date(progress.startedAt).toUpperCase() })}</div><h1>{kit.title}</h1>{kit.description && <p className="kit-excerpt">{richTextToPlain(kit.description)}</p>}{kit.description && <button type="button" className="edit-link kit-read-more" onClick={() => setAbout(true)}>{t.readMore} <ArrowRight size={15} /></button>}</div><div className="kit-meter" aria-label={fill(t.progressLabel, { percent })}><strong>{percent}<small>%</small></strong><span>{fill(t.lessonsCount, { done, total })}</span><div className="progress"><span style={{ width: percent + '%' }} /></div></div></div>
        {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>{t.close}</button></div>}
        {lesson ? <div className="lesson-layout">
            <section className="lesson-main panel"><VideoPlayer lesson={lesson} /><div className="lesson-info"><div className="card-top"><span className="eyebrow">{fill(t.lessonOf, { n: index + 1, total })}</span>{lesson.stitch && <span className="chip">{lesson.stitch}</span>}</div><h2>{lesson.title}</h2>{lesson.notes && <p className="lesson-notes">{lesson.notes}</p>}
                <div className="lesson-actions">{progress.completed.includes(lesson.id) ? <Button type="button" variant="outline" onClick={() => void toggle(lesson.id, false)}><CheckCircle2 size={17} />{t.undoDone}</Button> : <Button type="button" onClick={() => void markAndNext()}><Check size={17} />{t.markDone}</Button>}<span className="spacer" /><Button type="button" variant="outline" disabled={index <= 0} onClick={() => setCurrent(kit.lessons[index - 1]!.id)}><ArrowLeft size={16} />{t.previous}</Button><Button type="button" variant="outline" disabled={index >= total - 1} onClick={() => setCurrent(kit.lessons[index + 1]!.id)}>{t.next}<ArrowRight size={16} /></Button></div></div></section>
            <aside className="lesson-list panel"><div className="panel-title"><h2>{t.stitches}</h2><span className="muted">{done}/{total}</span></div><ol>{kit.lessons.map((l, i) => { const ok = progress.completed.includes(l.id); return <li key={l.id} className={(l.id === lesson.id ? 'current ' : '') + (ok ? 'done' : '')}><button type="button" className="lesson-check" aria-label={(ok ? t.markTodo : t.markDoneFor) + l.title} aria-pressed={ok} onClick={() => void toggle(l.id, !ok)}>{ok ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button><button type="button" className="lesson-link" onClick={() => setCurrent(l.id)}><small>{String(i + 1).padStart(2, '0')}{l.stitch ? ' · ' + l.stitch : ''}</small><span>{l.title}</span></button>{l.id === lesson.id && <PlayCircle size={16} className="lesson-playing" />}</li>; })}</ol></aside>
        </div> : <section className="panel client-empty"><p>{t.lessonsSoon}</p></section>}
        {about && <KitDialogShell kit={kit} onClose={() => setAbout(false)} />}
        <Notes kitId={kit._id} initial={progress.notes} />
        <QuestionsPanel kitId={kit._id} lessons={kit.lessons} currentLesson={lesson?.id ?? ''} />
    </>;
}

function Notes({ kitId, initial }: { kitId: string, initial: string }) {
    const save = useMutation(anyApi.kits.saveNotes); const [notes, setNotes] = useState(initial), [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>(''); const { t: { client: t } } = useI18n();
    const persist = async () => { if (notes === initial) return; setState('saving'); try { await save({ kitId, notes }); setState('saved'); } catch { setState('error'); } };
    return <section className="panel notes-panel"><div className="panel-title"><h2>{t.notes}</h2><span className="muted" role="status">{state === 'saving' ? t.saving : state === 'saved' ? t.saved : state === 'error' ? t.saveFailed : t.autoSaved}</span></div><textarea rows={4} maxLength={5000} value={notes} placeholder={t.notesPlaceholder} aria-label={t.notesLabel} onChange={e => { setNotes(e.target.value); setState(''); }} onBlur={() => void persist()} /></section>;
}

function QuestionsPanel({ kitId, lessons, currentLesson }: { kitId: string, lessons: LessonView[], currentLesson: string }) {
    const questions = useQuery(anyApi.kits.questions, { kitId }) as Question[] | undefined;
    const ask = useMutation(anyApi.kits.ask), remove = useMutation(anyApi.kits.removeQuestion);
    const [body, setBody] = useState(''), [lessonId, setLessonId] = useState(currentLesson), [filter, setFilter] = useState<'all' | 'lesson'>('all'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const { t: { client: t, auth: { sending } }, error: errorOf, date } = useI18n();
    useEffect(() => setLessonId(currentLesson), [currentLesson]);
    const title = (id: string) => lessons.find(l => l.id === id)?.title;
    const shown = (questions ?? []).filter(q => filter === 'all' || q.lessonId === currentLesson);
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await ask({ kitId, lessonId, body }); setBody(''); } catch (err) { setError(errorOf(err, t.askFailed)); } finally { setBusy(false); } };
    return <section className="panel qa-panel" id="questions"><div className="panel-title"><h2><MessageCircleQuestion size={19} />{t.qa}</h2><div className="segmented"><button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>{t.wholeKit}</button><button type="button" className={filter === 'lesson' ? 'selected' : ''} onClick={() => setFilter('lesson')}>{t.thisLesson}</button></div></div>
        <form className="ask-form" onSubmit={submit}><textarea rows={3} maxLength={2000} required value={body} onChange={e => setBody(e.target.value)} placeholder={t.askPlaceholder} aria-label={t.askLabel} disabled={busy} /><div className="ask-row"><label className="filter-field">{t.lesson}<select value={lessonId} onChange={e => setLessonId(e.target.value)}><option value="">{t.wholeKit}</option>{lessons.map((l, i) => <option key={l.id} value={l.id}>{i + 1}. {l.title}</option>)}</select></label><Button disabled={busy || body.trim().length < 3}>{busy ? sending : t.ask}</Button></div>{error && <p role="alert" className="error">{error}</p>}</form>
        {!questions ? <p className="muted">{t.loadingQuestions}</p> : shown.length ? <ul className="qa-list">{shown.map(q => <li key={q._id} className="qa-item">
            <div className="qa-question"><div className="qa-meta"><strong>{q.mine ? t.you : q.authorName}</strong><small>{date(q.createdAt)}{q.lessonId && title(q.lessonId) ? ' · ' + title(q.lessonId) : ''}</small>{q.mine && !q.answer && <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={t.deleteQuestion} onClick={async () => { if (await confirmAsk({ description: t.confirmDeleteQuestion, destructive: true })) void remove({ id: q._id }); }}><Trash2 size={15} /></Button>}</div><p>{q.body}</p></div>
            {q.answer ? <div className="qa-answer"><div className="qa-meta"><strong><img className="qa-symbol" src="/brand/symbole.svg" alt="" />Émilie · Faïença</strong>{q.answeredAt && <small>{date(q.answeredAt)}</small>}</div><p>{q.answer}</p></div> : <p className="qa-pending">{t.pending}</p>}
        </li>)}</ul> : <p className="muted qa-empty">{filter === 'lesson' ? t.noLessonQuestion : t.noQuestion}</p>}
    </section>;
}

export function VideoPlayer({ lesson }: { lesson: { title: string, videoUrl: string, videoFileUrl: string | null } }) {
    const { t: { client: t } } = useI18n();
    if (lesson.videoFileUrl) return <div className="video-frame"><video key={lesson.videoFileUrl} src={lesson.videoFileUrl} controls preload="metadata" playsInline /></div>;
    const source = lesson.videoUrl ? videoSource(lesson.videoUrl) : null;
    if (source?.type === 'iframe') return <div className="video-frame"><iframe key={source.src} src={source.src} title={fill(t.video, { title: lesson.title })} loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>;
    if (source?.type === 'video') return <div className="video-frame"><video key={source.src} src={source.src} controls preload="metadata" playsInline /></div>;
    return <div className="video-frame video-empty"><PlayCircle size={34} />{lesson.videoUrl ? <a href={lesson.videoUrl} target="_blank" rel="noreferrer">{t.openVideo}</a> : <span>{t.videoSoon}</span>}</div>;
}

function Cover({ url }: { url: string }) { return url ? <img className="kit-cover" src={url} alt="" loading="lazy" /> : <div className="kit-cover placeholder"><Flower2 size={34} /></div>; }
function Stat({ label, value }: { label: string, value: number }) { return <div className="stat"><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div>; }
