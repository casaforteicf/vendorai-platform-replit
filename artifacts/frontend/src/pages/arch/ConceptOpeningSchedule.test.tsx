import { afterEach,expect,it } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import { ConceptOpeningSchedule } from "./ConceptOpeningSchedule";
afterEach(cleanup);
it("refreshes warning when geometry changes and retains empty-state export guard",()=>{
 const walls=[{id:"w",floor:0,x1:0,y1:0,x2:4,y2:0}];
 const opening={id:"d",wallId:"w",floor:0,type:"door" as const,offset:0.5,width:1,height:2.1,sillHeight:0};
 const {rerender}=render(<ConceptOpeningSchedule walls={walls} openings={[opening]}/>);
 expect(screen.getByText("Informado")).toBeTruthy();
 rerender(<ConceptOpeningSchedule walls={walls} openings={[{...opening,offset:0}]}/>);
 expect(screen.getByText("Vão ultrapassa a parede")).toBeTruthy();
 rerender(<ConceptOpeningSchedule walls={walls} openings={[]}/>);
 expect(screen.getByRole("button",{name:"Exportar quadro de esquadrias CSV"}).hasAttribute("disabled")).toBe(true);
});

it("shows registered specifications and missing values in expandable details",()=>{
 const walls=[{id:"w",floor:0,x1:0,y1:0,x2:4,y2:0}];
 render(<ConceptOpeningSchedule walls={walls} openings={[{id:"j",wallId:"w",floor:0,type:"window",offset:0.5,manufacturer:"Marca registrada",openingStyle:"sliding",leafCount:2}]}/>);
 expect(screen.getByText("Marca registrada")).toBeTruthy();
 expect(screen.getByText("Correr")).toBeTruthy();
 expect(screen.getByText("Não vinculado")).toBeTruthy();
 expect(screen.getByText("Ver especificação").closest("details")).toBeTruthy();
});
