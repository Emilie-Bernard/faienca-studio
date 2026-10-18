'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, Flower2, MessageSquareText, Paperclip, Plus, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ask } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { emptyMission, groupByPhase, missionError, missionStatusLabels, type MissionFile, type MissionInput, type MissionStatus } from '../lib/stage';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';
import { dueLabel, statusBadge } from './stagiaire';
import type { LeaveGuard } from './kits-admin';
import { clearDraft, useLocalDraft } from './local-draft';
import { ProjectsAdmin } from './stage-projects';

type Progress = { userId: string; status: MissionStatus; notes: string; feedback: string; updatedAt: number; deliverables: FileView[] };
type AdminMission = Omit<MissionInput, 'resources'> & { _id: string; revision: number; order: number; resources: FileView[]; progress: Progress[] };
type Trainee = { _id: string; name: string; email: string };
type Data = { trainees: Trainee[]; missions: AdminMission[] };
const dateTimeFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const inputOf = (m: AdminMission): MissionInput => ({ title: m.title, description: m.description, phase: m.phase, dueDate: m.dueDate, published: m.published, resources: m.resources.map(({ id, label, url, storageId }) => ({ id, label, url, ...(storageId ? { storageId } : {}) })) });
const nameOf = (t: Trainee) => t.name || t.email || 'Stagiaire';
const fieldLabel = 'text-xs font-semibold text-muted-foreground';
const toReview = (m: AdminMission) => m.progress.filter(p => p.status === 'submitted').length;
const validated = (m: AdminMission) => m.progress.length > 0 && m.progress.every(p => p.status === 'validated');

/** Liste des missions, ou fiche d'une mission quand l'adresse contient ?mission=<id|new>. */
export function StageAdmin({ missionId, onOpenMission, leaveGuard, onToast }: { missionId: string | null, onOpenMission: (id: string | null, replace?: boolean) => void, leaveGuard: LeaveGuard, onToast: (s: string) => void }) {
    const data = useQuery(anyApi.stage.adminList) as Data | undefined;
    if (!data) return <p className="muted">Chargement du stage…</p>;
    if (missionId) {
        const mission = missionId === 'new' ? null : data.missions.find(m => m._id === missionId);
        if (mission === undefined) return <section className="panel"><div className="empty"><Flower2 size={28} /><p>Cette mission n’existe plus ou a été supprimée.</p></div><div className="flex justify-center"><Button variant="outline" onClick={() => onOpenMission(null)}><ArrowLeft />Retour aux missions</Button></div></section>;
        const phases = [...new Set(data.missions.map(m => m.phase.trim()).filter(Boolean))];
        return <MissionPage key={missionId} mission={mission} trainees={data.trainees} phases={phases} leaveGuard={leaveGuard} onBack={() => onOpenMission(null)} onCreated={id => onOpenMission(id, true)} onToast={onToast} />;
    }
    return <StageSections data={data} onOpenMission={onOpenMission} onToast={onToast} />;
}

/** Missions préparées par l'atelier, ou projets proposés par la stagiaire (?onglet=projets). */
function StageSections({ data, onOpenMission, onToast }: { data: Data, onOpenMission: (id: string) => void, onToast: (s: string) => void }) {
    const [section, setSection] = useState<'missions' | 'projets'>(() => new URLSearchParams(location.search).get('onglet') === 'projets' ? 'projets' : 'missions');
    const pending = useQuery(anyApi.projects.adminPending) as number | undefined;
    const choose = (s: typeof section) => { setSection(s); history.replaceState(null, '', '?vue=Stage' + (s === 'projets' ? '&onglet=projets' : '')); };
    return <>
        <div className="stage-tabs" role="tablist" aria-label="Stage">{([['missions', 'Missions'], ['projets', 'Projets de la stagiaire']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? 'selected' : ''} onClick={() => choose(id)}>{label}{id === 'projets' && !!pending && <span className="badge purple">{pending}</span>}</button>)}</div>
        {section === 'projets' ? <ProjectsAdmin onToast={onToast} /> : <MissionList data={data} onOpenMission={onOpenMission} />}
    </>;
}

