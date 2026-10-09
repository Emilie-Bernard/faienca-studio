'use client';
import { useState } from 'react';
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
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
type Mode = 'signIn' | 'signUp' | 'atelier' | 'reset' | 'reset-verification';
function Gate() {
    const { isAuthenticated, isLoading } = useConvexAuth();
    if (isLoading) return <Loader message="Ouverture de votre atelier…" />;
    if (isAuthenticated) return <Home />;
    return <AuthScreen />;
}
function Home() {
    const me = useQuery(anyApi.users.me) as Me | null | undefined; const { signOut } = useAuthActions();
    if (me === undefined) return <Loader message="Ouverture de votre espace…" />;
    if (me === null) return <Welcome><p>Ce compte n’est plus disponible.</p><Button onClick={() => void signOut()}>Revenir à la connexion</Button></Welcome>;
    return me.role === 'admin' ? <Studio /> : <ClientSpace me={me} />;
}
const RESET_NOTICE = 'Si un compte existe pour cette adresse, un code vient d’y être envoyé. Pensez à vérifier les courriers indésirables.';
const notConfigured = (err: unknown) => err instanceof Error && /is not configured/.test(err.message);
function message(err: unknown, mode: Mode) {
    if (err instanceof ConvexError && typeof err.data === 'string') return err.data;
    if (notConfigured(err)) return 'La connexion n’est pas encore activée sur le serveur. Réessayez un peu plus tard.';
    if (mode === 'signUp') return 'La création du compte a échoué. Cette adresse a peut-être déjà un compte : essayez de vous connecter.';
    if (mode === 'signIn') return 'E-mail ou mot de passe incorrect.';
    if (mode === 'reset-verification') return 'Ce code est incorrect ou a expiré. Vérifiez-le, ou demandez-en un nouveau.';
    return 'La connexion a échoué. Vérifiez le mot de passe.';
}
function AuthScreen() {
    const { signIn } = useAuthActions(); const [mode, setMode] = useState<Mode>('signIn'); const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [email, setEmail] = useState('');
    const switchTo = (m: Mode) => { setMode(m); setError(''); setNotice(''); };
    const submit = async (form: HTMLFormElement) => {
        setBusy(true); setError('');
        const data = new FormData(form);
        const password = String(data.get(mode === 'reset-verification' ? 'newPassword' : 'password') ?? '');
        if ((mode === 'signUp' || mode === 'reset-verification') && password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); setBusy(false); return; }
        if (data.has('email')) setEmail(String(data.get('email')));
        try {
            await signIn(mode === 'atelier' ? 'password' : 'compte', data);
            if (mode === 'reset') { setNotice(RESET_NOTICE); setMode('reset-verification'); setBusy(false); }
        } catch (err) {
            // Même réponse que l'adresse ait un compte ou non, pour ne pas révéler qui est inscrite.
            if (mode === 'reset' && !(err instanceof ConvexError) && !notConfigured(err)) { setNotice(RESET_NOTICE); setMode('reset-verification'); }
            else setError(message(err, mode));
            setBusy(false);
        }
    };
    const field = (name: string, label: string, props: React.ComponentProps<typeof Input>, aside?: React.ReactNode) => <div className="grid gap-1.5"><div className="flex items-baseline justify-between gap-3"><Label htmlFor={'auth-' + name} className="text-xs font-semibold text-muted-foreground">{label}</Label>{aside}</div><Input id={'auth-' + name} name={name} required disabled={busy} className="h-11 bg-card text-base" {...props} /></div>;
    const emailField = field('email', 'Adresse e-mail', { type: 'email', autoComplete: 'email', defaultValue: email });
    const form = (fields: React.ReactNode, cta: string, busyCta: string) => <form key={mode} className="auth-form" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
        {mode !== 'atelier' && <input type="hidden" name="flow" value={mode} />}{fields}
        <Button size="lg" disabled={busy}>{busy ? busyCta : cta}<ArrowUpRight /></Button>
    </form>;
    const link = (label: string, onClick: () => void, className = '') => <Button type="button" variant="link" className={'h-auto p-0 text-xs ' + className} onClick={onClick}>{label}</Button>;
    const alerts = <>{notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}</>;
    if (mode === 'atelier') return <Welcome title={<>Un peu de clarté.<br />Beaucoup de belles idées.</>}><p>Connectez-vous pour retrouver votre calendrier, vos idées et les prochaines étapes de Faïença.</p>
        {form(field('password', 'Mot de passe de l’atelier', { type: 'password', autoComplete: 'current-password' }), 'Entrer dans l’atelier', 'Connexion…')}{alerts}
        <div className="auth-links">{link('Retour à l’espace brodeuses', () => switchTo('signIn'), 'text-muted-foreground')}</div></Welcome>;
    if (mode === 'reset' || mode === 'reset-verification') return <Welcome title={<>Un nouveau<br />mot de passe.</>}>
        <p>{mode === 'reset' ? 'Indiquez l’adresse de votre compte : nous vous envoyons un code à 8 chiffres pour choisir un nouveau mot de passe.' : <>Saisissez le code reçu à <strong>{email}</strong>, puis votre nouveau mot de passe.</>}</p>
        {mode === 'reset'
            ? form(emailField, 'Recevoir le code', 'Envoi…')
            : form(<><input type="hidden" name="email" value={email} />{field('code', 'Code reçu par e-mail', { inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9]{8}', maxLength: 8, placeholder: '12345678', className: 'h-11 bg-card text-center text-lg tracking-[.3em]' })}{field('newPassword', 'Nouveau mot de passe (8 caractères minimum)', { type: 'password', autoComplete: 'new-password', minLength: 8 })}</>, 'Changer et me connecter', 'Vérification…')}
        {alerts}
        <div className="auth-links">{mode === 'reset-verification' && link('Renvoyer un code', () => switchTo('reset'))}{link('Retour à la connexion', () => switchTo('signIn'), 'text-muted-foreground')}</div>
    </Welcome>;
    return <Welcome><p>Retrouvez les vidéos de vos kits, suivez votre ouvrage point par point et posez vos questions à Émilie.</p>
        <Tabs value={mode} onValueChange={v => switchTo(v as Mode)} className="auth-tabs">
            <TabsList className="grid h-10 w-full grid-cols-2"><TabsTrigger value="signIn">Se connecter</TabsTrigger><TabsTrigger value="signUp">Créer un compte</TabsTrigger></TabsList>
            <TabsContent value="signIn">{form(<>{emailField}{field('password', 'Mot de passe', { type: 'password', autoComplete: 'current-password' }, link('Mot de passe oublié ?', () => switchTo('reset')))}</>, 'Se connecter', 'Connexion…')}</TabsContent>
            <TabsContent value="signUp">{form(<>{field('name', 'Prénom', { autoComplete: 'given-name', maxLength: 80 })}{emailField}{field('password', 'Mot de passe (8 caractères minimum)', { type: 'password', autoComplete: 'new-password', minLength: 8 })}</>, 'Créer mon compte', 'Création…')}</TabsContent>
        </Tabs>
        {alerts}
        <p className="auth-switch">{mode === 'signUp' ? <>Déjà un compte ? {link('Se connecter', () => switchTo('signIn'))}</> : <>Pas encore de compte ? {link('Créer un compte', () => switchTo('signUp'))}</>}</p>
        {mode === 'signUp' && <small>Votre code d’activation se trouve dans la boîte de votre kit. Vous le saisirez juste après.</small>}
        <div className="auth-links">{link('Accès atelier', () => switchTo('atelier'), 'text-muted-foreground')}</div>
    </Welcome>;
}
function Welcome({ children, title = <>Brodez à votre rythme.<br />On vous accompagne.</> }: { children: React.ReactNode, title?: React.ReactNode }) { return <main className="welcome"><div className="welcome-brand"><img src="/brand/logo-horizontal.svg" alt="Faïença" /></div><section><div className="eyebrow">VOTRE ATELIER AU QUOTIDIEN</div><h1>{title}</h1>{children}</section><footer>Le Sud dans les idées. Le fil entre les mains.</footer></main> }
export default function Providers() { if (!client) return <Welcome><p>Votre espace est en préparation. La connexion sera disponible dès que son installation sera terminée.</p></Welcome>; return <ConvexAuthProvider client={client}><Gate /></ConvexAuthProvider> }
