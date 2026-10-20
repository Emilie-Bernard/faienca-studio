'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { useAuthActions } from '@convex-dev/auth/react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, Circle, ClipboardList, Flag, Flower2, Hammer, Library as LibraryIcon, Lightbulb, MessageSquareText, Newspaper, NotebookPen, Paperclip, Send } from 'lucide-react';
import { groupByPhase, missionStatusLabels, percentDone, traineeStatuses, type MissionStatus } from '../lib/stage';
import Loader from './loader';
import { AppShell, type NavGroup } from '@/components/app-nav';
import { errorText, type Me } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';
import { Library } from './library';
import { Veille } from './veille';
import { TraineeProjects } from './stage-projects';
import { useLocalDraft } from './local-draft';

export type TraineeMission = {
    _id: string; title: string; description: string; phase: string; dueDate: string; resources: FileView[];
    progress: { status: MissionStatus; notes: string; deliverables: FileView[]; feedback: string; updatedAt: number | null };
};
export const statusBadge: Record<MissionStatus, string> = { todo: '', doing: 'blue', submitted: 'orange', validated: 'green' };
export const dueLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

type Tab = 'missions' | 'projects' | 'library' | 'veille';
const VIEW_KEY = 'faienca-stage-view';
const AUTOSAVE_MS = 5 * 60 * 1000;
/** Onglet et mission ouverts, gardés pour cet onglet du navigateur : un rechargement ramène au même endroit, sans rien dans l'adresse. */
function readView(): { tab: Tab, missionId: string | null } {
    try { const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? 'null') as { tab?: Tab, missionId?: string | null } | null; if (v?.tab) return { tab: v.tab, missionId: v.missionId ?? null }; } catch { /* stockage indisponible */ }
    return { tab: 'missions', missionId: null };
}

export default function TraineeSpace({ me }: { me: Me }) {
    const { signOut } = useAuthActions();
    const missions = useQuery(anyApi.stage.mine) as TraineeMission[] | undefined;
    const [openId, setOpenId] = useState<string | null>(null), [toast, setToast] = useState(''), [tab, setTab] = useState<Tab>('missions'), [ready, setReady] = useState(false);
    useEffect(() => { const v = readView(); setTab(v.tab); setOpenId(v.missionId); setReady(true); }, []);
    useEffect(() => { if (ready) try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ tab, missionId: openId })); } catch { /* stockage indisponible */ } }, [ready, tab, openId]);
    const openMission = (id: string | null) => { setOpenId(id); window.scrollTo(0, 0); };
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
    if (!missions || !ready) return <Loader message="Chargement de votre stage…" />;
    const open = tab === 'missions' ? missions.find(m => m._id === openId) : undefined;
    const firstName = me.name.split(/\s+/)[0] || 'toi';
    const statuses = missions.map(m => m.progress.status);
    const count = (s: MissionStatus) => statuses.filter(x => x === s).length;
    const next = missions.find(m => m.progress.status === 'doing') ?? missions.find(m => m.progress.status === 'todo');
    const tabs = [['missions', 'Mes missions', ClipboardList], ['projects', 'Mes projets', Lightbulb], ['library', 'Bibliothèque', LibraryIcon], ['veille', 'Veille textile', Newspaper]] as const;
    const navGroups: NavGroup[] = [{ items: tabs.map(([, label, icon]) => ({ label, icon })) }];
    const current = tabs.find(([id]) => id === tab)![1];
    return <AppShell navbar label="STAGE" groups={navGroups} current={current} onSelect={label => { setTab(tabs.find(([, l]) => l === label)![0]); openMission(null); }} title={open ? open.title : current}
        user={{ name: me.name || me.email, detail: 'Stagiaire' }} onSignOut={() => void signOut()} signOutLabel="Déconnexion">
        <main className="client-main">{tab === 'veille' ? <>
            <div className="page-heading"><div><div className="eyebrow">VEILLE TEXTILE</div><h1>Veille textile</h1><p>Les brodeuses d’art et les nouvelles du monde textile. Lance une recherche : l’agent prépare le portrait.</p></div></div>
            <Veille onToast={setToast} /></> : tab === 'library' ? <>
            <div className="page-heading"><div><div className="eyebrow">BIBLIOTHÈQUE</div><h1>Bibliothèque</h1><p>Les documents partagés avec l’atelier. Tu peux aussi y ajouter les tiens.</p></div></div>
            <Library onToast={setToast} /></> : tab === 'projects' ? <>
            <div className="page-heading"><div><div className="eyebrow">MES PROJETS</div><h1>Mes projets</h1><p>Tes idées et les projets que tu portes toi-même. Ajoute tes documents et tes questions : l’atelier les voit.</p></div></div>
            <TraineeProjects onToast={setToast} /></> : open ? <MissionPage key={open._id} mission={open} onBack={() => openMission(null)} onToast={setToast} /> : <>
            <div className="page-heading"><div><div className="eyebrow">MON STAGE</div><h1>Bonjour {firstName}</h1><p>Voici tes missions. Avance à ton rythme : les dates sont des repères, pas des échéances.</p></div></div>
            <section className="stats"><Stat label="Missions" value={missions.length} /><Stat label="En cours" value={count('doing')} /><Stat label="À relire" value={count('submitted')} /><Stat label="Validées" value={count('validated')} /></section>
            {missions.length > 0 && <div className="progress" role="img" aria-label={`Avancement : ${percentDone(statuses)} %`}><span style={{ width: percentDone(statuses) + '%' }} /></div>}
            {next && <p className="muted">Prochaine étape : <button type="button" className="edit-link inline-link" onClick={() => openMission(next._id)}>{next.title}</button></p>}
            {missions.length ? groupByPhase(missions).map(g => <section key={g.phase} className="stage-phase"><h2>{g.phase}</h2>
                {g.missions.map(m => <MissionRow key={m._id} mission={m} onOpen={() => openMission(m._id)} />)}</section>)
                : <section className="panel client-empty"><Flower2 size={28} /><p>Aucune mission pour le moment. Elles apparaîtront ici dès qu’elles seront prêtes.</p></section>}
        </>}</main>
        {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </AppShell>;
}

