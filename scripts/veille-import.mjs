// Envoie dans la Veille textile ce que Claude Code a préparé dans data/veille/.
//   node scripts/veille-import.mjs                  → les portraits (data/veille/portraits/*.json), vers dev
//   node scripts/veille-import.mjs --ateliers       → les ateliers (data/veille/ateliers/*.json)
//   node scripts/veille-import.mjs --videos         → les vidéos (data/veille/videos.json)
//   node scripts/veille-import.mjs --tout           → les trois
//   … --prod                                        → vers la production au lieu de dev
//   node scripts/veille-import.mjs a.json b.json    → seulement ces portraits (avec --ateliers : ces ateliers)
// Une fiche déjà présente (même nom, ou même lien pour une vidéo) est complétée, pas dupliquée.
// On appelle le CLI Convex avec node directement : sous Windows, npx coupe les longues lignes de commande.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const prod = args.includes('--prod'), all = args.includes('--tout');
const files = args.filter(a => !a.startsWith('--'));
const target = prod ? 'PROD' : 'dev';
let failed = 0;

function run(fn, payload) {
    const r = spawnSync(process.execPath, ['node_modules/convex/bin/main.js', 'run', ...(prod ? ['--prod'] : []), fn, JSON.stringify({ json: payload })], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').slice(-3).join(' '));
    const i = r.stdout.indexOf('{');
    return i < 0 ? {} : JSON.parse(r.stdout.slice(i));
}
const readJson = file => JSON.stringify(JSON.parse(readFileSync(file, 'utf8')));
const jsonIn = dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => join(dir, f)) : [];

function importEach(label, list, fn, report) {
    if (!list.length) { console.log(`Aucun fichier pour : ${label}.`); return; }
    console.log(`${label} : envoi de ${list.length} fichier(s) vers ${target}…`);
    for (const file of list) {
        try { const json = readJson(file); console.log(`✓ ${JSON.parse(json).name} : ${report(run(fn, json))}`); }
        catch (err) { console.log(`✗ ${basename(file)} : ${err.message}`); failed++; }
    }
}

const onlyOthers = args.some(a => a === '--ateliers' || a === '--videos');
const portraits = all ? jsonIn('data/veille/portraits') : onlyOthers ? [] : files.length ? files : jsonIn('data/veille/portraits');
if (portraits.length) importEach('Portraits', portraits, 'veille:importPortrait', out => `${out.news ?? 0} nouvelle(s) ajoutée(s)`);
if (all || args.includes('--ateliers')) importEach('Ateliers', files.length && !all ? files : jsonIn('data/veille/ateliers'), 'veilleAteliers:importWorkshop', out => out.created ? 'ajouté' : 'complété');
if (all || args.includes('--videos')) {
    const file = 'data/veille/videos.json';
    if (!existsSync(file)) console.log('Aucun fichier de vidéos.');
    else {
        try { const out = run('veilleVideos:importVideos', readJson(file)); console.log(`✓ Vidéos vers ${target} : ${out.added} ajoutée(s) sur ${out.found}`); }
        catch (err) { console.log(`✗ videos.json : ${err.message}`); failed++; }
    }
}
if (failed) { console.log(`${failed} échec(s).`); process.exit(1); }
