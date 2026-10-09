'use client';
import { useI18n } from './i18n';
export default function ErrorPage({reset}:{reset:()=>void}){const {t}=useI18n();return <main className="loading"><h1>{t.error.title}</h1><p>{t.error.body}</p><button onClick={reset}>{t.error.retry}</button></main>}
