'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ChevronDown, FolderOpen, Lightbulb, MessageCircleQuestion, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ask } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { hasNews, projectError, projectStatusLabels, projectStatuses, questionError, type ProjectQuestion, type ProjectStatus } from '../lib/projects';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';

type Project = { _id: string; title: string; description: string; status: ProjectStatus; createdAt: number; updatedAt: number; files: FileView[]; questions: ProjectQuestion[] };
type AdminProject = Project & { authorName: string; seenByAdminAt: number | null; openQuestions: number };
const projectBadge: Record<ProjectStatus, string> = { idea: 'purple', doing: 'blue', paused: 'orange', done: 'green' };
const dateFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const ErrorBox = ({ error, onClose }: { error: string, onClose: () => void }) => error ? <div role="alert" className="error">{error}<button type="button" onClick={onClose}>Fermer</button></div> : null;

// ——— Espace stagiaire ———

/** Les projets que la stagiaire propose elle-même : idée, informations, documents et questions. */
export function TraineeProjects({ onToast }: { onToast: (s: string) => void }) {
    const projects = useQuery(anyApi.projects.mine) as Project[] | undefined;
    const [openId, setOpenId] = useState<string | null>(null), [creating, setCreating] = useState(false);
    if (!projects) return <p className="muted">Chargement de tes projets…</p>;
    return <>
        <div className="filters"><span className="muted">{projects.length ? `${projects.length} projet${projects.length > 1 ? 's' : ''}` : 'Aucun projet pour l’instant'}</span><span className="spacer" />{!creating && <Button type="button" onClick={() => setCreating(true)}><Plus size={16} />Proposer un projet</Button>}</div>
        {creating && <NewProject onCancel={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); onToast('Projet ajouté : l’atelier peut le voir'); }} />}
        {projects.length ? projects.map(p => <ProjectCard key={p._id} project={p} open={openId === p._id} onToggle={() => setOpenId(openId === p._id ? null : p._id)} onToast={onToast} />)
            : !creating && <section className="panel client-empty"><Lightbulb size={28} /><p>Une idée de projet, un besoin que tu as repéré ? Ajoute-le ici avec tes documents et tes questions : l’atelier le verra.</p></section>}
    </>;
}

function NewProject({ onCancel, onCreated }: { onCancel: () => void, onCreated: (id: string) => void }) {
    const create = useMutation(anyApi.projects.create);
    const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submit = async (e: FormEvent) => {
        e.preventDefault(); const problem = projectError({ title, description }); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { onCreated(await create({ title, description }) as string); } catch (err) { setError(errorText(err, 'Le projet n’a pas été ajouté.')); setBusy(false); }
    };
    return <form className="panel project-form" onSubmit={submit}>
        <div className="panel-title"><h2>Nouveau projet</h2><Button type="button" variant="ghost" size="icon" aria-label="Annuler" onClick={onCancel}><X size={16} /></Button></div>
        <ErrorBox error={error} onClose={() => setError('')} />
        <label className="project-field">Titre<Input autoFocus maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Un kit pour débuter le point de croix" /></label>
        <label className="project-field">L’idée<Textarea maxLength={8000} value={description} className="min-h-32 [field-sizing:content]" onChange={e => setDescription(e.target.value)} placeholder="Ce que tu imagines, pourquoi, pour qui, ce dont tu aurais besoin…" /></label>
        <p className="muted">Tu pourras ajouter des documents et poser des questions juste après.</p>
        <div className="flex gap-2"><Button disabled={busy || !title.trim()}>{busy ? 'Ajout…' : 'Ajouter le projet'}</Button><Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button></div>
    </form>;
}

