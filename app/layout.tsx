import type {Metadata} from 'next';
import './ui.css';
import { ConfirmHost } from '@/components/confirm-dialog';
export const metadata:Metadata={title:'Faïença Studio',description:'L’atelier de vos projets et de votre communication.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}<ConfirmHost /></body></html>}
