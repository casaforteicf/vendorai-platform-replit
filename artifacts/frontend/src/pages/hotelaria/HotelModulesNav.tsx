import {Link,useLocation} from "wouter";
const links=[
 {href:"/hotelaria/recepcao",name:"Recepção e reservas"},
 {href:"/hotelaria/receitas",name:"Receitas e custos"},
 {href:"/hotelaria/planejamento",name:"Refeições e compras"},
 {href:"/hotelaria/tarifas",name:"Tarifas e diárias"},
] as const;
export default function HotelModulesNav(){
 const [location]=useLocation();
 return <nav aria-label="Módulos de hotelaria" className="mb-5 flex flex-wrap gap-2 rounded-xl border p-3">
  {links.map(link=><Link key={link.href} href={link.href} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${location===link.href?"bg-primary text-primary-foreground":"hover:bg-muted"}`}>{link.name}</Link>)}
 </nav>;
}
