import PaperLabDashboard from './components/PaperLabDashboard';

export default function Page(){
  return <>
    <a href="/testes" style={{position:'fixed',right:18,bottom:18,zIndex:40,background:'#f0b90b',color:'#111',padding:'11px 14px',borderRadius:7,textDecoration:'none',fontWeight:900,boxShadow:'0 8px 30px rgba(0,0,0,.28)'}}>Teste oficial · 30 dias</a>
    <PaperLabDashboard/>
  </>;
}
