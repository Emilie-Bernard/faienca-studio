'use client';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import Brand from '@/app/brand';
import { useI18n } from '@/app/i18n';

export type NavItem = { label: string; icon: ComponentType<{ size?: number }>; count?: number };
export type NavGroup = { title?: string; items: NavItem[] };
/** Action secondaire du pied de menu (sauvegarde, etc.). */
export type NavAction = { label: string; icon: ComponentType<{ size?: number }>; onClick: () => void };

const COLLAPSED_KEY = 'faienca-sidebar-collapsed';

/** Un lien du menu : sur mobile, le tiroir se referme après le choix. */
function NavButton({ item: { label, icon: Icon, count }, active, onSelect }: { item: NavItem, active: boolean, onSelect: (label: string) => void }) {
    const { isMobile, setOpenMobile } = useSidebar();
    return <SidebarMenuItem>
        <SidebarMenuButton isActive={active} tooltip={label} aria-current={active ? 'page' : undefined} className="h-10 gap-3 text-[14px] text-muted-foreground data-[active=true]:font-semibold [&>svg]:size-[18px]"
            onClick={() => { if (isMobile) setOpenMobile(false); onSelect(label); }}>
            <Icon /><span>{label}</span>
        </SidebarMenuButton>
        {count !== undefined && <SidebarMenuBadge className="text-[11px] text-muted-foreground">{count}</SidebarMenuBadge>}
    </SidebarMenuItem>;
}

function FooterButton({ label, icon: Icon, onClick, className }: NavAction & { className?: string }) {
    const { isMobile, setOpenMobile } = useSidebar();
    return <SidebarMenuItem><SidebarMenuButton tooltip={label} className={'gap-3 text-muted-foreground ' + (className ?? '')} onClick={() => { if (isMobile) setOpenMobile(false); onClick(); }}><Icon /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>;
}

/** En mode barre de navigation, le menu latéral n'existe que sur mobile (en tiroir). */
function MobileOnly({ when, children }: { when: boolean, children: ReactNode }) {
    const { isMobile } = useSidebar();
    return when && !isMobile ? null : <>{children}</>;
}

/**
 * Coque commune aux espaces atelier, stagiaire et brodeuse : menu latéral repliable en icônes
 * sur grand écran, tiroir sous 768 px, et en-tête avec le bouton menu.
 * Avec `navbar`, le menu passe dans l'en-tête sur grand écran ; le tiroir reste sur mobile.
 */
export function AppShell({ navbar = false, label, groups, current, onSelect, title, trail, aside, user, actions = [], onSignOut, signOutLabel, children }: {
    navbar?: boolean, label: string, groups: NavGroup[], current: string, onSelect: (label: string) => void,
    title: string, trail?: string, aside?: ReactNode,
    user: { name: string, detail?: string }, actions?: NavAction[], onSignOut: () => void, signOutLabel: string, children: ReactNode,
}) {
    const { t } = useI18n();
    // Menu replié en icônes : préférence gardée sur l'appareil.
    const [open, setOpen] = useState(true);
    useEffect(() => { try { if (localStorage.getItem(COLLAPSED_KEY) === '1') setOpen(false); } catch { /* ignore */ } }, []);
    const change = (next: boolean) => { setOpen(next); try { localStorage.setItem(COLLAPSED_KEY, next ? '0' : '1'); } catch { /* ignore */ } };
    return <SidebarProvider open={open} onOpenChange={change}>
        <MobileOnly when={navbar}><Sidebar collapsible="icon" mobileTitle={label} mobileDescription={t.nav.description}>
            <SidebarHeader className="pt-4">
                <a className="brand group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>span]:hidden" href="/"><Brand label={label} /></a>
            </SidebarHeader>
            <SidebarContent>{groups.map((g, i) => <SidebarGroup key={g.title ?? i}>
                {g.title && <SidebarGroupLabel className="text-[10px] font-bold tracking-[1.7px] text-[#8b8178]">{g.title}</SidebarGroupLabel>}
                <SidebarMenu>{g.items.map(item => <NavButton key={item.label} item={item} active={current === item.label} onSelect={onSelect} />)}</SidebarMenu>
            </SidebarGroup>)}</SidebarContent>
            <SidebarFooter>
                <SidebarSeparator className="mx-0" />
                <div className="flex items-center gap-2.5 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" title={user.name}>
                    <span className="avatar size-8! shrink-0">{(user.name[0] ?? '?').toUpperCase()}</span>
                    <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden"><strong className="block truncate text-[13px]">{user.name}</strong>{user.detail && <small className="block truncate text-[11px] text-muted-foreground">{user.detail}</small>}</div>
                </div>
                <SidebarMenu>
                    {actions.map(a => <FooterButton key={a.label} {...a} />)}
                    <FooterButton label={signOutLabel} icon={LogOut} onClick={onSignOut} className="text-destructive hover:text-destructive" />
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar></MobileOnly>
        <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-[#fffdf8f2] px-3 backdrop-blur-md md:h-16 md:px-5">
                <SidebarTrigger label={t.nav.toggle} className={cn('size-9 text-muted-foreground', navbar && 'md:hidden')} />
                <Separator orientation="vertical" className={cn('mr-1 h-5!', navbar && 'md:hidden')} />
                {navbar && <div className="hidden min-w-0 flex-1 items-center gap-6 md:flex">
                    <a className="brand shrink-0 px-0 [&>span>small]:hidden lg:[&>span>small]:block" href="/"><Brand label={label} /></a>
                    <nav className="flex min-w-0 items-center gap-1">{groups.flatMap(g => g.items).map(({ label: l, icon: Icon, count }) => <Button key={l} type="button" variant="ghost" aria-current={current === l ? 'page' : undefined} onClick={() => onSelect(l)}
                        className={cn('text-muted-foreground', current === l && 'bg-accent font-semibold text-accent-foreground')}><Icon size={16} />{l}{count !== undefined && <span className="text-[11px] text-muted-foreground">{count}</span>}</Button>)}</nav>
                </div>}
                <div className={cn('flex min-w-0 items-center text-[13px]', navbar && 'md:hidden')}>
                    {trail && <><span className="breadcrumb hidden sm:inline">{trail}</span><span className="slash hidden sm:inline">/</span></>}
                    <span className="truncate">{title}</span>
                </div>
                {(aside || navbar) && <div className="ml-auto flex shrink-0 items-center gap-2">{aside}
                    {navbar && <div className="hidden items-center gap-2 md:flex">
                        <span className="avatar size-8! shrink-0" title={user.name}>{(user.name[0] ?? '?').toUpperCase()}</span>
                        <span className="hidden max-w-[180px] truncate text-[13px] lg:inline">{user.name}</span>
                        <Button type="button" variant="ghost" size="icon" aria-label={signOutLabel} title={signOutLabel} onClick={onSignOut}><LogOut /></Button>
                    </div>}
                </div>}
            </header>
            {children}
        </SidebarInset>
    </SidebarProvider>;
}
