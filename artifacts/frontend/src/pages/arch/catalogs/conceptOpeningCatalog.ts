export type ConceptOpeningFamily = {
  id: string;
  label: string;
  type: "door" | "window";
  width: number;
  height: number;
  sillHeight: number;
  openingStyle: "hinged" | "sliding" | "fixed" | "tilt_turn";
  swing?: "left" | "right";
  category: "Portas" | "Janelas";
  tags: string[];
};

export const CONCEPT_OPENING_FAMILIES: ConceptOpeningFamily[] = [
  { id:"door-hinged-080", label:"Porta giro 80", type:"door", width:0.80, height:2.10, sillHeight:0, openingStyle:"hinged", swing:"left", category:"Portas", tags:["giro","interna"] },
  { id:"door-hinged-090", label:"Porta giro 90", type:"door", width:0.90, height:2.10, sillHeight:0, openingStyle:"hinged", swing:"left", category:"Portas", tags:["giro","acesso"] },
  { id:"door-sliding-160", label:"Porta correr 160", type:"door", width:1.60, height:2.10, sillHeight:0, openingStyle:"sliding", category:"Portas", tags:["correr","2 folhas"] },
  { id:"door-sliding-240", label:"Porta correr 240", type:"door", width:2.40, height:2.20, sillHeight:0, openingStyle:"sliding", category:"Portas", tags:["correr","vão grande"] },
  { id:"door-pivot-120", label:"Porta pivotante 120", type:"door", width:1.20, height:2.40, sillHeight:0, openingStyle:"hinged", swing:"left", category:"Portas", tags:["pivotante","entrada"] },
  { id:"window-slide-120", label:"Janela correr 120×120", type:"window", width:1.20, height:1.20, sillHeight:0.90, openingStyle:"sliding", category:"Janelas", tags:["correr","2 folhas"] },
  { id:"window-slide-180", label:"Janela correr 180×120", type:"window", width:1.80, height:1.20, sillHeight:0.90, openingStyle:"sliding", category:"Janelas", tags:["correr","3 folhas"] },
  { id:"window-slide-200", label:"Janela correr 200×120", type:"window", width:2.00, height:1.20, sillHeight:0.90, openingStyle:"sliding", category:"Janelas", tags:["correr","4 folhas"] },
  { id:"window-maxim-080", label:"Maxim-ar 80×60", type:"window", width:0.80, height:0.60, sillHeight:1.50, openingStyle:"tilt_turn", category:"Janelas", tags:["maxim-ar","banheiro"] },
  { id:"window-fixed-200", label:"Janela fixa 200×200", type:"window", width:2.00, height:2.00, sillHeight:0.30, openingStyle:"fixed", category:"Janelas", tags:["fixa","panorâmica"] },
  { id:"window-tilt-120", label:"Oscilo-batente 120×120", type:"window", width:1.20, height:1.20, sillHeight:0.90, openingStyle:"tilt_turn", category:"Janelas", tags:["oscilo-batente","térmica"] },
];

export const openingFamilyById = (id?: string) =>
  CONCEPT_OPENING_FAMILIES.find((family) => family.id === id);
