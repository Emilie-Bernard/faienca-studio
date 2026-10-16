import type {Metadata} from 'next';
import './ui.css';
import { ConfirmHost } from '@/components/confirm-dialog';
import { MESSAGES } from '../lib/i18n';
import { getLocale } from '../lib/locale-server';
import { LocaleProvider } from './i18n';
import Analytics from './analytics';
export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:'Faïença Studio',description:MESSAGES[locale].meta.description,robots:{index:false,follow:false}}}
export default async function Layout({children}:{children:React.ReactNode}){const locale=await getLocale();return <html lang={locale}><body><LocaleProvider initial={locale}>{children}<ConfirmHost /></LocaleProvider><Analytics /></body></html>}
