export type EngineeringSeverity = "error" | "warning" | "info";

export type EngineeringValidation = {
  code: string;
  severity: EngineeringSeverity;
  message: string;
  field?: string;
  expected?: unknown;
  actual?: unknown;
};

export type EngineeringInput = {
  widthMm: number;
  heightMm: number;
  quantity?: number;
  leafCount?: number;
  glassThicknessMm?: number;
  glassWeightKgPerM2?: number;
  installationType?: string;
  options?: Record<string, boolean | number | string | null | undefined>;
  requiredPerformance?: {
    acousticDb?: number;
    watertightnessPa?: number;
    windPressurePa?: number;
  };
};

export type EngineeringConfiguration = {
  id: string;
  code: string;
  name: string;
  productKind: string;
  openingType: string;
  leafCount?: number | null;
  minWidthMm?: number | null;
  maxWidthMm?: number | null;
  minHeightMm?: number | null;
  maxHeightMm?: number | null;
  maxLeafWeightKg?: number | null;
  allowedGlassThicknessMm?: number[];
  installationRules?: Record<string, unknown>;
};

export type PerformanceEvidence = {
  id?: string;
  reportNumber?: string | null;
  testType: string;
  acousticDb?: number | null;
  watertightnessPa?: number | null;
  windPressurePa?: number | null;
  conditions?: Record<string, unknown>;
};

export type ComponentRule = {
  id?: string;
  code: string;
  name: string;
  group: string;
  role: string;
  unit: "un" | "m" | "m2" | "kg" | string;
  required?: boolean;
  commercialLengthMm?: number | null;
  costValue?: number | null;
  saleValue?: number | null;
  pricingBasis?: string | null;
  quantityRule?: RuleExpression;
  dimensionRule?: RuleExpression;
  conditionRule?: ConditionExpression;
  wasteRule?: RuleExpression;
  metadata?: Record<string, unknown>;
};

export type RuleExpression =
  | { op: "constant"; value: number }
  | { op: "input"; field: "widthMm" | "heightMm" | "leafCount" | "quantity" | "glassThicknessMm" }
  | { op: "option"; key: string; fallback?: number }
  | { op: "sum"; args: RuleExpression[] }
  | { op: "subtract"; left: RuleExpression; right: RuleExpression }
  | { op: "multiply"; args: RuleExpression[] }
  | { op: "divide"; numerator: RuleExpression; denominator: RuleExpression }
  | { op: "perimeter"; width: RuleExpression; height: RuleExpression }
  | { op: "area"; width: RuleExpression; height: RuleExpression }
  | { op: "percent"; base: RuleExpression; percent: number }
  | { op: "max"; args: RuleExpression[] }
  | { op: "min"; args: RuleExpression[] };

export type ConditionExpression =
  | { op: "always" }
  | { op: "optionEquals"; key: string; value: boolean | number | string | null }
  | { op: "gte"; left: RuleExpression; right: RuleExpression }
  | { op: "lte"; left: RuleExpression; right: RuleExpression }
  | { op: "and"; args: ConditionExpression[] }
  | { op: "or"; args: ConditionExpression[] }
  | { op: "not"; arg: ConditionExpression };

export type ResolvedBomItem = {
  code: string;
  name: string;
  group: string;
  role: string;
  unit: string;
  theoreticalQuantity: number;
  billedQuantity: number;
  commercialUnits?: number;
  wasteQuantity: number;
  unitCost?: number | null;
  totalCost?: number | null;
  unitSale?: number | null;
  totalSale?: number | null;
  trace: string[];
};

export type EngineeringResult = {
  valid: boolean;
  validations: EngineeringValidation[];
  bom: ResolvedBomItem[];
  totals: {
    cost: number;
    sale: number;
  };
  evidence: {
    accepted: PerformanceEvidence[];
    rejected: Array<{ evidence: PerformanceEvidence; reasons: string[] }>;
  };
};

const finite = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function inputValue(field: string, input: EngineeringInput) {
  if (field === "leafCount") return finite(input.leafCount, 0);
  if (field === "quantity") return finite(input.quantity, 1);
  return finite((input as Record<string, unknown>)[field], 0);
}

