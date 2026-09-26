export type MasterRoom = {
  id: string;
  kind: string;
  label?: string;
  floor?: number;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
};

export type ProjectMasterIssue = {
  id: string;
  severity: "error" | "warning";
  roomId?: string;
  message: string;
};

export type ProjectMasterAcceptance = {
  validatorVersion: "project-master-v1";
  status: "approved" | "review" | "blocked";
  score: number;
  issues: ProjectMasterIssue[];
  errors: ProjectMasterIssue[];
  warnings: ProjectMasterIssue[];
  majorWarnings: ProjectMasterIssue[];
  blockingIssueIds: string[];
};

const EPS = 0.06;
const MAJOR_WARNING_PREFIXES = [
  "private-access-",
  "functional-width-",
  "circulation-missing-",
  "service-private-adjacency-",
  "garage-access-",
];

const overlap = (a1: number, a2: number, b1: number, b2: number) =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
const nearly = (a: number, b: number) => Math.abs(a - b) <= EPS;
const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase("pt-BR");
const isPrivateBath = (room: MasterRoom) =>
  room.kind === "banheiro" && /su[ií]te|master|casal|priv/i.test(lower(room.label));

function sharesEdge(a: MasterRoom, b: MasterRoom) {
  const ax = Number(a.x ?? 0), ay = Number(a.y ?? 0);
  const aw = Number(a.width ?? 0), ad = Number(a.depth ?? 0);
  const bx = Number(b.x ?? 0), by = Number(b.y ?? 0);
  const bw = Number(b.width ?? 0), bd = Number(b.depth ?? 0);
  const vertical =
    (nearly(ax + aw, bx) || nearly(ax, bx + bw)) &&
    overlap(ay, ay + ad, by, by + bd) >= 0.8;
  const horizontal =
    (nearly(ay + ad, by) || nearly(ay, by + bd)) &&
    overlap(ax, ax + aw, bx, bx + bw) >= 0.8;
  return vertical || horizontal;
}

