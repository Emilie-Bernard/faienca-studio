'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ClipboardList, Flower2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ask } from '@/components/confirm-dialog';
import { emptyMission, groupByPhase, missionError, missionStatusLabels, type MissionFile, type MissionInput, type MissionStatus } from '../lib/stage';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';
import { dueLabel, statusBadge } from './stagiaire';

type Progress = { userId: string; status: MissionStatus; notes: string; feedback: string; updatedAt: number; deliverables: FileView[] };
type AdminMission = Omit<MissionInput, 'resources'> & { _id: string; revision: number; order: number; resources: FileView[]; progress: Progress[] };
type Trainee = { _id: string; name: string; email: string };
type Data = { trainees: Trainee[]; missions: AdminMission[] };
const dateTimeFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const inputOf = (m: AdminMission): MissionInput => ({ title: m.title, description: m.description, phase: m.phase, dueDate: m.dueDate, published: m.published, resources: m.resources.map(({ id, label, url, storageId }) => ({ id, label, url, ...(storageId ? { storageId } : {}) })) });
const nameOf = (t: Trainee) => t.name || t.email || 'Stagiaire';

/** Liste des missions, ou page d'édition d'une mission. */
export function StageAdmin({ onToast }: { onToast: (s: string) => void }) {
    const data = useQuery(anyApi.stage.adminList) as Data | undefined;
    const move = useMutation(anyApi.stage.moveMission);
    const [editing, setEditing] = useState<string | null>(null), [error, setError] = useState('');
    if (!data) return <p className="muted">Chargement du stage…</p>;
    if (editing) {
        const mission = editing === 'new' ? null : data.missions.find(m => m._id === editing);
        if (mission === undefined) return <section className="panel"><div className="empty"><Flower2 size={28} /><p>Cette mission n’existe plus.</p></div><div className="flex justify-center"><Button variant="outline" onClick={() => setEditing(null)}><ArrowLeft />Retour aux missions</Button></div></section>;
        return <MissionPage key={editing} mission={mission} trainees={data.trainees} onBack={() => setEditing(null)} onCreated={id => setEditing(id)} onToast={onToast} />;
    }
    const toReview = data.missions.reduce((n, m) => n + m.progress.filter(p => p.status === 'submitted').length, 0);
    return <>
        <div className="page-tools"><div className="review-note"><ClipboardList size={22} /><p>Préparez les missions, joignez-y vos fichiers, puis publiez-les : la stagiaire les suit à son rythme depuis son espace. Pour lui donner accès, créez-lui un compte puis passez-le au rôle « Stagiaire » dans <strong>Clientes</strong>.</p></div>
            <div className="filters"><span className="muted">{data.missions.length} mission{data.missions.length > 1 ? 's' : ''} · {data.trainees.length} stagiaire{data.trainees.length > 1 ? 's' : ''}{toReview ? ` · ${toReview} à relire` : ''}</span><Button onClick={() => setEditing('new')}><Plus size={16} />Nouvelle mission</Button></div></div>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        {data.missions.length ? groupByPhase(data.missions).map(g => <section key={g.phase} className="stage-phase"><h2>{g.phase}</h2>
            {g.missions.map(m => {
                const index = data.missions.findIndex(x => x._id === m._id);
                const review = m.progress.filter(p => p.status === 'submitted').length;
                const best = m.progress.length === 1 ? m.progress[0]!.status : null;
                return <article key={m._id} className="panel stage-mission"><div className="stage-mission-head">
                    <button type="button" className="stage-mission-title" onClick={() => setEditing(m._id)}><strong>{m.title}</strong>{m.dueDate && <small><CalendarDays size={13} />Repère : {dueLabel(m.dueDate)}</small>}</button>
                    {!m.published && <span className="badge orange">Brouillon</span>}
                    {review > 0 ? <span className="badge orange">À relire</span> : best && <span className={'badge ' + statusBadge[best]}>{missionStatusLabels[best]}</span>}
                    <Button type="button" variant="ghost" size="icon" aria-label="Monter" disabled={index === 0} onClick={() => void move({ id: m._id, direction: 'up' }).catch(err => setError(errorText(err, 'Déplacement impossible.')))}><ArrowUp size={16} /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Descendre" disabled={index === data.missions.length - 1} onClick={() => void move({ id: m._id, direction: 'down' }).catch(err => setError(errorText(err, 'Déplacement impossible.')))}><ArrowDown size={16} /></Button>
                </div></article>;
            })}</section>)
            : <section className="panel"><div className="empty"><Flower2 size={28} /><p>Créez la première mission du stage.</p></div></section>}
    </>;
}

