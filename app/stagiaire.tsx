'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { useAuthActions } from '@convex-dev/auth/react';
import { CalendarDays, Check, ChevronDown, ClipboardList, Flower2, Library as LibraryIcon, Lightbulb, LogOut, MessageSquareText, Paperclip } from 'lucide-react';
import { groupByPhase, missionStatusLabels, percentDone, traineeStatuses, type MissionStatus } from '../lib/stage';
import Loader from './loader';
import Brand from './brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { errorText, type Me } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';
import { Library } from './library';
import { TraineeProjects } from './stage-projects';

export type TraineeMission = {
    _id: string; title: string; description: string; phase: string; dueDate: string; resources: FileView[];
    progress: { status: MissionStatus; notes: string; deliverables: FileView[]; feedback: string; updatedAt: number | null };
};
export const statusBadge: Record<MissionStatus, string> = { todo: '', doing: 'blue', submitted: 'orange', validated: 'green' };
export const dueLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export default function TraineeSpace({ me }: { me: Me }) {
    const { signOut } = useAuthActions();
    const missions = useQuery(anyApi.stage.mine) as TraineeMission[] | undefined;
    const [openId, setOpenId] = useState<string | null>(null), [toast, setToast] = useState(''), [tab, setTab] = useState<'missions' | 'projects' | 'library'>('missions');
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
    if (!missions) return <Loader message="Chargement de votre stage…" />;
    const firstName = me.name.split(/\s+/)[0] || 'toi';
    const statuses = missions.map(m => m.progress.status);
    const count = (s: MissionStatus) => statuses.filter(x => x === s).length;
    const next = missions.find(m => m.progress.status === 'doing') ?? missions.find(m => m.progress.status === 'todo');
    return <div className="client">
        <header className="client-bar"><a className="brand" href="/"><Brand label="STAGE" /></a>
            <nav>{([['missions', 'Mes missions', ClipboardList], ['projects', 'Mes projets', Lightbulb], ['library', 'Bibliothèque', LibraryIcon]] as const).map(([id, label, Icon]) => <Button key={id} type="button" variant="ghost" aria-current={tab === id ? 'page' : undefined} className={cn('text-muted-foreground', tab === id && 'bg-accent font-semibold text-accent-foreground')} onClick={() => setTab(id)}><Icon size={16} />{label}</Button>)}</nav>
            <div className="client-user"><span className="avatar">{firstName[0]!.toUpperCase()}</span><span className="client-name">{me.name || me.email}</span><Button variant="ghost" size="icon" aria-label="Se déconnecter" title="Se déconnecter" onClick={() => void signOut()}><LogOut /></Button></div>
        </header>
        <main className="client-main">{tab === 'library' ? <>
            <div className="page-heading"><div><div className="eyebrow">BIBLIOTHÈQUE</div><h1>Bibliothèque</h1><p>Les documents partagés avec l’atelier. Tu peux aussi y ajouter les tiens.</p></div></div>
            <Library onToast={setToast} /></> : tab === 'projects' ? <>
            <div className="page-heading"><div><div className="eyebrow">MES PROJETS</div><h1>Mes projets</h1><p>Tes idées et les projets que tu portes toi-même. Ajoute tes documents et tes questions : l’atelier les voit.</p></div></div>
            <TraineeProjects onToast={setToast} /></> : <>
            <div className="page-heading"><div><div className="eyebrow">MON STAGE</div><h1>Bonjour {firstName}</h1><p>Voici tes missions. Avance à ton rythme : les dates sont des repères, pas des échéances.</p></div></div>
            <section className="stats"><Stat label="Missions" value={missions.length} /><Stat label="En cours" value={count('doing')} /><Stat label="À relire" value={count('submitted')} /><Stat label="Validées" value={count('validated')} /></section>
            {missions.length > 0 && <div className="progress" role="img" aria-label={`Avancement : ${percentDone(statuses)} %`}><span style={{ width: percentDone(statuses) + '%' }} /></div>}
            {next && !openId && <p className="muted">Prochaine étape : <button type="button" className="edit-link" onClick={() => setOpenId(next._id)}>{next.title}</button></p>}
            {missions.length ? groupByPhase(missions).map(g => <section key={g.phase} className="stage-phase"><h2>{g.phase}</h2>
                {g.missions.map(m => <MissionCard key={m._id} mission={m} open={openId === m._id} onToggle={() => setOpenId(openId === m._id ? null : m._id)} onToast={setToast} />)}</section>)
                : <section className="panel client-empty"><Flower2 size={28} /><p>Aucune mission pour le moment. Elles apparaîtront ici dès qu’elles seront prêtes.</p></section>}
        </>}</main>
        {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>;
}

function Stat({ label, value }: { label: string, value: number }) { return <div className="stat"><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div>; }

function MissionCard({ mission: m, open, onToggle, onToast }: { mission: TraineeMission, open: boolean, onToggle: () => void, onToast: (s: string) => void }) {
    const setStatus = useMutation(anyApi.stage.setStatus), saveNotes = useMutation(anyApi.stage.saveNotes), addFile = useMutation(anyApi.stage.addDeliverable), removeFile = useMutation(anyApi.stage.removeDeliverable), uploadUrl = useMutation(anyApi.stage.generateUploadUrl);
    const { status } = m.progress; const locked = status === 'validated';
    const [notes, setNotes] = useState(m.progress.notes), [error, setError] = useState('');
    const fail = (err: unknown, fallback: string) => setError(errorText(err, fallback));
    const choose = async (next: MissionStatus) => { setError(''); try { await setStatus({ missionId: m._id, status: next }); if (next === 'submitted') onToast('Mission envoyée en relecture'); } catch (err) { fail(err, 'Le statut n’a pas été modifié.'); } };
    const persistNotes = async () => { if (notes === m.progress.notes) return; setError(''); try { await saveNotes({ missionId: m._id, notes }); onToast('Notes enregistrées'); } catch (err) { fail(err, 'Les notes n’ont pas été enregistrées.'); } };
    return <article className={cn('panel stage-mission', open && 'open')}>
        <button type="button" className="stage-mission-head" aria-expanded={open} onClick={onToggle}>
            <span className="stage-mission-title"><strong>{m.title}</strong>{m.dueDate && <small><CalendarDays size={13} />Repère : {dueLabel(m.dueDate)}</small>}</span>
            {m.progress.feedback && !locked && <MessageSquareText size={16} aria-label="Commentaire de l’atelier" />}
            <span className={'badge ' + statusBadge[status]}>{missionStatusLabels[status]}</span>
            <ChevronDown size={18} className="stage-chevron" />
        </button>
        {open && <div className="stage-mission-body">
            {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
            {m.description && <p className="stage-description">{m.description}</p>}
            {m.resources.length > 0 && <div><h3>Fichiers et ressources</h3><FileLinks files={m.resources} /></div>}
            {m.progress.feedback && <div className="review-note"><MessageSquareText size={20} /><div><strong>{locked ? 'Validée par l’atelier' : 'Commentaire de l’atelier'}</strong><p>{m.progress.feedback}</p></div></div>}
            <div><h3>Où en es-tu ?</h3>
                {locked ? <p className="muted">Cette mission est validée, bravo ! Pour la reprendre, demande à l’atelier de la rouvrir.</p>
                    : <div className="segmented" role="group" aria-label="Statut de la mission">{traineeStatuses.map(s => <button key={s} type="button" aria-pressed={status === s} className={status === s ? 'selected' : ''} onClick={() => void choose(s)}>{s === 'submitted' ? 'J’ai terminé, à relire' : missionStatusLabels[s]}</button>)}</div>}</div>
            <div><h3>Mes notes</h3><textarea rows={4} maxLength={5000} value={notes} aria-label="Mes notes pour cette mission" placeholder="Ce que tu as essayé, ce qui a bloqué, tes questions…" onChange={e => setNotes(e.target.value)} onBlur={() => void persistNotes()} /><p className="muted">Enregistrées quand tu quittes le champ.</p></div>
            <div><h3><Paperclip size={15} /> Mes rendus</h3>
                <FileLinks files={m.progress.deliverables} onRemove={locked ? undefined : f => void removeFile({ missionId: m._id, fileId: f.id }).catch(err => fail(err, 'Le rendu n’a pas été retiré.'))} />
                {!m.progress.deliverables.length && <p className="muted">Photos de ton travail, fichiers ou liens : ajoute ce que tu veux montrer.</p>}
                {!locked && <FileAdder what="rendu" upload={() => uploadUrl() as Promise<string>} onAdd={async file => { try { await addFile({ missionId: m._id, file }); onToast('Rendu ajouté'); } catch (err) { throw new Error(errorText(err, 'Le rendu n’a pas été ajouté.')); } }} />}</div>
        </div>}
    </article>;
}