export function evaluateProjectMasterAcceptance(input: {
  rooms: MasterRoom[];
  lotWidth: number;
  lotDepth: number;
  floors: number;
  site?: { frontSide?: "top" | "bottom" | "left" | "right"; setbackFront?: number };
}) : ProjectMasterAcceptance {
  const rooms = Array.isArray(input.rooms) ? input.rooms : [];
  const issues: ProjectMasterIssue[] = [];
  const floors = Math.max(1, Math.round(Number(input.floors) || 1));

  if (!rooms.length) {
    issues.push({ id: "rooms-missing", severity: "error", message: "O projeto não possui ambientes." });
  }

  for (let floor = 0; floor < floors; floor += 1) {
    const current = rooms.filter((room) => Number(room.floor ?? 0) === floor);
    if (!current.length) {
      issues.push({ id: `floor-${floor}-empty`, severity: "error", message: `Pavimento ${floor + 1} sem ambientes.` });
      continue;
    }

    for (const room of current) {
      const x = Number(room.x ?? 0), y = Number(room.y ?? 0);
      const width = Number(room.width ?? 0), depth = Number(room.depth ?? 0);
      if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
        issues.push({ id: `invalid-size-${room.id}`, severity: "error", roomId: room.id, message: `${room.label ?? room.id} possui dimensão inválida.` });
        continue;
      }
      if (x < -EPS || y < -EPS || x + width > input.lotWidth + EPS || y + depth > input.lotDepth + EPS) {
        issues.push({ id: `outside-${room.id}`, severity: "error", roomId: room.id, message: `${room.label ?? room.id} ultrapassa o limite do terreno.` });
      }
    }

    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i]!, b = current[j]!;
        const ox = overlap(Number(a.x ?? 0), Number(a.x ?? 0) + Number(a.width ?? 0), Number(b.x ?? 0), Number(b.x ?? 0) + Number(b.width ?? 0));
        const oy = overlap(Number(a.y ?? 0), Number(a.y ?? 0) + Number(a.depth ?? 0), Number(b.y ?? 0), Number(b.y ?? 0) + Number(b.depth ?? 0));
        if (ox > EPS && oy > EPS) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: "error", roomId: a.id, message: `${a.label ?? a.id} está sobrepondo ${b.label ?? b.id}.` });
        }
      }
    }

    const indoor = current.filter((room) => room.kind !== "piscina");
    if (indoor.length > 1) {
      const connected = new Set<string>([indoor[0]!.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of indoor) {
          if (!connected.has(a.id)) continue;
          for (const b of indoor) {
            if (connected.has(b.id)) continue;
            if (sharesEdge(a, b)) { connected.add(b.id); changed = true; }
          }
        }
      }
      for (const room of indoor) {
        if (!connected.has(room.id)) {
          issues.push({ id: `isolated-${room.id}`, severity: "error", roomId: room.id, message: `${room.label ?? room.id} está isolado da planta.` });
        }
      }
    }

    const privateRooms = current.filter((room) => room.kind === "quarto" || room.kind === "suite");
    const circulation = current.find((room) => room.kind === "circulacao");
    if (privateRooms.length >= 2 && !circulation) {
      issues.push({ id: `circulation-missing-${floor}`, severity: "warning", message: "A área íntima precisa de hall/circulação." });
    }
    for (const room of privateRooms) {
      const adjacent = current.filter((neighbor) => neighbor.id !== room.id && sharesEdge(room, neighbor));
      if (!adjacent.some((neighbor) => ["circulacao", "sala", "escada"].includes(neighbor.kind))) {
        issues.push({ id: `private-access-${room.id}`, severity: "warning", roomId: room.id, message: `${room.label ?? room.id} não possui acesso claro por hall/circulação.` });
      }
    }

    const minSideByKind: Record<string, number> = {
      quarto: 2.4, suite: 2.4, cozinha: 1.8, banheiro: 1.2, lavanderia: 1.5, garagem: 2.5,
    };
    for (const room of current) {
      const minSide = minSideByKind[room.kind];
      if (minSide && Math.min(Number(room.width ?? 0), Number(room.depth ?? 0)) + EPS < minSide) {
        issues.push({ id: `functional-width-${room.id}`, severity: "warning", roomId: room.id, message: `${room.label ?? room.id} possui lado útil abaixo de ${minSide.toFixed(1)} m.` });
      }
    }

    const suites = current.filter((room) => room.kind === "suite");
    for (const bath of current.filter(isPrivateBath)) {
      const matchingSuite = suites.find((suite) => {
        const suiteLabel = lower(suite.label).replace(/su[ií]te|master|casal/g, "").trim();
        return suiteLabel && lower(bath.label).includes(suiteLabel);
      });
      const owner = matchingSuite ?? (suites.length === 1 ? suites[0] : undefined);
      if (owner && !sharesEdge(owner, bath)) {
        issues.push({ id: `suite-bath-adjacency-${owner.id}-${bath.id}`, severity: "error", roomId: bath.id, message: `${bath.label ?? "Banheiro da suíte"} precisa estar conectado diretamente à ${owner.label ?? "suíte"}.` });
      }
    }

    for (const serviceRoom of current.filter((room) => room.kind === "lavanderia")) {
      for (const privateRoom of privateRooms) {
        if (sharesEdge(serviceRoom, privateRoom)) {
          issues.push({ id: `service-private-adjacency-${serviceRoom.id}-${privateRoom.id}`, severity: "warning", roomId: serviceRoom.id, message: "Lavanderia diretamente encostada no setor íntimo." });
        }
      }
    }

    const stair = current.find((room) => room.kind === "escada");
    if (floors > 1 && !stair) {
      issues.push({ id: `stair-missing-${floor}`, severity: "error", message: `Pavimento ${floor + 1} sem escada de conexão.` });
    }
    if (stair && floor > 0) {
      const lowerStair = rooms.find((room) => room.kind === "escada" && Number(room.floor ?? 0) === floor - 1);
      if (!lowerStair || !sharesEdge(stair, lowerStair) && (
        overlap(Number(stair.x ?? 0), Number(stair.x ?? 0) + Number(stair.width ?? 0), Number(lowerStair?.x ?? 0), Number(lowerStair?.x ?? 0) + Number(lowerStair?.width ?? 0)) < Math.min(Number(stair.width ?? 0), Number(lowerStair?.width ?? 0)) * 0.7
        || overlap(Number(stair.y ?? 0), Number(stair.y ?? 0) + Number(stair.depth ?? 0), Number(lowerStair?.y ?? 0), Number(lowerStair?.y ?? 0) + Number(lowerStair?.depth ?? 0)) < Math.min(Number(stair.depth ?? 0), Number(lowerStair?.depth ?? 0)) * 0.7
      )) {
        issues.push({ id: `stair-align-${stair.id}`, severity: "error", roomId: stair.id, message: "Escada desalinhada com o pavimento inferior." });
      }
    }

    const garage = current.find((room) => room.kind === "garagem");
    if (garage) {
      const gap = input.site?.frontSide === "bottom" ? input.lotDepth - (Number(garage.y ?? 0) + Number(garage.depth ?? 0))
        : input.site?.frontSide === "left" ? Number(garage.x ?? 0)
        : input.site?.frontSide === "right" ? input.lotWidth - (Number(garage.x ?? 0) + Number(garage.width ?? 0))
        : Number(garage.y ?? 0);
      if (gap > Math.max(0, Number(input.site?.setbackFront ?? 0)) + 3) {
        issues.push({ id: `garage-access-${garage.id}`, severity: "warning", roomId: garage.id, message: "Garagem distante da frente do terreno." });
      }
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const majorWarnings = warnings.filter((issue) => MAJOR_WARNING_PREFIXES.some((prefix) => issue.id.includes(prefix)));
  const nonMajorWarnings = warnings.filter((issue) => !majorWarnings.includes(issue));
  const score = Math.max(0, Math.min(100, Math.round(100 - errors.length * 30 - majorWarnings.length * 10 - nonMajorWarnings.length * 3)));
  const status = errors.length > 0 || score < 60 ? "blocked" : majorWarnings.length > 0 || warnings.length >= 3 || score < 80 ? "review" : "approved";
  return { validatorVersion: "project-master-v1", status, score, issues, errors, warnings, majorWarnings, blockingIssueIds: errors.map((issue) => issue.id) };
}
