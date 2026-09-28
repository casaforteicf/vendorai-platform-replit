export type IfcMetadata = {
  schema: string | null;
  projectName: string | null;
  unit: "m" | "mm" | "cm" | "unknown";
  storeys: Array<{ id: string; name: string | null; elevation: number | null }>;
  counts: {
    walls: number;
    doors: number;
    windows: number;
    slabs: number;
    spaces: number;
    roofs: number;
    columns: number;
    beams: number;
    stairs: number;
    furnishings: number;
    totalEntities: number;
  };
  warnings: string[];
};

type IfcEntity = {
  id: string;
  type: string;
  body: string;
};

function decodeStepString(value: string) {
  return value.replace(/''/g, "'").trim();
}

function quotedStrings(body: string) {
  const values: string[] = [];
  const regex = /'((?:''|[^'])*)'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body))) values.push(decodeStepString(match[1] ?? ""));
  return values;
}

function parseEntityLines(input: string): IfcEntity[] {
  const normalized = input.replace(/\r/g, "");
  const entities: IfcEntity[] = [];
  const regex = /#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(([\s\S]*?)\);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized))) {
    entities.push({
      id: match[1] ?? "",
      type: (match[2] ?? "").toUpperCase(),
      body: match[3] ?? "",
    });
  }
  return entities;
}

function parseElevation(body: string) {
  const tokens = body.split(",");
  const last = tokens[tokens.length - 1]?.trim() ?? "";
  const value = Number(last.replace(/\)$/g, ""));
  return Number.isFinite(value) ? value : null;
}

function inferUnit(input: string): IfcMetadata["unit"] {
  const compact = input.toUpperCase();
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\.MILLI\.[^)]*\.METRE\./.test(compact)) return "mm";
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\.CENTI\.[^)]*\.METRE\./.test(compact)) return "cm";
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\$[^)]*\.METRE\./.test(compact)) return "m";
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\.METRE\./.test(compact)) return "m";
  return "unknown";
}

export function parseIfcMetadata(input: string): IfcMetadata {
  if (!input || input.includes("\u0000")) {
    throw new Error("Arquivo IFC binário ou inválido.");
  }
  if (!/ISO-10303-21/i.test(input) || !/FILE_SCHEMA/i.test(input)) {
    throw new Error("O arquivo não parece ser um IFC STEP válido.");
  }

  const entities = parseEntityLines(input);
  if (!entities.length) throw new Error("Nenhuma entidade IFC foi encontrada.");

  const schemaMatch = input.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  const schema = schemaMatch?.[1]?.trim() ?? null;

  const project = entities.find((entity) => entity.type === "IFCPROJECT");
  const projectStrings = project ? quotedStrings(project.body) : [];
  const projectName = projectStrings[1] || projectStrings[0] || null;

  const storeys = entities
    .filter((entity) => entity.type === "IFCBUILDINGSTOREY")
    .map((entity) => {
      const strings = quotedStrings(entity.body);
      return {
        id: entity.id,
        name: strings[1] || strings[0] || null,
        elevation: parseElevation(entity.body),
      };
    });

  const count = (...types: string[]) => entities.filter((entity) => types.includes(entity.type)).length;
  const counts = {
    walls: count("IFCWALL", "IFCWALLSTANDARDCASE", "IFCCURTAINWALL"),
    doors: count("IFCDOOR"),
    windows: count("IFCWINDOW"),
    slabs: count("IFCSLAB"),
    spaces: count("IFCSPACE"),
    roofs: count("IFCROOF"),
    columns: count("IFCCOLUMN"),
    beams: count("IFCBEAM"),
    stairs: count("IFCSTAIR", "IFCSTAIRFLIGHT"),
    furnishings: count("IFCFURNISHINGELEMENT", "IFCFURNITURE"),
    totalEntities: entities.length,
  };

  const warnings: string[] = [];
  if (!schema) warnings.push("Schema IFC não identificado no cabeçalho.");
  if (!project) warnings.push("Entidade IFCPROJECT não encontrada.");
  if (!storeys.length) warnings.push("Nenhum IFCBUILDINGSTOREY encontrado.");
  if (!counts.walls) warnings.push("Nenhuma parede IFC foi identificada.");
  if (inferUnit(input) === "unknown") warnings.push("Unidade linear IFC não identificada.");

  return {
    schema,
    projectName,
    unit: inferUnit(input),
    storeys,
    counts,
    warnings,
  };
}