function Stat({ label, value }: { label: string, value: number }) { return <div className="stat"><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div>; }

/** Ligne de la liste : ouvre la page de la mission. */
function MissionRow({ mission: m, onOpen }: { mission: TraineeMission, onOpen: () => void }) {
    const { status } = m.progress;
    return <article className="panel stage-mission">
        <button type="button" className="stage-mission-head" onClick={onOpen}>
            <span className="stage-mission-title"><strong>{m.title}</strong>{m.dueDate && <small><CalendarDays size={13} />Repère : {dueLabel(m.dueDate)}</small>}</span>
            {m.progress.feedback && status !== 'validated' && <MessageSquareText size={16} aria-label="Commentaire de l’atelier" />}
            <span className={'badge ' + statusBadge[status]}>{missionStatusLabels[status]}</span>
            <ChevronRight size={18} />
        </button>
    </article>;
}

const stepInfo = {
    todo: { icon: Circle, title: 'À faire', hint: 'Pas encore commencée' },
    doing: { icon: Hammer, title: 'En cours', hint: 'J’y travaille' },
    submitted: { icon: Send, title: 'J’ai terminé', hint: 'L’atelier relit' },
} satisfies Record<(typeof traineeStatuses)[number], { icon: typeof Circle, title: string, hint: string }>;
const timeFr =(t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Page d'une mission. Les notes sont gardées dans ce navigateur à chaque frappe (rien n'est perdu au rechargement)
 * et envoyées à l'atelier en quittant le champ, en revenant à la liste, ou toutes les 5 minutes s'il y a du nouveau.
 */