function ProjectCard({ project: p, open, onToggle, onToast }: { project: Project, open: boolean, onToggle: () => void, onToast: (s: string) => void }) {
    const update = useMutation(anyApi.projects.update), setStatus = useMutation(anyApi.projects.setStatus), remove = useMutation(anyApi.projects.remove);
    const addFile = useMutation(anyApi.projects.addFile), removeFile = useMutation(anyApi.projects.removeFile), uploadUrl = useMutation(anyApi.stage.generateUploadUrl);
    const [title, setTitle] = useState(p.title), [description, setDescription] = useState(p.description), [error, setError] = useState('');
    useEffect(() => { setTitle(p.title); setDescription(p.description); }, [p.title, p.description]);
    const fail = (err: unknown, fallback: string) => setError(errorText(err, fallback));
    const dirty = title !== p.title || description !== p.description;
    const save = async () => { const problem = projectError({ title, description }); if (problem) { setError(problem); return; } setError(''); try { await update({ id: p._id, title, description }); onToast('Projet enregistré'); } catch (err) { fail(err, 'Le projet n’a pas été enregistré.'); } };
    const erase = async () => { if (!await ask({ title: 'Supprimer ce projet ?', description: 'Ses documents et ses questions seront supprimés avec lui.', confirmLabel: 'Supprimer', destructive: true })) return; try { await remove({ id: p._id }); onToast('Projet supprimé'); } catch (err) { fail(err, 'La suppression a échoué.'); } };
    const answered = p.questions.filter(q => q.answer).length;
    return <article className={cn('panel stage-mission', open && 'open')}>
        <button type="button" className="stage-mission-head" aria-expanded={open} onClick={onToggle}>
            <span className="stage-mission-title"><strong>{p.title}</strong><small>Mis à jour le {dateFr(p.updatedAt)}{p.files.length > 0 && ` · ${p.files.length} document${p.files.length > 1 ? 's' : ''}`}{p.questions.length > 0 && ` · ${answered}/${p.questions.length} réponse${answered > 1 ? 's' : ''}`}</small></span>
            <span className={'badge ' + projectBadge[p.status]}>{projectStatusLabels[p.status]}</span>
            <ChevronDown size={18} className="stage-chevron" />
        </button>
        {open && <div className="stage-mission-body">
            <ErrorBox error={error} onClose={() => setError('')} />
            <div><h3>Où en est ce projet ?</h3>
                <div className="segmented" role="group" aria-label="Statut du projet">{projectStatuses.map(s => <button key={s} type="button" aria-pressed={p.status === s} className={p.status === s ? 'selected' : ''} onClick={() => void setStatus({ id: p._id, status: s }).catch(err => fail(err, 'Le statut n’a pas été modifié.'))}>{projectStatusLabels[s]}</button>)}</div></div>
            <div className="project-form"><h3>Informations</h3>
                <label className="project-field">Titre<Input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
                <label className="project-field">Description, avancement, idées<Textarea maxLength={8000} value={description} className="min-h-32 [field-sizing:content]" onChange={e => setDescription(e.target.value)} placeholder="L’idée, les étapes, ce que tu as trouvé, les liens utiles…" /></label>
                {dirty && <div className="flex gap-2"><Button type="button" onClick={() => void save()}>Enregistrer</Button><Button type="button" variant="ghost" onClick={() => { setTitle(p.title); setDescription(p.description); }}>Annuler</Button></div>}</div>
            <div><h3><Paperclip size={15} /> Documents</h3>
                <FileLinks files={p.files} onRemove={f => void removeFile({ id: p._id, fileId: f.id }).catch(err => fail(err, 'Le document n’a pas été retiré.'))} />
                {!p.files.length && <p className="muted">Inspirations, croquis, fichiers, liens Drive ou Pinterest…</p>}
                <FileAdder what="document" upload={() => uploadUrl() as Promise<string>} onAdd={async file => { try { await addFile({ id: p._id, file }); onToast('Document ajouté'); } catch (err) { throw new Error(errorText(err, 'Le document n’a pas été ajouté.')); } }} /></div>
            <Questions project={p} onToast={onToast} />
            <div className="flex justify-end"><Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void erase()}><Trash2 size={15} />Supprimer le projet</Button></div>
        </div>}
    </article>;
}

