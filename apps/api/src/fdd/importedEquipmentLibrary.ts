import type {
  FddAlgorithm,
  FddDefinitionParameter,
  FddDefinitionStatus,
  FddEquipmentType,
  FddParameterSpec,
  FddQuantityKind,
  FddRequiredPoint
} from "./library.js";
import { IMPORTED_EQUIPMENT_FDD_CATALOG, type ImportedEquipmentFddRule } from "./importedEquipmentCatalog.js";
import {
  importedEquipmentCategoryDisplayLabel,
  importedEquipmentRuleDisplayName,
  importedEquipmentSourceDescription
} from "./importedEquipmentEnglish.js";

const IMPORTED_EQUIPMENT_LIBRARY_VERSION = "v1";

const CATEGORY_KEYS: Record<FddEquipmentType, Record<string, string>> = {
  ahu: {
    "运行状态": "AHU-Operation",
    "风机": "AHU-Fan",
    "静压控制": "AHU-StaticPressure",
    "送风温度控制": "AHU-SupplyAirTemperature",
    "盘管/水侧": "AHU-CoilWaterSide",
    "执行器": "AHU-Actuator",
    "混风/新风": "AHU-MixedOutdoorAir",
    "过滤器/风管": "AHU-FilterDuct",
    "传感器": "AHU-Sensor"
  },
  chiller: {},
  pump: {
    "运行状态": "Pump-Operation",
    "水力性能": "Pump-HydraulicPerformance",
    "控制": "Pump-Control",
    "压力异常": "Pump-Pressure",
    "阀门": "Pump-Valve",
    "传感器": "Pump-Sensor"
  },
  cooling_tower: {
    "运行状态": "CoolingTower-Operation",
    "风机": "CoolingTower-Fan",
    "旁通与水位": "CoolingTower-BypassWaterLevel",
    "传感器": "CoolingTower-Sensor"
  },
  fcu: {
    "运行状态": "FCU-Operation",
    "风机": "FCU-Fan",
    "温度控制": "FCU-TemperatureControl",
    "冷却/加热阀": "FCU-CoolingHeatingValve",
    "过滤器": "FCU-Filter",
    "传感器": "FCU-Sensor"
  },
  vav: {
    "区域温度控制": "VAV-ZoneTemperature",
    "风量控制": "VAV-AirflowControl",
    "风阀": "VAV-Damper",
    "风量设定值": "VAV-AirflowSetpoint",
    "再热": "VAV-Reheat",
    "传感器": "VAV-Sensor"
  },
  sensor: {}
};

const REQUIRES_REVIEW_IDS = new Set([
  "VAV-05", "VAV-14",
  "PMP-06", "PMP-07", "PMP-11", "PMP-15", "PMP-16", "PMP-17", "PMP-18",
  "FCU-01", "FCU-12",
  "CT-02", "CT-03", "CT-04",
  "AHU-03", "AHU-05", "AHU-06", "AHU-07", "AHU-17", "AHU-19", "AHU-20", "AHU-32"
]);

const REQUIRES_CONFIGURATION_IDS = new Set([
  "VAV-09", "VAV-10", "VAV-15", "VAV-16", "VAV-17",
  "PMP-04", "PMP-05", "PMP-08", "PMP-09", "PMP-10",
  "FCU-03", "FCU-06", "FCU-07", "FCU-17", "FCU-18", "FCU-19", "FCU-20",
  "CT-07", "CT-08", "CT-09", "CT-10", "CT-11", "CT-12",
  "AHU-08", "AHU-09", "AHU-33", "AHU-34", "AHU-35", "AHU-36", "AHU-37", "AHU-38", "AHU-39", "AHU-40", "AHU-41", "AHU-42", "AHU-43", "AHU-44"
]);