function MissionPage({ mission: m, onBack, onToast }: { mission: TraineeMission, onBack: () => void, onToast: (s: string) => void }) {
    const setStatus = useMutation(anyApi.stage.setStatus), saveNotes = useMutation(anyApi.stage.saveNotes), addFile = useMutation(anyApi.stage.addDeliverable), removeFile = useMutation(anyApi.stage.removeDeliverable), uploadUrl = useMutation(anyApi.stage.generateUploadUrl);
    const { status } = m.progress; const locked = status === 'validated';
    const [notes, setNotes] = useState(m.progress.notes), [error, setError] = useState(''), [savedAt, setSavedAt] = useState<number | null>(null), [saving, setSaving] = useState(false);
    const dirty = notes !== m.progress.notes;
    const { restored } = useLocalDraft({ key: 'faienca-mission-notes-' + m._id, revision: m.progress.updatedAt, data: notes, dirty, onRestore: setNotes });
    const fail = (err: unknown, fallback: string) => setError(errorText(err, fallback));
    const choose = async (next: MissionStatus) => { setError(''); try { await setStatus({ missionId: m._id, status: next }); if (next === 'submitted') onToast('Mission envoyée en relecture'); } catch (err) { fail(err, 'Le statut n’a pas été modifié.'); } };
    const persistNotes = async (quiet = false) => {
        if (!dirty || saving) return;
        setError(''); setSaving(true);
        try { await saveNotes({ missionId: m._id, notes }); setSavedAt(Date.now()); if (!quiet) onToast('Notes enregistrées'); }
        catch (err) { fail(err, 'Les notes n’ont pas été enregistrées. Elles restent gardées dans ce navigateur.'); }
        finally { setSaving(false); }
    };
    // Sauvegarde automatique : seulement tant que la page est ouverte, et seulement si les notes ont changé.
    const latest = useRef(persistNotes); latest.current = persistNotes;
    useEffect(() => { const id = setInterval(() => void latest.current(true), AUTOSAVE_MS); return () => clearInterval(id); }, []);
    const back = async () => { await persistNotes(true); onBack(); };
    const hint = saving ? 'Enregistrement…'
        : dirty ? (restored ? 'Brouillon retrouvé dans ce navigateur : il partira à l’atelier en quittant le champ, ou dans 5 minutes au plus.' : 'Gardées dans ce navigateur. Envoyées à l’atelier en quittant le champ, et toutes les 5 minutes.')
        : savedAt ? `Enregistrées à ${timeFr(savedAt)}.` : 'Enregistrées automatiquement.';
    return <div className="stage-mission-page">
        <button type="button" className="back-link" onClick={() => void back()}><ArrowLeft size={16} />Mes missions</button>
        <div className="page-heading"><div>
            <div className="eyebrow">{m.phase.toUpperCase()}</div>
            <h1>{m.title}</h1>
            <p className="flex flex-wrap items-center gap-3"><span className={'badge ' + statusBadge[status]}>{missionStatusLabels[status]}</span>{m.dueDate && <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />Repère : {dueLabel(m.dueDate)}</span>}</p>
        </div></div>
        <section className="panel stage-mission-body">
            {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
            {m.description && <p className="stage-description">{m.description}</p>}
            {m.resources.length > 0 && <div><h3>Fichiers et ressources</h3><FileLinks files={m.resources} /></div>}
            {m.progress.feedback && <div className="review-note"><MessageSquareText size={20} /><div><strong>{locked ? 'Validée par l’atelier' : 'Commentaire de l’atelier'}</strong><p>{m.progress.feedback}</p></div></div>}
            <div className="mission-block">
                <div className="mission-block-head"><h3><Flag size={15} />Où en es-tu ?</h3></div>
                {locked ? <p className="mission-done"><Check size={16} />Cette mission est validée, bravo ! Pour la reprendre, demande à l’atelier de la rouvrir.</p>
                    : <div className="mission-steps" role="group" aria-label="Statut de la mission">{traineeStatuses.map((s, i) => {
                        const { icon: Icon, title, hint } = stepInfo[s], reached = traineeStatuses.indexOf(status as typeof s) >= i;
                        return <button key={s} type="button" aria-pressed={status === s} className={'mission-step' + (status === s ? ' current' : reached ? ' reached' : '')} onClick={() => void choose(s)}>
                            <span className="mission-step-icon">{reached && status !== s ? <Check size={16} /> : <Icon size={16} />}</span>
                            <span><strong>{title}</strong><small>{hint}</small></span>
                        </button>;
                    })}</div>}
            </div>
            <div className="mission-block">
                <div className="mission-block-head"><h3><NotebookPen size={15} />Mes notes</h3>
                    <span className={'mission-save' + (saving ? ' saving' : dirty ? ' dirty' : '')} aria-live="polite" title={hint}><span className="dot" />{saving ? 'Enregistrement…' : dirty ? 'Pas encore envoyées' : savedAt ? `Envoyées à ${timeFr(savedAt)}` : 'À jour'}</span></div>
                <textarea className="mission-notes" rows={6} maxLength={5000} value={notes} aria-label="Mes notes pour cette mission" placeholder="Ce que tu as essayé, ce qui a bloqué, tes questions…" onChange={e => setNotes(e.target.value)} onBlur={() => void persistNotes()} />
                <p className="mission-block-foot"><span>{hint}</span><span>{notes.length} / 5000</span></p>
            </div>
            <div className="mission-block">
                <div className="mission-block-head"><h3><Paperclip size={15} />Mes rendus{m.progress.deliverables.length > 0 && <span className="product-count">{m.progress.deliverables.length}</span>}</h3></div>
                <p className="mission-block-help">Photos de ton travail, fichiers ou liens : ajoute ce que tu veux montrer à l’atelier.</p>
                <FileLinks files={m.progress.deliverables} onRemove={locked ? undefined : f => void removeFile({ missionId: m._id, fileId: f.id }).catch(err => fail(err, 'Le rendu n’a pas été retiré.'))} />
                {!locked && <FileAdder drop what="rendu" upload={() => uploadUrl() as Promise<string>} onAdd={async file => { try { await addFile({ missionId: m._id, file }); onToast('Rendu ajouté'); } catch (err) { throw new Error(errorText(err, 'Le rendu n’a pas été ajouté.')); } }} />}
            </div>
        </section>
    </div>;
}
