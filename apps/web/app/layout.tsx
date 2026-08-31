import './styles.css';
import AuthNav from './components/AuthNav';

export const metadata = { title: 'TAD — VendorAI', description: 'Trading AI Decisions' };

export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}<AuthNav/></body></html>;
}