const REVIEW_NOTES: Partial<Record<string, string>> = {
  "VAV-05": "The source threshold is written as AFLOW - AFLOWsp > 1.3 × AFLOWsp; confirm whether the intended rule is AFLOW > 1.3 × AFLOWsp.",
  "VAV-14": "The source names insufficient reheat while using a positive discharge-to-supply temperature rise; confirm the inequality direction.",
  "PMP-06": "The source does not define an oscillation crossing count or a numeric standard-deviation threshold.",
  "PMP-07": "The source compares commanded and actual frequency without a deadband or tolerance.",
  "PMP-11": "The source predicate and fault name describe high outlet pressure, but the English conclusion says pressure is low; confirm the intended diagnosis.",
  "PMP-15": "The source uses an inlet-pressure slope threshold that is absent from the tunable-parameter list.",
  "PMP-16": "The source uses an outlet-pressure slope threshold that is absent from the tunable-parameter list.",
  "PMP-17": "The source category is blank, the prose says fan speed, and the Brick mapping points to a command rather than speed feedback.",
  "PMP-18": "The pressure-consistency expression is damaged/ambiguous in the source and needs engineering confirmation.",
  "FCU-01": "The source mixes AND and OR without parentheses, so the intended start-failure precedence must be confirmed.",
  "FCU-12": "The source omits a separator between the cooling- and heating-valve alternatives and mixes AND/OR without parentheses. The two one-of groups shown here are an explicit import-time inference that must be confirmed before implementation.",
  "CT-02": "The source mixes AND and OR without parentheses, so the intended unexpected-operation precedence must be confirmed.",
  "CT-03": "The leaving-tower temperature name and the source Brick class describe different condenser-water directions.",
  "CT-04": "The leaving-tower temperature name and the source Brick class describe different condenser-water directions.",
  "AHU-03": "The source mixes AND and OR without parentheses, so the intended unexpected-operation precedence must be confirmed.",
  "AHU-05": "The source mixes AND and OR without parentheses, so the intended unexpected-fan-operation precedence must be confirmed.",
  "AHU-06": "The predicate requires the fan to be enabled, but the source required-point list does not include a fan enable or status point.",
  "AHU-07": "The predicate requires the fan to be enabled, but the source required-point list does not include a fan enable or status point.",
  "AHU-17": "The source alternates between cooling-valve command and feedback without defining one-of input semantics consistently.",
  "AHU-19": "The source alternates between heating-valve command and feedback without defining one-of input semantics consistently.",
  "AHU-20": "The source combines two command-or-feedback groups; confirm grouping and precedence before implementation.",
  "AHU-32": "The outdoor-air-fraction expression is damaged in the source and needs a near-zero denominator guard."
};

const PROVENANCE_NOTES: Partial<Record<string, string>> = {
  "AHU-41": "The source required point uses humidity symbol ∅sa, while the Brick mapping labels that same input Tsa; the Brick class identifies it as supply-air humidity.",
  "AHU-42": "The source required point uses humidity symbol ∅ma, while the Brick mapping labels that same input Tma; the Brick class identifies it as mixed-air humidity.",
  "AHU-43": "The source required point uses humidity symbol ∅ra, while the Brick mapping labels that same input Tra; the Brick class identifies it as return-air humidity.",
  "AHU-44": "The source required point uses humidity symbol ∅oa, while the Brick mapping labels that same input Toa; the Brick class identifies it as outside-air humidity."
};

const SOURCE_BRICK_SYMBOL_ALIASES: Record<string, string[]> = {
  damfb: ["DAM_{pos}"],
  ccvcmd: ["CCV_{cmd}/HCV_{cmd}"],
  hcvcmd: ["CCV_{cmd}/HCV_{cmd}"],
  ccvfb: ["CCV_{fb}/HCV_{fb}"],
  hcvfb: ["CCV_{fb}/HCV_{fb}"],
  pumpspeed: ["PUMP_{speed_command}"],
  humiditysa: ["T_{sa}"],
  humidityma: ["T_{ma}"],
  humidityra: ["T_{ra}"],
  humidityoa: ["T_{oa}"]
};

