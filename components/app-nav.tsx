'use client';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import Brand from '@/app/brand';
import { useI18n } from '@/app/i18n';

export type NavItem = { label: string; icon: ComponentType<{ size?: number }>; count?: number };
export type NavGroup = { title?: string; items: NavItem[] };

/** Liens de navigation partagés par la barre latérale (grand écran) et le tiroir (tablette, mobile). */
export function NavLinks({ groups, current, onSelect, compact = false }: { groups: NavGroup[], current: string, onSelect: (label: string) => void, compact?: boolean }) {
    return <div className="flex flex-col gap-5">{groups.map((g, i) => <div key={g.title ?? i} className="nav-group">
        {g.title && !compact && <div className="nav-label">{g.title}</div>}
        <nav className="flex flex-col gap-1">{g.items.map(({ label, icon: Icon, count }) => {
            const active = current === label;
            return <Button key={label} type="button" variant="ghost" title={label} aria-label={compact ? label : undefined} aria-current={active ? 'page' : undefined} onClick={() => onSelect(label)}
                className={cn('h-11 w-full justify-start gap-3 px-4 text-[14px] font-normal text-muted-foreground', compact && 'justify-center px-0', active && 'bg-accent font-semibold text-accent-foreground')}>
                <Icon size={20} />{!compact && <span className="truncate">{label}</span>}
                {!compact && count !== undefined && <span className="ml-auto rounded bg-background px-1.5 text-[11px] text-muted-foreground">{count}</span>}
            </Button>;
        })}</nav>
    </div>)}</div>;
}

/** En-tête compact avec bouton menu : remplace la barre latérale sous 1024 px. */
export function MobileNav({ label, title, groups, current, onSelect, footer }: { label: string, title: string, groups: NavGroup[], current: string, onSelect: (label: string) => void, footer?: ReactNode }) {
    const [open, setOpen] = useState(false); const { t } = useI18n();
    return <header className="mobile-header">
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label={t.nav.open}><Menu className="size-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="w-[290px] gap-0 bg-card p-0">
                <SheetHeader className="px-5 pt-5 pb-3">
                    <SheetTitle asChild><a className="brand" href="/"><Brand label={label} /></a></SheetTitle>
                    <SheetDescription className="sr-only">{t.nav.description}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-3 pb-4"><NavLinks groups={groups} current={current} onSelect={v => { setOpen(false); onSelect(v); }} /></div>
                {footer && <><Separator /><div className="p-3">{footer}</div></>}
            </SheetContent>
        </Sheet>
        <a className="brand mobile-header-brand" href="/"><Brand label={label} /></a>
        <span className="mobile-header-title">{title}</span>
    </header>;
}
