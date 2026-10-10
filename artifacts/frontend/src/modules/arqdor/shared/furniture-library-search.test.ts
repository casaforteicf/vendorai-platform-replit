import {describe,it,expect} from "vitest";
import {searchFurnitureLibrary,type FurnitureLibraryRecord} from "./furniture-library-search";
const entries:FurnitureLibraryRecord[]=[
{id:"u",name:"Armário universal",category:"closet",tags:["madeira"],scope:"universal",revision:1},
{id:"a",name:"Armário privado",category:"closet",tags:["madeira"],scope:"tenant",tenantId:"a",revision:1},
{id:"b",name:"Armário outro cliente",category:"closet",tags:["madeira"],scope:"tenant",tenantId:"b",revision:1},
{id:"me",name:"Balcão pessoal",category:"balcao",tags:[],scope:"user",tenantId:"a",ownerUserId:"user1",revision:1}];
describe("furniture library tenant scoped search",()=>{
 it("does not reveal other tenant models",()=>{
  expect(searchFurnitureLibrary(entries,{tenantId:"a",text:"armário"}).map(x=>x.id)).toEqual(["a","u"]);
 });
 it("limits individual items to owner and filters favorites",()=>{
  expect(searchFurnitureLibrary(entries,{tenantId:"a",userId:"user2",text:"balcão"})).toHaveLength(0);
  expect(searchFurnitureLibrary(entries,{tenantId:"a",userId:"user1",favorites:new Set(["me"]),favoritesOnly:true}).map(x=>x.id)).toEqual(["me"]);
 });
});