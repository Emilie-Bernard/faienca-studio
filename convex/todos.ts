import { queryGeneric as query, mutationGeneric as mutation, internalMutationGeneric as internalMutation } from 'convex/server';
import { v, ConvexError } from 'convex/values';
import { requireAdmin } from './access';
import { isoToday } from '../lib/model';

/** Nombre maximum de tâches dans la liste d'une journée (reportées et terminées du jour comprises). */
export const DAILY_LIMIT = 5;

// Le jour vient du navigateur (fuseau Europe/Paris côté client) : on vérifie seulement son format.
function checkDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw new ConvexError('Date invalide.');
}

async function dayList(ctx: any, today: string) {
    const open = await ctx.db.query('todos').withIndex('by_doneDay', (q: any) => q.eq('doneDay', undefined)).collect();
    const done = await ctx.db.query('todos').withIndex('by_doneDay', (q: any) => q.eq('doneDay', today)).collect();
    return [...open.filter((t: any) => t.day <= today && !t.dismissed), ...done].sort((a: any, b: any) => a.createdAt - b.createdAt);
}

export const today = query({
    args: { today: v.string() }, handler: async (ctx, { today }) => {
        await requireAdmin(ctx); checkDay(today);
        return (await dayList(ctx, today)).map((t: any) => ({ _id: t._id, title: t.title, day: t.day, done: t.doneDay !== undefined, auto: t.source !== undefined }));
    }
});

export const add = mutation({
    args: { title: v.string(), today: v.string() }, handler: async (ctx, { title, today }) => {
        await requireAdmin(ctx); checkDay(today);
        const clean = title.trim();
        if (!clean || clean.length > 200) throw new ConvexError('La tâche doit contenir entre 1 et 200 caractères.');
        if ((await dayList(ctx, today)).length >= DAILY_LIMIT) throw new ConvexError(`${DAILY_LIMIT} tâches maximum par jour : terminez-en une avant d’en ajouter.`);
        return await ctx.db.insert('todos', { title: clean, day: today, createdAt: Date.now() });
    }
});

export const toggle = mutation({
    args: { id: v.id('todos'), today: v.string() }, handler: async (ctx, { id, today }) => {
        await requireAdmin(ctx); checkDay(today);
        const t = await ctx.db.get(id); if (!t) throw new ConvexError('Tâche introuvable.');
        await ctx.db.patch(id, t.doneDay === undefined ? { doneDay: today, doneAt: Date.now() } : { doneDay: undefined, doneAt: undefined });
    }
});

export const remove = mutation({
    args: { id: v.id('todos') }, handler: async (ctx, { id }) => {
        await requireAdmin(ctx);
        const t = await ctx.db.get(id); if (!t) return;
        // Une tâche proposée est seulement retirée, pour ne pas être proposée de nouveau le lendemain.
        if (t.source) await ctx.db.patch(id, { dismissed: true }); else await ctx.db.delete(id);
    }
});

function addDays(day: string, n: number) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const short = (s: string) => s.length > 90 ? s.slice(0, 89) + '…' : s;

/** Tâches proposées pour la journée, de la plus urgente à la moins urgente. */
async function suggestions(ctx: any, today: string) {
    const soon = addDays(today, 2);
    const entries = await ctx.db.query('entries').collect();
    const out: { source: string, title: string }[] = [];
    const due = entries.filter((e: any) => e.date && e.date <= soon && (
        (e.kind === 'publication' && ['À préparer', 'En production'].includes(e.status)) || (e.kind === 'newsletter' && e.status === 'Brouillon')
    )).sort((a: any, b: any) => a.date.localeCompare(b.date));
    const label = (e: any) => (e.kind === 'newsletter' ? 'Préparer la newsletter « ' : 'Finaliser « ') + short(e.title) + ' »' + (e.date < today ? ' (en retard)' : e.date === today ? ' (prévu aujourd’hui)' : '');
    for (const e of due.filter((e: any) => e.date <= today)) out.push({ source: e.kind + ':' + e._id, title: label(e) });
    const questions = (await ctx.db.query('kitQuestions').collect()).filter((q: any) => !q.answer).length;
    if (questions) out.push({ source: 'questions', title: questions === 1 ? 'Répondre à la question d’une cliente' : `Répondre aux ${questions} questions des clientes` });
    for (const e of due.filter((e: any) => e.date > today)) out.push({ source: e.kind + ':' + e._id, title: label(e) });
    const projects = entries.filter((e: any) => e.kind === 'projet' && ['En cours', 'À faire'].includes(e.status))
        .sort((a: any, b: any) => (a.priority === 'Haute' ? 0 : 1) - (b.priority === 'Haute' ? 0 : 1) || (a.status === 'En cours' ? 0 : 1) - (b.status === 'En cours' ? 0 : 1) || (a.date || '9999').localeCompare(b.date || '9999'));
    for (const p of projects) { const task = p.tasks.find((t: any) => !t.done); if (task) out.push({ source: 'tache:' + p._id + ':' + task.id, title: short(p.title) + ' — ' + short(task.title) }); }
    return out;
}

/** Complète la journée jusqu'à 5 tâches. Une proposition déjà faite (ou supprimée) ne revient pas, sauf les questions. */
async function fill(ctx: any, today: string) {
    let free = DAILY_LIMIT - (await dayList(ctx, today)).length; const added: string[] = [];
    for (const s of await suggestions(ctx, today)) {
        if (free <= 0) break;
        const seen = await ctx.db.query('todos').withIndex('by_source', (q: any) => q.eq('source', s.source)).collect();
        if (s.source === 'questions' ? seen.some((t: any) => t.day === today || t.doneDay === today || (t.doneDay === undefined && !t.dismissed)) : seen.length) continue;
        await ctx.db.insert('todos', { title: s.title, day: today, createdAt: Date.now(), source: s.source });
        added.push(s.title); free--;
    }
    return added;
}

export const autoFill = internalMutation({ args: {}, handler: async (ctx) => ({ added: await fill(ctx, isoToday()) }) });

export const fillNow = mutation({
    args: { today: v.string() }, handler: async (ctx, { today }) => {
        await requireAdmin(ctx); checkDay(today);
        return { added: await fill(ctx, today) };
    }
});
