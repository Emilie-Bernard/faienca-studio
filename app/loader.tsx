import { Flower2 } from 'lucide-react';

export default function Loader({ message = 'Votre atelier prend place…' }: { message?: string }) {
    return (
        <div className="loader-page" role="status" aria-live="polite" aria-busy="true">
            <div className="loader-mark"><Flower2 size={30} /></div>
            <p className="loader-brand">faïença<small>STUDIO</small></p>
            <span className="loader-bar" />
            <p className="loader-message">{message}</p>
        </div>
    );
}
