import { query, mutation, internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { portraitFields, newsFields } from './schema';
import { requireAdmin, requireTrainee } from './access';
import { mentionedArtists, mergePortrait, nameKey, newsError, normalizeNews, normalizePortrait, portraitError, type NewsInput, type PortraitInput } from '../lib/veille';

// Veille textile : portraits de brodeuses d'art et nouvelles du monde textile, pour l'atelier et les stagiaires.

/** Une recherche de l'agent qui dure plus longtemps a forcément échoué : on peut la relancer. */
const STALE_MS = 45 * 60 * 1000;
/** Modèle utilisé par défaut sur OpenRouter ; OPENROUTER_MODEL dans Convex le remplace. */
export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
/**
 * Moteur de l'agent : Exa s'il a une clé (EXA_API_KEY, effort réglable par EXA_EFFORT), sinon OpenRouter.
 * Le nom sert aussi d'étiquette dans le journal.
 */
export function agentEngine(): { provider: 'exa' | 'openrouter'; model: string } | null {
    if (process.env.EXA_API_KEY) return { provider: 'exa', model: `exa/agent-${exaEffort()}` };
    if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter', model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL };
    return null;
}
const EXA_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export const exaEffort = () => { const e = process.env.EXA_EFFORT?.trim() as typeof EXA_EFFORTS[number]; return EXA_EFFORTS.includes(e) ? e : 'medium'; };
const modelName = () => agentEngine()?.model ?? DEFAULT_MODEL;
const authorOf = (me: Awaited<ReturnType<typeof requireTrainee>>) => me.role === 'admin' ? 'L’atelier' : (me.user.name || me.user.email || 'Stagiaire');
const portraitOf = (a: Doc<'artists'>): PortraitInput => {
    const { name, country, city, zone, birthDate, deathDate, techniques, summary, biography, website, instagram, photoUrl, works, timeline, sources, researchNotes } = a;
    return { name, country, city, zone, birthDate, deathDate, techniques, summary, biography, website, instagram, photoUrl, works, timeline, sources, researchNotes };
};
const running = (a: Pick<Doc<'artists'>, 'research' | 'updatedAt'>) => a.research === 'running' && Date.now() - a.updatedAt < STALE_MS;
const runStatus = (r: Pick<Doc<'agentRuns'>, 'status' | 'startedAt'>) => r.status === 'running' && Date.now() - r.startedAt >= STALE_MS ? 'error' as const : r.status;
const newId = () => crypto.randomUUID();

/** La liste des artistes, sans les biographies. */
export const artists = query({
    args: {}, handler: async (ctx) => {
        await requireTrainee(ctx);
        const rows = await ctx.db.query('artists').collect();
        return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(a => ({
            _id: a._id, name: a.name, country: a.country, city: a.city, zone: a.zone, birthDate: a.birthDate, deathDate: a.deathDate,
            techniques: a.techniques, summary: a.summary, photoUrl: a.photoUrl, works: a.works.length, dates: a.timeline.length,
            research: running(a) ? 'running' as const : a.research === 'running' ? 'error' as const : a.research,
            updatedAt: a.updatedAt,
        }));
    }
});

/** Un portrait complet, avec les nouvelles qui la concernent et le coût de la dernière recherche. */
export const artist = query({
    args: { id: v.id('artists') }, handler: async (ctx, { id }) => {
        await requireTrainee(ctx);
        const a = await ctx.db.get(id); if (!a) return null;
        const news = (await ctx.db.query('textileNews').collect()).filter(n => n.artistIds.includes(id));
        const last = await ctx.db.query('agentRuns').withIndex('by_artist', q => q.eq('artistId', id)).order('desc').first();
        const stale = a.research === 'running' && !running(a);
        return {
            ...a, research: stale ? 'error' as const : a.research, researchError: stale ? 'La recherche n’a pas abouti. Relance-la.' : a.researchError, news,
            lastRun: last && { status: runStatus(last), cost: last.cost, model: last.model, finishedAt: last.finishedAt },
        };
    }
});

export const news = query({
    args: {}, handler: async (ctx) => {
        await requireTrainee(ctx);
        const [rows, people] = await Promise.all([ctx.db.query('textileNews').collect(), ctx.db.query('artists').collect()]);
        const names = new Map(people.map(a => [a._id, a.name]));
        return rows.map(n => ({ ...n, artists: n.artistIds.flatMap(id => names.has(id) ? [{ _id: id, name: names.get(id)! }] : []) }));
    }
});

/** Dernière recherche d'actualités, et si l'agent est disponible (clé Exa ou OpenRouter configurée). */
export const agentStatus = query({
    args: {}, handler: async (ctx) => {
        await requireTrainee(ctx);
        const scan = await ctx.db.query('agentRuns').withIndex('by_kind', q => q.eq('kind', 'news')).order('desc').first();
        return {
            available: !!agentEngine(), model: modelName(),
            scan: scan ? { status: runStatus(scan), startedAt: scan.startedAt, finishedAt: scan.finishedAt, error: scan.error, cost: scan.cost } : null,
        };
    }
});

/** Journal de toutes les recherches de l'agent, pour l'atelier seulement. */
export const runs = query({
    args: {}, handler: async (ctx) => {
        await requireAdmin(ctx);
        const rows = await ctx.db.query('agentRuns').order('desc').take(200);
        return rows.map(r => ({ ...r, status: runStatus(r) }));
    }
});

const requireAgent = () => { if (!agentEngine()) throw new ConvexError('L’agent de recherche n’est pas encore branché : il manque une clé EXA_API_KEY ou OPENROUTER_API_KEY dans Convex.'); };

async function startRun(ctx: MutationCtx, kind: 'portrait' | 'news', subject: string, startedBy: string, artistId?: Id<'artists'>) {
    const model = modelName(), now = Date.now();
    return await ctx.db.insert('agentRuns', {
        kind, subject, startedBy, model, status: 'running', startedAt: now, ...(artistId ? { artistId } : {}),
        cost: 0, inputTokens: 0, outputTokens: 0, searches: 0, fetches: 0,
        log: [{ at: now, level: 'info', text: `Recherche lancée par ${startedBy}, modèle ${model}.` }],
    });
}

export const saveArtist = mutation({
    args: { id: v.optional(v.id('artists')), data: v.object(portraitFields) }, handler: async (ctx, { id, data }) => {
        const me = await requireTrainee(ctx);
        const error = portraitError(data); if (error) throw new ConvexError(error);
        const key = nameKey(data.name), now = Date.now();
        const twin = await ctx.db.query('artists').withIndex('by_nameKey', q => q.eq('nameKey', key)).first();
        if (twin && twin._id !== id) throw new ConvexError(`${twin.name} est déjà dans la liste.`);
        if (id) { await ctx.db.patch(id, { ...data, name: data.name.trim(), nameKey: key, updatedAt: now }); return id; }
        return await ctx.db.insert('artists', { ...data, name: data.name.trim(), nameKey: key, research: 'idle', createdAt: now, updatedAt: now, authorName: authorOf(me) });
    }
});

export const removeArtist = mutation({
    args: { id: v.id('artists') }, handler: async (ctx, { id }) => {
        await requireTrainee(ctx);
        for (const n of await ctx.db.query('textileNews').collect()) if (n.artistIds.includes(id)) await ctx.db.patch(n._id, { artistIds: n.artistIds.filter(a => a !== id) });
        await ctx.db.delete(id);
    }
});

export const saveNews = mutation({
    args: { id: v.optional(v.id('textileNews')), data: v.object(newsFields), artistIds: v.array(v.id('artists')) }, handler: async (ctx, { id, data, artistIds }) => {
        const me = await requireTrainee(ctx);
        const error = newsError(data); if (error) throw new ConvexError(error);
        const now = Date.now(), clean = { ...data, title: data.title.trim(), summary: data.summary.trim() };
        if (id) { await ctx.db.patch(id, { ...clean, artistIds, updatedAt: now }); return id; }
        return await ctx.db.insert('textileNews', { ...clean, artistIds, source: 'manual', createdAt: now, updatedAt: now, authorName: authorOf(me) });
    }
});

export const removeNews = mutation({
    args: { id: v.id('textileNews') }, handler: async (ctx, { id }) => { await requireTrainee(ctx); await ctx.db.delete(id); }
});

/**
 * Lance l'agent sur une artiste : il la retrouve sur Internet puis creuse chaque piste
 * (œuvres, expositions, parcours, dates). Le portrait se remplit quand il a fini.
 */
export const research = mutation({
    args: { name: v.optional(v.string()), id: v.optional(v.id('artists')), hint: v.optional(v.string()) }, handler: async (ctx, args) => {
        const me = await requireTrainee(ctx);
        requireAgent();
        const hint = (args.hint ?? '').trim().slice(0, 500), now = Date.now();
        let target = args.id ? await ctx.db.get(args.id) : null;
        if (!target) {
            const name = (args.name ?? '').trim();
            if (!name || name.length > 120) throw new ConvexError('Indique le nom de l’artiste à rechercher.');
            target = await ctx.db.query('artists').withIndex('by_nameKey', q => q.eq('nameKey', nameKey(name))).first();
            if (!target) {
                const id = await ctx.db.insert('artists', { ...normalizePortrait({ name }, newId), nameKey: nameKey(name), research: 'idle', createdAt: now, updatedAt: now, authorName: authorOf(me) });
                target = (await ctx.db.get(id))!;
            }
        }
        if (running(target)) throw new ConvexError(`La recherche sur ${target.name} est déjà en cours.`);
        await ctx.db.patch(target._id, { research: 'running', researchError: undefined, researchHint: hint || target.researchHint, updatedAt: now });
        const runId = await startRun(ctx, 'portrait', target.name, authorOf(me), target._id);
        await ctx.scheduler.runAfter(0, internal.veilleAgent.researchArtist, { id: target._id, runId });
        return target._id;
    }
});

/** Lance l'agent sur les nouvelles du monde textile (expositions, salons…), France et Europe d'abord. */
export const scanNews = mutation({
    args: {}, handler: async (ctx) => {
        const me = await requireTrainee(ctx);
        requireAgent();
        const last = await ctx.db.query('agentRuns').withIndex('by_kind', q => q.eq('kind', 'news')).order('desc').first();
        if (last && runStatus(last) === 'running') throw new ConvexError('Une recherche d’actualités est déjà en cours.');
        const runId = await startRun(ctx, 'news', 'Nouvelles du monde textile', authorOf(me));
        await ctx.scheduler.runAfter(0, internal.veilleAgent.scanNews, { runId });
        return runId;
    }
});

// --- Pour l'agent ---

export const researchContext = internalQuery({
    args: { id: v.id('artists') }, handler: async (ctx, { id }) => {
        const a = await ctx.db.get(id);
        return a && { name: a.name, hint: a.researchHint ?? '', known: portraitOf(a), model: modelName() };
    }
});

export const newsContext = internalQuery({
    args: {}, handler: async (ctx) => {
        const [rows, people] = await Promise.all([ctx.db.query('textileNews').collect(), ctx.db.query('artists').collect()]);
        return { known: rows.map(n => n.title + (n.url ? ' — ' + n.url : '')).slice(-150), artists: people.map(a => a.name), model: modelName() };
    }
});

/** Ajoute une ligne au journal et cumule ce que l'étape a coûté. */
export const logRun = internalMutation({
    args: {
        runId: v.id('agentRuns'), lines: v.array(v.object({ level: v.union(v.literal('info'), v.literal('error')), text: v.string() })),
        cost: v.optional(v.number()), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()), searches: v.optional(v.number()), fetches: v.optional(v.number()),
    }, handler: async (ctx, { runId, lines, ...add }) => {
        const r = await ctx.db.get(runId); if (!r) return;
        const now = Date.now();
        await ctx.db.patch(runId, {
            log: [...r.log, ...lines.map(l => ({ at: now, level: l.level, text: l.text.slice(0, 2000) }))].slice(-400),
            cost: r.cost + (add.cost ?? 0), inputTokens: r.inputTokens + (add.inputTokens ?? 0), outputTokens: r.outputTokens + (add.outputTokens ?? 0),
            searches: r.searches + (add.searches ?? 0), fetches: r.fetches + (add.fetches ?? 0),
        });
    }
});

