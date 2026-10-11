import { describe, expect, it } from "vitest";
import { convertSurveyToArqdor } from "./convertSurveyToArqdor";
import type { SurveyElement } from "./SurveyElementsEditor";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): SurveyElement => ({
  id, roomName: "Cozinha", elementType: "wall", label: id, verified: true,
  x1Mm:x1, y1Mm:y1, x2Mm:x2, y2Mm:y2, thicknessMm:150,
});
describe("Arqdor Measure conversion gate", () => {
  it("blocks unconnected geometry even when individual walls are verified", () => {
    const result = convertSurveyToArqdor([wall("a",0,0,3000,0)]);
    expect(result.readyForReview).toBe(false);
    expect(result.warnings.some((w) => w.includes("sem conexão"))).toBe(true);
  });
  it("converts a closed measured outline into metric wall geometry", () => {
    const result = convertSurveyToArqdor([wall("a",0,0,3000,0),wall("b",3000,0,3000,2000),wall("c",3000,2000,0,2000),wall("d",0,2000,0,0)]);
    expect(result.readyForReview).toBe(true);
    expect(result.configuration.customWalls[0].x2).toBe(3);
    expect(result.configuration.customWalls[0].thickness).toBe(0.15);
  });
  it("rejects an overlapping opening pair", () => {
    const walls = [wall("a",0,0,3000,0),wall("b",3000,0,3000,2000),wall("c",3000,2000,0,2000),wall("d",0,2000,0,0)];
    const opening = (id:string,offset:number):SurveyElement => ({id,roomName:"Cozinha",elementType:"window",label:id,verified:true,wallId:"a",offsetMm:offset,widthMm:1000,heightMm:1000,sillHeightMm:900});
    const result = convertSurveyToArqdor([...walls,opening("e",500),opening("f",1000)]);
    expect(result.readyForReview).toBe(false);
    expect(result.warnings.some((w)=>w.includes("sobrepostas"))).toBe(true);
  });
});