export function evaluateRule(rule: RuleExpression | undefined, input: EngineeringInput): number {
  if (!rule) return 0;
  switch (rule.op) {
    case "constant":
      return finite(rule.value);
    case "input":
      return inputValue(rule.field, input);
    case "option":
      return finite(input.options?.[rule.key], finite(rule.fallback, 0));
    case "sum":
      return rule.args.reduce((acc, arg) => acc + evaluateRule(arg, input), 0);
    case "subtract":
      return evaluateRule(rule.left, input) - evaluateRule(rule.right, input);
    case "multiply":
      return rule.args.reduce((acc, arg) => acc * evaluateRule(arg, input), 1);
    case "divide": {
      const denominator = evaluateRule(rule.denominator, input);
      return Math.abs(denominator) < 1e-9 ? 0 : evaluateRule(rule.numerator, input) / denominator;
    }
    case "perimeter":
      return 2 * (evaluateRule(rule.width, input) + evaluateRule(rule.height, input));
    case "area":
      return evaluateRule(rule.width, input) * evaluateRule(rule.height, input);
    case "percent":
      return evaluateRule(rule.base, input) * (finite(rule.percent) / 100);
    case "max":
      return Math.max(...rule.args.map((arg) => evaluateRule(arg, input)));
    case "min":
      return Math.min(...rule.args.map((arg) => evaluateRule(arg, input)));
  }
}

export function evaluateCondition(condition: ConditionExpression | undefined, input: EngineeringInput): boolean {
  if (!condition || condition.op === "always") return true;
  switch (condition.op) {
    case "optionEquals":
      return (input.options?.[condition.key] ?? null) === condition.value;
    case "gte":
      return evaluateRule(condition.left, input) >= evaluateRule(condition.right, input);
    case "lte":
      return evaluateRule(condition.left, input) <= evaluateRule(condition.right, input);
    case "and":
      return condition.args.every((arg) => evaluateCondition(arg, input));
    case "or":
      return condition.args.some((arg) => evaluateCondition(arg, input));
    case "not":
      return !evaluateCondition(condition.arg, input);
    default:
      return true;
  }
}

function validateConfiguration(
  configuration: EngineeringConfiguration,
  input: EngineeringInput,
): EngineeringValidation[] {
  const out: EngineeringValidation[] = [];
  const checks: Array<[string, number | null | undefined, (actual: number, expected: number) => boolean, string]> = [
    ["widthMm:min", configuration.minWidthMm, (a, e) => a >= e, "widthMm"],
    ["widthMm:max", configuration.maxWidthMm, (a, e) => a <= e, "widthMm"],
    ["heightMm:min", configuration.minHeightMm, (a, e) => a >= e, "heightMm"],
    ["heightMm:max", configuration.maxHeightMm, (a, e) => a <= e, "heightMm"],
  ];

  for (const [code, expected, test, field] of checks) {
    if (expected == null) continue;
    const actual = finite((input as Record<string, unknown>)[field]);
    if (!test(actual, finite(expected))) {
      out.push({
        code: `configuration.${code}`,
        severity: "error",
        field,
        actual,
        expected,
        message: `${field} fora do limite homologado da configuração ${configuration.code}.`,
      });
    }
  }

  if (configuration.leafCount != null && input.leafCount != null && configuration.leafCount !== input.leafCount) {
    out.push({
      code: "configuration.leafCount",
      severity: "error",
      field: "leafCount",
      expected: configuration.leafCount,
      actual: input.leafCount,
      message: "Quantidade de folhas não corresponde à configuração selecionada.",
    });
  }

  if (
    input.glassThicknessMm != null &&
    configuration.allowedGlassThicknessMm?.length &&
    !configuration.allowedGlassThicknessMm.includes(input.glassThicknessMm)
  ) {
    out.push({
      code: "configuration.glassThickness",
      severity: "error",
      field: "glassThicknessMm",
      expected: configuration.allowedGlassThicknessMm,
      actual: input.glassThicknessMm,
      message: "Espessura de vidro não homologada para esta configuração.",
    });
  }

  if (configuration.maxLeafWeightKg != null && input.glassWeightKgPerM2 != null) {
    const leafs = Math.max(1, input.leafCount ?? configuration.leafCount ?? 1);
    const areaPerLeafM2 = (input.widthMm / 1000) * (input.heightMm / 1000) / leafs;
    const estimatedGlassWeight = areaPerLeafM2 * input.glassWeightKgPerM2;
    if (estimatedGlassWeight > configuration.maxLeafWeightKg) {
      out.push({
        code: "configuration.leafWeight",
        severity: "error",
        field: "glassWeightKgPerM2",
        expected: configuration.maxLeafWeightKg,
        actual: Number(estimatedGlassWeight.toFixed(3)),
        message: "Peso estimado do vidro por folha supera o limite cadastrado da configuração.",
      });
    }
  }

  return out;
}

function evidenceMatchesConditions(evidence: PerformanceEvidence, input: EngineeringInput) {
  const reasons: string[] = [];
  const conditions = evidence.conditions ?? {};

  for (const [key, expected] of Object.entries(conditions)) {
    if (key === "glassThicknessMm" && input.glassThicknessMm != null && Number(expected) !== input.glassThicknessMm) {
      reasons.push(`vidro ensaiado ${expected} mm ≠ ${input.glassThicknessMm} mm`);
      continue;
    }
    if (key === "leafCount" && input.leafCount != null && Number(expected) !== input.leafCount) {
      reasons.push(`folhas ensaiadas ${expected} ≠ ${input.leafCount}`);
      continue;
    }
    if (key.startsWith("option.")) {
      const optionKey = key.slice("option.".length);
      if ((input.options?.[optionKey] ?? null) !== expected) {
        reasons.push(`condição ${optionKey} divergente do ensaio`);
      }
    }
  }

  return reasons;
}

