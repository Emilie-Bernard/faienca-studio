import { internalAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { newsKinds, timelineKinds, zones } from '../lib/veille';
import { agentEngine, exaEffort } from './veille';

// Agent de veille : via Exa (son agent de recherche) ou OpenRouter (un modèle avec la recherche web), il cherche sur Internet, lit les pages,
// puis remet un portrait ou des nouvelles structurés. Chaque étape et son coût vont au journal.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TODAY = () => new Date().toISOString().slice(0, 10);

const s = { type: 'string' } as const;
const newsItem = {
    type: 'object', additionalProperties: false,
    required: ['kind', 'title', 'summary', 'place', 'city', 'country', 'zone', 'startDate', 'endDate', 'url'],
    properties: { kind: { type: 'string', enum: [...newsKinds] }, title: s, summary: s, place: s, city: s, country: s, zone: { type: 'string', enum: [...zones] }, startDate: s, endDate: s, url: s },
};

type FunctionTool = { name: string; description: string; parameters: Record<string, unknown> };

const portraitTool: FunctionTool = {
    name: 'enregistrer_portrait',
    description: 'Enregistre le portrait final de l’artiste dans la veille de l’atelier. À appeler une seule fois, quand toutes les recherches sont faites.',
    parameters: {
        type: 'object', additionalProperties: false,
        required: ['country', 'city', 'zone', 'birthDate', 'deathDate', 'techniques', 'summary', 'biography', 'website', 'instagram', 'photoUrl', 'works', 'timeline', 'news', 'sources', 'researchNotes'],
        properties: {
            country: s, city: s, zone: { type: 'string', enum: [...zones] },
            birthDate: { type: 'string', description: 'AAAA, AAAA-MM ou AAAA-MM-JJ si une source le donne, sinon chaîne vide.' },
            deathDate: { type: 'string', description: 'Vide si la personne est vivante ou si la date est inconnue.' },
            techniques: { type: 'array', items: s },
            summary: { type: 'string', description: 'Une ou deux phrases.' },
            biography: { type: 'string', description: 'Portrait de 3 à 6 paragraphes séparés par une ligne vide : parcours, formation, style, œuvres marquantes, actualité.' },
            website: s, instagram: s, photoUrl: { type: 'string', description: 'Lien https direct vers une image publique, sinon vide.' },
            works: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'year', 'technique', 'description', 'url', 'imageUrl'], properties: { title: s, year: s, technique: s, description: s, url: s, imageUrl: s } } },
            timeline: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'kind', 'label'], properties: { date: { type: 'string', description: 'AAAA, AAAA-MM ou AAAA-MM-JJ' }, kind: { type: 'string', enum: [...timelineKinds] }, label: s } } },
            news: { type: 'array', description: 'Expositions, salons ou actualités récents ou à venir qui la concernent.', items: newsItem },
            sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'url'], properties: { label: s, url: s } } },
            researchNotes: { type: 'string', description: 'Ce qui reste incertain ou à vérifier, homonymes, pistes non creusées.' },
        },
    },
};

const newsTool: FunctionTool = {
    name: 'enregistrer_nouvelles',
    description: 'Enregistre les nouvelles trouvées dans la veille de l’atelier. À appeler une seule fois, à la fin.',
    parameters: { type: 'object', additionalProperties: false, required: ['news'], properties: { news: { type: 'array', items: newsItem } } },
};

const RULES = `Règles :
- Ne rien inventer. Chaque fait vient d'une page que tu as réellement trouvée ou lue ; cite ces pages dans les sources.
- Si une information est incertaine, mets-la dans researchNotes plutôt que dans le portrait.
- Les dates s'écrivent AAAA, AAAA-MM ou AAAA-MM-JJ. Les liens commencent par https://.
- Écris en français, avec un ton simple et chaleureux, sans tiret cadratin.
- zone : "france" si la personne ou l'événement est en France, "europe" pour le reste de l'Europe, "monde" sinon.`;

type Message = { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: ToolCall[] };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type Usage = { cost?: number; prompt_tokens?: number; completion_tokens?: number; server_tool_use?: Record<string, number> };
type Completion = {
    choices?: { finish_reason?: string; message?: Message & { annotations?: { type: string; url_citation?: { url: string; title?: string } }[] } }[];
    usage?: Usage; error?: { message?: string; code?: number | string };
};

/** Erreur à montrer telle quelle dans l'interface. */
class AgentError extends Error {}

const money = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: n < 0.1 ? 3 : 2, maximumFractionDigits: n < 0.1 ? 3 : 2 }) + ' $';

