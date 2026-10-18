'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, File, FileArchive, FileSpreadsheet, FileText, Film, ImageIcon, Link2, Presentation } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MissionFile } from '../lib/stage';

export const kinds = {
    pdf: { label: 'PDF', Icon: FileText, ext: ['pdf'] },
    image: { label: 'Image', Icon: ImageIcon, ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'avif'] },
    video: { label: 'Vidéo', Icon: Film, ext: ['mp4', 'mov', 'webm', 'm4v'] },
    sheet: { label: 'Tableur', Icon: FileSpreadsheet, ext: ['xls', 'xlsx', 'csv', 'ods', 'numbers'] },
    slides: { label: 'Présentation', Icon: Presentation, ext: ['ppt', 'pptx', 'key', 'odp'] },
    doc: { label: 'Document', Icon: FileText, ext: ['doc', 'docx', 'odt', 'txt', 'rtf', 'pages', 'md'] },
    archive: { label: 'Archive', Icon: FileArchive, ext: ['zip', 'rar', '7z'] },
    link: { label: 'Lien', Icon: Link2, ext: [] },
    file: { label: 'Fichier', Icon: File, ext: [] },
} as const;
export type FileKind = keyof typeof kinds;
type Previewable = MissionFile & { fileUrl: string | null };

/** Devine le type d'un document à partir de l'extension de son nom de fichier ou de son lien. */
export function kindOf(f: MissionFile): FileKind {
    if (!f.storageId && /youtu\.?be|vimeo\.com/i.test(f.url)) return 'video';
    const ext = (f.storageId ? f.label : f.url.split(/[?#]/)[0]!).match(/\.([a-z0-9]{2,7})$/i)?.[1]?.toLowerCase();
    const found = (Object.keys(kinds) as FileKind[]).find(k => ext && (kinds[k].ext as readonly string[]).includes(ext));
    return found ?? (f.storageId ? 'file' : 'link');
}

/** Aperçu affichable : seuls les fichiers téléversés (les liens externes bloqueraient la lecture du PDF). */
export const previewOf = (f: Previewable) => {
    const kind = kindOf(f);
    return { kind, url: f.fileUrl && (kind === 'image' || kind === 'pdf') ? f.fileUrl : null };
};

// Première page des PDF déjà rendue, pour ne pas la recalculer à chaque affichage.
const pdfCache = new Map<string, Promise<string>>();
async function renderPdf(url: string, width: number) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const doc = await pdfjs.getDocument({ url }).promise;
    try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(3, (width * (window.devicePixelRatio || 1)) / base.width) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.85);
    } finally { void doc.destroy(); }
}
const pdfPreview = (url: string, width: number) => {
    let p = pdfCache.get(url);
    if (!p) { p = renderPdf(url, width); pdfCache.set(url, p); p.catch(() => pdfCache.delete(url)); }
    return p;
};

/** Vignette : l'image elle-même, la première page d'un PDF, sinon l'icône du type de fichier. */
export function FileThumb({ file, className }: { file: Previewable, className?: string }) {
    const { kind, url } = previewOf(file), { Icon } = kinds[kind];
    const box = useRef<HTMLDivElement>(null);
    const [src, setSrc] = useState<string | null>(kind === 'image' ? url : null), [broken, setBroken] = useState(false);
    useEffect(() => {
        if (kind !== 'pdf' || !url || !box.current) return;
        const el = box.current; let alive = true;
        // Rendu seulement quand la vignette arrive à l'écran.
        const io = new IntersectionObserver(([e]) => {
            if (!e?.isIntersecting) return;
            io.disconnect();
            pdfPreview(url, Math.max(240, el.clientWidth)).then(s => { if (alive) setSrc(s); }, () => { if (alive) setBroken(true); });
        }, { rootMargin: '200px' });
        io.observe(el);
        return () => { alive = false; io.disconnect(); };
    }, [kind, url]);
    return <div ref={box} className={cn('file-thumb', 'kind-' + kind, src && !broken && 'has-preview', kind === 'pdf' && 'is-pdf', className)}>
        {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon size={24} />}
        {kind === 'pdf' && src && !broken && <span className="file-thumb-tag">PDF</span>}
    </div>;
}

export type LightboxItem = { url: string, title: string, href: string };

/** Agrandit les images et aperçus PDF d'une galerie, avec les flèches pour passer de l'un à l'autre. */
export function Lightbox({ items, index, onIndex }: { items: LightboxItem[], index: number | null, onIndex: (i: number | null) => void }) {
    const item = index === null ? null : items[index];
    const step = (d: number) => { if (index !== null && items.length > 1) onIndex((index + d + items.length) % items.length); };
    return <Dialog open={!!item} onOpenChange={o => { if (!o) onIndex(null); }}>
        <DialogContent className="lightbox gap-0 p-0 sm:max-w-5xl" onKeyDown={e => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }}>
            {item && <>
                <div className="lightbox-stage">
                    <img src={item.url} alt={item.title} />
                    {items.length > 1 && <>
                        <Button type="button" variant="secondary" size="icon" className="lightbox-nav left-3" aria-label="Précédent" onClick={() => step(-1)}><ChevronLeft /></Button>
                        <Button type="button" variant="secondary" size="icon" className="lightbox-nav right-3" aria-label="Suivant" onClick={() => step(1)}><ChevronRight /></Button>
                    </>}
                </div>
                <div className="lightbox-bar">
                    <DialogTitle className="truncate text-sm font-semibold">{item.title}</DialogTitle>
                    {items.length > 1 && <span className="muted shrink-0 text-xs">{index! + 1} / {items.length}</span>}
                    <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0" asChild><a href={item.href} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Ouvrir</a></Button>
                </div>
            </>}
        </DialogContent>
    </Dialog>;
}

/**
 * Galerie : un clic sur une image l'agrandit ; un PDF s'ouvre dans un nouvel onglet
 * (sa première page sert d'aperçu), comme les autres fichiers et les liens.
 */
export function useGallery<T>(list: T[], fileOf: (x: T) => Previewable, titleOf: (x: T) => string) {
    const [index, setIndex] = useState<number | null>(null);
    const images = list.flatMap(x => { const f = fileOf(x), { kind, url } = previewOf(f); return kind === 'image' && url ? [{ key: x, item: { url, title: titleOf(x), href: url } }] : []; });
    const open = (x: T) => { const i = images.findIndex(m => m.key === x); if (i < 0) return false; setIndex(i); return true; };
    return { open, lightbox: <Lightbox items={images.map(m => m.item)} index={index} onIndex={setIndex} /> };
}
