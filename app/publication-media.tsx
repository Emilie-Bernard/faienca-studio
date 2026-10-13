'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { Button } from '@/components/ui/button';
import { Download, ImagePlus, Trash2 } from 'lucide-react';
import { ask } from '@/components/confirm-dialog';
import { newFile } from '../lib/stage';

type Media = { id: string; label: string; url: string; storageId?: string; fileUrl: string | null };
const MAX_BYTES = 50 * 1024 * 1024;

/** Visuels prêts à poster : envoyés dans l'ordre des noms de fichiers, téléchargeables un par un ou tous ensemble. */
export function PublicationMedia({ entryId }: { entryId: string }) {
    const media = useQuery(anyApi.studio.media, { id: entryId }) as Media[] | undefined;
    const upload = useMutation(anyApi.studio.generateUploadUrl), add = useMutation(anyApi.studio.addMedia), remove = useMutation(anyApi.studio.removeMedia);
    const [busy, setBusy] = useState(''), [error, setError] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const send = async (list: FileList | null) => {
        const files = [...(list ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
        if (!files.length) return;
        if (files.some(f => f.size > MAX_BYTES)) { setError('Un fichier dépasse 50 Mo.'); return; }
        setError('');
        try {
            const sent = [];
            for (const [i, file] of files.entries()) {
                setBusy(`Envoi ${i + 1}/${files.length}…`);
                const res = await fetch(await upload(), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
                if (!res.ok) throw new Error('Le téléversement a échoué. Vérifiez votre connexion puis réessayez.');
                const { storageId } = await res.json() as { storageId: string };
                sent.push({ ...newFile(), label: file.name, storageId });
            }
            await add({ id: entryId, files: sent });
        } catch (err) { setError(err instanceof Error && err.message ? err.message : 'Les visuels n’ont pas pu être ajoutés.'); }
        finally { setBusy(''); if (input.current) input.current.value = ''; }
    };
    const save = async (m: Media) => {
        if (!m.fileUrl) return;
        const blob = await (await fetch(m.fileUrl)).blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m.label || 'visuel'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const saveAll = async () => { setBusy('Téléchargement…'); try { for (const m of media ?? []) await save(m); } catch { setError('Le téléchargement a échoué.'); } finally { setBusy(''); } };
    return <div className="full publication-media">
        <div className="publication-media-head"><h3>Visuels à poster</h3>{!!media?.length && <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={saveAll}><Download size={15} />Tout télécharger</Button>}</div>
        {media === undefined ? <p className="muted">Chargement…</p> : media.length ? <ol className="publication-media-grid">{media.map((m, i) => <li key={m.id}>
            <a href={m.fileUrl ?? undefined} target="_blank" rel="noopener noreferrer" title={m.label}>{/^.*\.(mp4|mov|webm)$/i.test(m.label) ? <video src={m.fileUrl ?? undefined} muted /> : <img src={m.fileUrl ?? undefined} alt={m.label} loading="lazy" />}</a>
            <span className="publication-media-num">{i + 1}</span>
            <div className="publication-media-actions">
                <Button type="button" variant="ghost" size="icon" aria-label={'Télécharger ' + m.label} onClick={() => void save(m)}><Download size={15} /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + m.label} onClick={async () => { if (await ask('Retirer ce visuel ?')) await remove({ id: entryId, fileId: m.id }); }}><Trash2 size={15} /></Button>
            </div>
        </li>)}</ol> : <p className="muted">Aucun visuel pour l’instant. Ajoutez les images dans l’ordre du carrousel (elles sont triées par nom de fichier).</p>}
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={e => void send(e.target.files)} />
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => input.current?.click()}><ImagePlus size={16} />{busy || 'Ajouter des visuels'}</Button>
        {error && <p role="alert" className="error-inline">{error}</p>}
    </div>;
}
