import { describe,it,expect } from "vitest";
import { inspectMepWallImpact } from "./arqdor-mep-host-impact";
const wall={id:"w1",floor:0,x1:0,y1:0,x2:3000,y2:0,thickness:150};
const point={id:"p1",hostElementId:"w1",floorId:"0"};
describe("BIM host impact",()=>{
 it("does not report unchanged wall",()=>expect(inspectMepWallImpact([wall],[wall],[point])).toEqual([]));
 it("marks removed hosts",()=>expect(inspectMepWallImpact([wall],[],[point])[0]?.reason).toBe("removed"));
 it("marks shifted walls",()=>expect(inspectMepWallImpact([wall],[{...wall,y2:800}],[point])[0]?.reason).toBe("modified"));
 it("marks floor changes",()=>expect(inspectMepWallImpact([wall],[{...wall,floor:1}],[point])[0]?.reason).toBe("floor_changed"));
 it("never modifies source positions",()=>{const before=[wall],after=[{...wall,x2:4000}];inspectMepWallImpact(before,after,[point]);expect(before[0].x2).toBe(3000);});
});