function MissionPage({ mission, trainees, onBack, onCreated, onToast }: { mission: AdminMission | null, trainees: Trainee[], onBack: () => void, onCreated: (id: string) => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.stage.saveMission), remove = useMutation(anyApi.stage.removeMission), uploadUrl = useMutation(anyApi.stage.adminUploadUrl);
    const [data, setData] = useState<MissionInput>(() => mission ? inputOf(mission) : emptyMission());
    const [revision, setRevision] = useState(mission?.revision), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<MissionInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    const back = async () => { if (!dirty || await ask({ title: 'Quitter sans enregistrer ?', description: 'Les modifications de cette mission seront perdues.', confirmLabel: 'Quitter sans enregistrer', destructive: true })) onBack(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault(); const problem = missionError(data);
        if (problem) { setError(problem); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        setBusy(true); setError('');
        try {
            const id = await save({ data, ...(mission ? { id: mission._id, revision } : {}) }) as string;
            setDirty(false);
            if (mission) { setRevision(r => (r ?? 0) + 1); onToast('Mission enregistrée'); } else { onToast('Mission créée'); onCreated(id); }
        } catch (err) { setError(errorText(err, 'Impossible d’enregistrer. Vos modifications restent sur la page.')); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        setBusy(false);
    };
    const erase = async () => {
        if (!mission || !await ask({ title: 'Supprimer cette mission ?', description: 'Les notes et les rendus de la stagiaire seront supprimés avec elle.', confirmLabel: 'Supprimer', destructive: true })) return;
        setBusy(true); try { await remove({ id: mission._id, revision }); onToast('Mission supprimée'); onBack(); } catch (err) { setError(errorText(err, 'La suppression a échoué.')); setBusy(false); }
    };
    const viewOf = (f: MissionFile): FileView => ({ ...f, fileUrl: mission?.resources.find(r => r.id === f.id)?.fileUrl ?? null });
    return <form className="kit-page" onSubmit={submit}>
        <div className="kit-page-bar">
            <Button type="button" variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => void back()}><ArrowLeft />Stage</Button>
            <div className="kit-page-title"><span className="eyebrow">{mission ? 'MODIFIER LA MISSION' : 'NOUVELLE MISSION'}</span><h1>{data.title.trim() || 'Sans titre'}</h1></div>
            <span className={'badge ' + (data.published ? 'green' : 'orange')}>{data.published ? 'Publiée' : 'Brouillon'}</span><span className="spacer" />
            {dirty && <span className="kit-page-dirty" role="status">Modifications non enregistrées</span>}
            <Button disabled={busy || (!!mission && !dirty)}>{busy ? 'Enregistrement…' : mission ? 'Enregistrer' : 'Créer la mission'}</Button>
        </div>
        {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
        <section className="panel stage-form">
            <div><Label htmlFor="m-title">Titre</Label><Input id="m-title" maxLength={200} value={data.title} onChange={e => set({ title: e.target.value })} placeholder="Ex. Brode un carré de 5 points" /></div>
            <div className="stage-form-row">
                <div><Label htmlFor="m-phase">Phase</Label><Input id="m-phase" maxLength={80} value={data.phase} onChange={e => set({ phase: e.target.value })} placeholder="Ex. Apprendre, Concevoir…" /></div>
                <div><Label htmlFor="m-due">Date repère (facultative)</Label><Input id="m-due" type="date" value={data.dueDate} onChange={e => set({ dueDate: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="m-desc">Consigne</Label><Textarea id="m-desc" rows={8} maxLength={8000} value={data.description} onChange={e => set({ description: e.target.value })} placeholder="Ce qu’elle doit faire, ce que tu attends en rendu, combien de temps prévoir…" /></div>
            <label className="stage-switch"><Switch checked={data.published} onCheckedChange={published => set({ published })} /><span>Publiée : visible par la stagiaire</span></label>
        </section>
        <section className="panel stage-form"><div className="panel-title"><h2>Fichiers et ressources</h2></div>
            <FileLinks files={data.resources.map(viewOf)} onRemove={f => set({ resources: data.resources.filter(r => r.id !== f.id) })} />
            <FileAdder what="fichier" upload={() => uploadUrl() as Promise<string>} onAdd={async file => set({ resources: [...data.resources, file] })} />
            <p className="muted">Les fichiers ajoutés ici sont conservés dès l’enregistrement de la mission.</p>
        </section>
        {mission && <section className="panel stage-form"><div className="panel-title"><h2>Suivi</h2></div>
            {trainees.length ? trainees.map(t => <TraineeReview key={t._id} trainee={t} mission={mission} progress={mission.progress.find(p => p.userId === t._id)} onToast={onToast} />)
                : <p className="muted">Aucune stagiaire pour l’instant. Passez un compte au rôle « Stagiaire » dans Clientes.</p>}
        </section>}
        {mission && <div className="flex justify-end"><Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={() => void erase()}><Trash2 size={16} />Supprimer la mission</Button></div>}
    </form>;
}

function TraineeReview({ trainee, mission, progress, onToast }: { trainee: Trainee, mission: AdminMission, progress?: Progress, onToast: (s: string) => void }) {
    const review = useMutation(anyApi.stage.review);
    const status = progress?.status ?? 'todo';
    const [feedback, setFeedback] = useState(progress?.feedback ?? ''), [error, setError] = useState('');
    const act = async (next: 'validated' | 'doing') => { setError(''); try { await review({ missionId: mission._id, userId: trainee._id, status: next, feedback }); onToast(next === 'validated' ? 'Mission validée' : 'Mission rouverte'); } catch (err) { setError(errorText(err, 'La relecture n’a pas été enregistrée.')); } };
    return <div className="stage-review">
        <div className="card-top"><strong>{nameOf(trainee)}</strong><span className={'badge ' + statusBadge[status]}>{missionStatusLabels[status]}</span>{progress && <small>modifiée le {dateTimeFr(progress.updatedAt)}</small>}</div>
        {progress?.notes && <div><h3>Ses notes</h3><p className="stage-description">{progress.notes}</p></div>}
        {progress?.deliverables.length ? <div><h3>Ses rendus</h3><FileLinks files={progress.deliverables} /></div> : <p className="muted">Aucun rendu pour l’instant.</p>}
        {error && <p role="alert" className="error-inline">{error}</p>}
        <Label htmlFor={'fb-' + trainee._id}>Ton commentaire</Label>
        <Textarea id={'fb-' + trainee._id} rows={3} maxLength={4000} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Ce qui est réussi, ce qu’il faut reprendre…" />
        <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={status === 'validated' && feedback === (progress?.feedback ?? '')} onClick={() => void act('validated')}><Check size={16} />{status === 'validated' ? 'Mettre à jour le commentaire' : 'Valider'}</Button>
            <Button type="button" variant="outline" disabled={status === 'todo' && !progress} onClick={() => void act('doing')}><RotateCcw size={16} />Demander des modifications</Button>
        </div>
    </div>;
}
