'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { Plus, X, RotateCcw, Sparkles } from 'lucide-react';
import { isoToday } from '../lib/model';
import { errorText } from './client';

const LIMIT = 5;
type Todo = { _id: string, title: string, day: string, done: boolean, auto: boolean };

function daysLate(from: string, to: string) { return Math.round((Date.parse(to) - Date.parse(from)) / 86400000); }

/** To-do du jour : 5 tâches maximum, celles non terminées restent le lendemain. */
export default function DailyTodos() {
    // On recalcule la date chaque minute pour basculer au jour suivant sans recharger la page.
    const [today, setToday] = useState(isoToday);
    useEffect(() => { const t = setInterval(() => setToday(isoToday()), 60000); return () => clearInterval(t); }, []);
    const todos = useQuery(anyApi.todos.today, { today }) as Todo[] | undefined;
    const add = useMutation(anyApi.todos.add), fillNow = useMutation(anyApi.todos.fillNow), toggle = useMutation(anyApi.todos.toggle), remove = useMutation(anyApi.todos.remove);
    const [title, setTitle] = useState(''), [error, setError] = useState('');
    const list = todos ?? [], done = list.filter(t => t.done).length, full = list.length >= LIMIT;
    const run = async (p: Promise<unknown>, fallback: string) => { setError(''); try { await p; } catch (err) { setError(errorText(err, fallback)); } };
    const suggest = () => run(fillNow({ today }).then((r: { added: string[] }) => { if (!r.added.length) setError('Rien d’urgent à proposer pour le moment.'); }), 'Les suggestions n’ont pas pu être ajoutées.');
    const submit = async (e: FormEvent) => { e.preventDefault(); if (!title.trim() || full) return; const value = title; setTitle(''); await run(add({ title: value, today }), 'La tâche n’a pas été ajoutée.'); };
    return <section className="panel daily-todos">
        <div className="panel-title"><h2>Ma journée</h2><div className="daily-actions"><span className="muted">{done}/{list.length || 0} terminée{done > 1 ? 's' : ''} · {LIMIT} max</span>{!full && <button type="button" onClick={() => void suggest()} title="Compléter avec les contenus à finaliser, les questions des clientes et les étapes des projets prioritaires"><Sparkles size={14} />Suggérer</button>}</div></div>
        <div className="daily-progress" aria-hidden>{Array.from({ length: LIMIT }, (_, i) => <span key={i} className={i < done ? 'done' : i < list.length ? 'open' : ''} />)}</div>
        {todos && <ul>{list.map(t => {
            const late = t.done ? 0 : daysLate(t.day, today);
            return <li key={t._id} className={t.done ? 'done' : ''}>
                <label><input type="checkbox" checked={t.done} onChange={() => void run(toggle({ id: t._id, today }), 'La tâche n’a pas été mise à jour.')} /><span>{t.title}</span>{t.auto && <Sparkles className="auto" size={13} aria-label="Proposée automatiquement" />}</label>
                {late > 0 && <small className="carried" title={'Ajoutée le ' + new Date(t.day + 'T12:00:00').toLocaleDateString('fr-FR')}><RotateCcw size={12} />{late === 1 ? 'depuis hier' : `depuis ${late} jours`}</small>}
                <button type="button" aria-label={'Supprimer ' + t.title} onClick={() => void run(remove({ id: t._id }), 'La suppression a échoué.')}><X size={15} /></button>
            </li>;
        })}</ul>}
        {todos && !list.length && <p className="muted daily-empty">Rien de prévu. Ajoutez jusqu’à {LIMIT} choses à terminer aujourd’hui, ou laissez l’atelier vous en suggérer.</p>}
        {full ? <p className="muted daily-note">{done === LIMIT ? 'Journée bouclée, bravo ! À demain pour la suite.' : `Votre journée est pleine : terminez une tâche avant d’en ajouter une autre.`}</p>
            : <form onSubmit={submit}><input aria-label="Nouvelle tâche" placeholder="Ajouter une tâche pour aujourd’hui…" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /><button type="submit" aria-label="Ajouter la tâche" disabled={!title.trim()}><Plus size={17} /></button></form>}
        {error && <p role="alert" className="daily-error">{error}</p>}
    </section>;
}