function validatePerformance(
  evidence: PerformanceEvidence[],
  input: EngineeringInput,
): EngineeringResult["evidence"] {
  const accepted: PerformanceEvidence[] = [];
  const rejected: Array<{ evidence: PerformanceEvidence; reasons: string[] }> = [];
  const required = input.requiredPerformance ?? {};

  for (const item of evidence) {
    const reasons = evidenceMatchesConditions(item, input);
    if (required.acousticDb != null && (item.acousticDb == null || item.acousticDb < required.acousticDb)) {
      reasons.push("desempenho acústico inferior ao requerido");
    }
    if (
      required.watertightnessPa != null &&
      (item.watertightnessPa == null || item.watertightnessPa < required.watertightnessPa)
    ) {
      reasons.push("estanqueidade inferior ao requerido");
    }
    if (
      required.windPressurePa != null &&
      (item.windPressurePa == null || item.windPressurePa < required.windPressurePa)
    ) {
      reasons.push("pressão de vento ensaiada inferior ao requerido");
    }

    if (reasons.length) rejected.push({ evidence: item, reasons });
    else accepted.push(item);
  }

  return { accepted, rejected };
}

function resolveComponent(component: ComponentRule, input: EngineeringInput): ResolvedBomItem | null {
  if (!evaluateCondition(component.conditionRule, input)) return null;

  const base = Math.max(0, evaluateRule(component.quantityRule, input));
  const waste = Math.max(0, evaluateRule(component.wasteRule, { ...input, options: { ...input.options, baseQuantity: base } }));
  let theoretical = base;
  let billed = theoretical + waste;
  let commercialUnits: number | undefined;

  if (component.unit === "m" && component.commercialLengthMm && component.commercialLengthMm > 0) {
    const requiredMm = billed * 1000;
    commercialUnits = Math.ceil(requiredMm / component.commercialLengthMm);
    billed = (commercialUnits * component.commercialLengthMm) / 1000;
  }

  const quantity = Math.max(1, input.quantity ?? 1);
  theoretical *= quantity;
  billed *= quantity;
  if (commercialUnits != null) commercialUnits *= quantity;

  const unitCost = component.costValue ?? null;
  const unitSale = component.saleValue ?? null;

  return {
    code: component.code,
    name: component.name,
    group: component.group,
    role: component.role,
    unit: component.unit,
    theoreticalQuantity: Number(theoretical.toFixed(5)),
    billedQuantity: Number(billed.toFixed(5)),
    commercialUnits,
    wasteQuantity: Number(Math.max(0, billed - theoretical).toFixed(5)),
    unitCost,
    totalCost: unitCost == null ? null : Number((billed * unitCost).toFixed(2)),
    unitSale,
    totalSale: unitSale == null ? null : Number((billed * unitSale).toFixed(2)),
    trace: [
      `regra de quantidade: ${JSON.stringify(component.quantityRule ?? { op: "constant", value: 0 })}`,
      component.conditionRule ? `condição: ${JSON.stringify(component.conditionRule)}` : "condição: sempre",
      component.commercialLengthMm ? `barra comercial: ${component.commercialLengthMm} mm` : "sem otimização por barra",
    ],
  };
}

export function calculateEngineeringQuote(input: {
  configuration: EngineeringConfiguration;
  components: ComponentRule[];
  performanceEvidence?: PerformanceEvidence[];
  request: EngineeringInput;
}): EngineeringResult {
  const validations = validateConfiguration(input.configuration, input.request);
  const bom = input.components
    .map((component) => resolveComponent(component, input.request))
    .filter((item): item is ResolvedBomItem => Boolean(item));

  const evidence = validatePerformance(input.performanceEvidence ?? [], input.request);

  const required = input.request.requiredPerformance;
  if (required && Object.values(required).some((v) => v != null) && evidence.accepted.length === 0) {
    validations.push({
      code: "performance.noEvidence",
      severity: "error",
      message: "Nenhum ensaio cadastrado comprova esta configuração para o desempenho solicitado.",
    });
  }

  const cost = bom.reduce((sum, item) => sum + (item.totalCost ?? 0), 0);
  const sale = bom.reduce((sum, item) => sum + (item.totalSale ?? 0), 0);

  return {
    valid: !validations.some((item) => item.severity === "error"),
    validations,
    bom,
    totals: {
      cost: Number(cost.toFixed(2)),
      sale: Number(sale.toFixed(2)),
    },
    evidence,
  };
}
