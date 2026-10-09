'use client';
import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useI18n } from '@/app/i18n';

export type AskOptions = { title?: string; description: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type Pending = AskOptions & { resolve: (ok: boolean) => void };

let show: ((o: AskOptions) => Promise<boolean>) | null = null;

/**
 * Remplace window.confirm : une vraie boîte de dialogue dans la page.
 * (Certains navigateurs intégrés répondent « non » à window.confirm sans rien afficher.)
 */
export function ask(options: AskOptions | string): Promise<boolean> {
    const o = typeof options === 'string' ? { description: options } : options;
    return show ? show(o) : Promise.resolve(window.confirm(o.description));
}

/** À monter une seule fois, à la racine de l'application. */
export function ConfirmHost() {
    const [pending, setPending] = useState<Pending | null>(null); const { t } = useI18n();
    useEffect(() => {
        show = o => new Promise(resolve => setPending({ ...o, resolve }));
        return () => { show = null; };
    }, []);
    const close = (ok: boolean) => { pending?.resolve(ok); setPending(null); };
    const destructive = pending?.destructive ?? /^supprimer/i.test(pending?.description ?? '');
    return <AlertDialog open={!!pending} onOpenChange={open => { if (!open) close(false); }}>
        {pending && <AlertDialogContent className="bg-card">
            <AlertDialogHeader>
                <AlertDialogTitle className="font-serif text-2xl font-normal">{pending.title ?? (destructive ? t.confirm.deleteTitle : t.confirm.title)}</AlertDialogTitle>
                <AlertDialogDescription className="text-[15px] leading-relaxed">{pending.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => close(false)}>{pending.cancelLabel ?? t.confirm.cancel}</AlertDialogCancel>
                <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={() => close(true)}>{pending.confirmLabel ?? (destructive ? t.confirm.delete : t.confirm.confirm)}</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>}
    </AlertDialog>;
}