const SYMBOL_ALIASES: Record<string, string[]> = {
  damfb: ["DAMpos", "damper feedback", "damper position"],
  fanspeedact: ["fan speed feedback", "actual fan speed"],
  pumpspeedact: ["pump speed feedback", "actual pump speed"],
  rhvfb: ["reheat valve feedback", "reheat valve position"],
  ccvfb: ["cooling valve feedback", "cooling valve position"],
  hcvfb: ["heating valve feedback", "heating valve position"],
  oadfb: ["outside air damper feedback", "outside air damper position"],
  radfb: ["return air damper feedback", "return air damper position"],
  eadfb: ["exhaust air damper feedback", "exhaust air damper position"],
  tda: ["discharge air temperature"],
  foa: ["outside air flow", "outdoor air flow"],
  humidityma: ["mixed air humidity"]
};

function compactSymbol(value: string): string {
  return value
    .replace(/∅/gu, "humidity")
    .replace(/σ/giu, "sigma")
    .replace(/[{}_,\s]/gu, "")
    .replace(/[^a-z0-9]/giu, "")
    .toLowerCase();
}

function displaySymbol(value: string): string {
  return value
    .replace(/_\{([^}]+)\}/gu, "_$1")
    .replace(/[{}]/gu, "")
    .replace(/∅/gu, "Humidity")
    .trim();
}

