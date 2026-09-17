'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="loading"><h1>L’atelier n’a pas pu s’ouvrir.</h1><p>Vérifiez votre connexion et réessayez. Les données déjà enregistrées sont conservées.</p><button onClick={reset}>Réessayer</button></main>}