/** Fait chercher le modèle jusqu'à ce qu'il appelle l'outil d'enregistrement ; journalise chaque tour. */
async function runAgent(ctx: ActionCtx, runId: Id<'agentRuns'>, model: string, system: string, prompt: string, tool: FunctionTool): Promise<string> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new AgentError('La clé OPENROUTER_API_KEY manque dans Convex.');
    const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    const tools = [
        // Les pages lues sont tronquées : c'est ce qui coûte le plus cher.
        { type: 'openrouter:web_search', parameters: { max_uses: 15, max_results: 6 } },
        { type: 'openrouter:web_fetch', parameters: { max_uses: 10, max_content_tokens: 15000 } },
        { type: 'function', function: tool },
    ];
    for (let turn = 1; turn <= 4; turn++) {
        const started = Date.now();
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Faïença Studio — veille textile' },
            body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', max_tokens: 32000 }),
        });
        const body = await res.json().catch(() => ({})) as Completion;
        if (!res.ok || body.error) {
            const why = body.error?.message ?? `HTTP ${res.status}`;
            await ctx.runMutation(internal.veille.logRun, { runId, lines: [{ level: 'error', text: `Tour ${turn} : OpenRouter a répondu ${res.status} : ${why}` }] });
            throw new AgentError(res.status === 401 ? 'La clé OPENROUTER_API_KEY est refusée.' : res.status === 402 ? 'Plus assez de crédits sur OpenRouter.' : res.status === 429 ? 'Trop de recherches en même temps : réessaie dans quelques minutes.' : `OpenRouter a répondu ${res.status}.`);
        }
        const choice = body.choices?.[0], msg = choice?.message, u = body.usage ?? {};
        const used = u.server_tool_use ?? {};
        const searches = used.web_search_requests ?? 0, fetches = used.web_fetch_requests ?? 0;
        const cited = [...new Set((msg?.annotations ?? []).flatMap(a => a.url_citation?.url ? [a.url_citation.url] : []))];
        const call = msg?.tool_calls?.find(c => c.function?.name === tool.name);
        await ctx.runMutation(internal.veille.logRun, {
            runId, cost: u.cost ?? 0, inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, searches, fetches,
            lines: [
                { level: 'info', text: `Tour ${turn} (${Math.round((Date.now() - started) / 1000)} s) : ${searches} recherche${searches > 1 ? 's' : ''} web, ${fetches} page${fetches > 1 ? 's' : ''} lue${fetches > 1 ? 's' : ''}, ${(u.prompt_tokens ?? 0).toLocaleString('fr-FR')} jetons lus, ${(u.completion_tokens ?? 0).toLocaleString('fr-FR')} écrits, ${money(u.cost ?? 0)}.` },
                ...cited.slice(0, 40).map(url => ({ level: 'info' as const, text: 'Source citée : ' + url })),
                ...(call ? [{ level: 'info' as const, text: `Résultat remis (${Math.round(call.function.arguments.length / 1000)} ko).` }] : []),
            ],
        });
        if (call) {
            try { JSON.parse(call.function.arguments); return call.function.arguments; }
            catch { throw new AgentError('Le résultat remis par l’agent était incomplet. Relance la recherche.'); }
        }
        if (choice?.finish_reason === 'length') throw new AgentError('La réponse de l’agent a été coupée (trop longue).');
        messages.push({ role: 'assistant', content: msg?.content ?? '' });
        messages.push({ role: 'user', content: `Appelle maintenant l’outil ${tool.name} avec tout ce que tu as trouvé.` });
    }
    throw new AgentError('L’agent n’a pas terminé sa recherche.');
}

const explain = (err: unknown) => err instanceof AgentError ? err.message : `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`;

// --- Exa : la recherche tourne chez Exa ; on la suit toutes les 15 secondes jusqu'au résultat. ---

const EXA = 'https://api.exa.ai/agent/runs';
const POLL_MS = 15_000, MAX_POLLS = 160; // 40 minutes au plus
type Job = { kind: 'portrait'; id: Id<'artists'> } | { kind: 'news' };
type ExaRun = {
    id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; stopReason: string | null;
    output?: { text?: string; structured?: unknown; grounding?: { field: string; citations: { url: string }[] }[] };
    usage?: { searches?: number; agentComputeUnits?: number }; costDollars?: { total?: number };
};
const exaHeaders = () => ({ 'x-api-key': process.env.EXA_API_KEY ?? '', 'Content-Type': 'application/json' });