function slotSymbol(value: string): string {
  return displaySymbol(value)
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

function sourceForRule(rule: ImportedEquipmentFddRule) {
  return IMPORTED_EQUIPMENT_FDD_CATALOG.sources.find((source) => source.sha256 === rule.sourceSha256);
}

function sourceDescription(rule: ImportedEquipmentFddRule, symbol: string): string | undefined {
  return importedEquipmentSourceDescription(rule.equipmentType, symbol);
}

function splitTopLevelCommas(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "{" || character === "(" || character === "[") depth += 1;
    if (character === "}" || character === ")" || character === "]") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function definitionParametersForRule(rule: ImportedEquipmentFddRule): FddDefinitionParameter[] {
  const requiredSymbols = new Set(splitRequiredPointGroups(rule).flat().map(compactSymbol));
  const parameters = splitTopLevelCommas(rule.tunableParametersRaw).flatMap((token) => {
    const match = token.match(/^(.+?)(?:\s*\(([^()]*)\))?$/u);
    const symbol = match?.[1]?.trim() ?? token;
    const rawDefault = match?.[2]?.trim();
    if (compactSymbol(symbol) === "n") return [];
    if (!rawDefault && requiredSymbols.has(compactSymbol(symbol))) return [];
    return [{
      symbol: displaySymbol(symbol),
      ...(rawDefault ? { rawDefault } : {}),
      resolution: !rawDefault
        ? "site_required" as const
        : rawDefault.includes("*")
          ? "source_expression" as const
          : "source_default" as const
    }];
  });
  if (rule.id === "FCU-03") {
    parameters.push({ symbol: "∆Fan_speed", resolution: "site_required" });
  }
  if (/\bMODE\s*=\s*(?:Cooling|Heating)/iu.test(rule.diagnosticRule)) {
    parameters.push({ symbol: "MODE_encoding", resolution: "site_required" });
  }
  return parameters;
}

function allSourceSymbols(): string[] {
  const symbols = new Set<string>();
  for (const source of IMPORTED_EQUIPMENT_FDD_CATALOG.sources) {
    for (const variable of source.variables) symbols.add(variable.symbol);
  }
  for (const rule of IMPORTED_EQUIPMENT_FDD_CATALOG.rules) {
    for (const group of splitRequiredPointGroups(rule)) {
      for (const symbol of group) symbols.add(symbol);
    }
    for (const token of splitTopLevelCommas(rule.tunableParametersRaw)) {
      const match = token.match(/^(.+?)(?:\s*\(([^()]*)\))?$/u);
      const symbol = match?.[1]?.trim();
      if (symbol && compactSymbol(symbol) !== "n") symbols.add(symbol);
    }
  }
  for (const aliases of Object.values(SOURCE_BRICK_SYMBOL_ALIASES)) {
    for (const alias of aliases) symbols.add(alias);
  }
  return [...symbols].sort((left, right) => right.length - left.length);
}

const ALL_SOURCE_SYMBOLS = allSourceSymbols();

function sourceBrickClass(rule: ImportedEquipmentFddRule, symbol: string): string | undefined {
  const normalized = rule.brickClassesRaw.replace(/\s+/gu, "");
  const symbolCandidates = [symbol, ...(SOURCE_BRICK_SYMBOL_ALIASES[compactSymbol(symbol)] ?? [])];
  for (const candidate of symbolCandidates) {
    const normalizedCandidate = candidate.replace(/\s+/gu, "");
    const markerMatches = [`${normalizedCandidate}:brick:`, `${normalizedCandidate}:`]
      .map((marker) => ({ marker, index: normalized.indexOf(marker) }))
      .filter((entry) => entry.index >= 0)
      .sort((left, right) => left.index - right.index || right.marker.length - left.marker.length);
    const markerMatch = markerMatches[0];
    if (!markerMatch) continue;
    const valueStart = markerMatch.index + markerMatch.marker.length;
    const nextMarkerIndex = ALL_SOURCE_SYMBOLS
      .flatMap((nextSymbol) => {
        const nextCandidates = [nextSymbol, ...(SOURCE_BRICK_SYMBOL_ALIASES[compactSymbol(nextSymbol)] ?? [])];
        return nextCandidates.flatMap((nextCandidate) => {
          const normalizedNextCandidate = nextCandidate.replace(/\s+/gu, "");
          return [
            normalized.indexOf(`${normalizedNextCandidate}:brick:`, valueStart),
            normalized.indexOf(`${normalizedNextCandidate}:`, valueStart)
          ];
        });
      })
      .filter((index) => index >= valueStart)
      .sort((left, right) => left - right)[0] ?? normalized.length;
    const brickClass = normalized.slice(valueStart, nextMarkerIndex).replace(/^brick:/u, "").trim();
    if (brickClass && !brickClass.includes(":")) return brickClass;
  }
  return undefined;
}

function importedQuantityKind(symbols: string[]): FddQuantityKind {
  const text = symbols.map(compactSymbol).join(" ");
  if (/humidity/u.test(text)) return "humidity";
  if (/co2|carbon dioxide/u.test(text)) return "concentration";
  if (/basinh|waterlevel|condh/u.test(text)) return "level";
  if (/power/u.test(text)) return "power";
  if (/current/u.test(text)) return "current";
  if (/aflow|flow|foa/u.test(text)) return "flow_rate";
  if (/chwst|chwrt|hwst|hwrt|cttin|cttout|toat|toawb|^t[a-z]/u.test(text)) return "temperature";
  if (/dp|pressure|^pin$|^pout$|^sp$|^spsp$/u.test(text)) return "pressure";
  if (/speed|freq/u.test(text)) return "speed";
  if (/dam|valve|rhv|ccv|hcv|oad|rad|ead/u.test(text)) return "position";
  if (/cmd|sts|status|mode|alm/u.test(text)) return "status";
  return "unknown";
}

function acceptableUnits(kind: FddQuantityKind): string[] | undefined {
  if (kind === "temperature") return ["C", "degC", "F", "degF"];
  if (kind === "flow_rate") return ["m3/h", "m3/s", "L/s", "cfm", "gpm"];
  if (kind === "power") return ["W", "kW"];
  if (kind === "current") return ["A", "amp"];
  if (kind === "pressure") return ["Pa", "kPa", "bar", "psi", "inH2O"];
  if (kind === "humidity") return ["%RH", "%", "percent"];
  if (kind === "position") return ["%", "percent", "ratio"];
  if (kind === "speed") return ["Hz", "rpm", "%", "percent"];
  if (kind === "level") return ["m", "cm", "mm", "%", "percent"];
  if (kind === "concentration") return ["ppm", "ppb"];
  return undefined;
}

function splitRequiredPointGroups(rule: ImportedEquipmentFddRule): string[][] {
  let raw: string = rule.requiredPointsRaw;
  if (rule.id === "FCU-12") {
    raw = raw.replace("CCV_{fb}HCV_{cmd}", "CCV_{fb}, HCV_{cmd}");
  }
  return raw
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => group.split(/\s+or\s+/iu).map((symbol) => symbol.trim()).filter(Boolean));
}

