// Product routes are part of the public website deployment (Cloudflare production sync).
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import GrowthRevenueHero from "@/components/GrowthRevenueHero";
import PublicSeoManager from "@/components/PublicSeoManager";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import "@/styles/vendorIdentity.css";

const NotFound = lazy(() => import("@/pages/not-found"));
const Funcionalidades = lazy(() => import("@/pages/Funcionalidades"));
const RecursoDetalhe = lazy(() => import("@/pages/RecursoDetalhe"));
const AgenteDetalhe = lazy(() => import("@/pages/AgenteDetalhe"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const ProdutoDetalhe = lazy(() => import("@/pages/ProdutoDetalhe"));
const SeoIntentPage = lazy(() => import("@/pages/SeoIntentPage"));
const SeoIntentHub = lazy(() => import("@/pages/SeoIntentHub"));
const Precos = lazy(() => import("@/pages/Precos"));
const Sobre = lazy(() => import("@/pages/Sobre"));
const Imprensa = lazy(() => import("@/pages/Imprensa"));
const Contato = lazy(() => import("@/pages/Contato"));
const Demo = lazy(() => import("@/pages/Demo"));
const CadastroPraca = lazy(() => import("@/pages/CadastroPraca"));
const DownloadApp = lazy(() => import("@/pages/DownloadApp"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const VerticalPage = lazy(() => import("@/pages/site/VerticalPage"));
const ParceirosPage = lazy(() => import("@/pages/site/ParceirosPage"));
const BlogList = lazy(() => import("@/pages/blog/BlogListRoute"));
const BlogPost = lazy(() => import("@/pages/blog/BlogPostRoute"));
const UnifiedLpRouter = lazy(() => import("@/pages/lp/UnifiedLpRouter"));
const IntentVerticalLp = lazy(() => import("@/pages/lp/IntentVerticalLp"));
const AcademiasIntentLp = lazy(() => import("@/pages/lp/AcademiasIntentLp"));
const VeiculosIntentLp = lazy(() => import("@/pages/lp/VeiculosIntentLp"));
const ClinicasOdontoEsteticaIntentLp = lazy(() => import("@/pages/lp/ClinicasOdontoEsteticaIntentLp"));
const ImobiliariasIntentLp = lazy(() => import("@/pages/lp/ImobiliariasIntentLp"));
const ConstrutorasIntentLp = lazy(() => import("@/pages/lp/ConstrutorasIntentLp"));
const EsquadriasIntentLp = lazy(() => import("@/pages/lp/EsquadriasIntentLp"));
const PiscinasIntentLp = lazy(() => import("@/pages/lp/PiscinasIntentLp"));
const ArquiteturaIntentLp = lazy(() => import("@/pages/lp/ArquiteturaIntentLpV2"));
const AutopecasIntentLp = lazy(() => import("@/pages/lp/AutopecasIntentLp"));
const MateriaisConstrucaoIntentLp = lazy(() => import("@/pages/lp/MateriaisConstrucaoIntentLp"));
const AlimentosIntentLp = lazy(() => import("@/pages/lp/AlimentosIntentLp"));
const MaquinasInsumosIntentLp = lazy(() => import("@/pages/lp/MaquinasInsumosIntentLpV2"));
const MarcenariasIntentLp = lazy(() => import("@/pages/lp/MarcenariasIntentLp"));
const SegurosIntentLp = lazy(() => import("@/pages/lp/SegurosIntentLp"));
const FarmaciasIntentLp = lazy(() => import("@/pages/lp/FarmaciasIntentLp"));
const MacrosegmentHub = lazy(() => import("@/pages/lp/MacrosegmentHub"));
const LpCommercialOffer = lazy(() => import("@/pages/lp/LpCommercialOffer"));
const InteractiveOperatingSystem = lazy(() => import("@/components/InteractiveOperatingSystem"));
const DistributedProductScreens = lazy(() => import("@/components/DistributedProductScreens"));
const HomeConversionSections = lazy(() => import("@/components/HomeConversionSections"));
const AgentSimulatorWidget = lazy(() => import("@/components/AgentSimulatorWidget").then((module) => ({ default: module.AgentSimulatorWidget })));
const RouteToasterComponent = lazy(() => import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })));
const LpMandatoryVisuals = lazy(() => import("@/components/LpMandatoryVisuals"));

const SPECIALIZED_INTENT_LP_SLUGS = new Set([
  "academias-studios",
  "concessionarias-lojas-veiculos",
  "clinicas-odontologicas-esteticas",
  "imobiliarias-corretores",
  "construtora-residencial",
  "esquadrias-portas-janelas",
  "piscinas",
  "arquitetura-interiores",
  "distribuidora-autopecas",
  "distribuidora-materiais-construcao",
  "distribuidora-alimentos-bebidas",
  "maquinas-insumos",
  "distribuidora-acessorios-ferragens-chapas",
  "marcenarias-moveis-planejados",
  "seguros",
  "farmacias",
]);

function RouteFallback(){return <div className="min-h-[45vh] bg-white" aria-live="polite" aria-busy="true"/>}
function ScrollToTop(){const [location]=useLocation();useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"});},[location]);return null}
function ViewportDeferred({children,minHeight=720,rootMargin="900px 0px"}:{children:ReactNode;minHeight?:number;rootMargin?:string}){const [enabled,setEnabled]=useState(false);const sentinelRef=useRef<HTMLDivElement|null>(null);useEffect(()=>{if(enabled)return;const node=sentinelRef.current;if(!node||typeof IntersectionObserver==="undefined"){setEnabled(true);return;}const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting))return;setEnabled(true);observer.disconnect();},{rootMargin});observer.observe(node);return()=>observer.disconnect();},[enabled,rootMargin]);return <div ref={sentinelRef} style={{minHeight:enabled?undefined:minHeight,contentVisibility:"auto",containIntrinsicSize:`auto ${minHeight}px`}}>{enabled?children:null}</div>}
function OnDemandAgentSimulator(){const [enabled,setEnabled]=useState(false);if(!enabled)return <button type="button" onClick={()=>setEnabled(true)} aria-label="Testar um agente de IA agora" className="fixed bottom-24 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_10px_28px_rgba(37,99,235,0.38)] transition hover:scale-105 hover:bg-blue-500 sm:bottom-5 sm:left-5 sm:h-14 sm:w-auto sm:gap-2 sm:px-5 sm:text-sm sm:font-semibold"><span aria-hidden="true" className="text-lg">✦</span><span className="hidden sm:inline">Testar um agente</span></button>;return <Suspense fallback={null}><AgentSimulatorWidget initialOpen/></Suspense>}
function FloatingActions(){const [location]=useLocation();const formFocusedPage=location==="/demo"||location==="/contato"||location==="/cadastro-praca"||location==="/baixar-app";if(formFocusedPage)return null;return <><WhatsAppFloatButton/><OnDemandAgentSimulator/></>}
function RouteToaster(){const [location]=useLocation();if(location!=="/cadastro-praca")return null;return <Suspense fallback={null}><RouteToasterComponent/></Suspense>}
function LpOfferGlobal(){const [location]=useLocation();if(!location.startsWith("/lp/"))return null;const path=location.split("?")[0]??location;const parts=path.split("/").filter(Boolean);const slug=parts[1];const isMainLp=parts.length===2;const isSpecializedIntent=parts.length>=3&&!!slug&&SPECIALIZED_INTENT_LP_SLUGS.has(slug);if(!isMainLp&&!isSpecializedIntent)return null;return <Suspense fallback={null}><LpCommercialOffer/></Suspense>}
function ContextualMandatoryVisuals(){const [location]=useLocation();const path=location.split("?")[0]??location;const needed=path.startsWith("/lp/")||path.startsWith("/produtos/")||path.startsWith("/agentes-virtuais-inteligentes");if(!needed)return null;return <Suspense fallback={null}><LpMandatoryVisuals/></Suspense>}
function HomeWithGrowthRevenueHero(){return <><GrowthRevenueHero/><ViewportDeferred minHeight={1040} rootMargin="500px 0px"><Suspense fallback={null}><InteractiveOperatingSystem/></Suspense></ViewportDeferred><ViewportDeferred minHeight={1120} rootMargin="500px 0px"><Suspense fallback={null}><DistributedProductScreens/></Suspense></ViewportDeferred><ViewportDeferred minHeight={1320} rootMargin="500px 0px"><Suspense fallback={null}><HomeConversionSections/></Suspense></ViewportDeferred></>}
function Router(){return <Suspense fallback={<RouteFallback/>}><Switch><Route path="/verticais/:slug" component={VerticalPage}/><Route path="/parceiros" component={ParceirosPage}/><Route path="/segmentos/:slug" component={MacrosegmentHub}/><Route path="/lp/academias-studios/:intent" component={AcademiasIntentLp}/><Route path="/lp/concessionarias-lojas-veiculos/:intent" component={VeiculosIntentLp}/><Route path="/lp/clinicas-odontologicas-esteticas/:intent" component={ClinicasOdontoEsteticaIntentLp}/><Route path="/lp/imobiliarias-corretores/:intent" component={ImobiliariasIntentLp}/><Route path="/lp/construtora-residencial/:intent" component={ConstrutorasIntentLp}/><Route path="/lp/esquadrias-portas-janelas/:intent" component={EsquadriasIntentLp}/><Route path="/lp/piscinas/:intent" component={PiscinasIntentLp}/><Route path="/lp/arquitetura-interiores/:intent" component={ArquiteturaIntentLp}/><Route path="/lp/distribuidora-autopecas/:intent" component={AutopecasIntentLp}/><Route path="/lp/distribuidora-materiais-construcao/:intent" component={MateriaisConstrucaoIntentLp}/><Route path="/lp/distribuidora-alimentos-bebidas/:intent" component={AlimentosIntentLp}/><Route path="/lp/maquinas-insumos/:intent" component={MaquinasInsumosIntentLp}/><Route path="/lp/distribuidora-acessorios-ferragens-chapas/:intent" component={MarcenariasIntentLp}/><Route path="/lp/marcenarias-moveis-planejados/:intent" component={MarcenariasIntentLp}/><Route path="/lp/seguros/:intent" component={SegurosIntentLp}/><Route path="/lp/farmacias/:intent" component={FarmaciasIntentLp}/><Route path="/lp/:slug/:intent" component={IntentVerticalLp}/><Route path="/lp/:slug" component={UnifiedLpRouter}/><Route><div className="vendor-public-shell flex min-h-screen flex-col overflow-x-clip"><Navbar/><main className="min-w-0 flex-1"><Switch><Route path="/" component={HomeWithGrowthRevenueHero}/><Route path="/solucoes" component={SeoIntentHub}/><Route path="/comparar" component={SeoIntentHub}/><Route path="/agentes-virtuais-inteligentes/:slug" component={SeoIntentPage}/><Route path="/agentes-virtuais-inteligentes" component={SeoIntentPage}/><Route path="/solucoes/:slug" component={SeoIntentPage}/><Route path="/comparar/:slug" component={SeoIntentPage}/><Route path="/produtos/:slug" component={ProdutoDetalhe}/><Route path="/produtos" component={Produtos}/><Route path="/funcionalidades/:slug" component={RecursoDetalhe}/><Route path="/funcionalidades" component={Funcionalidades}/><Route path="/agentes/:slug" component={AgenteDetalhe}/><Route path="/precos" component={Precos}/><Route path="/sobre" component={Sobre}/><Route path="/imprensa" component={Imprensa}/><Route path="/contato" component={Contato}/><Route path="/demo" component={Demo}/><Route path="/baixar-app" component={DownloadApp}/><Route path="/cadastro-praca" component={CadastroPraca}/><Route path="/privacy" component={Privacy}/><Route path="/terms" component={Terms}/><Route path="/blog/:slug" component={BlogPost}/><Route path="/blog" component={BlogList}/><Route component={NotFound}/></Switch></main><Footer/></div></Route></Switch></Suspense>}
function App(){return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,"")}><PublicSeoManager/><ScrollToTop/><Router/><LpOfferGlobal/><ContextualMandatoryVisuals/><FloatingActions/><RouteToaster/></WouterRouter>}
export default App;