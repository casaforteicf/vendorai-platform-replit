import PaperLabDashboard from './components/PaperLabDashboard';

export default function Page(){
  return <>
    <div style={{position:'fixed',right:18,bottom:18,zIndex:40,display:'flex',gap:8,flexDirection:'column',alignItems:'flex-end'}}>
      <a href="/laboratorio-v2" style={{background:'#181a20',border:'1px solid #f0b90b',color:'#f0b90b',padding:'10px 13px',borderRadius:7,textDecoration:'none',fontWeight:900,boxShadow:'0 8px 30px rgba(0,0,0,.28)'}}>Laboratório V2 · 30 dias</a>
      <a href="/testes" style={{background:'#f0b90b',color:'#111',padding:'11px 14px',borderRadius:7,textDecoration:'none',fontWeight:900,boxShadow:'0 8px 30px rgba(0,0,0,.28)'}}>Teste oficial · 30 dias</a>
    </div>
    <PaperLabDashboard/>
  </>;
}