function MissionList({ data: { missions, trainees }, onOpenMission }: { data: Data, onOpenMission: (id: string) => void }) {
    const move = useMutation(anyApi.stage.moveMission);
    const [filter, setFilter] = useState<'all' | 'review' | 'draft'>('all'), [error, setError] = useState('');
    const reviewCount = missions.reduce((n, m) => n + toReview(m), 0);
    const count = { all: missions.length, review: missions.filter(m => toReview(m) > 0).length, draft: missions.filter(m => !m.published).length };
    const shown = missions.filter(m => filter === 'all' || (filter === 'review' ? toReview(m) > 0 : !m.published));
    const open = (e: React.MouseEvent, id: string) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onOpenMission(id); };
    const moveTo = (id: string, direction: 'up' | 'down') => void move({ id, direction }).catch(err => setError(errorText(err, 'Déplacement impossible.')));
    return <>
        <section className="product-kpis">
            <div className="product-kpi"><span>Missions publiées</span><strong>{missions.filter(m => m.published).length}/{missions.length}</strong><small>{count.draft ? `${count.draft} en brouillon` : 'aucun brouillon'}</small></div>
            <div className={cn('product-kpi', reviewCount > 0 && 'warn')}><span>À relire</span><strong>{reviewCount}</strong><small>{reviewCount ? 'rendus en attente' : 'rien en attente'}</small></div>
            <div className="product-kpi"><span>Validées</span><strong>{missions.filter(validated).length}</strong><small>missions terminées</small><div className="progress"><span style={{ width: missions.length ? missions.filter(validated).length / missions.length * 100 + '%' : '0%' }} /></div></div>
            <div className="product-kpi"><span>Stagiaires</span><strong>{trainees.length}</strong><small className="truncate">{trainees.map(nameOf).join(', ') || 'aucune pour l’instant'}</small></div>
        </section>
        {!trainees.length && <div className="stage-callout"><UserPlus size={18} /><p>Pour donner accès à ta stagiaire : elle crée son compte sur la page d’accueil, puis tu passes son rôle à « Stagiaire » dans <a className="edit-link" href="?vue=Clientes">Clientes</a>.</p></div>}
        <div className="filters product-filters">
            <div className="segmented" role="group" aria-label="Filtrer les missions">{([['all', 'Toutes'], ['review', 'À relire'], ['draft', 'Brouillons']] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{label} <span className="muted">{count[v]}</span></button>)}</div>
            <span className="spacer" /><Button type="button" onClick={() => onOpenMission('new')}><Plus size={16} />Nouvelle mission</Button>
        </div>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        {shown.length ? groupByPhase(shown).map(g => { const done = g.missions.filter(validated).length; return <section key={g.phase} className="stage-phase">
            <div className="stage-phase-head"><h2>{g.phase}</h2><span className="muted">{done}/{g.missions.length} validée{done > 1 ? 's' : ''}</span><div className="progress"><span style={{ width: done / g.missions.length * 100 + '%' }} /></div></div>
            <ol className="stage-rows">{g.missions.map(m => {
                const index = missions.findIndex(x => x._id === m._id), review = toReview(m), single = m.progress.length === 1 ? m.progress[0]!.status : null;
                const files = m.progress.reduce((n, p) => n + p.deliverables.length, 0);
                return <li key={m._id} className={cn('stage-row', review > 0 && 'review')}>
                    <span className="lesson-num">{index + 1}</span>
                    <a className="stage-row-main" href={'?vue=Stage&mission=' + m._id} onClick={e => open(e, m._id)}>
                        <strong>{m.title}</strong>
                        <span className="stage-row-meta">{m.dueDate && <span><CalendarDays size={13} />{dueLabel(m.dueDate)}</span>}{m.resources.length > 0 && <span><Paperclip size={13} />{m.resources.length} ressource{m.resources.length > 1 ? 's' : ''}</span>}{files > 0 && <span>{files} rendu{files > 1 ? 's' : ''}</span>}</span>
                    </a>
                    <span className="stage-row-badges">{!m.published && <span className="badge orange">Brouillon</span>}{review > 0 ? <span className="badge purple">À relire</span> : single && single !== 'todo' && <span className={'badge ' + statusBadge[single]}>{missionStatusLabels[single]}</span>}</span>
                    <span className="stage-row-tools">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={'Monter « ' + m.title + ' »'} disabled={index === 0} onClick={() => moveTo(m._id, 'up')}><ArrowUp /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={'Descendre « ' + m.title + ' »'} disabled={index === missions.length - 1} onClick={() => moveTo(m._id, 'down')}><ArrowDown /></Button>
                    </span>
                </li>;
            })}</ol>
        </section>; })
            : <section className="panel"><div className="empty"><Flower2 size={28} /><p>{missions.length ? 'Aucune mission dans cette catégorie.' : 'Crée la première mission du stage.'}</p></div></section>}
    </>;
}