function Questions({ project: p, onToast }: { project: Project, onToast: (s: string) => void }) {
    const askQuestion = useMutation(anyApi.projects.ask), remove = useMutation(anyApi.projects.removeQuestion);
    const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submit = async (e: FormEvent) => {
        e.preventDefault(); const problem = questionError(body); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { await askQuestion({ id: p._id, body }); setBody(''); onToast('Question envoyée à l’atelier'); } catch (err) { setError(errorText(err, 'La question n’a pas été envoyée.')); } finally { setBusy(false); }
    };
    return <div><h3><MessageCircleQuestion size={15} /> Questions pour l’atelier</h3>
        {p.questions.length > 0 && <ul className="project-questions">{p.questions.map(q => <li key={q._id}>
            <div className="qa-meta"><span className={'badge ' + (q.answer ? 'green' : 'orange')}>{q.answer ? 'Répondu' : 'En attente'}</span><small>{dateFr(q.createdAt)}</small><span className="spacer" />{!q.answer && <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer la question" onClick={() => void remove({ id: q._id })}><Trash2 size={14} /></Button>}</div>
            <p className="answer-body">{q.body}</p>
            {q.answer && <div className="project-answer"><strong>L’atelier</strong><p>{q.answer}</p></div>}
        </li>)}</ul>}
        <form className="project-ask" onSubmit={submit}>
            <Textarea rows={2} maxLength={2000} value={body} disabled={busy} onChange={e => setBody(e.target.value)} aria-label="Ta question" placeholder="Une question sur ce projet ? Elle restera ici avec sa réponse." />
            {error && <p role="alert" className="error-inline">{error}</p>}
            <div><Button variant="outline" disabled={busy || !body.trim()}>{busy ? 'Envoi…' : 'Poser la question'}</Button></div>
        </form>
    </div>;
}

// ——— Administration ———

/** Les projets proposés par les stagiaires, avec leurs documents et leurs questions. */
export function ProjectsAdmin({ onToast }: { onToast: (s: string) => void }) {
    const projects = useQuery(anyApi.projects.adminList) as AdminProject[] | undefined;
    const markSeen = useMutation(anyApi.projects.markSeen);
    const [openId, setOpenId] = useState<string | null>(null), [filter, setFilter] = useState<'all' | 'open'>('all');
    if (!projects) return <p className="muted">Chargement des projets…</p>;
    const open = projects.filter(p => p.openQuestions > 0);
    const shown = filter === 'open' ? open : projects;
    const toggle = (p: AdminProject) => { const next = openId === p._id ? null : p._id; setOpenId(next); if (next) void markSeen({ id: p._id }); };
    return <>
        <div className="filters product-filters">
            <div className="segmented" role="group" aria-label="Filtrer les projets">{([['all', 'Tous', projects.length], ['open', 'Questions en attente', open.length]] as const).map(([v, label, n]) => <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{label} <span className="muted">{n}</span></button>)}</div>
            <span className="muted">Les projets que ta stagiaire propose elle-même.</span>
        </div>
        {shown.length ? shown.map(p => <AdminProjectCard key={p._id} project={p} open={openId === p._id} onToggle={() => toggle(p)} onToast={onToast} />)
            : <section className="panel"><div className="empty"><FolderOpen size={28} /><p>{projects.length ? 'Aucune question en attente.' : 'Ta stagiaire n’a pas encore proposé de projet. Elle peut le faire depuis l’onglet « Mes projets » de son espace.'}</p></div></section>}
    </>;
}

function AdminProjectCard({ project: p, open, onToggle, onToast }: { project: AdminProject, open: boolean, onToggle: () => void, onToast: (s: string) => void }) {
    const news = hasNews(p);
    return <article className={cn('panel stage-mission', open && 'open', p.openQuestions > 0 && 'review')}>
        <button type="button" className="stage-mission-head" aria-expanded={open} onClick={onToggle}>
            <span className="stage-mission-title"><strong>{p.title}</strong><small>{p.authorName} · mis à jour le {dateFr(p.updatedAt)}{p.files.length > 0 && ` · ${p.files.length} document${p.files.length > 1 ? 's' : ''}`}</small></span>
            {p.seenByAdminAt === null ? <span className="badge orange">Nouveau</span> : news && p.openQuestions === 0 && <span className="badge">Modifié</span>}
            {p.openQuestions > 0 && <span className="badge purple">{p.openQuestions} question{p.openQuestions > 1 ? 's' : ''}</span>}
            <span className={'badge ' + projectBadge[p.status]}>{projectStatusLabels[p.status]}</span>
            <ChevronDown size={18} className="stage-chevron" />
        </button>
        {open && <div className="stage-mission-body">
            <div><h3>Informations</h3>{p.description ? <p className="stage-description">{p.description}</p> : <p className="muted">Pas encore de description.</p>}<p className="muted">Proposé le {dateFr(p.createdAt)}.</p></div>
            <div><h3><Paperclip size={15} /> Documents</h3>{p.files.length ? <FileLinks files={p.files} /> : <p className="muted">Aucun document pour l’instant.</p>}</div>
            <div><h3><MessageCircleQuestion size={15} /> Questions</h3>{p.questions.length ? <div className="admin-questions">{p.questions.map(q => <ProjectAnswer key={q._id} q={q} author={p.authorName} onToast={onToast} />)}</div> : <p className="muted">Aucune question sur ce projet.</p>}</div>
        </div>}
    </article>;
}

function ProjectAnswer({ q, author, onToast }: { q: ProjectQuestion, author: string, onToast: (s: string) => void }) {
    const answer = useMutation(anyApi.projects.answer);
    const [text, setText] = useState(q.answer ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await answer({ id: q._id, answer: text }); onToast(text.trim() ? 'Réponse envoyée' : 'Réponse retirée'); } catch (err) { setError(errorText(err, 'La réponse n’a pas été enregistrée.')); } finally { setBusy(false); } };
    return <div className="stage-review"><div className="qa-meta"><span className={'badge ' + (q.answer ? 'green' : 'orange')}>{q.answer ? 'Répondu' : 'À répondre'}</span><small>{author} · {dateFr(q.createdAt)}</small></div>
        <p className="answer-body">{q.body}</p>
        <form onSubmit={submit} className="project-ask"><Textarea rows={2} maxLength={4000} value={text} disabled={busy} onChange={e => setText(e.target.value)} placeholder="Ta réponse…" aria-label={'Réponse à ' + author} />{error && <p role="alert" className="error-inline">{error}</p>}<div><Button disabled={busy || text.trim() === (q.answer ?? '')}>{busy ? 'Envoi…' : q.answer ? 'Mettre à jour' : 'Répondre'}</Button></div></form>
    </div>;
}
