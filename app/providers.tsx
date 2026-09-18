'use client';
import {useState} from 'react';
import {ConvexReactClient,useConvexAuth} from 'convex/react';
import {ConvexAuthProvider,useAuthActions} from '@convex-dev/auth/react';
import {ArrowUpRight,Flower2} from 'lucide-react';
import Studio from './studio';
const url=process.env.NEXT_PUBLIC_CONVEX_URL;
const client=url?new ConvexReactClient(url):null;
function Gate(){
 const {isAuthenticated,isLoading}=useConvexAuth();const {signIn}=useAuthActions();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 if(isLoading)return <div className="loading">Ouverture de votre atelier…</div>;
 if(isAuthenticated)return <Studio/>;
 return <Welcome><p>Connectez-vous pour retrouver votre calendrier, vos idées et les prochaines étapes de Faïença.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await signIn('password',new FormData(e.currentTarget));}catch{setError('La connexion a échoué. Vérifiez le mot de passe.');setBusy(false);}}}><input name="password" type="password" autoComplete="current-password" required placeholder="Mot de passe" aria-label="Mot de passe" disabled={busy}/><button className="primary" disabled={busy}>{busy?'Connexion…':'Entrer dans l’atelier'}<ArrowUpRight size={18}/></button></form>{error&&<p role="alert" className="error">{error}</p>}<small>Un espace privé, réservé à la créatrice de Faïença.</small></Welcome>;
}
function Welcome({children}:{children:React.ReactNode}){return <main className="welcome"><div className="welcome-brand"><Flower2 size={40}/><span>faïença<span className="studio-word">STUDIO</span></span></div><section><div className="eyebrow">VOTRE ATELIER AU QUOTIDIEN</div><h1>Un peu de clarté.<br/>Beaucoup de belles idées.</h1>{children}</section><footer>Le Sud dans les idées. Le fil entre les mains.</footer></main>}
export default function Providers(){if(!client)return <Welcome><p>Votre espace est en préparation. La connexion privée sera disponible dès que son installation sera terminée.</p></Welcome>;return <ConvexAuthProvider client={client}><Gate/></ConvexAuthProvider>}
