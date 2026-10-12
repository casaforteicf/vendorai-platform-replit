import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ConceptOpeningBudget} from "./ConceptOpeningBudget";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const openings=[{id:"d",wallId:"w",floor:0,type:"door" as const,offset:0.5}];
const quote={items:[{id:"i",descricao:"Porta",quantidade:"1.00",unidade:"un",valorUnitario:"100.00",valorTotal:"100.00"}],issues:[],total:100,quoteToken:"quote-a",projectId:"p",canApply:true};
it("consults saved concept then confirms with the quoted token",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>quote}).mockResolvedValueOnce({ok:true,json:async()=>({synced:1})});vi.stubGlobal("fetch",fetch);
 render(<ConceptOpeningBudget conceptId="c" openings={openings}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar preços das esquadrias"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"Confirmar envio ao orçamento"}).hasAttribute("disabled")).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:"Confirmar envio ao orçamento"}));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("sincronizada"));
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({apply:false});
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({apply:true,quoteToken:"quote-a"});
});
it("blocks incomplete estimates and clears preview when openings change",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({...quote,canApply:false,issues:["Produto ausente"]})}));
 const {rerender}=render(<ConceptOpeningBudget conceptId="c" openings={openings}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar preços das esquadrias"}));
 await screen.findByText("Produto ausente");
 expect(screen.getByRole("button",{name:"Confirmar envio ao orçamento"}).hasAttribute("disabled")).toBe(true);
 rerender(<ConceptOpeningBudget conceptId="c" openings={[...openings]}/>);
 expect(screen.queryByText("Produto ausente")).toBeNull();
});
it("shows a stale quote error and requires a new consultation",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce({ok:true,json:async()=>quote}).mockResolvedValueOnce({ok:false,json:async()=>({error:"Preços mudaram"})}));
 render(<ConceptOpeningBudget conceptId="c" openings={openings}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar preços das esquadrias"}));
 const confirm=await screen.findByRole("button",{name:"Confirmar envio ao orçamento"});fireEvent.click(confirm);
 await screen.findByText("Preços mudaram");expect(screen.queryByRole("button",{name:"Confirmar envio ao orçamento"})).toBeNull();
});

it("ignores a late response from an earlier project after a newer quote arrives",async()=>{
 let resolveOld:(value:unknown)=>void=()=>{};
 const old=new Promise(resolve=>{resolveOld=resolve;});
 vi.stubGlobal("fetch",vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce({ok:true,json:async()=>({...quote,total:200,quoteToken:"new",items:[{...quote.items[0],descricao:"Novo projeto"}]})}));
 const {rerender}=render(<ConceptOpeningBudget conceptId="old" openings={openings}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar preços das esquadrias"}));
 rerender(<ConceptOpeningBudget conceptId="new" openings={openings}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar preços das esquadrias"}));
 await screen.findByText(/Novo projeto/);
 await act(async()=>{resolveOld({ok:true,json:async()=>quote});await old;});
 expect(screen.getByText(/Novo projeto/)).toBeTruthy();
 expect(screen.queryByText(/Porta ·/)).toBeNull();
});
it("does not send repeated requests from rapid clicks",async()=>{
 let resolve:(value:unknown)=>void=()=>{};
 const pending=new Promise(r=>{resolve=r;});const fetch=vi.fn(()=>pending);vi.stubGlobal("fetch",fetch);
 render(<ConceptOpeningBudget conceptId="c" openings={openings}/>);
 const button=screen.getByRole("button",{name:"Consultar preços das esquadrias"});
 fireEvent.click(button);fireEvent.click(button);expect(fetch).toHaveBeenCalledOnce();
 await act(async()=>{resolve({ok:true,json:async()=>quote});await pending;});
 expect(screen.getByRole("button",{name:"Confirmar envio ao orçamento"})).toBeTruthy();
});
it("rejects malformed monetary items instead of rendering or enabling confirmation",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({...quote,items:[null]})}));
 render(<ConceptOpeningBudget conceptId="c" openings={openings}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar preços das esquadrias"}));
 await screen.findByText("Resposta de preços inválida.");expect(screen.queryByRole("button",{name:"Confirmar envio ao orçamento"})).toBeNull();
});
