'use client';
import { useI18n } from './i18n';

export default function Loader({ message }: { message?: string }) {
    const { t } = useI18n();
    return (
        <div className="loader-page" role="status" aria-live="polite" aria-busy="true">
            <div className="loader-mark"><img src="/brand/symbole.svg" alt="" /></div>
            <p className="loader-brand"><img src="/brand/logo-textuel.svg" alt="Faïença" /></p>
            <span className="loader-bar" />
            <p className="loader-message">{message ?? t.loader.default}</p>
        </div>
    );
}
