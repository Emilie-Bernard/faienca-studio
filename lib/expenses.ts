/** Dépenses de Faïença : factures et achats, pour savoir combien coûte l'atelier. */
import { filesError, type MissionFile } from './stage';

export const expenseCategories = [
  'Matériel et fournitures', 'Emballage et expédition', 'Logiciels et abonnements', 'Site et hébergement',
  'Publicité et marketing', 'Impression', 'Frais bancaires et plateformes', 'Formation', 'Autre',
] as const;

export interface ExpenseInput { date: string; supplier: string; label: string; category: string; amount: number | null; notes: string; receipt?: MissionFile }

export const emptyExpense = (date: string): Omit<ExpenseInput, 'receipt'> => ({ date, supplier: '', label: '', category: expenseCategories[0], amount: null, notes: '' });

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

/** Renvoie un message d'erreur en français, ou null si la dépense est valide. */
export function expenseError(e: ExpenseInput): string | null {
  if (!isDate(e.date)) return 'La date est invalide.';
  if (!e.supplier.trim() || e.supplier.length > 120) return 'Le fournisseur doit contenir entre 1 et 120 caractères.';
  if (e.label.length > 200) return 'Le libellé ne peut pas dépasser 200 caractères.';
  if (!(expenseCategories as readonly string[]).includes(e.category)) return 'Catégorie inconnue.';
  if (e.amount === null || !Number.isFinite(e.amount) || e.amount <= 0 || e.amount >= 1000000) return 'Le montant doit être un nombre positif.';
  if (e.notes.length > 2000) return 'Les notes ne peuvent pas dépasser 2 000 caractères.';
  return e.receipt ? filesError([e.receipt], 'Justificatif') : null;
}

/** Arrondi au centime, pour éviter les 0,30000000004 €. */
export const cents = (n: number) => Math.round(n * 100) / 100;

type Row = { date: string; category: string; amount: number };

/** Total de l'année, par mois (12 cases) et par catégorie (de la plus chère à la moins chère). */
export function yearSummary(rows: Row[], year: string) {
  const inYear = rows.filter(r => r.date.startsWith(year + '-'));
  const months = Array.from({ length: 12 }, () => 0);
  const byCategory = new Map<string, number>();
  for (const r of inYear) {
    months[Number(r.date.slice(5, 7)) - 1] += r.amount;
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
  }
  const total = cents(inYear.reduce((s, r) => s + r.amount, 0));
  return {
    total, count: inYear.length,
    months: months.map(cents),
    categories: [...byCategory].map(([category, amount]) => ({ category, amount: cents(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

/** Années présentes dans les dépenses, plus l'année en cours, de la plus récente à la plus ancienne. */
export const yearsOf = (rows: { date: string }[], current: string) => [...new Set([current, ...rows.map(r => r.date.slice(0, 4))])].sort().reverse();

const cell = (s: string) => /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;

/** Export pour le tableur ou la comptable : séparateur « ; » et virgule décimale, comme Excel en français. */
export function expensesCsv(rows: (ExpenseInput & { amount: number })[]) {
  const head = ['Date', 'Fournisseur', 'Libellé', 'Catégorie', 'Montant TTC (€)', 'Notes'];
  return '﻿' + [head, ...rows.map(r => [r.date, r.supplier, r.label, r.category, r.amount.toFixed(2).replace('.', ','), r.notes])].map(l => l.map(cell).join(';')).join('\n');
}