async function startExa(ctx: ActionCtx, runId: Id<'agentRuns'>, job: Job, system: string, prompt: string, tool: FunctionTool) {
    const effort = exaEffort();
    const res = await fetch(EXA, {
        method: 'POST', headers: exaHeaders(),
        body: JSON.stringify({ query: prompt, systemPrompt: system, effort, outputSchema: tool.parameters, metadata: { faiencaRun: runId } }),
    });
    const body = await res.json().catch(() => ({})) as Partial<ExaRun> & { error?: string; message?: string };
    if (!res.ok || !body.id) {
        await ctx.runMutation(internal.veille.logRun, { runId, lines: [{ level: 'error', text: `Exa a répondu ${res.status} : ${body.message ?? body.error ?? 'erreur inconnue'}` }] });
        throw new AgentError(res.status === 401 || res.status === 403 ? 'La clé EXA_API_KEY est refusée.' : res.status === 402 ? 'Plus assez de crédits sur Exa.' : res.status === 429 ? 'Trop de recherches Exa en même temps : réessaie dans quelques minutes.' : `Exa a répondu ${res.status}.`);
    }
    await ctx.runMutation(internal.veille.logRun, { runId, lines: [{ level: 'info', text: `Recherche confiée à l’agent Exa (effort ${effort}), identifiant ${body.id}.` }] });
    await ctx.scheduler.runAfter(POLL_MS, internal.veilleAgent.pollExa, { runId, exaId: body.id, job, attempt: 1 });
}

const jobValidator = v.union(v.object({ kind: v.literal('portrait'), id: v.id('artists') }), v.object({ kind: v.literal('news') }));

async function finish(ctx: ActionCtx, runId: Id<'agentRuns'>, job: Job, result: string) {
    if (job.kind === 'portrait') await ctx.runMutation(internal.veille.applyResearch, { id: job.id, runId, result });
    else await ctx.runMutation(internal.veille.applyNews, { runId, result });
}
async function fail(ctx: ActionCtx, runId: Id<'agentRuns'>, job: Job, error: string) {
    if (job.kind === 'portrait') await ctx.runMutation(internal.veille.researchFailed, { id: job.id, runId, error });
    else await ctx.runMutation(internal.veille.scanFailed, { runId, error });
}

