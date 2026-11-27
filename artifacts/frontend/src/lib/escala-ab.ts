export const GRUPOS = ["Cozinha M", "Cozinha N", "Salão M", "Salão N", "Salão P", "Confeitaria M", "Confeitaria N", "Quiosque"] as const;
export const JANELAS = ["07:30–16:54", "13:26–22:50", "06:00–17:24", "13:56–23:20", "19:00–23:00", "04:00–15:24", "11:56–21:20", "07:00–19:30"];

export type EscalaStaff = {
  name: string;
  role: string;
  sector: string;
  shift: string;
  regime: string;
  start: string;
  breakStart: string;
  breakEnd: string;
  end: string;
  sunday: number;
  schedule: string[];
};

export type EscalaDia = { date: string; pax: number; morning: number; targets: number[] };
export type EscalaExtra = { name: string; phone: string; role: string; group: number; days: number[]; notes: string };
export type EscalaState = {
  start: string;
  cost: number;
  staff: EscalaStaff[];
  days: EscalaDia[];
  criticalPairs: string[][];
  rates: { weekday: number; weekend: number; holiday: number };
  holidays: Record<string, boolean>;
  extraPeople: EscalaExtra[];
};

const DIA = 86400000;
export const dataDe = (start: string, offset: number) => new Date(new Date(`${start}T12:00:00`).getTime() + offset * DIA);
export const rotuloDia = (state: EscalaState, d: number) => dataDe(state.start, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
export const diaSemana = (state: EscalaState, d: number) => dataDe(state.start, d).toLocaleDateString("pt-BR", { weekday: "short" });
export const chaveData = (state: EscalaState, d: number) => {
  const x = dataDe(state.start, d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const domingo = (state: EscalaState, d: number) => dataDe(state.start, d).getDay() === 0;

export function estadoInicial(start: string): EscalaState {
  return {
    start,
    cost: 120,
    staff: [],
    days: Array.from({ length: 35 }, (_, d) => {
      const date = dataDe(start, d);
      return {
        date: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
        pax: 0,
        morning: 0,
        targets: Array(GRUPOS.length).fill(0),
      };
    }),
    criticalPairs: [],
    rates: { weekday: 120, weekend: 120, holiday: 120 },
    holidays: {},
    extraPeople: [],
  };
}

export function normalizarEstado(input: unknown, fallbackStart: string): EscalaState {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<EscalaState>;
  const base = estadoInicial(typeof raw.start === "string" ? raw.start : fallbackStart);
  const staff = Array.isArray(raw.staff) ? raw.staff.filter((s): s is EscalaStaff => Boolean(s && typeof s === "object")) : [];
  return {
    ...base,
    ...raw,
    start: typeof raw.start === "string" ? raw.start : fallbackStart,
    cost: Number.isFinite(Number(raw.cost)) ? Number(raw.cost) : 120,
    staff: staff.map((s) => ({
      name: String(s.name ?? ""),
      role: String(s.role ?? ""),
      sector: String(s.sector ?? "Salão"),
      shift: String(s.shift ?? "M"),
      regime: String(s.regime ?? "5x2 integral"),
      start: String(s.start ?? "08:00"),
      breakStart: String(s.breakStart ?? "12:00"),
      breakEnd: String(s.breakEnd ?? "13:00"),
      end: String(s.end ?? "17:24"),
      sunday: Number(s.sunday ?? 1),
      schedule: Array.isArray(s.schedule) && s.schedule.length === 35 ? s.schedule.map((v) => (v === "T" ? "T" : "F")) : base.days.map((_, d) => d % 7 < 5 ? "T" : "F"),
    })),
    days: Array.isArray(raw.days) && raw.days.length === 35
      ? raw.days.map((d, i) => ({
          date: typeof d.date === "string" ? d.date : base.days[i]!.date,
          pax: Number.isFinite(Number(d.pax)) ? Number(d.pax) : 0,
          morning: Number.isFinite(Number(d.morning)) ? Number(d.morning) : 0,
          targets: Array.isArray(d.targets) && d.targets.length === GRUPOS.length ? d.targets.map(Number) : Array(GRUPOS.length).fill(0),
        }))
      : base.days,
    criticalPairs: Array.isArray(raw.criticalPairs) ? raw.criticalPairs.map((p) => (Array.isArray(p) ? p.map(String) : [])).filter((p) => p.length > 0) : [],
    rates: {
      weekday: Number(raw.rates?.weekday ?? raw.cost ?? 120),
      weekend: Number(raw.rates?.weekend ?? raw.cost ?? 120),
      holiday: Number(raw.rates?.holiday ?? raw.cost ?? 120),
    },
    holidays: raw.holidays && typeof raw.holidays === "object" ? raw.holidays : {},
    extraPeople: Array.isArray(raw.extraPeople) ? raw.extraPeople.map((e) => ({
      name: String(e.name ?? ""),
      phone: String(e.phone ?? ""),
      role: String(e.role ?? ""),
      group: Number(e.group ?? 2),
      days: Array.isArray(e.days) ? e.days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
      notes: String(e.notes ?? ""),
    })) : [],
  };
}

export function minutos(time: string): number {
  if (!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [h, m] = time.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
}

export function minutosTrabalho(s: EscalaStaff): number {
  const a = minutos(s.start), b = minutos(s.end), c = minutos(s.breakStart), d = minutos(s.breakEnd);
  if (!Number.isFinite(a + b) || b <= a) return NaN;
  if (!s.breakStart && !s.breakEnd) return b - a;
  if (!Number.isFinite(c + d) || c < a || d < c || d > b) return NaN;
  return b - a - (d - c);
}

export function fmtHoras(m: number): string {
  return Number.isFinite(m) ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "Revisar";
}

export function grupoIndice(s: EscalaStaff): number {
  const key = s.sector === "Quiosque" ? "Quiosque" : `${s.sector} ${s.shift}`;
  return GRUPOS.indexOf(key as (typeof GRUPOS)[number]);
}

export function contar(state: EscalaState) {
  return state.days.map((day, d) => {
    const ativos = GRUPOS.map(() => 0);
    state.staff.forEach((s) => {
      const g = grupoIndice(s);
      if (s.schedule[d] === "T" && g >= 0) ativos[g] += 1;
    });
    const extras = ativos.map((v, g) => Math.max(0, day.targets[g] - v));
    return { ativos, extras, total: ativos.reduce((a, b) => a + b, 0), totalExtras: extras.reduce((a, b) => a + b, 0) };
  });
}

export function metaDia(state: EscalaState, d: number) {
  const day = state.days[d];
  const matrix = [[3, 3, 3, 2, 1, 2, 1, 1], [3, 4, 4, 3, 1, 2, 2, 1], [4, 4, 5, 3, 1, 3, 2, 1], [5, 5, 6, 4, 2, 3, 3, 1]];
  const level = (p: number) => p <= 50 ? 0 : p <= 100 ? 1 : p <= 150 ? 2 : 3;
  day.targets = GRUPOS.map((g, j) => {
    const pax = g.endsWith(" M") ? day.morning : day.pax;
    let value = matrix[level(pax)]![j]!;
    if (pax > 200 && [0, 1, 2, 3, 5, 6].includes(j)) value += Math.ceil((pax - 200) / 50);
    return value;
  });
}

export function gerarMetas(state: EscalaState) {
  state.days.forEach((_, d) => metaDia(state, d));
}

export function gerarEscala(state: EscalaState) {
  for (const staff of state.staff) {
    if (staff.regime === "12x36") continue;
    for (let week = 0; week < 5; week += 1) {
      const start = week * 7;
      let count = staff.schedule.slice(start, start + 7).filter((v) => v === "T").length;
      for (let i = 0; i < 7 && count > 5; i += 1) {
        if (staff.schedule[start + i] === "T") { staff.schedule[start + i] = "F"; count -= 1; }
      }
      for (let i = 0; i < 7 && count < 5; i += 1) {
        if (staff.schedule[start + i] === "F") { staff.schedule[start + i] = "T"; count += 1; }
      }
    }
  }
}

export function validar(state: EscalaState): Array<{ nome: string; alertas: string }> {
  const out: Array<{ nome: string; alertas: string }> = [];
  for (const s of state.staff) {
    const alertas: string[] = [];
    if (s.regime !== "12x36") {
      for (let w = 0; w < 5; w += 1) {
        const dias = s.schedule.slice(w * 7, w * 7 + 7).filter((v) => v === "T").length;
        if (dias !== 5) alertas.push(`ciclo ${w + 1} com ${dias} dias`);
      }
      let run = 0;
      for (const v of s.schedule) { run = v === "T" ? run + 1 : 0; if (run > 6) { alertas.push("mais de 6 dias seguidos"); break; } }
    }
    const domingosFolga = s.schedule.filter((v, d) => domingo(state, d) && v !== "T").length;
    if (s.regime !== "12x36" && domingosFolga === 0) alertas.push("sem domingo de folga");
    out.push({ nome: s.name || "Sem nome", alertas: alertas.join("; ") || "OK" });
  }
  for (const pair of state.criticalPairs) {
    for (let d = 0; d < state.days.length; d += 1) {
      const presentes = pair.filter((prefix) => state.staff.some((s) => s.name.startsWith(prefix) && s.schedule[d] === "T"));
      if (presentes.length === pair.length) out.push({ nome: `${pair.join(" / ")} em ${rotuloDia(state, d)}`, alertas: "funções críticas juntas no mesmo dia" });
    }
  }
  return out;
}

export function tipoTarifa(state: EscalaState, d: number): "weekday" | "weekend" | "holiday" {
  if (state.holidays[chaveData(state, d)]) return "holiday";
  return [0, 6].includes(dataDe(state.start, d).getDay()) ? "weekend" : "weekday";
}
export function valorTarifa(state: EscalaState, d: number): number {
  return Number(state.rates[tipoTarifa(state, d)] ?? state.cost ?? 0);
}
export function custoExtras(state: EscalaState): number {
  const c = contar(state);
  return c.reduce((total, item, d) => total + item.totalExtras * valorTarifa(state, d), 0);
}

export function paraCsv(state: EscalaState): string {
  const c = contar(state);
  const rows: string[][] = [
    ["Nome", "Cargo", "Setor", "Turno", "Regime", "Entrada", "Intervalo início", "Intervalo fim", "Saída", ...state.days.map((_, d) => rotuloDia(state, d))],
    ...state.staff.map((s) => [s.name, s.role, s.sector, s.shift, s.regime, s.start, s.breakStart, s.breakEnd, s.end, ...s.schedule]),
    ["Extras", ...Array(9).fill(""), ...c.map((x) => String(x.totalExtras))],
    ["Custo extras", ...Array(9).fill(""), ...c.map((x, d) => x.totalExtras * valorTarifa(state, d)).map((v) => v.toFixed(2))],
  ];
  return "\uFEFF" + rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

export function cobertura(state: EscalaState, d: number) {
  const slots: Array<{ hora: string; setores: number[] }> = [];
  for (let t = 240; t < 1440; t += 30) {
    const setores = ["Cozinha", "Salão", "Confeitaria", "Quiosque"].map((setor) => state.staff.filter((s) => {
      if (s.sector !== setor || s.schedule[d] !== "T") return false;
      const start = minutos(s.start), end = minutos(s.end), bs = minutos(s.breakStart), be = minutos(s.breakEnd);
      return t >= start && t < end && !(t >= bs && t < be);
    }).length);
    slots.push({ hora: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, setores });
  }
  return slots;
}