async function endRun(ctx: MutationCtx, runId: Id<'agentRuns'>, text: string, error?: string) {
    const r = await ctx.db.get(runId); if (!r) return;
    const now = Date.now();
    await ctx.db.patch(runId, { status: error ? 'error' : 'done', finishedAt: now, ...(error ? { error } : {}), log: [...r.log, { at: now, level: error ? 'error' as const : 'info' as const, text }].slice(-400) });
}

/**
 * Ajoute les nouvelles absentes et les relie aux artistes citées. Une nouvelle est déjà connue si elle a le même titre,
 * ou le même lien et la même date : plusieurs nouvelles peuvent renvoyer à une même page (« À propos » d'une artiste).
 */
async function addNews(ctx: MutationCtx, items: NewsInput[], also: Id<'artists'>[] = []) {
    const [existing, people] = await Promise.all([ctx.db.query('textileNews').collect(), ctx.db.query('artists').collect()]);
    const known: { _id?: Id<'textileNews'>; title: string; url: string; startDate: string; artistIds: Id<'artists'>[] }[] = [...existing];
    const same = (a: { title: string; url: string; startDate: string }, b: NewsInput) => nameKey(a.title) === nameKey(b.title) || (!!b.url && a.url === b.url && a.startDate === b.startDate);
    let added = 0;
    for (const n of items) {
        if (newsError(n)) continue;
        const twin = known.find(e => same(e, n));
        if (twin) {
            // Déjà connue : on la relie simplement à l'artiste recherchée.
            if (twin._id && also.some(a => !twin.artistIds.includes(a))) await ctx.db.patch(twin._id, { artistIds: [...new Set([...twin.artistIds, ...also])] });
            continue;
        }
        const artistIds = [...new Set([...also, ...mentionedArtists(people, `${n.title} ${n.summary}`).map(a => a._id)])];
        const now = Date.now();
        const _id = await ctx.db.insert('textileNews', { ...n, artistIds, source: 'agent', createdAt: now, updatedAt: now, authorName: 'Agent de veille' });
        known.push({ _id, title: n.title, url: n.url, startDate: n.startDate, artistIds });
        added++;
    }
    return added;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export const applyResearch = internalMutation({
    args: { id: v.id('artists'), runId: v.id('agentRuns'), result: v.string() }, handler: async (ctx, { id, runId, result }) => {
        const a = await ctx.db.get(id);
        if (!a) { await endRun(ctx, runId, 'Le portrait a été supprimé pendant la recherche : rien n’a été enregistré.', 'Portrait supprimé'); return; }
        const raw = JSON.parse(result) as Record<string, unknown>;
        const found = normalizePortrait({ ...raw, name: a.name }, newId);
        const merged = mergePortrait(portraitOf(a), found);
        await ctx.db.patch(id, { ...merged, research: 'idle', researchError: undefined, researchedAt: Date.now(), updatedAt: Date.now() });
        const items = (Array.isArray(raw.news) ? raw.news : []).map(normalizeNews).filter((n): n is NewsInput => !!n);
        const added = await addNews(ctx, items, [id]);
        await endRun(ctx, runId, `Portrait enregistré : ${plural(found.works.length, 'œuvre')}, ${plural(found.timeline.length, 'date')}, ${plural(found.sources.length, 'source')}, ${plural(items.length, 'nouvelle')} trouvée${items.length > 1 ? 's' : ''} (${added} ajoutée${added > 1 ? 's' : ''}).`);
    }
});

export const researchFailed = internalMutation({
    args: { id: v.id('artists'), runId: v.id('agentRuns'), error: v.string() }, handler: async (ctx, { id, runId, error }) => {
        if (await ctx.db.get(id)) await ctx.db.patch(id, { research: 'error', researchError: error.slice(0, 500), updatedAt: Date.now() });
        await endRun(ctx, runId, 'Échec : ' + error, error.slice(0, 500));
    }
});

export const applyNews = internalMutation({
    args: { runId: v.id('agentRuns'), result: v.string() }, handler: async (ctx, { runId, result }) => {
        const raw = JSON.parse(result) as { news?: unknown[] };
        const items = (raw.news ?? []).map(normalizeNews).filter((n): n is NewsInput => !!n);
        const added = await addNews(ctx, items);
        await endRun(ctx, runId, `${plural(items.length, 'nouvelle')} trouvée${items.length > 1 ? 's' : ''}, ${added} ajoutée${added > 1 ? 's' : ''} (les autres étaient déjà dans la veille).`);
    }
});

export const scanFailed = internalMutation({
    args: { runId: v.id('agentRuns'), error: v.string() }, handler: async (ctx, { runId, error }) => { await endRun(ctx, runId, 'Échec : ' + error, error.slice(0, 500)); }
});

/**
 * Import d'un portrait préparé ailleurs (par exemple par Claude Code), en JSON :
 *   npx convex run veille:importPortrait '{"json": "…"}'
 * Sous Windows, un long JSON dépasse la ligne de commande de npx : lancer node_modules/convex/bin/main.js avec node.
 * Le portrait est fusionné avec celui du même nom s'il existe ; ses nouvelles sont ajoutées.
 */
export const importPortrait = internalMutation({
    args: { json: v.string() }, handler: async (ctx, { json }) => {
        const raw = JSON.parse(json) as Record<string, unknown>;
        const found = normalizePortrait(raw, newId);
        const error = portraitError(found); if (error) throw new ConvexError(error);
        const key = nameKey(found.name), now = Date.now();
        const twin = await ctx.db.query('artists').withIndex('by_nameKey', q => q.eq('nameKey', key)).first();
        let id: Id<'artists'>;
        if (twin) { id = twin._id; await ctx.db.patch(id, { ...mergePortrait(portraitOf(twin), found), research: 'idle', researchError: undefined, researchedAt: now, updatedAt: now }); }
        else id = await ctx.db.insert('artists', { ...found, nameKey: key, research: 'idle', researchedAt: now, createdAt: now, updatedAt: now, authorName: 'Agent de veille' });
        const items = (Array.isArray(raw.news) ? raw.news : []).map(normalizeNews).filter((n): n is NewsInput => !!n);
        return { id, news: await addNews(ctx, items, [id]) };
    }
});

/**
 * Corrige la photo d'un portrait ou d'un atelier depuis la ligne de commande (vide pour la retirer) :
 *   npx convex run veille:setPhoto '{"table": "workshops", "name": "Atelier Baqué Molinié", "photoUrl": ""}'
 */
export const setPhoto = internalMutation({
    args: { table: v.union(v.literal('artists'), v.literal('workshops')), name: v.string(), photoUrl: v.string() }, handler: async (ctx, { table, name, photoUrl }) => {
        if (photoUrl && !/^https:\/\/\S+$/i.test(photoUrl)) throw new ConvexError('Le lien doit commencer par https://.');
        const row = await ctx.db.query(table).withIndex('by_nameKey', q => q.eq('nameKey', nameKey(name))).first();
        if (!row) throw new ConvexError(`Introuvable : ${name}.`);
        await ctx.db.patch(row._id, { photoUrl, updatedAt: Date.now() });
        return row._id;
    }
});