function MissionPage({ mission, trainees, phases, leaveGuard, onBack, onCreated, onToast }: { mission: AdminMission | null, trainees: Trainee[], phases: string[], leaveGuard: LeaveGuard, onBack: () => void, onCreated: (id: string) => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.stage.saveMission), remove = useMutation(anyApi.stage.removeMission), uploadUrl = useMutation(anyApi.stage.adminUploadUrl);
    const [data, setData] = useState<MissionInput>(() => mission ? inputOf(mission) : emptyMission());
    const [revision, setRevision] = useState(mission?.revision), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const draftKey = 'faienca-mission-draft:' + (mission?._id ?? 'new');
    const { restored, forget } = useLocalDraft({ key: draftKey, revision: mission?.revision ?? null, data, dirty, onRestore: d => { setData(d); setDirty(true); } });
    const release = () => { leaveGuard.current = async () => true; };
    useEffect(() => {
        leaveGuard.current = async () => { if (!dirty) return true; const ok = await ask({ title: 'Quitter sans enregistrer ?', description: 'Les modifications de cette mission seront perdues.', confirmLabel: 'Quitter sans enregistrer', destructive: true }); if (ok) { clearDraft(draftKey); release(); } return ok; };
        return release;
    });
    useEffect(() => { if (!dirty) return; const before = (e: BeforeUnloadEvent) => e.preventDefault(); addEventListener('beforeunload', before); return () => removeEventListener('beforeunload', before); }, [dirty]);
    const set = (patch: Partial<MissionInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const back = async () => { if (busy) return; if (await leaveGuard.current()) onBack(); };
    const discard = async () => { if (!await ask({ title: 'Annuler les modifications ?', description: 'La mission revient à sa dernière version enregistrée.', confirmLabel: 'Annuler les modifications', destructive: true })) return; forget(); setDirty(false); if (mission) setData(inputOf(mission)); else { release(); onBack(); } };
    const submit = async (e: FormEvent) => {
        e.preventDefault(); const problem = missionError(data);
        if (problem) { setError(problem); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        setBusy(true); setError('');
        try {
            const id = await save({ data, ...(mission ? { id: mission._id, revision } : {}) }) as string;
            clearDraft(draftKey); setDirty(false);
            if (mission) { setRevision(r => (r ?? 0) + 1); onToast('Mission enregistrée'); } else { release(); onToast('Mission créée'); onCreated(id); }
        } catch (err) { setError(errorText(err, 'Impossible d’enregistrer. Vos modifications restent sur la page.')); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        setBusy(false);
    };
    const erase = async () => {
        if (!mission || !await ask({ title: 'Supprimer cette mission ?', description: 'Les notes et les rendus de la stagiaire seront supprimés avec elle.', confirmLabel: 'Supprimer', destructive: true })) return;
        setBusy(true); try { await remove({ id: mission._id, revision }); clearDraft(draftKey); release(); onToast('Mission supprimée'); onBack(); } catch (err) { setError(errorText(err, 'La suppression a échoué.')); setBusy(false); }
    };
    const viewOf = (f: MissionFile): FileView => ({ ...f, fileUrl: mission?.resources.find(r => r.id === f.id)?.fileUrl ?? null });
    const review = mission ? toReview(mission) : 0;
    return <form className="kit-page" onSubmit={submit}>
        <div className="kit-page-bar">
            <Button type="button" variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => void back()}><ArrowLeft />Stage</Button>
            <div className="kit-page-title"><span className="eyebrow">{(data.phase.trim() || (mission ? 'MISSION' : 'NOUVELLE MISSION')).toUpperCase()}</span><h1>{data.title.trim() || 'Sans titre'}</h1></div>
            <span className={'badge ' + (data.published ? 'green' : 'orange')}>{data.published ? 'Publiée' : 'Brouillon'}</span>
            {review > 0 && <span className="badge purple">À relire</span>}
            <span className="spacer" />
            {dirty && <span className="kit-page-dirty" role="status">Modifications non enregistrées</span>}
            {dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => void discard()}><RotateCcw size={16} />Annuler</Button>}
            <Button disabled={busy || (!!mission && !dirty)}>{busy ? 'Enregistrement…' : mission ? 'Enregistrer' : 'Créer la mission'}</Button>
        </div>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        {restored && <p className="product-restored" role="status"><RotateCcw size={15} />Vos modifications non enregistrées ont été retrouvées. Enregistrez-les ou annulez-les.</p>}
        <div className="kit-page-grid">
            <div className="kit-page-main">
                <section className="panel"><div className="panel-title"><h2>Consigne</h2></div><div className="grid gap-5">
                    <div className="grid gap-1.5"><Label htmlFor="m-title" className={fieldLabel}>Titre</Label><Input id="m-title" maxLength={200} value={data.title} className="h-11 bg-card text-base" onChange={e => set({ title: e.target.value })} placeholder="Ex. Brode un carré de 5 points" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="m-desc" className={fieldLabel}>Ce qu’elle doit faire</Label><Textarea id="m-desc" maxLength={8000} value={data.description} className="min-h-56 bg-card text-base leading-7 [field-sizing:content]" onChange={e => set({ description: e.target.value })} placeholder="L’objectif, les étapes, ce que tu attends en rendu, le temps à prévoir…" /></div>
                </div></section>
                <section className="panel"><div className="panel-title"><h2>Fichiers et ressources</h2><span className="muted">{data.resources.length}</span></div>
                    <FileLinks files={data.resources.map(viewOf)} onRemove={f => set({ resources: data.resources.filter(r => r.id !== f.id) })} />
                    <FileAdder what="fichier" upload={() => uploadUrl() as Promise<string>} onAdd={async file => set({ resources: [...data.resources, file] })} />
                    <p className="muted mt-2 text-xs">Modèles, fiches techniques, photos d’inspiration… Ils sont conservés à l’enregistrement de la mission.</p>
                </section>
                {mission && <section className="panel"><div className="panel-title"><h2>Suivi</h2>{review > 0 && <span className="badge purple">{review} à relire</span>}</div>
                    {trainees.length ? <div className="grid gap-4">{trainees.map(t => <TraineeReview key={t._id} trainee={t} mission={mission} progress={mission.progress.find(p => p.userId === t._id)} onToast={onToast} />)}</div>
                        : <p className="muted">Aucune stagiaire pour l’instant. Passe un compte au rôle « Stagiaire » dans <a className="edit-link" href="?vue=Clientes">Clientes</a>.</p>}
                </section>}
            </div>
            <aside className="kit-page-side">
                <section className="panel"><div className="panel-title"><h2>Publication</h2></div>
                    <div className="flex items-center justify-between gap-4"><Label htmlFor="m-published" className="leading-snug font-normal">Visible par la stagiaire</Label><Switch id="m-published" checked={data.published} onCheckedChange={published => set({ published })} /></div>
                    <small className="mt-3 block">En brouillon, tu peux préparer la mission tranquillement.</small>
                </section>
                <section className="panel"><div className="panel-title"><h2>Organisation</h2></div><div className="grid gap-4">
                    <div className="grid gap-1.5"><Label htmlFor="m-phase" className={fieldLabel}>Phase</Label><Input id="m-phase" list="m-phases" maxLength={80} value={data.phase} className="h-11 bg-card" onChange={e => set({ phase: e.target.value })} placeholder="Ex. Apprendre, Concevoir…" /><datalist id="m-phases">{phases.map(p => <option key={p} value={p} />)}</datalist></div>
                    <div className="grid gap-1.5"><Label htmlFor="m-due" className={fieldLabel}>Date repère (facultative)</Label><Input id="m-due" type="date" value={data.dueDate} className="h-11 bg-card" onChange={e => set({ dueDate: e.target.value })} /><small>Un repère, pas une échéance : elle avance à son rythme.</small></div>
                </div></section>
                {mission && <section className="panel kit-page-danger"><div className="panel-title"><h2>Supprimer la mission</h2></div><p>Ses notes et ses rendus seront supprimés avec elle. Pour la masquer simplement, repasse-la en brouillon.</p><Button type="button" variant="outline" className="mt-3 text-destructive hover:text-destructive" disabled={busy} onClick={() => void erase()}><Trash2 />Supprimer…</Button></section>}
            </aside>
        </div>
    </form>;
}

function TraineeReview({ trainee, mission, progress, onToast }: { trainee: Trainee, mission: AdminMission, progress?: Progress, onToast: (s: string) => void }) {
    const review = useMutation(anyApi.stage.review);
    const status = progress?.status ?? 'todo';
    const [feedback, setFeedback] = useState(progress?.feedback ?? ''), [error, setError] = useState('');
    const act = async (next: 'validated' | 'doing') => { setError(''); try { await review({ missionId: mission._id, userId: trainee._id, status: next, feedback }); onToast(next === 'validated' ? 'Mission validée' : 'Mission rouverte'); } catch (err) { setError(errorText(err, 'La relecture n’a pas été enregistrée.')); } };
    return <div className={cn('stage-review', status === 'submitted' && 'review')}>
        <div className="stage-review-head"><span className="avatar">{nameOf(trainee)[0]!.toUpperCase()}</span><div><strong>{nameOf(trainee)}</strong>{progress && <small>Mise à jour le {dateTimeFr(progress.updatedAt)}</small>}</div><span className="spacer" /><span className={'badge ' + (status === 'submitted' ? 'purple' : statusBadge[status])}>{missionStatusLabels[status]}</span></div>
        {progress?.notes && <div><h3>Ses notes</h3><p className="stage-description">{progress.notes}</p></div>}
        <div><h3>Ses rendus</h3>{progress?.deliverables.length ? <FileLinks files={progress.deliverables} /> : <p className="muted">Aucun rendu pour l’instant.</p>}</div>
        {error && <p role="alert" className="error-inline">{error}</p>}
        <div className="grid gap-1.5"><Label htmlFor={'fb-' + trainee._id} className={fieldLabel}><MessageSquareText size={13} className="inline" /> Ton commentaire</Label>
            <Textarea id={'fb-' + trainee._id} rows={3} maxLength={4000} value={feedback} className="bg-card" onChange={e => setFeedback(e.target.value)} placeholder="Ce qui est réussi, ce qu’il faut reprendre…" /></div>
        <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={status === 'validated' && feedback === (progress?.feedback ?? '')} onClick={() => void act('validated')}><Check size={16} />{status === 'validated' ? 'Mettre à jour le commentaire' : 'Valider la mission'}</Button>
            <Button type="button" variant="outline" disabled={status === 'todo' && !progress} onClick={() => void act('doing')}><RotateCcw size={16} />Demander des modifications</Button>
        </div>
    </div>;
}
