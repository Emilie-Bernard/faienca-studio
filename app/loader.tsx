export default function Loader({ message = 'Votre atelier prend place…' }: { message?: string }) {
    return (
        <div className="loader-page" role="status" aria-live="polite" aria-busy="true">
            <div className="loader-mark"><img src="/brand/symbole.svg" alt="" /></div>
            <p className="loader-brand"><img src="/brand/logo-textuel.svg" alt="Faïença" /></p>
            <span className="loader-bar" />
            <p className="loader-message">{message}</p>
        </div>
    );
}