function importedRequiredPoint(rule: ImportedEquipmentFddRule, symbols: string[]): FddRequiredPoint {
  const labels = symbols.map(displaySymbol);
  const descriptions = symbols.map((symbol) => sourceDescription(rule, symbol)).filter((value): value is string => Boolean(value));
  const brickClasses = symbols.map((symbol) => sourceBrickClass(rule, symbol)).filter((value): value is string => Boolean(value));
  const kind = importedQuantityKind(symbols);
  const aliases = symbols.flatMap((symbol) => SYMBOL_ALIASES[compactSymbol(symbol)] ?? []);
  const pointLabel = labels.join(" or ");
  const brickSemantics = brickClasses.map((brickClass) => brickClass.replace(/_/gu, " "));
  const semantics = descriptions.length > 0
    ? [...new Set(descriptions)].join(" / ")
    : brickSemantics.length > 0
      ? [...new Set(brickSemantics)].join(" / ")
      : `${pointLabel} source point (Brick class unavailable)`;
  const units = acceptableUnits(kind);
  const persistenceDays = rule.persistenceMinutes / (24 * 60);
  return {
    slot: labels.map(slotSymbol).join("_or_"),
    label: pointLabel,
    semantic: semantics,
    required: true,
    quantityKind: kind,
    unitRoleDescription: `${pointLabel} is required by ${rule.id}. The DOCX does not define a canonical engineering unit; confirm the point and unit before an executable evaluator is enabled.`,
    ...(units ? { acceptableUnits: units } : {}),
    keywords: [...new Set([...labels, ...descriptions, ...aliases, ...brickClasses, ...brickSemantics])],
    sourceSymbols: labels,
    ...(brickClasses.length > 0 ? { sourceBrickClasses: brickClasses } : {}),
    historyRequirement: {
      minDays: persistenceDays,
      preferredDays: persistenceDays
    }
  };
}

function categoryForRule(rule: ImportedEquipmentFddRule): { key: string; label: string } {
  const sourceLabel = rule.category || (rule.id === "PMP-17" ? "传感器" : "未分类");
  return {
    key: CATEGORY_KEYS[rule.equipmentType][sourceLabel] ?? `${rule.equipmentType}-Uncategorized`,
    label: importedEquipmentCategoryDisplayLabel(rule)
  };
}

function definitionStatusForRule(rule: ImportedEquipmentFddRule): FddDefinitionStatus {
  if (REQUIRES_REVIEW_IDS.has(rule.id)) return "requires_review";
  if (REQUIRES_CONFIGURATION_IDS.has(rule.id)
    || definitionParametersForRule(rule).some((parameter) => parameter.resolution === "site_required")) {
    return "requires_configuration";
  }
  return "implementation_ready";
}

