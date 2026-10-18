'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link2, Trash2, Upload } from 'lucide-react';
import { FileThumb, kinds, previewOf, useGallery } from './file-preview';
import { newFile, type MissionFile } from '../lib/stage';

export type FileView = MissionFile & { fileUrl: string | null };
const MAX_BYTES = 50 * 1024 * 1024;

/** Fichiers téléversés ou liens, en galerie : aperçu des images et de la première page des PDF. */
export function FileLinks({ files, onRemove }: { files: FileView[], onRemove?: (f: FileView) => void }) {
    const { open, lightbox } = useGallery(files, f => f, f => f.label || 'Image');
    if (!files.length) return null;
    return <><ul className="file-gallery">{files.map(f => {
        const href = f.fileUrl ?? f.url, { kind } = previewOf(f), name = f.label || (f.storageId ? 'Fichier' : f.url);
        return <li key={f.id} className="file-card">
            {href ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; if (open(f)) e.preventDefault(); }}>
                <FileThumb file={f} />
                <span className="file-card-name">{f.storageId ? null : <Link2 size={13} />}<span>{name}</span></span>
                <small>{kinds[kind].label}</small>
            </a> : <div className="file-card-missing"><FileThumb file={f} /><span className="file-card-name muted"><span>{f.label || 'Fichier indisponible'}</span></span></div>}
            {onRemove && <Button type="button" variant="secondary" size="icon" className="file-card-remove" aria-label={'Retirer ' + (f.label || 'ce fichier')} onClick={() => onRemove(f)}><Trash2 size={15} /></Button>}
        </li>;
    })}</ul>{lightbox}</>;
}

/** Ajoute un fichier (téléversé dans Convex) ou un lien https à une liste. */
export function FileAdder({ upload, onAdd, disabled, what = 'fichier', drop }: { upload: () => Promise<string>, onAdd: (file: MissionFile) => Promise<void>, disabled?: boolean, what?: string, /** Zone de dépôt (glisser-déposer) au lieu du bouton. */ drop?: boolean }) {
    const [label, setLabel] = useState(''), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const run = async (fn: () => Promise<MissionFile>) => {
        setBusy(true); setError('');
        try { await onAdd(await fn()); setLabel(''); setUrl(''); }
        catch (err) { setError(err instanceof Error && err.message ? err.message : `Le ${what} n’a pas pu être ajouté.`); }
        finally { setBusy(false); if (input.current) input.current.value = ''; }
    };
    const pick = (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_BYTES) { setError('Ce fichier dépasse 50 Mo. Ajoutez plutôt un lien (Drive, WeTransfer…).'); if (input.current) input.current.value = ''; return; }
        void run(async () => {
            const res = await fetch(await upload(), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
            if (!res.ok) throw new Error('Le téléversement a échoué. Vérifiez votre connexion puis réessayez.');
            const { storageId } = await res.json() as { storageId: string };
            return { ...newFile(), label: label.trim() || file.name, url: '', storageId };
        });
    };
    const addLink = () => {
        if (!/^https:\/\//i.test(url.trim())) { setError('Le lien doit commencer par https://.'); return; }
        void run(async () => ({ ...newFile(), label: label.trim() || url.trim(), url: url.trim() }));
    };
    const off = disabled || busy;
    const fileInput = <input ref={input} type="file" hidden onChange={e => pick(e.target.files?.[0])} />;
    const linkInput = <Input aria-label="Lien https" type="url" placeholder="https://…" value={url} disabled={off} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />;
    const linkButton = <Button type="button" variant="outline" disabled={off || !url.trim()} onClick={addLink}><Link2 size={16} />Ajouter le lien</Button>;
    if (drop) return <div className="stage-adder">
        {fileInput}
        <button type="button" className={'stage-drop' + (over ? ' over' : '')} disabled={off} onClick={() => input.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!off) setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); if (!off) pick(e.dataTransfer.files[0]); }}>
            <span className="stage-drop-icon"><Upload size={20} /></span>
            <strong>{busy ? 'Envoi en cours…' : 'Dépose un fichier ici'}</strong>
            <small>ou clique pour le choisir · photo, PDF, vidéo… jusqu’à 50 Mo</small>
        </button>
        <div className="stage-adder-link">
            <span className="muted">ou un lien</span>
            {linkInput}
            <Input className="stage-adder-label" aria-label={`Nom du ${what}`} placeholder="Nom (facultatif)" maxLength={120} value={label} disabled={off} onChange={e => setLabel(e.target.value)} />
            {linkButton}
        </div>
        {error && <p role="alert" className="error-inline">{error}</p>}
    </div>;
    return <div className="stage-adder">
        <Input aria-label={`Nom du ${what}`} placeholder={`Nom du ${what} (facultatif)`} maxLength={120} value={label} disabled={disabled || busy} onChange={e => setLabel(e.target.value)} />
        <div className="stage-adder-row">
            <input ref={input} type="file" hidden onChange={e => pick(e.target.files?.[0])} />
            <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload size={16} />{busy ? 'Envoi…' : 'Téléverser un fichier'}</Button>
            <span className="muted">ou</span>
            <Input aria-label="Lien https" type="url" placeholder="https://…" value={url} disabled={disabled || busy} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
            <Button type="button" variant="outline" disabled={disabled || busy || !url.trim()} onClick={addLink}><Link2 size={16} />Ajouter le lien</Button>
        </div>
        {error && <p role="alert" className="error-inline">{error}</p>}
    </div>;
}