export const pollExa = internalAction({
    args: { runId: v.id('agentRuns'), exaId: v.string(), job: jobValidator, attempt: v.number() }, handler: async (ctx, { runId, exaId, job, attempt }) => {
        let run: ExaRun;
        try {
            const res = await fetch(`${EXA}/${encodeURIComponent(exaId)}`, { headers: exaHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            run = await res.json() as ExaRun;
        } catch (err) {
            // Un raté réseau ne fait pas échouer la recherche : on réessaie au prochain passage.
            if (attempt < MAX_POLLS) { await ctx.scheduler.runAfter(POLL_MS, internal.veilleAgent.pollExa, { runId, exaId, job, attempt: attempt + 1 }); return; }
            await fail(ctx, runId, job, `Impossible de suivre la recherche Exa (${err instanceof Error ? err.message : 'erreur'}).`); return;
        }
        if (run.status === 'queued' || run.status === 'running') {
            if (attempt >= MAX_POLLS) {
                await fetch(`${EXA}/${encodeURIComponent(exaId)}/cancel`, { method: 'POST', headers: exaHeaders() }).catch(() => {});
                await fail(ctx, runId, job, 'La recherche Exa a pris plus de 40 minutes : elle a été arrêtée.'); return;
            }
            // Une ligne toutes les deux minutes environ, pour suivre sans noyer le journal.
            if (attempt % 8 === 0) await ctx.runMutation(internal.veille.logRun, { runId, lines: [{ level: 'info', text: `Exa travaille encore (${run.status === 'queued' ? 'en attente' : 'en cours'}, ${Math.round(attempt * POLL_MS / 60000)} min).` }] });
            await ctx.scheduler.runAfter(POLL_MS, internal.veilleAgent.pollExa, { runId, exaId, job, attempt: attempt + 1 });
            return;
        }
        const cited = [...new Set((run.output?.grounding ?? []).flatMap(g => g.citations.map(c => c.url)))];
        await ctx.runMutation(internal.veille.logRun, {
            runId, cost: run.costDollars?.total ?? 0, searches: run.usage?.searches ?? 0,
            lines: [
                { level: run.status === 'completed' ? 'info' : 'error', text: `Exa a terminé : ${run.status}${run.stopReason ? ` (${run.stopReason})` : ''}, ${run.usage?.searches ?? 0} recherche(s), ${money(run.costDollars?.total ?? 0)}.` },
                ...cited.slice(0, 40).map(url => ({ level: 'info' as const, text: 'Source citée : ' + url })),
            ],
        });
        if (run.status !== 'completed' || !run.output?.structured || typeof run.output.structured !== 'object') {
            await fail(ctx, runId, job, run.status === 'completed' ? 'Exa n’a rien renvoyé d’exploitable.' : `La recherche Exa s’est arrêtée (${run.status}).`); return;
        }
        await finish(ctx, runId, job, JSON.stringify(run.output.structured));
    }
});

/** Confie la recherche au moteur configuré : Exa s'il a une clé, sinon OpenRouter. */
async function research(ctx: ActionCtx, runId: Id<'agentRuns'>, job: Job, system: string, prompt: (end: string) => string, tool: FunctionTool, model: string) {
    try {
        if (agentEngine()?.provider === 'exa') await startExa(ctx, runId, job, system, prompt('Remplis enfin le schéma de sortie avec tout ce que tu as trouvé.'), tool);
        else await finish(ctx, runId, job, await runAgent(ctx, runId, model, system, prompt(`Appelle enfin ${tool.name} avec tout ce que tu as trouvé.`), tool));
    } catch (err) { await fail(ctx, runId, job, explain(err)); }
}

export const researchArtist = internalAction({
    args: { id: v.id('artists'), runId: v.id('agentRuns') }, handler: async (ctx, { id, runId }) => {
        const c = await ctx.runQuery(internal.veille.researchContext, { id });
        if (!c) { await ctx.runMutation(internal.veille.scanFailed, { runId, error: 'Portrait supprimé avant la recherche.' }); return; }
        const already = c.known.works.length || c.known.timeline.length ? `\n\nCe que l'atelier sait déjà (complète-le) :\n${JSON.stringify({ works: c.known.works.map(w => w.title), timeline: c.known.timeline.map(t => t.date + ' ' + t.label), sources: c.known.sources.map(x => x.url) })}` : '';
        const system = `Tu es l'agent de veille de Faïença, un atelier de broderie. Tu prépares des portraits de brodeuses d'art et d'artistes textiles pour l'atelier et sa stagiaire. Nous sommes le ${TODAY()}.\n\n${RULES}`;
        const prompt = (end: string) => `Prépare le portrait de l'artiste « ${c.name} ».${c.hint ? `\nIndice de l'atelier : ${c.hint}` : ''}

Travaille en deux temps.
1. Trouve-la : site personnel, Instagram, articles, galeries, écoles, salons. Vérifie qu'il s'agit bien d'une brodeuse ou artiste textile. Si le nom semble mal orthographié, cherche les variantes proches et dis-le dans researchNotes. Signale les homonymes.
2. Pour chaque piste trouvée, relance des recherches ciblées et lis les pages les plus utiles : ses créations (titre, année, technique, description, lien, image), son parcours et sa formation, ses expositions, résidences et voyages, ses prix, ses techniques, ses dates de naissance et de décès si elles sont publiques, et son actualité récente ou à venir.

Construis une frise chronologique complète (vie, formation, œuvres, expositions, résidences, prix). ${end}${already}`;
        await research(ctx, runId, { kind: 'portrait', id }, system, prompt, portraitTool, c.model);
    }
});

export const scanNews = internalAction({
    args: { runId: v.id('agentRuns') }, handler: async (ctx, { runId }) => {
        const c = await ctx.runQuery(internal.veille.newsContext, {});
        const system = `Tu es l'agent de veille de Faïença, un atelier de broderie. Tu suis l'actualité du monde textile pour l'atelier et sa stagiaire. Nous sommes le ${TODAY()}.\n\n${RULES}`;
        const prompt = (end: string) => `Cherche les nouvelles du monde de la broderie d'art et du textile : expositions en cours ou à venir, salons et festivals, techniques remises à l'honneur, ateliers et maisons d'art, prix, actualités des brodeuses. La France d'abord, puis l'Europe ; ailleurs seulement si c'est marquant.

Garde les événements en cours, à venir, ou récents (moins de trois mois). Pour chacun : lieu, ville, pays, dates de début et de fin, lien vers la page officielle, et un résumé de 2 à 4 phrases qui dit ce qu'on y verra (artistes, techniques).
${c.artists.length ? `\nArtistes que l'atelier suit (cherche aussi leur actualité) : ${c.artists.join(', ')}.` : ''}
${c.known.length ? `\nDéjà dans la veille, à ne pas reprendre :\n${c.known.join('\n')}` : ''}

Vise une quinzaine de nouvelles solides. ${end}`;
        await research(ctx, runId, { kind: 'news' }, system, prompt, newsTool, c.model);
    }
});