function definitionIssuesForRule(rule: ImportedEquipmentFddRule): string[] {
  const status = definitionStatusForRule(rule);
  const provenanceNote = PROVENANCE_NOTES[rule.id];
  if (status === "requires_review") {
    return [
      REVIEW_NOTES[rule.id] ?? "The source predicate or point mapping requires engineering review before implementation.",
      ...(provenanceNote ? [provenanceNote] : [])
    ];
  }
  if (status === "requires_configuration") {
    const siteRequired = definitionParametersForRule(rule)
      .filter((parameter) => parameter.resolution === "site_required")
      .map((parameter) => parameter.symbol);
    return [
      `Site-specific values are required for: ${siteRequired.join(", ") || "one or more source thresholds"}. Configure them from design data or an approved baseline before implementation.`,
      ...(provenanceNote ? [provenanceNote] : [])
    ];
  }
  return provenanceNote ? [provenanceNote] : [];
}

function windowParameter(rule: ImportedEquipmentFddRule): FddParameterSpec {
  return {
    key: "window_minutes",
    label: "Persistence window",
    type: "number",
    defaultValue: rule.persistenceMinutes,
    unit: "min",
    min: 1,
    max: 240,
    step: 1,
    description: `Persistence window N imported from ${rule.id}.`,
    editable: true
  };
}

function algorithmKeyForRule(rule: ImportedEquipmentFddRule): string {
  const ruleNumber = rule.id.split("-")[1] ?? rule.id;
  return `${rule.equipmentType}_fdd_${ruleNumber.toLowerCase()}`;
}

function importedEquipmentAlgorithm(rule: ImportedEquipmentFddRule): FddAlgorithm {
  const source = sourceForRule(rule);
  if (!source) throw new Error(`Missing source metadata for ${rule.id}.`);
  const category = categoryForRule(rule);
  const algorithmKey = algorithmKeyForRule(rule);
  const definitionStatus = definitionStatusForRule(rule);
  const version = `${IMPORTED_EQUIPMENT_LIBRARY_VERSION}-${source.sha256.slice(0, 8)}`;
  return {
    id: `fddalg_${algorithmKey}_${version}`,
    scope: "global_builtin",
    algorithmKey,
    version,
    name: `${rule.id} ${importedEquipmentRuleDisplayName(rule.id)}`,
    equipmentType: rule.equipmentType,
    faultType: category.label,
    method: "rule_based",
    categoryKey: category.key,
    categoryLabel: category.label,
    requiredPoints: splitRequiredPointGroups(rule).map((symbols) => importedRequiredPoint(rule, symbols)),
    outputs: [{ key: "fault_status", label: "Fault status", type: "boolean" }],
    parameters: [windowParameter(rule)],
    formula: rule.diagnosticRule,
    logicSummary: [
      `Imported ${rule.id} from ${source.fileName}.`,
      `Source tunable parameters: ${rule.tunableParametersRaw || "not specified"}.`,
      `Source Brick mapping: ${rule.brickClassesRaw || "not specified"}.`,
      "Runtime validation: specification only; no executable evaluator is registered yet."
    ].join(" "),
    sourcePaperId: `docx:${source.fileName}:${source.sha256}`,
    deployableRuntime: false,
    definitionStatus,
    definitionIssues: definitionIssuesForRule(rule),
    definitionParameters: definitionParametersForRule(rule),
    sourceDefinition: {
      ruleId: rule.id,
      sourceFile: source.fileName,
      sha256: source.sha256,
      requiredPointsRaw: rule.requiredPointsRaw,
      tunableParametersRaw: rule.tunableParametersRaw,
      brickClassesRaw: rule.brickClassesRaw
    }
  };
}

export function importedEquipmentFddAlgorithms(): FddAlgorithm[] {
  return IMPORTED_EQUIPMENT_FDD_CATALOG.rules.map(importedEquipmentAlgorithm);
}

export const IMPORTED_EQUIPMENT_FDD_COUNTS = {
  total: 111,
  ahu: 44,
  fcu: 20,
  pump: 18,
  cooling_tower: 12,
  vav: 17,
  implementation_ready: 43,
  requires_configuration: 46,
  requires_review: 22
} as const;
