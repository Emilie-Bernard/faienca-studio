'use client';
import { useEffect, useState } from 'react';

/** Modifications non enregistrées d'une fiche, gardées dans ce navigateur pour survivre à un rechargement. */
type Draft<T> = { data: T; revision: number | null };

function read<T>(key: string): Draft<T> | null { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as Draft<T> : null; } catch { return null; } }
export function clearDraft(key: string) { try { localStorage.removeItem(key); } catch { /* stockage indisponible */ } }

/**
 * Reprend le brouillon à l'ouverture s'il part de la version enregistrée actuelle, puis le tient à jour tant que la fiche est modifiée.
 * La lecture se fait après l'affichage : le stockage du navigateur n'existe pas pendant le rendu serveur.
 */
export function useLocalDraft<T>({ key, revision, data, dirty, skip, onRestore }: { key: string, revision: number | null, data: T, dirty: boolean, skip?: boolean, onRestore: (data: T) => void }) {
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (skip) return;
    const d = read<T>(key); if (d && d.revision === revision) { onRestore(d.data); setRestored(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- une seule fois, à l'ouverture de la fiche
  useEffect(() => { try { if (dirty) localStorage.setItem(key, JSON.stringify({ data, revision })); else localStorage.removeItem(key); } catch { /* stockage indisponible */ } }, [key, dirty, data, revision]);
  return { restored: restored && dirty, forget: () => { clearDraft(key); setRestored(false); } };
}
