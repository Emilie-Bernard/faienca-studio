'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConvexReactClient, useConvexAuth, useQuery } from 'convex/react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { anyApi } from 'convex/server';
import { ConvexError } from 'convex/values';
import { ArrowUpRight } from 'lucide-react';
import Loader from './loader';
import Studio from './studio';
import ClientSpace, { type Me } from './client';
import TraineeSpace from './stagiaire';
import { peekPendingKit } from '../lib/pending-kit';
import type { Messages } from '../lib/i18n';
import { LanguageSwitcher, Lines, useI18n } from './i18n';
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
type Mode = 'signIn' | 'signUp' | 'atelier' | 'reset' | 'reset-verification';
function Gate() {
    const { isAuthenticated, isLoading } = useConvexAuth(); const { t } = useI18n();
    if (isLoading) return <Loader message={t.loader.studio} />;
    if (isAuthenticated) return <Home />;
    return <AuthScreen />;
}
function Home() {
    const me = useQuery(anyApi.users.me) as Me | null | undefined; const { signOut } = useAuthActions(); const { t } = useI18n();
    if (me === undefined) return <Loader message={t.loader.space} />;
    if (me === null) return <Welcome><p>{t.auth.unavailable}</p><Button onClick={() => void signOut()}>{t.auth.backToSignIn}</Button></Welcome>;
    return me.role === 'admin' ? <Studio /> : me.role === 'stagiaire' ? <TraineeSpace me={me} /> : <ClientSpace me={me} />;
}
const notConfigured = (err: unknown) => err instanceof Error && /is not configured/.test(err.message);
function message(err: unknown, mode: Mode, t: Messages['auth'], server: (m: string) => string) {
    if (err instanceof ConvexError && typeof err.data === 'string') return server(err.data);
    if (notConfigured(err)) return t.notConfigured;
    if (mode === 'signUp') return t.signUpFailed;
    if (mode === 'signIn') return t.signInFailed;
    if (mode === 'reset-verification') return t.codeFailed;
    return t.studioFailed;
}
function AuthScreen() {
    const { signIn } = useAuthActions(); const [mode, setMode] = useState<Mode>('signIn'); const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [email, setEmail] = useState('');
    const { t: { auth: t }, server } = useI18n();
    const switchTo = (m: Mode) => { setMode(m); setError(''); setNotice(''); };
    // Lien « Vidéos du kit » de la boutique : le kit est mis de côté jusqu'à la connexion.
    const [kitWaiting, setKitWaiting] = useState(false);
    useEffect(() => { setKitWaiting(!!peekPendingKit()); }, []);
    const submit = async (form: HTMLFormElement) => {
        setBusy(true); setError('');
        const data = new FormData(form);
        const password = String(data.get(mode === 'reset-verification' ? 'newPassword' : 'password') ?? '');
        if ((mode === 'signUp' || mode === 'reset-verification') && password.length < 8) { setError(t.passwordTooShort); setBusy(false); return; }
        if (data.has('email')) setEmail(String(data.get('email')));
        try {
            await signIn(mode === 'atelier' ? 'password' : 'compte', data);
            if (mode === 'reset') { setNotice(t.resetNotice); setMode('reset-verification'); setBusy(false); }
        } catch (err) {
            // Même réponse que l'adresse ait un compte ou non, pour ne pas révéler qui est inscrite.
            if (mode === 'reset' && !(err instanceof ConvexError) && !notConfigured(err)) { setNotice(t.resetNotice); setMode('reset-verification'); }
            else setError(message(err, mode, t, server));
            setBusy(false);
        }
    };
    const field = (name: string, label: string, props: React.ComponentProps<typeof Input>, aside?: React.ReactNode) => <div className="grid gap-1.5"><div className="flex items-baseline justify-between gap-3"><Label htmlFor={'auth-' + name} className="text-xs font-semibold text-muted-foreground">{label}</Label>{aside}</div><Input id={'auth-' + name} name={name} required disabled={busy} className="h-11 bg-card text-base" {...props} /></div>;
    const emailField = field('email', t.email, { type: 'email', autoComplete: 'email', defaultValue: email });
    const form = (fields: React.ReactNode, cta: string, busyCta: string) => <form key={mode} className="auth-form" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
        {mode !== 'atelier' && <input type="hidden" name="flow" value={mode} />}{fields}
        <Button size="lg" disabled={busy}>{busy ? busyCta : cta}<ArrowUpRight /></Button>
    </form>;
    const link = (label: string, onClick: () => void, className = '') => <Button type="button" variant="link" className={'h-auto p-0 text-xs ' + className} onClick={onClick}>{label}</Button>;
    const alerts = <>{notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}</>;
    if (mode === 'atelier') return <Welcome title={t.studioTitle}><p>{t.studioIntro}</p>
        {form(field('password', t.studioPassword, { type: 'password', autoComplete: 'current-password' }), t.enterStudio, t.signingIn)}{alerts}
        <div className="auth-links">{link(t.backToClients, () => switchTo('signIn'), 'text-muted-foreground')}</div></Welcome>;
    if (mode === 'reset' || mode === 'reset-verification') { const [before, after = ''] = t.resetCodeIntro.split('{email}'); return <Welcome title={t.resetTitle}>
        <p>{mode === 'reset' ? t.resetIntro : <>{before}<strong>{email}</strong>{after}</>}</p>
        {mode === 'reset'
            ? form(emailField, t.getCode, t.sending)
            : form(<><input type="hidden" name="email" value={email} />{field('code', t.codeLabel, { inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9]{8}', maxLength: 8, placeholder: '12345678', className: 'h-11 bg-card text-center text-lg tracking-[.3em]' })}{field('newPassword', t.newPassword, { type: 'password', autoComplete: 'new-password', minLength: 8 })}</>, t.changeAndSignIn, t.verifying)}
        {alerts}
        <div className="auth-links">{mode === 'reset-verification' && link(t.resendCode, () => switchTo('reset'))}{link(t.backToSignIn, () => switchTo('signIn'), 'text-muted-foreground')}</div>
    </Welcome>; }
    return <Welcome><p>{t.intro}</p>
        <Tabs value={mode} onValueChange={v => switchTo(v as Mode)} className="auth-tabs">
            <TabsList className="grid h-10 w-full grid-cols-2"><TabsTrigger value="signIn">{t.signIn}</TabsTrigger><TabsTrigger value="signUp">{t.signUp}</TabsTrigger></TabsList>
            <TabsContent value="signIn">{form(<>{emailField}{field('password', t.password, { type: 'password', autoComplete: 'current-password' }, link(t.forgot, () => switchTo('reset')))}</>, t.signIn, t.signingIn)}</TabsContent>
            <TabsContent value="signUp">{form(<>{field('name', t.firstName, { autoComplete: 'given-name', maxLength: 80 })}{emailField}{field('password', t.newPasswordLabel, { type: 'password', autoComplete: 'new-password', minLength: 8 })}</>, t.createAccount, t.creating)}</TabsContent>
        </Tabs>
        {alerts}
        <p className="auth-switch">{mode === 'signUp' ? <>{t.haveAccount} {link(t.signIn, () => switchTo('signIn'))}</> : <>{t.noAccount} {link(t.signUp, () => switchTo('signUp'))}</>}</p>
        {kitWaiting ? <small>{t.kitWaiting}</small> : mode === 'signUp' && <small>{t.codeHint}</small>}
        <div className="auth-links">{link(t.studioAccess, () => switchTo('atelier'), 'text-muted-foreground')}</div>
    </Welcome>;
}
function Welcome({ children, title }: { children: React.ReactNode, title?: string }) { const { t } = useI18n(); return <main className="welcome"><div className="welcome-brand"><img src="/brand/logo-horizontal.svg" alt="Faïença" /><LanguageSwitcher /></div><section><div className="eyebrow">{t.auth.eyebrow}</div><h1><Lines text={title ?? t.auth.title} /></h1>{children}</section><footer>{t.tagline}</footer></main> }
function Preparing() { const { t } = useI18n(); return <Welcome><p>{t.auth.preparing}</p></Welcome>; }
export default function Providers() { if (!client) return <Preparing />; return <ConvexAuthProvider client={client}><Gate /></ConvexAuthProvider> }
