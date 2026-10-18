'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { Download, Paperclip, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ask } from '@/components/confirm-dialog';
import { emptyExpense, expenseCategories, expenseError, expensesCsv, yearSummary, yearsOf, type ExpenseInput } from '../lib/expenses';
import { euro } from '../lib/products';
import { isoToday } from '../lib/model';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';

type Row = Omit<ExpenseInput, 'amount' | 'receipt'> & { _id: string; amount: number; receipt?: FileView };
const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dayFr = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const num = (s: string) => { const t = s.trim().replace(/\s/g, '').replace(',', '.'); return t === '' ? null : Number(t); };

function download(name: string, text: string) { const a = document.createElement('a'); const href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.href = href; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); }

/** Dépenses de l'atelier : totaux de l'année, répartition par mois et par catégorie, liste des factures. */
export function ExpensesAdmin({ onToast }: { onToast: (s: string) => void }) {
    const rows = useQuery(anyApi.expenses.list) as Row[] | undefined;
    const today = isoToday();
    const [year, setYear] = useState(today.slice(0, 4)), [search, setSearch] = useState(''), [category, setCategory] = useState('');
    const [editing, setEditing] = useState<Row | 'new' | null>(null);
    if (!rows) return <p className="muted">Chargement des dépenses…</p>;
    const summary = yearSummary(rows, year);
    const q = search.trim().toLowerCase();
    const shown = rows.filter(r => r.date.startsWith(year + '-') && (!category || r.category === category) && (!q || `${r.supplier} ${r.label} ${r.notes}`.toLowerCase().includes(q)));
    const shownTotal = shown.reduce((s, r) => s + r.amount, 0);
    const current = year === today.slice(0, 4);
    // Moyenne sur les mois écoulés pour l'année en cours, sur 12 mois pour une année terminée.
    const elapsed = current ? Number(today.slice(5, 7)) : 12;
    const peak = Math.max(...summary.months, 0);
    return <div className="expenses">
        <div className="expenses-toolbar">
            <label className="filter-field">Année<select value={year} onChange={e => { setYear(e.target.value); setCategory(''); }}>{yearsOf(rows, today.slice(0, 4)).map(y => <option key={y}>{y}</option>)}</select></label>
            <span className="spacer" />
            {rows.length > 0 && <Button type="button" variant="outline" onClick={() => download(`faienca-depenses-${year}.csv`, expensesCsv(shown))}><Download size={16} />Exporter CSV</Button>}
            <Button type="button" onClick={() => setEditing('new')}><Plus size={18} />Nouvelle dépense</Button>
        </div>

        <section className="product-kpis">
            <Kpi label={`Total ${year}`} value={euro(summary.total)} detail={`${summary.count} dépense${summary.count > 1 ? 's' : ''}`} />
            {current && <Kpi label="Ce mois-ci" value={euro(summary.months[elapsed - 1] ?? 0)} detail={months[elapsed - 1] + ' ' + year} />}
            <Kpi label="Moyenne par mois" value={euro(summary.total / elapsed)} detail={current ? `sur ${elapsed} mois écoulé${elapsed > 1 ? 's' : ''}` : 'sur 12 mois'} />
            <Kpi label="Plus gros poste" value={summary.categories[0] ? euro(summary.categories[0].amount) : '—'} detail={summary.categories[0]?.category ?? 'Aucune dépense'} />
        </section>

        {summary.count > 0 && <div className="expenses-charts">
            <section className="panel">
                <div className="panel-title"><h2>Par mois</h2><span className="muted">{year}</span></div>
                <ol className="expenses-months" aria-label={`Dépenses par mois en ${year}`}>
                    {summary.months.map((m, i) => <li key={i} title={`${months[i]} ${year} : ${euro(m)}`}>
                        <span className="expenses-month-bar"><span style={{ height: peak ? (m / peak * 100) + '%' : 0 }} /></span>
                        <small>{months[i].replace('.', '')}</small>
                        <span className="sr-only">{euro(m)}</span>
                    </li>)}
                </ol>
            </section>
            <section className="panel">
                <div className="panel-title"><h2>Par catégorie</h2><span className="muted">{summary.categories.length}</span></div>
                <ul className="expenses-categories">
                    {summary.categories.map(c => <li key={c.category}>
                        <button type="button" aria-pressed={category === c.category} onClick={() => setCategory(category === c.category ? '' : c.category)} title="Filtrer la liste sur cette catégorie">
                            <span className="expenses-category-head"><span>{c.category}</span><strong>{euro(c.amount)}</strong></span>
                            <span className="expenses-category-bar"><span style={{ width: (c.amount / summary.categories[0]!.amount * 100) + '%' }} /></span>
                            <small>{Math.round(c.amount / summary.total * 100)} % du total</small>
                        </button>
                    </li>)}
                </ul>
            </section>
        </div>}

        <section className="panel expenses-list">
            <div className="panel-title"><h2>Factures et achats</h2><span className="muted">{shown.length} · {euro(shownTotal)}</span></div>
            <div className="filters">
                <label className="search"><Search size={17} /><input aria-label="Rechercher une dépense" placeholder="Rechercher un fournisseur, un libellé…" value={search} onChange={e => setSearch(e.target.value)} /></label>
                <label className="filter-field">Catégorie<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Toutes</option>{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></label>
            </div>
            {!rows.length ? <div className="empty"><Receipt size={28} /><p>Aucune dépense pour l’instant. Ajoutez votre première facture avec « Nouvelle dépense ».</p></div>
                : !shown.length ? <p className="muted">Aucune dépense ne correspond, en {year}.</p>
                : <div className="table-scroll"><table className="expenses-table"><thead><tr>{['Date', 'Fournisseur', 'Catégorie', 'Montant TTC', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                    <tbody>{shown.map(r => <tr key={r._id}>
                        <td>{dayFr(r.date)}</td>
                        <td><strong>{r.supplier}</strong>{r.label && <small>{r.label}</small>}</td>
                        <td>{r.category}</td>
                        <td className="expenses-amount">{euro(r.amount)}</td>
                        <td className="expenses-actions">
                            {r.receipt && (r.receipt.fileUrl ?? r.receipt.url) && <Button type="button" variant="ghost" size="icon" asChild><a href={r.receipt.fileUrl ?? r.receipt.url} target="_blank" rel="noopener noreferrer" aria-label={'Voir le justificatif de ' + r.supplier} title="Voir le justificatif"><Paperclip size={16} /></a></Button>}
                            <Button type="button" variant="outline" onClick={() => setEditing(r)}><Pencil size={14} />Modifier</Button>
                        </td>
                    </tr>)}</tbody></table></div>}
        </section>

        {editing && <ExpenseDialog key={editing === 'new' ? 'new' : editing._id} expense={editing === 'new' ? null : editing} today={today} onClose={() => setEditing(null)} onToast={onToast} />}
    </div>;
}

function Kpi({ label, value, detail }: { label: string, value: string, detail?: string }) {
    return <div className="product-kpi"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function ExpenseDialog({ expense, today, onClose, onToast }: { expense: Row | null, today: string, onClose: () => void, onToast: (s: string) => void }) {
    const save = useMutation(anyApi.expenses.save), remove = useMutation(anyApi.expenses.remove), uploadUrl = useMutation(anyApi.expenses.generateUploadUrl);
    const [data, setData] = useState<Omit<ExpenseInput, 'receipt'> & { receipt?: FileView }>(() => expense ? { ...expense } : emptyExpense(today));
    const [amount, setAmount] = useState(() => expense ? expense.amount.toFixed(2).replace('.', ',') : '');
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const set = (patch: Partial<typeof data>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
    useEffect(() => { setData(d => ({ ...d, amount: num(amount) })); }, [amount]);
    const close = async () => { if (!busy && (!dirty || await ask('Fermer sans enregistrer cette dépense ?'))) onClose(); };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const { date, supplier, label, category, amount, notes, receipt } = data;
        // Seuls les champs de la dépense partent au serveur : ni son _id, ni le lien d'aperçu (fileUrl) calculé par le serveur.
        const input: ExpenseInput = { date, supplier, label, category, amount, notes, ...(receipt ? { receipt: { id: receipt.id, label: receipt.label, url: receipt.url, ...(receipt.storageId ? { storageId: receipt.storageId } : {}) } } : {}) };
        const problem = expenseError(input); if (problem) { setError(problem); return; }
        setBusy(true); setError('');
        try { await save({ data: input, ...(expense ? { id: expense._id } : {}) }); onToast(expense ? 'Dépense mise à jour' : 'Dépense ajoutée'); onClose(); }
        catch (err) { setError(errorText(err, 'La dépense n’a pas été enregistrée.')); setBusy(false); }
    };
    const erase = async () => {
        if (!expense || !await ask({ title: `Supprimer la dépense « ${expense.supplier} » ?`, description: 'Elle disparaîtra des totaux, avec son justificatif.', confirmLabel: 'Supprimer', destructive: true })) return;
        setBusy(true);
        try { await remove({ id: expense._id }); onToast('Dépense supprimée'); onClose(); }
        catch (err) { setError(errorText(err, 'La dépense n’a pas été supprimée.')); setBusy(false); }
    };
    return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
        <DialogContent className="expense-dialog" onInteractOutside={e => e.preventDefault()}>
            <form onSubmit={submit}>
                <header><span className="eyebrow">DÉPENSE</span><DialogTitle>{expense ? 'Modifier la dépense' : 'Nouvelle dépense'}</DialogTitle><DialogDescription className="muted">Montant TTC, tel qu’il apparaît sur la facture.</DialogDescription></header>
                {error && <div role="alert" className="error">{error}</div>}
                <div className="expense-grid">
                    <div><Label htmlFor="x-date">Date</Label><Input id="x-date" type="date" required value={data.date} onChange={e => set({ date: e.target.value })} /></div>
                    <div><Label htmlFor="x-amount">Montant TTC (€)</Label><Input id="x-amount" inputMode="decimal" required placeholder="Ex. 24,90" value={amount} onChange={e => { setAmount(e.target.value); setDirty(true); }} /></div>
                    <div><Label htmlFor="x-supplier">Fournisseur</Label><Input id="x-supplier" required maxLength={120} placeholder="Ex. DMC, Shopify, La Poste…" value={data.supplier} onChange={e => set({ supplier: e.target.value })} /></div>
                    <div><Label htmlFor="x-category">Catégorie</Label><select id="x-category" className="expense-select" value={data.category} onChange={e => set({ category: e.target.value })}>{expenseCategories.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div className="full"><Label htmlFor="x-label">Libellé</Label><Input id="x-label" maxLength={200} placeholder="Ex. Abonnement mensuel, fils pour le kit Mimosa…" value={data.label} onChange={e => set({ label: e.target.value })} /></div>
                    <div className="full"><Label htmlFor="x-notes">Notes</Label><Textarea id="x-notes" rows={2} maxLength={2000} value={data.notes} onChange={e => set({ notes: e.target.value })} /></div>
                    <div className="full"><Label>Justificatif</Label>
                        {data.receipt ? <FileLinks files={[data.receipt]} onRemove={() => set({ receipt: undefined })} />
                            : <FileAdder what="justificatif" upload={async () => await uploadUrl() as string} onAdd={async f => set({ receipt: { ...f, fileUrl: null } })} disabled={busy} />}
                    </div>
                </div>
                <footer>
                    {expense && <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Supprimer la dépense" disabled={busy} onClick={() => void erase()}><Trash2 size={18} /></Button>}
                    <span className="spacer" />
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Annuler</Button>
                    <Button disabled={busy}>{busy ? 'Enregistrement…' : expense ? 'Enregistrer' : 'Ajouter la dépense'}</Button>
                </footer>
            </form>
        </DialogContent>
    </Dialog>;
}
