/** Logo Faïença (symbole + logo textuel du guide graphique) suivi d'un mot d'espace : STUDIO, MON CARNET… */
export default function Brand({ label }: { label: string }) {
    return <><img className="brand-symbol" src="/brand/symbole.svg" alt="" /><span><img className="brand-wordmark" src="/brand/logo-textuel.svg" alt="Faïença" /><small>{label}</small></span></>;
}
