import type { SeedStore } from "../seed.js";
import { importedEquipmentFddAlgorithms } from "./importedEquipmentLibrary.js";
import { hasExecutableFddEvaluator } from "./runtimeRegistry.js";
import type {
  FddAlgorithmRequirement,
  FddEquipmentType,
  FddQuantityKind,
  FddRequiredPoint
} from "@building-agent/fdd-deployment-planner";
import type { FddDeployabilityCheck } from "./deploymentPlannerAdapter.js";

export * from "@building-agent/fdd-deployment-planner";
export * from "./deploymentPlannerAdapter.js";

export type FddTaskSource = "global_library" | "project_upload" | "buildinggpt_generated";
export type FddSharingScope = "project_only" | "global_community";
export type FddTaskStatus = "checking" | "ready" | "running" | "paused" | "cannot_deploy";
export type FddAlgorithmScope = "global_builtin" | "global_community";
export type FddMethod = "rule_based" | "bayesian_network" | "performance_indicator" | "statistical";
export type FddDefinitionStatus = "implementation_ready" | "requires_configuration" | "requires_review";
export type FddDefinitionParameterResolution = "source_default" | "source_expression" | "site_required";
export type FddParameterType = "number" | "boolean" | "select";
export type FddParameterValue = string | number | boolean;
export type FddParameterSource = "algorithm_default" | "buildinggpt_recommended" | "user_override";

export interface FddDefinitionParameter {
  symbol: string;
  rawDefault?: string;
  resolution: FddDefinitionParameterResolution;
}

export interface FddSourceDefinition {
  ruleId: string;
  sourceFile: string;
  sha256: string;
  requiredPointsRaw: string;
  tunableParametersRaw: string;
  brickClassesRaw: string;
}

export interface FddOutput {
  key: string;
  label: string;
  type: "boolean" | "number" | "text";
  unit?: string;
}

export interface FddParameterSpec {
  key: string;
  label: string;
  type: FddParameterType;
  defaultValue: FddParameterValue;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description: string;
  editable: boolean;
}

export interface FddTaskParameterValue {
  key: string;
  value: FddParameterValue;
  unit?: string;
  source: FddParameterSource;
  confidence?: number;
  reason: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface FddAlgorithm extends FddAlgorithmRequirement {
  scope: FddAlgorithmScope;
  algorithmKey: string;
  name: string;
  faultType: string;
  method: FddMethod;
  categoryKey: string;
  categoryLabel: string;
  outputs: FddOutput[];
  parameters: FddParameterSpec[];
  formula: string;
  logicSummary: string;
  sourcePaperId?: string;
  authorUserId?: string;
  deployableRuntime: boolean;
  definitionStatus?: FddDefinitionStatus;
  definitionIssues?: string[];
  definitionParameters?: FddDefinitionParameter[];
  sourceDefinition?: FddSourceDefinition;
}

export interface ProjectFddTask {
  id: string;
  projectId: string;
  source: FddTaskSource;
  sharingScope: FddSharingScope;
  globalAlgorithmId?: string;
  algorithmSnapshot: FddAlgorithm;
  status: FddTaskStatus;
  deployabilityCheck?: FddDeployabilityCheck;
  parameterValues?: FddTaskParameterValue[];
  /** Optional additive policy mirror; the immutable SQLite receipt is authoritative. */
  authorizationPolicy?: "v4" | "fleetguard-v1";
  activeDeploymentReceiptId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFddLibraryCheckRun {
  id: string;
  projectId: string;
  algorithmIds: string[];
  projectDataSignature: string;
  createdAt: string;
}

export interface FddAlgorithmCreateInput {
  name: string;
  equipmentType: FddEquipmentType;
  faultType: string;
  method: FddMethod;
  categoryKey?: string;
  categoryLabel?: string;
  formula: string;
  logicSummary: string;
  requiredPoints: FddRequiredPoint[];
  parameters?: FddParameterSpec[];
  outputs?: FddOutput[];
  sharingScope: FddSharingScope;
}

const DEFAULT_HISTORY_REQUIREMENT = { minDays: 7, preferredDays: 30 };
const BUILTIN_FDD_VERSION = "v13";
const FDD_QUANTITY_KINDS: readonly FddQuantityKind[] = ["temperature", "flow_rate", "power", "energy", "load", "status", "pressure", "humidity", "position", "speed", "current", "level", "concentration", "unknown"];

function numberParameter(
  key: string,
  label: string,
  defaultValue: number,
  unit: string,
  description: string,
  bounds: { min?: number; max?: number; step?: number } = {}
): FddParameterSpec {
  return {
    key,
    label,
    type: "number",
    defaultValue,
    unit,
    description,
    editable: true,
    ...bounds
  };
}

function inferParameterSpecs(formula: string, method: FddMethod): FddParameterSpec[] {
  const normalized = formula.toLowerCase();
  const parameters: FddParameterSpec[] = [];
  const add = (parameter: FddParameterSpec) => {
    if (!parameters.some((entry) => entry.key === parameter.key)) {
      parameters.push(parameter);
    }
  };

  if (/window[_\s-]?minutes|for .*window/u.test(normalized)) {
    add(numberParameter("window_minutes", "Detection window", 30, "min", "Duration the condition must persist before a fault is emitted.", { min: 5, max: 240, step: 5 }));
  }
  if (/cop[_\s-]?threshold/u.test(normalized)) {
    add(numberParameter("cop_threshold", "COP threshold", 4, "ratio", "Minimum acceptable COP during valid loaded operation.", { min: 0.5, max: 10, step: 0.1 }));
  }
  if (/min[_\s-]?load/u.test(normalized)) {
    add(numberParameter("min_load", "Minimum load", 200, "kW", "Minimum cooling load required before evaluating the fault rule.", { min: 0, max: 5000, step: 10 }));
  }
  if (/tolerance/u.test(normalized)) {
    add(numberParameter("tolerance_percent", "Tolerance", 10, "%", "Allowed mismatch before the consistency rule flags a fault.", { min: 0, max: 100, step: 1 }));
  }
  if (/deltat[_\s-]?min|delta[_\s-]?t.*</u.test(normalized)) {
    add(numberParameter("delta_t_min", "Minimum Delta-T", 2, "C", "Minimum chilled water temperature difference during proven flow.", { min: 0, max: 15, step: 0.1 }));
  }
  if (/min[_\s-]?flow/u.test(normalized)) {
    add(numberParameter("min_flow", "Minimum flow", 10, "flow unit", "Minimum measured chilled water flow for flow proving.", { min: 0, max: 10000, step: 1 }));
  }
  if (/freeze[_\s-]?window/u.test(normalized)) {
    add(numberParameter("freeze_window", "Flatline window", 60, "min", "Signal window used to detect flatlined sensor behavior.", { min: 10, max: 1440, step: 5 }));
  }
  if (/epsilon[_\s-]?temp/u.test(normalized)) {
    add(numberParameter("epsilon_temp", "Temperature variation epsilon", 0.1, "C", "Maximum rolling standard deviation treated as temperature flatline.", { min: 0, max: 5, step: 0.05 }));
  }
  if (/epsilon[_\s-]?flow/u.test(normalized)) {
    add(numberParameter("epsilon_flow", "Flow variation epsilon", 1, "flow unit", "Maximum rolling standard deviation treated as flow flatline.", { min: 0, max: 100, step: 0.1 }));
  }
  if (method === "bayesian_network") {
    add(numberParameter("posterior_threshold", "Posterior threshold", 0.7, "probability", "Posterior probability required before reporting a non-fault-free DBN state.", { min: 0, max: 1, step: 0.05 }));
    add(numberParameter("evidence_threshold", "Evidence threshold", 0.6, "probability", "Evidence confidence threshold for DBN fault evidence nodes.", { min: 0, max: 1, step: 0.05 }));
  }
  return parameters;
}

function inferQuantityKind(slot: string, label: string, semantic: string, acceptableUnits?: string[]): FddQuantityKind {
  const text = `${slot} ${label} ${semantic} ${(acceptableUnits ?? []).join(" ")}`.toLowerCase();
  if (/\b(status|on\/off|running|enable|proof)\b/u.test(text)) return "status";
  if (/\b(load|cooling output|cooling)\b/u.test(text)) return "load";
  if (/\b(current|amp|amps|amperage)\b/u.test(text)) return "current";
  if (/kwh|kw-?h|kilowatt[\s-]?hour|\benergy\b/u.test(text)) return "energy";
  if (/kw(?!h)|\b(kilowatt|power|watt|motor)\b/u.test(text)) return "power";
  if (/\b(consumption|accumulated)\b/u.test(text)) return "energy";
  if (/\b(temp|temperature|chwst|chwrt|sat|mat|oat|rat)\b/u.test(text)) return "temperature";
  if (/\b(flow|flowrate|gpm|l\/s|m3\/h|cfm)\b/u.test(text)) return "flow_rate";
  if (/\b(pressure|delta p|differential pressure|dp|pa|psi)\b/u.test(text)) return "pressure";
  if (/\b(humidity|humid)\b/u.test(text)) return "humidity";
  if (/\b(level|water level|height)\b/u.test(text)) return "level";
  if (/\b(co2|carbon dioxide|concentration|ppm|ppb)\b/u.test(text)) return "concentration";
  if (/\b(damper|valve|position|command|%)\b/u.test(text)) return "position";
  if (/\b(speed|rpm)\b/u.test(text)) return "speed";
  return "unknown";
}

function requiredPoint(
  slot: string,
  label: string,
  semantic: string,
  keywords: string[],
  acceptableUnits?: string[],
  quantityKind?: FddQuantityKind,
  unitRoleDescription?: string
): FddRequiredPoint {
  const resolvedQuantityKind = quantityKind ?? inferQuantityKind(slot, label, semantic, acceptableUnits);
  return {
    slot,
    label,
    semantic,
    required: true,
    quantityKind: resolvedQuantityKind,
    unitRoleDescription: unitRoleDescription ?? `${label} must provide ${resolvedQuantityKind.replace(/_/gu, " ")} evidence for the FDD formula.`,
    keywords,
    ...(acceptableUnits ? { acceptableUnits } : {}),
    historyRequirement: DEFAULT_HISTORY_REQUIREMENT
  };
}

function optionalPoint(
  slot: string,
  label: string,
  semantic: string,
  keywords: string[],
  acceptableUnits?: string[],
  quantityKind?: FddQuantityKind,
  unitRoleDescription?: string
): FddRequiredPoint {
  const resolvedQuantityKind = quantityKind ?? inferQuantityKind(slot, label, semantic, acceptableUnits);
  return {
    slot,
    label,
    semantic,
    required: false,
    quantityKind: resolvedQuantityKind,
    unitRoleDescription: unitRoleDescription ?? `${label} can provide optional ${resolvedQuantityKind.replace(/_/gu, " ")} evidence for the FDD formula.`,
    keywords,
    ...(acceptableUnits ? { acceptableUnits } : {}),
    historyRequirement: DEFAULT_HISTORY_REQUIREMENT
  };
}

function exactRequiredPoint(slot: string, label: string, semantic: string, pointName: string, acceptableUnits?: string[]): FddRequiredPoint {
  return requiredPoint(slot, label, semantic, [pointName], acceptableUnits);
}

const AHU_SUPPLY_AIR_FLOW = requiredPoint("supply_air_flow", "Supply air flow", "Supply air flow rate serving the AHU", ["supply air flow", "Fsa", "SA flow"], ["cfm", "m3/s", "l/s"]);
const AHU_SUPPLY_AIR_PRESSURE = requiredPoint("supply_air_pressure", "Supply duct static pressure", "Measured supply duct static pressure", ["supply air pressure", "duct static", "Psa"], ["Pa", "inH2O", "psi"]);
const AHU_SUPPLY_AIR_PRESSURE_SETPOINT = requiredPoint("supply_air_pressure_setpoint", "Supply duct static pressure setpoint", "Supply duct static pressure setpoint", ["supply air pressure setpoint", "duct static setpoint", "Psa setpoint", "Psa stp"], ["Pa", "inH2O", "psi"]);
const AHU_SUPPLY_FAN_POWER = requiredPoint("supply_fan_power", "Supply fan power", "Supply fan electric power", ["supply fan power", "Wsf", "SF kW"], ["kW", "W"]);
const AHU_SUPPLY_FAN_SPEED = requiredPoint("supply_fan_speed", "Supply fan speed or command", "Supply fan speed/control signal", ["supply fan speed", "Nsf", "SF speed", "supply fan command"], ["%", "rpm"]);
const AHU_SUPPLY_FAN_STATUS = requiredPoint("supply_fan_status", "Supply fan status", "Supply fan run status", ["supply fan status", "SF status", "fan running"]);
const AHU_RETURN_FAN_POWER = requiredPoint("return_fan_power", "Return fan power", "Return fan electric power", ["return fan power", "Wrf", "RF kW"], ["kW", "W"]);
const AHU_RETURN_FAN_SPEED = requiredPoint("return_fan_speed", "Return fan speed or command", "Return fan speed/control signal", ["return fan speed", "Nrf", "RF speed", "return fan command"], ["%", "rpm"]);
const AHU_RETURN_AIR_FLOW = optionalPoint("return_air_flow", "Return air flow", "Return air flow rate", ["return air flow", "Fra", "RA flow"], ["cfm", "m3/s", "l/s"]);
const AHU_FILTER_PRESSURE_DROP = requiredPoint("filter_pressure_drop", "Filter differential pressure", "Differential pressure across the AHU filter", ["filter differential pressure", "DeltaPfilter", "filter DP"], ["Pa", "inH2O", "psi"]);
const AHU_OUTDOOR_AIR_DAMPER = requiredPoint("outdoor_air_damper_command", "Outdoor air damper command", "Outdoor air damper position or command", ["outdoor air damper", "OAD", "OA damper"], ["%", "percent"]);
const AHU_RETURN_AIR_DAMPER = requiredPoint("return_air_damper_command", "Return air damper command", "Return air damper position or command", ["return air damper", "RAD", "RA damper"], ["%", "percent"]);
const AHU_EXHAUST_AIR_DAMPER = requiredPoint("exhaust_air_damper_command", "Exhaust air damper command", "Exhaust air damper position or command", ["exhaust air damper", "EAD", "EA damper"], ["%", "percent"]);
const AHU_MIXED_AIR_TEMP = requiredPoint("mixed_air_temp", "Mixed air temperature", "Mixed air temperature", ["mixed air temp", "Tma", "MAT"], ["C", "F"]);
const AHU_OUTDOOR_AIR_TEMP = requiredPoint("outdoor_air_temp", "Outdoor air temperature", "Outdoor air temperature", ["outdoor air temp", "Toa", "OAT"], ["C", "F"]);
const AHU_RETURN_AIR_TEMP = requiredPoint("return_air_temp", "Return air temperature", "Return air temperature", ["return air temp", "Tra", "RAT"], ["C", "F"]);
const AHU_SUPPLY_AIR_TEMP = requiredPoint("supply_air_temp", "Supply air temperature", "AHU supply air temperature", ["supply air temp", "Tsa", "SAT"], ["C", "F"]);
const AHU_SUPPLY_AIR_TEMP_SETPOINT = requiredPoint("supply_air_temp_setpoint", "Supply air temperature setpoint", "AHU supply air temperature setpoint", ["supply air temp setpoint", "Tsa setpoint", "SAT spt"], ["C", "F"]);
const AHU_COOLING_VALVE = requiredPoint("cooling_valve", "Cooling coil valve command", "Cooling coil valve control signal", ["cooling valve", "Ucc", "cooling coil valve"], ["%", "percent"]);
const AHU_HEATING_VALVE = requiredPoint("heating_valve", "Heating coil valve command", "Heating coil valve control signal", ["heating valve", "Uhc", "heating coil valve"], ["%", "percent"]);
const AHU_CHW_SUPPLY_TEMP = requiredPoint("chw_supply_temp", "Supply chilled water temperature", "Supply chilled water temperature", ["chilled water supply", "Tcw", "CHWS"], ["C", "F"]);
const AHU_CHW_SUPPLY_TEMP_SETPOINT = requiredPoint("chw_supply_temp_setpoint", "Supply chilled water temperature setpoint", "Supply chilled water temperature setpoint", ["chilled water supply setpoint", "Tcw setpoint", "CHWS setpoint"], ["C", "F"]);
const AHU_CHW_PRESSURE_DIFF = requiredPoint("chw_pressure_diff", "Chilled water pressure difference", "Pressure difference of chilled water loop", ["chilled water pressure", "DPcw", "CHW DP"], ["Pa", "kPa", "psi"]);
const AHU_CHW_PRESSURE_DIFF_SETPOINT = requiredPoint("chw_pressure_diff_setpoint", "Chilled water pressure difference setpoint", "Pressure difference setpoint of chilled water loop", ["chilled water pressure setpoint", "DPcw setpoint", "CHW DP setpoint"], ["Pa", "kPa", "psi"]);
const AHU_CHW_PUMP_STATUS = requiredPoint("chw_pump_status", "Chilled water pump status", "Chilled water circulating pump status or power", ["chilled water pump status", "CWP status", "Wcwp"], ["kW", "W"]);
const AHU_HW_SUPPLY_TEMP = requiredPoint("hw_supply_temp", "Supply heating water temperature", "Supply heating water temperature", ["heating water supply", "Thw", "HHWS"], ["C", "F"]);
const AHU_HW_SUPPLY_TEMP_SETPOINT = requiredPoint("hw_supply_temp_setpoint", "Supply heating water temperature setpoint", "Supply heating water temperature setpoint", ["heating water supply setpoint", "Thw setpoint", "HHWS setpoint"], ["C", "F"]);
const AHU_HW_PRESSURE_DIFF = requiredPoint("hw_pressure_diff", "Heating water pressure difference", "Pressure difference of heating water loop", ["heating water pressure", "DPhw", "HHW DP"], ["Pa", "kPa", "psi"]);
const AHU_HW_PRESSURE_DIFF_SETPOINT = requiredPoint("hw_pressure_diff_setpoint", "Heating water pressure difference setpoint", "Pressure difference setpoint of heating water loop", ["heating water pressure setpoint", "DPhw setpoint", "HHW DP setpoint"], ["Pa", "kPa", "psi"]);
const AHU_HW_PUMP_STATUS = requiredPoint("hw_pump_status", "Heating water pump status", "Heating water circulating pump status or power", ["heating water pump status", "HWP status", "Whwp"], ["kW", "W"]);
const AHU_MIXED_AIR_HUMIDITY = requiredPoint("mixed_air_humidity", "Mixed air humidity", "Mixed air humidity sensor value", ["mixed air humidity", "Hma", "MA humidity"], ["%", "percent", "g/kg"]);
const AHU_OUTDOOR_AIR_HUMIDITY = optionalPoint("outdoor_air_humidity", "Outdoor air humidity", "Outdoor air humidity reference", ["outdoor air humidity", "Hoa", "OA humidity"], ["%", "percent", "g/kg"]);
const AHU_TERMINAL_RETURN_AIR_REFERENCE = optionalPoint("terminal_return_air_reference", "Terminal return air reference", "Terminal airflow-weighted return air temperature reference", ["terminal return temp", "VAV return temp", "weighted return air"], ["C", "F"]);
const AHU_OUTDOOR_AIR_REFERENCE = optionalPoint("outdoor_air_reference", "Outdoor air temperature reference", "Outdoor air temperature from another device or station", ["outdoor air reference", "weather station OAT", "other OAT"], ["C", "F"]);

const CHILLER_LOW_COP_POINTS: FddRequiredPoint[] = [
  requiredPoint("chiller_status", "Chiller running status", "Chiller on/off or run status", ["chiller status", "run status", "running", "enable"]),
  requiredPoint(
    "cooling_load",
    "Cooling load",
    "Direct cooling output used in the COP formula",
    ["cooling load", "cooling output", "cooling kW", "refrigeration ton", "RT"],
    ["kW", "RT"],
    "load",
    "Cooling load must be a direct cooling output for the COP formula. Flow plus supply/return temperature belongs to a separate calculated-load algorithm."
  ),
  requiredPoint("chiller_power", "Chiller power", "Chiller electric power consumption", ["chiller power", "electric power", "motor power", "motor kilowatts", "kW"], ["kW", "W"], "power"),
  optionalPoint("bms_cop", "BMS COP", "BMS-provided COP value for comparison", ["COP", "BMS COP"], ["COP"])
];

const FDD_OUTPUTS: FddOutput[] = [
  { key: "fault_status", label: "Fault status", type: "boolean" }
];

interface AlgorithmSeed {
  key: string;
  name: string;
  equipmentType: FddEquipmentType;
  faultType: string;
  method: FddMethod;
  categoryKey?: string;
  categoryLabel?: string;
  points: FddRequiredPoint[];
  formula?: string;
  parameters?: FddParameterSpec[];
  logic: string;
  sourcePaperId?: string;
  deployableRuntime?: boolean;
}

const AHU_DBN_FORMULA = "For each fault node F_i, compute posterior probability P(F_i = state | evidence) = alpha * P(F_i = state) * product_k P(E_k | F_i = state, parents(E_k)); report the most likely non-fault-free state when posterior and evidence thresholds are exceeded.";

function inferredCategory(seed: AlgorithmSeed): { categoryKey: string; categoryLabel: string } {
  if (seed.categoryKey && seed.categoryLabel) {
    return { categoryKey: seed.categoryKey, categoryLabel: seed.categoryLabel };
  }
  if (seed.equipmentType === "ahu") {
    const normalizedFault = seed.faultType.toLowerCase();
    if (normalizedFault === "sensor") return { categoryKey: "AHU-Sensor", categoryLabel: "AHU-Sensor" };
    if (normalizedFault === "damper") return { categoryKey: "AHU-Damper", categoryLabel: "AHU-Damper" };
    if (normalizedFault === "fan") return { categoryKey: "AHU-Fan", categoryLabel: "AHU-Fan" };
    if (normalizedFault === "duct") return { categoryKey: "AHU-Duct", categoryLabel: "AHU-Duct" };
    if (normalizedFault === "filter") return { categoryKey: "AHU-Filter", categoryLabel: "AHU-Filter" };
    if (normalizedFault === "coil") return { categoryKey: "AHU-Coil", categoryLabel: "AHU-Coil" };
    if (normalizedFault === "secondary water") return { categoryKey: "AHU-WaterSide", categoryLabel: "AHU-WaterSide" };
  }
  const equipment = seed.equipmentType.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
  const fault = seed.faultType.split(/[^a-z0-9]+/iu).filter(Boolean).map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
  const categoryLabel = `${equipment}-${fault || "General"}`;
  return { categoryKey: categoryLabel, categoryLabel };
}

const AHU_PART_1: AlgorithmSeed[] = [
  {
    key: "ahu_supply_air_flow_sensor_fault",
    name: "Supply Air Flow Rate Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_FAN_POWER, AHU_SUPPLY_FAN_SPEED, AHU_SUPPLY_AIR_PRESSURE, AHU_SUPPLY_AIR_PRESSURE_SETPOINT],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F1. Evidence from Zhao Part I: E2 supply fan power versus supply airflow residual, E7 frozen supply airflow reading, and E1 supply pressure deviation from setpoint. Fault states include frozen, positive bias, negative bias, and fault-free."
  },
  {
    key: "ahu_supply_air_pressure_sensor_fault",
    name: "Supply Air Pressure Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_PRESSURE, AHU_SUPPLY_AIR_PRESSURE_SETPOINT, AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_FAN_POWER, AHU_SUPPLY_FAN_SPEED],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F2. Evidence from Zhao Part I: E1 pressure-minus-setpoint residual and E6 frozen pressure reading, cross-checked against fan airflow/power behavior. Fault states include positive/setpoint/negative frozen and positive/negative bias."
  },
  {
    key: "ahu_filter_differential_pressure_sensor_fault",
    name: "Filter Differential Pressure Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_FILTER_PRESSURE_DROP, AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_FAN_POWER],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F3. Evidence from Zhao Part I: E4 filter pressure drop versus airflow residual and E8 frozen differential pressure reading. Fault states include frozen, positive bias, negative bias, and fault-free."
  },
  {
    key: "ahu_outdoor_air_damper_stuck",
    name: "Outdoor Air Damper Stuck",
    equipmentType: "ahu",
    faultType: "damper",
    method: "bayesian_network",
    points: [AHU_OUTDOOR_AIR_DAMPER, AHU_MIXED_AIR_TEMP, AHU_OUTDOOR_AIR_TEMP, AHU_RETURN_AIR_TEMP, AHU_SUPPLY_FAN_STATUS],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F4. Evidence from Zhao Part I: damper command/position and E9/E10 mixed air temperature relationships against return and outdoor air temperatures. Fault states include stuck at maximum, partial, minimum, and fault-free."
  },
  {
    key: "ahu_return_air_damper_stuck",
    name: "Return Air Damper Stuck",
    equipmentType: "ahu",
    faultType: "damper",
    method: "bayesian_network",
    points: [AHU_RETURN_AIR_DAMPER, AHU_MIXED_AIR_TEMP, AHU_OUTDOOR_AIR_TEMP, AHU_RETURN_AIR_TEMP, AHU_SUPPLY_FAN_STATUS],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F5. Evidence from Zhao Part I: return damper command/position plus E9/E10 mixed air temperature consistency checks. Fault states include stuck at maximum, partial, minimum, and fault-free."
  },
  {
    key: "ahu_exhaust_air_damper_stuck",
    name: "Exhaust Air Damper Stuck",
    equipmentType: "ahu",
    faultType: "damper",
    method: "bayesian_network",
    points: [AHU_EXHAUST_AIR_DAMPER, AHU_MIXED_AIR_TEMP, AHU_OUTDOOR_AIR_TEMP, AHU_RETURN_AIR_TEMP, AHU_RETURN_FAN_POWER, AHU_RETURN_FAN_SPEED],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F6. Evidence from Zhao Part I: exhaust damper command/position, mixed/return/outdoor air temperature relationships, and return fan behavior. Fault states include stuck at maximum, partial, minimum, and fault-free."
  },
  {
    key: "ahu_supply_fan_fault",
    name: "Supply Fan Fault",
    equipmentType: "ahu",
    faultType: "fan",
    method: "bayesian_network",
    points: [AHU_SUPPLY_FAN_POWER, AHU_SUPPLY_FAN_SPEED, AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_AIR_PRESSURE, AHU_SUPPLY_AIR_PRESSURE_SETPOINT],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F7. Evidence from Zhao Part I: E2 fan power versus airflow residual, E5 supply fan control signal, E11 fan power level, and E1 pressure deviation. Fault states include complete failure and fixed maximum/minimum/partial speed."
  },
  {
    key: "ahu_return_fan_fault",
    name: "Return Fan Fault",
    equipmentType: "ahu",
    faultType: "fan",
    method: "bayesian_network",
    points: [AHU_RETURN_FAN_POWER, AHU_RETURN_FAN_SPEED, AHU_RETURN_AIR_FLOW, AHU_RETURN_AIR_TEMP, AHU_MIXED_AIR_TEMP],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F8. Evidence from Zhao Part I: E3 return fan power versus return fan speed residual and air-side operating context. Fault states include complete failure and fixed higher/lower/expected speed."
  },
  {
    key: "ahu_duct_leakage_before_supply_fan",
    name: "Duct Leakage Before Supply Fan",
    equipmentType: "ahu",
    faultType: "duct",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_FAN_POWER, AHU_SUPPLY_FAN_SPEED, AHU_SUPPLY_AIR_PRESSURE, AHU_SUPPLY_AIR_PRESSURE_SETPOINT],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F9. Evidence from Zhao Part I: supply airflow, fan power residuals, and supply pressure residuals upstream of the supply fan. Fault states include heavy leakage, slight leakage, and fault-free."
  },
  {
    key: "ahu_filter_fault",
    name: "Filter Fault",
    equipmentType: "ahu",
    faultType: "filter",
    method: "bayesian_network",
    points: [AHU_FILTER_PRESSURE_DROP, AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_FAN_POWER, AHU_SUPPLY_FAN_SPEED],
    sourcePaperId: "zhao-ahu-dbn-part-i-2017",
    logic: "Fault node F10. Evidence from Zhao Part I: E4 filter pressure drop versus supply airflow residual and fan power context. Fault states include filter fouling, broken filter, and fault-free."
  }
];

const AHU_PART_2: AlgorithmSeed[] = [
  {
    key: "ahu_heating_coil_valve_stuck",
    name: "Heating Coil Valve Stuck",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_HEATING_VALVE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F11. Evidence from Zhao Part II: E12 supply air temperature deviation and E42 heating coil valve command residual predicted from mixed air temperature and supply airflow. Fault states include positive stuck and negative stuck."
  },
  {
    key: "ahu_cooling_coil_valve_leaking",
    name: "Cooling Coil Valve Leaking",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_COOLING_VALVE, AHU_CHW_PUMP_STATUS],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F12. Evidence from Zhao Part II: E18 cooling coil control signal, E19 supply air unexpectedly below mixed air plus fan heat, and E43 cooling coil valve command residual. Fault states include heavy and slight leakage."
  },
  {
    key: "ahu_heating_coil_fouling",
    name: "Heating Coil Fouling",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_HEATING_VALVE, AHU_HW_PRESSURE_DIFF, AHU_HW_SUPPLY_TEMP],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F13. Evidence from Zhao Part II: supply air temperature deviation, heating coil valve command residual, and heating water loop pressure/temperature context. Fault state is heating coil fouling."
  },
  {
    key: "ahu_heating_water_pump_pressure_reduced",
    name: "Heating Water Circulating Pump Pressure Reduced",
    equipmentType: "ahu",
    faultType: "secondary water",
    method: "bayesian_network",
    points: [AHU_HW_PUMP_STATUS, AHU_HW_PRESSURE_DIFF, AHU_HW_PRESSURE_DIFF_SETPOINT, AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F14. Evidence from Zhao Part II: E14 heating water loop differential pressure below about 80% of setpoint, E27 pump status, and supply air temperature deviation. Fault state is pressure reduced."
  },
  {
    key: "ahu_supply_heating_water_low_temperature",
    name: "Supply Heating Water Low Temperature",
    equipmentType: "ahu",
    faultType: "secondary water",
    method: "bayesian_network",
    points: [AHU_HW_SUPPLY_TEMP, AHU_HW_SUPPLY_TEMP_SETPOINT, AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_HEATING_VALVE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F15. Evidence from Zhao Part II: E15 supply heating water temperature below setpoint minus threshold, combined with SAT deviation and heating valve demand. Fault state is low supply heating water temperature."
  },
  {
    key: "ahu_undersized_heating_coil",
    name: "Undersized Heating Coil",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_SUPPLY_AIR_FLOW, AHU_HEATING_VALVE, AHU_HW_SUPPLY_TEMP, AHU_HW_PRESSURE_DIFF],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F16. Evidence from Zhao Part II: persistent heating SAT deficit under high heating valve demand with adequate heating water temperature and pressure. Fault state is undersized heating coil."
  },
  {
    key: "ahu_supply_air_temperature_sensor_fault",
    name: "Supply Air Temperature Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_SUPPLY_FAN_STATUS],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F17. Evidence from Zhao Part II: E16 frozen SAT reading, E12 SAT deviation from setpoint, and E33/E37 excessively low/high SAT checks. Fault states include frozen and very/fairly positive or negative bias."
  },
  {
    key: "ahu_return_air_temperature_sensor_fault",
    name: "Return Air Temperature Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_RETURN_AIR_TEMP, AHU_MIXED_AIR_TEMP, AHU_OUTDOOR_AIR_TEMP, AHU_TERMINAL_RETURN_AIR_REFERENCE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F18. Evidence from Zhao Part II: E17 return air temperature bias against terminal airflow-weighted average and E24 frozen return air temperature reading. Fault states include frozen and very/fairly positive or negative bias."
  },
  {
    key: "ahu_mixed_air_temperature_sensor_fault",
    name: "Mixed Air Temperature Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_MIXED_AIR_TEMP, AHU_RETURN_AIR_TEMP, AHU_OUTDOOR_AIR_TEMP, AHU_OUTDOOR_AIR_DAMPER, AHU_RETURN_AIR_DAMPER],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F19. Evidence from Zhao Part II: E20/E23 mixed air temperature outside return/outdoor air bounds, E21 outdoor air fraction deviation, E22 frozen mixed air reading, and E36 outdoor-air-only consistency check. Fault states include frozen and very/fairly positive or negative bias."
  },
  {
    key: "ahu_outdoor_air_temperature_sensor_fault",
    name: "Outdoor Air Temperature Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_OUTDOOR_AIR_TEMP, AHU_MIXED_AIR_TEMP, AHU_RETURN_AIR_TEMP, AHU_OUTDOOR_AIR_REFERENCE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F20. Evidence from Zhao Part II: E25 frozen OAT, E26/E30 extreme low/high OAT checks, and E39 OAT bias against other devices. Fault states include frozen and very/fairly positive or negative bias."
  },
  {
    key: "ahu_heating_coil_valve_leaking",
    name: "Heating Coil Valve Leaking",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_HEATING_VALVE, AHU_HW_PUMP_STATUS],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F21. Evidence from Zhao Part II: E38 heating coil control signal, E28/E31 supply air warmer than expected, and E42 heating valve command residual. Fault state is heating coil valve leakage."
  },
  {
    key: "ahu_cooling_coil_fouling",
    name: "Cooling Coil Fouling",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_COOLING_VALVE, AHU_CHW_SUPPLY_TEMP, AHU_CHW_PRESSURE_DIFF],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F22. Evidence from Zhao Part II: persistent cooling SAT excess under cooling valve demand, E43 cooling valve residual, and chilled water pressure/temperature context. Fault state is cooling coil fouling."
  },
  {
    key: "ahu_chilled_water_pump_pressure_reduced",
    name: "Chilled Water Circulating Pump Pressure Reduced",
    equipmentType: "ahu",
    faultType: "secondary water",
    method: "bayesian_network",
    points: [AHU_CHW_PUMP_STATUS, AHU_CHW_PRESSURE_DIFF, AHU_CHW_PRESSURE_DIFF_SETPOINT, AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F23. Evidence from Zhao Part II: E29 chilled water loop pressure below about 80% of setpoint, E13 chilled water pump status, and cooling SAT deviation. Fault state is pressure reduced."
  },
  {
    key: "ahu_supply_chilled_water_high_temperature",
    name: "Supply Chilled Water High Temperature",
    equipmentType: "ahu",
    faultType: "secondary water",
    method: "bayesian_network",
    points: [AHU_CHW_SUPPLY_TEMP, AHU_CHW_SUPPLY_TEMP_SETPOINT, AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_COOLING_VALVE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F24. Evidence from Zhao Part II: E34 supply chilled water temperature above setpoint plus threshold, combined with cooling SAT deviation and cooling valve demand. Fault state is high supply chilled water temperature."
  },
  {
    key: "ahu_undersized_cooling_coil",
    name: "Undersized Cooling Coil",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_SUPPLY_AIR_FLOW, AHU_COOLING_VALVE, AHU_CHW_SUPPLY_TEMP, AHU_CHW_PRESSURE_DIFF],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F25. Evidence from Zhao Part II: persistent cooling SAT excess under high cooling valve demand with adequate chilled water temperature and pressure. Fault state is undersized cooling coil."
  },
  {
    key: "ahu_cooling_coil_valve_stuck",
    name: "Cooling Coil Valve Stuck",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_COOLING_VALVE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F26. Evidence from Zhao Part II: E12 supply air temperature deviation and E43 cooling coil valve command residual predicted from mixed air temperature, airflow, and humidity. Fault state is cooling coil valve stuck."
  },
  {
    key: "ahu_mixed_air_humidity_sensor_fault",
    name: "Mixed Air Humidity Sensor Fault",
    equipmentType: "ahu",
    faultType: "sensor",
    method: "bayesian_network",
    points: [AHU_MIXED_AIR_HUMIDITY, AHU_OUTDOOR_AIR_HUMIDITY, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_COOLING_VALVE],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F27. Evidence from Zhao Part II: E40 mixed air humidity bias against other devices, E41 frozen humidity reading, and E43 cooling valve model residual. Fault state is mixed air humidity sensor fault."
  },
  {
    key: "ahu_cooling_coil_stuck",
    name: "Cooling Coil Stuck",
    equipmentType: "ahu",
    faultType: "coil",
    method: "bayesian_network",
    points: [AHU_SUPPLY_AIR_TEMP, AHU_SUPPLY_AIR_TEMP_SETPOINT, AHU_MIXED_AIR_TEMP, AHU_SUPPLY_AIR_FLOW, AHU_COOLING_VALVE, AHU_CHW_SUPPLY_TEMP, AHU_CHW_PRESSURE_DIFF],
    sourcePaperId: "zhao-ahu-dbn-part-ii-2015",
    logic: "Fault node F28. Evidence from Zhao Part II: E44 revised APAR temperature relationship, SAT deviation, and cooling coil command/water-side context. Fault state is cooling coil stuck."
  }
];

const CHILLER_CLASS_POINTS = {
  status: requiredPoint("chiller_status", "Chiller status", "Chiller on/off, run, or proof status used to gate the FDD rule", ["On/Off Status", "chiller status", "run status", "running", "enable"], undefined, "status"),
  command: requiredPoint("chiller_command", "Chiller command", "Chiller start/stop command used by the FDD rule", ["Start Stop Command", "Chiller Start/Stop", "chiller command", "start stop", "remote start"], undefined, "status"),
  alarm: requiredPoint("chiller_alarm", "Chiller alarm", "Chiller failure, trip, or alarm status", ["Failure Alarm", "alarm", "trip alarm", "COMPSALM", "TALM"], undefined, "status"),
  powerStatus: requiredPoint("power_status", "Power status", "Chiller electrical power proof or power status", ["Power Status", "power proof", "power status"], undefined, "status"),
  flowStatus: requiredPoint("chw_flow_status", "CHW flow status", "Chilled water flow proof or flow status", ["CHW Flow Status", "flow status", "flow proof"], undefined, "status"),
  flowRate: requiredPoint("chw_flow_rate", "CHW flow rate", "Measured chilled water flow rate through the chiller", ["CHW Flowrate", "CHW flow rate", "CHWFWR"], ["gpm", "L/s", "m3/h"], "flow_rate"),
  chwSupplyTemp: requiredPoint("chw_supply_temp", "CHW supply temperature", "Chilled water supply temperature leaving the chiller", ["CHW Supply Temperature", "CHWST", "chilled water supply temperature"], ["C", "F"], "temperature"),
  chwReturnTemp: requiredPoint("chw_return_temp", "CHW return temperature", "Chilled water return temperature entering the chiller", ["CHW Return Temperature", "CHWRT", "chilled water return temperature"], ["C", "F"], "temperature"),
  chwSupplyTempSetpoint: requiredPoint("chw_supply_temp_setpoint", "CHW supply temperature setpoint", "Leaving chilled water supply temperature setpoint", ["LCW Setpoint", "CHWST setpoint", "CHWSTsp", "Control Point"], ["C", "F"], "temperature"),
  chwDifferentialPressure: requiredPoint("chw_differential_pressure", "CHW differential pressure", "Measured chilled water side differential pressure", ["CHW differential pressure", "CHW DP", "CHWdp", "CHWRPRESS", "CHWSPRESS"], ["kPa", "Pa", "psi"], "pressure"),
  chwValveCommand: requiredPoint("chw_valve_command", "CHW valve command", "Chilled water valve command or off/on status", ["CHW Valve Status", "valve command", "CHWVLVS"], undefined, "status"),
  cwSupplyTemp: requiredPoint("cw_supply_temp", "Condenser water supply temperature", "Condenser water temperature leaving the chiller", ["CW Supply Temperature", "CWST", "leaving condenser water", "SUAT"], ["C", "F"], "temperature"),
  cwReturnTemp: requiredPoint("cw_return_temp", "Condenser water return temperature", "Condenser water temperature entering the chiller", ["CW Return Temperature", "CWRT", "entering condenser water"], ["C", "F"], "temperature"),
  cwReturnTempSetpoint: requiredPoint("cw_return_temp_setpoint", "Condenser entering water temperature setpoint", "Entering condenser water temperature setpoint", ["ECW Setpoint", "CWRT setpoint", "CWRTsp"], ["C", "F"], "temperature"),
  cwFlowRate: requiredPoint("cw_flow_rate", "Condenser water flow rate", "Measured condenser water flow rate through the chiller", ["CW Flowrate", "CW flow rate", "CWFWR"], ["gpm", "L/s", "m3/h"], "flow_rate"),
  cwDifferentialPressure: requiredPoint("cw_differential_pressure", "Condenser water differential pressure", "Measured condenser water side differential pressure", ["CW differential pressure", "CW DP", "CWdp", "CWRPRESS", "CWSPRESS"], ["kPa", "Pa", "psi"], "pressure"),
  coolingLoad: requiredPoint("cooling_load", "Cooling load", "Cooling load delivered by the chiller or calculated from chilled water side", ["Water Cooling Load", "cooling load", "cooling output"], ["kW", "RT"], "load"),
  chillerPower: requiredPoint("chiller_power", "Chiller power", "Electrical power input required by the FDD formula", ["Motor Kilowatts", "chiller power", "electrical power", "TLKW", "kW"], ["kW", "W"], "power"),
  compressorCurrent: requiredPoint("compressor_current", "Compressor current", "Compressor or line current used to detect overload", ["Actual Line Current", "Average Line Current", "Line Current", "AMP", "compressor current"], ["A", "amp"], "current"),
  partLoadRatio: requiredPoint("part_load_ratio", "Part load ratio", "Chiller part load ratio or operating load fraction", ["Part Load Ratio", "PLR", "load ratio", "percent load"], ["%", "ratio"], "load"),
  loadCommand: requiredPoint("load_command", "Load command", "Chiller loading command or capacity command", ["Target Guide Vane Pos", "load command", "capacity command", "LOADcmd"], ["%", "ratio"], "position"),
  loadActual: requiredPoint("load_actual", "Actual load", "Actual chiller load, capacity, or guide vane response", ["Actual Guide Vane Pos", "actual load", "capacity", "LOADact"], ["%", "ratio", "kW"], "load"),
  evaporatorPressure: requiredPoint("evaporator_pressure", "Evaporator pressure", "Evaporator refrigerant pressure", ["Evaporator Pressure", "Pevap", "SUP"], ["kPa", "Pa", "psi"], "pressure"),
  condenserPressure: requiredPoint("condenser_pressure", "Condenser pressure", "Condensing or condenser refrigerant pressure", ["Condenser Pressure", "Pcond", "DISCP"], ["kPa", "Pa", "psi"], "pressure"),
  suctionPressure: requiredPoint("suction_pressure", "Suction pressure", "Compressor suction pressure", ["Suction Pressure", "Psuc", "SUP"], ["kPa", "Pa", "psi"], "pressure"),
  dischargePressure: requiredPoint("discharge_pressure", "Discharge pressure", "Compressor discharge pressure", ["Discharge Pressure", "Pdis", "DISCP"], ["kPa", "Pa", "psi"], "pressure"),
  evaporatorSaturationTemp: requiredPoint("evaporator_saturation_temp", "Evaporator saturation temperature", "Evaporator saturated refrigerant temperature", ["Calc Evap Sat Temp", "Evaporator saturation", "Tevap_sat"], ["C", "F"], "temperature"),
  condenserSaturationTemp: requiredPoint("condenser_saturation_temp", "Condenser saturation temperature", "Condenser saturated refrigerant temperature", ["Condenser Refrig Temp", "Condenser saturation", "Tcond_sat"], ["C", "F"], "temperature"),
  superheatTemp: requiredPoint("superheat_temp", "Superheat temperature", "Refrigerant superheat temperature", ["Superheat", "Tsuperheat"], ["C", "F"], "temperature"),
  subcoolingTemp: requiredPoint("subcooling_temp", "Subcooling temperature", "Refrigerant subcooling temperature", ["Subcooling", "Tsubcooling"], ["C", "F"], "temperature"),
  exvPosition: requiredPoint("exv_position", "EXV position", "Electronic expansion valve position or opening", ["EXV", "expansion valve", "valve position", "EXVpos"], ["%", "ratio"], "position"),
  outsideAirTemp: requiredPoint("outside_air_temp", "Outside air temperature", "Outside air temperature used by reset strategy checks", ["Outside Air Temperature", "OAT", "Toat"], ["C", "F"], "temperature")
};

function docWindowParameter(minutes: number): FddParameterSpec {
  return numberParameter("window_minutes", "Detection window", minutes, "min", "Imported from the chiller FDD library N-sample persistence window.", { min: 1, max: 240, step: 1 });
}

function tempParameter(key: string, label: string, defaultValue: number, description: string, bounds: { min?: number; max?: number; step?: number } = {}): FddParameterSpec {
  return numberParameter(key, label, defaultValue, "C", description, { step: 0.1, ...bounds });
}

function provisionalParameter(key: string, label: string, defaultValue: number, unit: string, description: string, bounds: { min?: number; max?: number; step?: number } = {}): FddParameterSpec {
  return numberParameter(key, label, defaultValue, unit, `${description} Temporary default; tune to the local design or historical baseline before relying on production alarms.`, bounds);
}

function chillerDocSeed(
  chId: string,
  key: string,
  name: string,
  categoryKey: string,
  faultType: string,
  points: FddRequiredPoint[],
  formula: string,
  parameters: FddParameterSpec[],
  method: FddMethod = "rule_based"
): AlgorithmSeed {
  return {
    key,
    name: `${chId} ${name}`,
    equipmentType: "chiller",
    faultType,
    method,
    categoryKey,
    categoryLabel: categoryKey,
    points,
    sourcePaperId: "fdd-library-chiller-final",
    deployableRuntime: true,
    formula: `\`${formula}\``,
    parameters,
    logic: `Imported ${chId} from FDD Library_chiller_final.docx. ${formula}`
  };
}

const CHILLER_DOC_5_MIN = () => docWindowParameter(5);
const CHILLER_DOC_10_MIN = () => docWindowParameter(10);
const POWER_ON_THRESHOLD = () => provisionalParameter("power_on_threshold_kw", "Power-on threshold", 0.1, "kW", "Electrical power threshold used to distinguish off from running/proven power.", { min: 0, max: 100, step: 0.1 });
const FLOW_MIN = () => provisionalParameter("flow_min", "Minimum flow", 10, "flow unit", "Minimum acceptable water flow.", { min: 0, max: 10000, step: 1 });
const FLOW_MAX = () => provisionalParameter("flow_max", "Maximum flow", 10000, "flow unit", "Maximum acceptable water flow.", { min: 0, max: 100000, step: 1 });

const CHILLER_DOC_RULES: AlgorithmSeed[] = [
  chillerDocSeed("CH-01", "chiller_ch_01_commanded_fails_to_start", "Commanded Chiller Fails to Start", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.command, CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.chillerPower], "fault = chiller_command == ON && chiller_status == OFF && chiller_power < power_on_threshold_kw for window_minutes", [POWER_ON_THRESHOLD(), CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-02", "chiller_ch_02_uncommanded_operation", "Uncommanded Chiller Operation", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.command, CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.chillerPower], "fault = chiller_command == OFF && (chiller_status == ON || chiller_power > power_on_threshold_kw) for window_minutes", [POWER_ON_THRESHOLD(), CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-03", "chiller_ch_03_abnormal_shutdown", "Abnormal Chiller Shutdown", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.command, CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.alarm], "fault = chiller_command == ON && chiller_status falls from ON to OFF, especially with chiller_alarm == ON, for window_minutes", [CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-04", "chiller_ch_04_running_no_cooling_output", "Chiller Running With No Cooling Output", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.chillerPower, CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp], "fault = chiller_status == ON && chiller_power > power_on_threshold_kw && (chw_return_temp - chw_supply_temp) < delta_t_min for window_minutes", [POWER_ON_THRESHOLD(), tempParameter("delta_t_min", "Minimum Delta-T", 1.7, "Minimum chilled water temperature difference indicating effective cooling.", { min: 0, max: 20 }), CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-05", "chiller_ch_05_prolonged_low_load", "Prolonged Low Load Operation", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.partLoadRatio], "fault = chiller_status == ON && part_load_ratio < plr_min for window_minutes", [provisionalParameter("plr_min", "Minimum PLR", 0.3, "ratio", "Minimum acceptable part-load ratio.", { min: 0, max: 1, step: 0.01 }), CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-06", "chiller_ch_06_loading_response_fault", "Loading Command Response Fault", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.loadCommand, CHILLER_CLASS_POINTS.loadActual, CHILLER_CLASS_POINTS.chillerPower], "fault = load_command increases but load_actual and chiller_power do not respond for window_minutes", [provisionalParameter("response_deadband_percent", "Response deadband", 5, "%", "Minimum load or power response expected after a load command change.", { min: 0, max: 100, step: 1 }), CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-07", "chiller_ch_07_unloading_failure", "Unloading Failure", "Chiller-Operation", "operation", [CHILLER_CLASS_POINTS.loadCommand, CHILLER_CLASS_POINTS.loadActual, CHILLER_CLASS_POINTS.chillerPower, CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwSupplyTempSetpoint], "fault = load_command decreases but load_actual or chiller_power do not decrease, and chw_supply_temp remains below setpoint for window_minutes", [provisionalParameter("response_deadband_percent", "Response deadband", 5, "%", "Minimum load or power response expected after an unload command change.", { min: 0, max: 100, step: 1 }), tempParameter("setpoint_deadband", "Setpoint deadband", 0.1, "Temperature deadband around the chilled water setpoint.", { min: 0, max: 5 }), CHILLER_DOC_5_MIN()]),
  chillerDocSeed("CH-08", "chiller_ch_08_high_chw_supply_temp", "High Chilled Water Supply Temperature", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwSupplyTempSetpoint], "fault = chw_supply_temp - chw_supply_temp_setpoint > chw_supply_high_delta for window_minutes", [tempParameter("chw_supply_high_delta", "High CHWST delta", 1.1, "Allowed chilled water supply temperature rise above setpoint.", { min: 0, max: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-09", "chiller_ch_09_low_chw_supply_temp", "Low Chilled Water Supply Temperature", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwSupplyTempSetpoint], "fault = chw_supply_temp_setpoint - chw_supply_temp > chw_supply_low_delta for window_minutes", [tempParameter("chw_supply_low_delta", "Low CHWST delta", 1.1, "Allowed chilled water supply temperature drop below setpoint.", { min: 0, max: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-10", "chiller_ch_10_insufficient_capacity", "Insufficient Cooling Capacity to Meet CHW Setpoint", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwSupplyTempSetpoint, CHILLER_CLASS_POINTS.loadActual], "fault = chw_supply_temp - chw_supply_temp_setpoint > chw_supply_load_delta && load_actual >= load_high_percent for window_minutes", [tempParameter("chw_supply_load_delta", "CHWST load delta", 1.1, "Allowed chilled water supply temperature rise above setpoint at high load.", { min: 0, max: 10 }), provisionalParameter("load_high_percent", "High load threshold", 95, "%", "Load threshold treated as close to full capacity.", { min: 0, max: 100, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-11", "chiller_ch_11_chw_supply_temp_hunting", "Chilled Water Supply Temperature Hunting", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwSupplyTempSetpoint], "fault = chw_supply_temp repeatedly crosses setpoint and rolling_std(chw_supply_temp) > supply_temp_std_threshold for window_minutes", [tempParameter("supply_temp_std_threshold", "Supply temp standard deviation threshold", 1, "Maximum acceptable chilled water supply temperature standard deviation.", { min: 0, max: 10 }), provisionalParameter("crossing_count_min", "Minimum crossing count", 2, "count", "Minimum setpoint crossings inside the detection window.", { min: 1, max: 20, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-12", "chiller_ch_12_insufficient_chw_flow", "Insufficient Chilled Water Flow", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.flowRate], "fault = chw_flow_rate < flow_min for window_minutes", [FLOW_MIN(), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-13", "chiller_ch_13_excessive_chw_flow", "Excessive Chilled Water Flow", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.flowRate], "fault = chw_flow_rate > flow_max for window_minutes", [FLOW_MAX(), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-14", "chiller_ch_14_low_chw_delta_t", "Low Chilled Water Delta-T", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp, CHILLER_CLASS_POINTS.flowRate], "fault = chw_return_temp - chw_supply_temp < delta_t_low while flow is normal for window_minutes", [tempParameter("delta_t_low", "Low CHW Delta-T", 2, "Minimum acceptable chilled water Delta-T.", { min: 0, max: 20 }), FLOW_MIN(), FLOW_MAX(), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-15", "chiller_ch_15_high_chw_delta_t", "High Chilled Water Delta-T", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp, CHILLER_CLASS_POINTS.flowRate], "fault = chw_return_temp - chw_supply_temp > delta_t_high while flow is normal for window_minutes", [tempParameter("delta_t_high", "High CHW Delta-T", 7, "Maximum acceptable chilled water Delta-T.", { min: 0, max: 30 }), FLOW_MIN(), FLOW_MAX(), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-16", "chiller_ch_16_high_evaporator_pressure", "High Evaporator Pressure", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.evaporatorPressure], "fault = evaporator_pressure > evaporator_pressure_high for window_minutes", [provisionalParameter("evaporator_pressure_high", "High evaporator pressure", 900, "kPa", "High evaporator pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-17", "chiller_ch_17_low_evaporator_pressure", "Low Evaporator Pressure", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.evaporatorPressure], "fault = evaporator_pressure < evaporator_pressure_low for window_minutes", [provisionalParameter("evaporator_pressure_low", "Low evaporator pressure", 200, "kPa", "Low evaporator pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-18", "chiller_ch_18_evaporator_heat_transfer_degradation", "Evaporator Heat Transfer Degradation", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.evaporatorSaturationTemp], "fault = chw_supply_temp - evaporator_saturation_temp > evaporator_approach_high for window_minutes", [tempParameter("evaporator_approach_high", "High evaporator approach", 1.7, "Maximum acceptable evaporator approach temperature.", { min: 0, max: 20 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-19", "chiller_ch_19_chw_freezing_risk", "Chilled Water Freezing Risk", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp], "fault = chw_supply_temp < freeze_temp_limit for window_minutes", [tempParameter("freeze_temp_limit", "Freeze risk limit", 2, "Chilled water temperature below this limit indicates freezing risk.", { min: -10, max: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-20", "chiller_ch_20_chw_flow_while_off", "Chilled Water Flow During Chiller Off", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.chwValveCommand, CHILLER_CLASS_POINTS.flowRate], "fault = chiller_status == OFF && chw_valve_command == OFF && chw_flow_rate > flow_off_threshold for window_minutes", [provisionalParameter("flow_off_threshold", "Off-state flow threshold", 0, "flow unit", "Maximum flow allowed while the chiller and valve are off.", { min: 0, max: 10000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-21", "chiller_ch_21_reversed_chw_delta_t", "Reversed Chilled Water Delta-T", "Chiller-ChilledWater", "chilled water", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp], "fault = chw_return_temp < chw_supply_temp for window_minutes", [CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-22", "chiller_ch_22_high_condenser_entering_water_temp", "High Condenser Entering Water Temperature", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.cwReturnTemp, CHILLER_CLASS_POINTS.cwReturnTempSetpoint], "fault = cw_return_temp - cw_return_temp_setpoint > cw_return_high_delta for window_minutes", [tempParameter("cw_return_high_delta", "High condenser entering water delta", 1.1, "Allowed condenser entering water temperature rise above setpoint.", { min: 0, max: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-23", "chiller_ch_23_low_condenser_entering_water_temp", "Low Condenser Entering Water Temperature", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.cwReturnTemp, CHILLER_CLASS_POINTS.cwReturnTempSetpoint], "fault = cw_return_temp_setpoint - cw_return_temp > cw_return_low_delta for window_minutes", [tempParameter("cw_return_low_delta", "Low condenser entering water delta", 1.1, "Allowed condenser entering water temperature drop below setpoint.", { min: 0, max: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-24", "chiller_ch_24_insufficient_cw_flow", "Insufficient Condenser Water Flow", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.cwFlowRate], "fault = cw_flow_rate < cw_flow_min for window_minutes", [provisionalParameter("cw_flow_min", "Minimum condenser water flow", 10, "flow unit", "Minimum acceptable condenser water flow.", { min: 0, max: 10000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-25", "chiller_ch_25_excessive_cw_flow", "Excessive Condenser Water Flow", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.cwFlowRate], "fault = cw_flow_rate > cw_flow_max for window_minutes", [provisionalParameter("cw_flow_max", "Maximum condenser water flow", 10000, "flow unit", "Maximum acceptable condenser water flow.", { min: 0, max: 100000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-26", "chiller_ch_26_condenser_heat_transfer_degradation", "Condenser Heat Transfer Degradation", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.condenserSaturationTemp, CHILLER_CLASS_POINTS.cwSupplyTemp], "fault = condenser_saturation_temp - cw_supply_temp > condenser_approach_high for window_minutes", [tempParameter("condenser_approach_high", "High condenser approach", 2.2, "Maximum acceptable condenser approach temperature.", { min: 0, max: 30 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-27", "chiller_ch_27_high_condensing_pressure", "High Condensing Pressure", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.condenserPressure], "fault = condenser_pressure > condenser_pressure_high for window_minutes", [provisionalParameter("condenser_pressure_high", "High condensing pressure", 1800, "kPa", "High condensing pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-28", "chiller_ch_28_low_condensing_pressure", "Low Condensing Pressure", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.condenserPressure], "fault = condenser_pressure < condenser_pressure_low for window_minutes", [provisionalParameter("condenser_pressure_low", "Low condensing pressure", 400, "kPa", "Low condensing pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-29", "chiller_ch_29_low_condenser_water_delta_t", "Low Condenser Water Delta-T", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.cwReturnTemp, CHILLER_CLASS_POINTS.cwSupplyTemp], "fault = cw_supply_temp - cw_return_temp < cw_delta_t_low for window_minutes", [tempParameter("cw_delta_t_low", "Low condenser water Delta-T", 2, "Minimum acceptable condenser water Delta-T.", { min: 0, max: 20 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-30", "chiller_ch_30_high_condenser_water_delta_t", "High Condenser Water Delta-T", "Chiller-CondenserWater", "condenser water", [CHILLER_CLASS_POINTS.cwReturnTemp, CHILLER_CLASS_POINTS.cwSupplyTemp], "fault = cw_supply_temp - cw_return_temp > cw_delta_t_high for window_minutes", [tempParameter("cw_delta_t_high", "High condenser water Delta-T", 7, "Maximum acceptable condenser water Delta-T.", { min: 0, max: 30 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-31", "chiller_ch_31_low_suction_pressure", "Low Suction Pressure", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.suctionPressure], "fault = suction_pressure < suction_pressure_low for window_minutes", [provisionalParameter("suction_pressure_low", "Low suction pressure", 200, "kPa", "Low suction pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-32", "chiller_ch_32_high_suction_pressure", "High Suction Pressure", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.suctionPressure], "fault = suction_pressure > suction_pressure_high for window_minutes", [provisionalParameter("suction_pressure_high", "High suction pressure", 900, "kPa", "High suction pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-33", "chiller_ch_33_high_discharge_pressure", "High Discharge Pressure", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.dischargePressure], "fault = discharge_pressure > discharge_pressure_high for window_minutes", [provisionalParameter("discharge_pressure_high", "High discharge pressure", 1800, "kPa", "High discharge pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-34", "chiller_ch_34_low_discharge_pressure", "Low Discharge Pressure", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.dischargePressure], "fault = discharge_pressure < discharge_pressure_low for window_minutes", [provisionalParameter("discharge_pressure_low", "Low discharge pressure", 400, "kPa", "Low discharge pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-35", "chiller_ch_35_refrigerant_undercharge_or_leak", "Possible Refrigerant Undercharge or Leakage", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.suctionPressure, CHILLER_CLASS_POINTS.superheatTemp, CHILLER_CLASS_POINTS.subcoolingTemp], "fault = suction_pressure < suction_pressure_low && superheat_temp > superheat_high && subcooling_temp < subcooling_low for window_minutes", [provisionalParameter("suction_pressure_low", "Low suction pressure", 200, "kPa", "Low suction pressure threshold.", { min: 0, max: 5000, step: 1 }), tempParameter("superheat_high", "High superheat", 10, "High superheat threshold.", { min: 0, max: 50 }), tempParameter("subcooling_low", "Low subcooling", 2, "Low subcooling threshold.", { min: 0, max: 50 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-36", "chiller_ch_36_refrigerant_overcharge", "Possible Refrigerant Overcharge", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.dischargePressure, CHILLER_CLASS_POINTS.subcoolingTemp, CHILLER_CLASS_POINTS.chillerPower], "fault = discharge_pressure > discharge_pressure_high && subcooling_temp > subcooling_high && chiller_power > power_high_kw for window_minutes", [provisionalParameter("discharge_pressure_high", "High discharge pressure", 1800, "kPa", "High discharge pressure threshold.", { min: 0, max: 5000, step: 1 }), tempParameter("subcooling_high", "High subcooling", 10, "High subcooling threshold.", { min: 0, max: 50 }), provisionalParameter("power_high_kw", "High chiller power", 1000, "kW", "High chiller power threshold.", { min: 0, max: 5000, step: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-37", "chiller_ch_37_exv_underfeeding_or_stuck_closed", "EXV Underfeeding or Stuck Closed", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.exvPosition, CHILLER_CLASS_POINTS.superheatTemp, CHILLER_CLASS_POINTS.suctionPressure], "fault = exv_position < exv_position_low && superheat_temp > superheat_high && suction_pressure < suction_pressure_low for window_minutes", [provisionalParameter("exv_position_low", "Low EXV position", 5, "%", "Low expansion valve position threshold.", { min: 0, max: 100, step: 1 }), tempParameter("superheat_high", "High superheat", 10, "High superheat threshold.", { min: 0, max: 50 }), provisionalParameter("suction_pressure_low", "Low suction pressure", 200, "kPa", "Low suction pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-38", "chiller_ch_38_exv_overfeeding_or_stuck_open", "EXV Overfeeding or Stuck Open", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.exvPosition, CHILLER_CLASS_POINTS.superheatTemp, CHILLER_CLASS_POINTS.suctionPressure], "fault = exv_position > exv_position_high && superheat_temp < superheat_low && suction_pressure > suction_pressure_high for window_minutes", [provisionalParameter("exv_position_high", "High EXV position", 95, "%", "High expansion valve position threshold.", { min: 0, max: 100, step: 1 }), tempParameter("superheat_low", "Low superheat", 2, "Low superheat threshold.", { min: 0, max: 50 }), provisionalParameter("suction_pressure_high", "High suction pressure", 900, "kPa", "High suction pressure threshold.", { min: 0, max: 5000, step: 1 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-39", "chiller_ch_39_compressor_overload", "Compressor Overload", "Chiller-RefrigerantCompressor", "refrigerant/compressor", [CHILLER_CLASS_POINTS.compressorCurrent, CHILLER_CLASS_POINTS.chillerPower], "fault = compressor_current > current_high_amp && chiller_power > power_high_kw for window_minutes", [provisionalParameter("current_high_amp", "High compressor current", 500, "A", "High compressor current threshold.", { min: 0, max: 5000, step: 1 }), provisionalParameter("power_high_kw", "High chiller power", 1000, "kW", "High chiller power threshold.", { min: 0, max: 5000, step: 10 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-40", "chiller_ch_40_low_chw_setpoint", "Low CHW Supply Temperature Setpoint", "Chiller-ControlSetpoint", "control/setpoint", [CHILLER_CLASS_POINTS.chwSupplyTempSetpoint], "fault = chw_supply_temp_setpoint < chw_setpoint_low for window_minutes", [tempParameter("chw_setpoint_low", "Low CHW setpoint", 5, "Low chilled water supply setpoint threshold.", { min: -10, max: 30 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-41", "chiller_ch_41_high_chw_setpoint", "High CHW Supply Temperature Setpoint", "Chiller-ControlSetpoint", "control/setpoint", [CHILLER_CLASS_POINTS.chwSupplyTempSetpoint], "fault = chw_supply_temp_setpoint > chw_setpoint_high for window_minutes", [tempParameter("chw_setpoint_high", "High CHW setpoint", 15.6, "High chilled water supply setpoint threshold.", { min: -10, max: 40 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-42", "chiller_ch_42_chw_setpoint_reset_failure", "CHW Setpoint Reset Failure", "Chiller-ControlSetpoint", "control/setpoint", [CHILLER_CLASS_POINTS.chwSupplyTempSetpoint, CHILLER_CLASS_POINTS.outsideAirTemp], "fault = outside_air_temp changes by more than outside_air_change_threshold while chw_supply_temp_setpoint remains constant for window_minutes", [tempParameter("outside_air_change_threshold", "Outside air change threshold", 5, "Outside air temperature change expected to exercise reset logic.", { min: 0, max: 30 }), tempParameter("setpoint_change_epsilon", "Setpoint change epsilon", 0.1, "Maximum setpoint movement treated as constant.", { min: 0, max: 5 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-43", "chiller_ch_43_chw_supply_temp_sensor_fault", "CHW Supply Temperature Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp], "fault = chw_supply_temp is out of range, stuck, or inconsistent with chw_return_temp for window_minutes", [tempParameter("chw_supply_temp_min", "Minimum CHWST", 0, "Minimum physically reasonable chilled water supply temperature.", { min: -50, max: 50 }), tempParameter("chw_supply_temp_max", "Maximum CHWST", 30, "Maximum physically reasonable chilled water supply temperature.", { min: -50, max: 100 }), tempParameter("temp_slope_epsilon", "Temperature slope epsilon", 0.01, "Maximum absolute temperature slope treated as stuck.", { min: 0, max: 5, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-44", "chiller_ch_44_chw_return_temp_sensor_fault", "CHW Return Temperature Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.chwReturnTemp, CHILLER_CLASS_POINTS.chwSupplyTemp], "fault = chw_return_temp is out of range, stuck, or inconsistent with chw_supply_temp for window_minutes", [tempParameter("chw_return_temp_min", "Minimum CHWRT", 0, "Minimum physically reasonable chilled water return temperature.", { min: -50, max: 50 }), tempParameter("chw_return_temp_max", "Maximum CHWRT", 30, "Maximum physically reasonable chilled water return temperature.", { min: -50, max: 100 }), tempParameter("temp_slope_epsilon", "Temperature slope epsilon", 0.01, "Maximum absolute temperature slope treated as stuck.", { min: 0, max: 5, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-45", "chiller_ch_45_chw_flow_sensor_fault", "CHW Flow Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.flowRate], "fault = chw_flow_rate is out of range, stuck, or zero while chiller and pump are running for window_minutes", [FLOW_MIN(), FLOW_MAX(), provisionalParameter("flow_slope_epsilon", "Flow slope epsilon", 0.02, "flow/min", "Maximum absolute flow slope treated as stuck.", { min: 0, max: 100, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-46", "chiller_ch_46_cw_supply_temp_sensor_fault", "Condenser Water Supply Temperature Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.cwSupplyTemp, CHILLER_CLASS_POINTS.cwReturnTemp], "fault = cw_supply_temp is out of range, stuck, or inconsistent with cw_return_temp for window_minutes", [tempParameter("cw_supply_temp_min", "Minimum CWST", 0, "Minimum physically reasonable condenser water supply temperature.", { min: -50, max: 50 }), tempParameter("cw_supply_temp_max", "Maximum CWST", 45, "Maximum physically reasonable condenser water supply temperature.", { min: -50, max: 100 }), tempParameter("temp_slope_epsilon", "Temperature slope epsilon", 0.01, "Maximum absolute temperature slope treated as stuck.", { min: 0, max: 5, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-47", "chiller_ch_47_cw_return_temp_sensor_fault", "Condenser Water Return Temperature Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.cwReturnTemp, CHILLER_CLASS_POINTS.cwSupplyTemp], "fault = cw_return_temp is out of range, stuck, or inconsistent with cw_supply_temp for window_minutes", [tempParameter("cw_return_temp_min", "Minimum CWRT", 0, "Minimum physically reasonable condenser water return temperature.", { min: -50, max: 50 }), tempParameter("cw_return_temp_max", "Maximum CWRT", 45, "Maximum physically reasonable condenser water return temperature.", { min: -50, max: 100 }), tempParameter("temp_slope_epsilon", "Temperature slope epsilon", 0.01, "Maximum absolute temperature slope treated as stuck.", { min: 0, max: 5, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-48", "chiller_ch_48_cw_flow_sensor_fault", "Condenser Water Flow Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.cwFlowRate], "fault = cw_flow_rate is out of range, stuck, or zero while chiller and pump are running for window_minutes", [provisionalParameter("cw_flow_min", "Minimum condenser water flow", 10, "flow unit", "Minimum physically reasonable condenser water flow.", { min: 0, max: 10000, step: 1 }), provisionalParameter("cw_flow_max", "Maximum condenser water flow", 10000, "flow unit", "Maximum physically reasonable condenser water flow.", { min: 0, max: 100000, step: 1 }), provisionalParameter("flow_slope_epsilon", "Flow slope epsilon", 0.02, "flow/min", "Maximum absolute flow slope treated as stuck.", { min: 0, max: 100, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-49", "chiller_ch_49_chw_differential_pressure_sensor_fault", "CHW Differential Pressure Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.flowRate, CHILLER_CLASS_POINTS.chwDifferentialPressure], "fault = chw_differential_pressure is out of range, stuck, or zero while chw_flow_rate > 0 for window_minutes", [provisionalParameter("chw_dp_min", "Minimum CHW DP", 0, "kPa", "Minimum physically reasonable chilled water differential pressure.", { min: 0, max: 10000, step: 1 }), provisionalParameter("chw_dp_max", "Maximum CHW DP", 1000, "kPa", "Maximum physically reasonable chilled water differential pressure.", { min: 0, max: 10000, step: 1 }), provisionalParameter("dp_slope_epsilon", "DP slope epsilon", 0.05, "kPa/min", "Maximum absolute differential pressure slope treated as stuck.", { min: 0, max: 100, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-50", "chiller_ch_50_cw_differential_pressure_sensor_fault", "Condenser Water Differential Pressure Sensor Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.cwFlowRate, CHILLER_CLASS_POINTS.cwDifferentialPressure], "fault = cw_differential_pressure is out of range, stuck, or zero while cw_flow_rate > 0 for window_minutes", [provisionalParameter("cw_dp_min", "Minimum CW DP", 0, "kPa", "Minimum physically reasonable condenser water differential pressure.", { min: 0, max: 10000, step: 1 }), provisionalParameter("cw_dp_max", "Maximum CW DP", 1000, "kPa", "Maximum physically reasonable condenser water differential pressure.", { min: 0, max: 10000, step: 1 }), provisionalParameter("dp_slope_epsilon", "DP slope epsilon", 0.05, "kPa/min", "Maximum absolute differential pressure slope treated as stuck.", { min: 0, max: 100, step: 0.01 }), CHILLER_DOC_10_MIN()]),
  chillerDocSeed("CH-51", "chiller_ch_51_heat_balance_sensor_consistency", "Heat Balance Sensor Consistency Fault", "Chiller-Sensor", "sensor", [CHILLER_CLASS_POINTS.chwReturnTemp, CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.flowRate, CHILLER_CLASS_POINTS.cwReturnTemp, CHILLER_CLASS_POINTS.cwSupplyTemp, CHILLER_CLASS_POINTS.cwFlowRate, CHILLER_CLASS_POINTS.chillerPower], "fault = abs(q_condenser - q_evaporator + chiller_power) / abs(q_condenser) > heat_balance_epsilon for window_minutes", [provisionalParameter("heat_balance_epsilon", "Heat balance epsilon", 0.1, "ratio", "Normalized heat balance error threshold.", { min: 0, max: 1, step: 0.01 }), CHILLER_DOC_10_MIN()], "performance_indicator")
];

const CHILLER_RULE_BASED_EXAMPLES: AlgorithmSeed[] = [
  {
    key: "chiller_low_chw_delta_t",
    name: "Chiller Low CHW Delta-T Detection",
    equipmentType: "chiller",
    faultType: "performance",
    method: "rule_based",
    categoryKey: "Chiller-Performance",
    categoryLabel: "Chiller-Performance",
    points: [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.flowStatus, CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "$$\n\\Delta T_{CHW} = T_{return} - T_{supply}\n$$\n`fault = chiller_on && flow_proven && DeltaT_CHW < deltaT_min for window_minutes`",
    logic: "Rule-based chiller performance indicator derived from the review's performance-indicator FDD category. When the chiller and CHW flow are proven on, a persistently low chilled water temperature difference indicates poor heat transfer, low load, bypassing, or sensor issues."
  },
  {
    key: "chiller_chw_flow_proving_fault",
    name: "Chiller CHW Flow Proving Fault",
    equipmentType: "chiller",
    faultType: "operation",
    method: "rule_based",
    categoryKey: "Chiller-Operation",
    categoryLabel: "Chiller-Operation",
    points: [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.flowStatus, CHILLER_CLASS_POINTS.flowRate],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "`fault = chiller_on && (!flow_proven || CHW_flow < min_flow) for window_minutes`",
    logic: "Rule-based chiller operation check. If the chiller is commanded or reported on but the chilled water flow switch is off or measured flow stays below the configured minimum, flag a flow proving fault."
  },
  {
    key: "chiller_cooling_load_plausibility",
    name: "Chiller Cooling Load Plausibility Check",
    equipmentType: "chiller",
    faultType: "data quality",
    method: "performance_indicator",
    categoryKey: "Chiller-Performance",
    categoryLabel: "Chiller-Performance",
    points: [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.flowRate, CHILLER_CLASS_POINTS.chwSupplyTemp, CHILLER_CLASS_POINTS.chwReturnTemp, CHILLER_CLASS_POINTS.coolingLoad],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "$$\nQ_{calc} = k \\cdot Flow_{CHW} \\cdot (T_{return} - T_{supply})\n$$\n`fault = chiller_on && abs(Q_bms - Q_calc) > tolerance for window_minutes`",
    logic: "Performance-indicator consistency check. It compares the BMS cooling load with a load calculated from chilled water flow and supply/return temperature difference to catch load meter, flow, or temperature data problems."
  },
  {
    key: "chiller_status_consistency",
    name: "Chiller On/Off Status Consistency Check",
    equipmentType: "chiller",
    faultType: "data quality",
    method: "rule_based",
    categoryKey: "Chiller-Operation",
    categoryLabel: "Chiller-Operation",
    points: [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.powerStatus],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "`fault = chiller_status != power_status for window_minutes`",
    logic: "Rule-based status consistency check. It compares chiller on/off status with power status and flags persistent disagreement as a command, proof, or data quality fault."
  }
];

const SENSOR_RULE_BASED_EXAMPLES: AlgorithmSeed[] = [
  {
    key: "sensor_chw_supply_temp_flatline",
    name: "CHW Supply Temperature Sensor Flatline",
    equipmentType: "sensor",
    faultType: "sensor fault",
    method: "statistical",
    categoryKey: "Sensor-Flatline",
    categoryLabel: "Sensor-Flatline",
    points: [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.chwSupplyTemp],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "`fault = chiller_on && rolling_std(CHW_supply_temp, freeze_window) < epsilon_temp for window_minutes`",
    logic: "Deployable sensor FDD rule for a chilled water supply temperature sensor. It flags a frozen or flatlined value when the chiller is operating but the measured signal has near-zero variation for the configured window."
  },
  {
    key: "sensor_chw_return_temp_flatline",
    name: "CHW Return Temperature Sensor Flatline",
    equipmentType: "sensor",
    faultType: "sensor fault",
    method: "statistical",
    categoryKey: "Sensor-Flatline",
    categoryLabel: "Sensor-Flatline",
    points: [CHILLER_CLASS_POINTS.status, CHILLER_CLASS_POINTS.chwReturnTemp],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "`fault = chiller_on && rolling_std(CHW_return_temp, freeze_window) < epsilon_temp for window_minutes`",
    logic: "Deployable sensor FDD rule for a chilled water return temperature sensor. It detects frozen or flatlined readings during proven chiller operation."
  },
  {
    key: "sensor_chw_flow_flatline",
    name: "CHW Flow Sensor Flatline",
    equipmentType: "sensor",
    faultType: "sensor fault",
    method: "statistical",
    categoryKey: "Sensor-Flatline",
    categoryLabel: "Sensor-Flatline",
    points: [CHILLER_CLASS_POINTS.flowStatus, CHILLER_CLASS_POINTS.flowRate],
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "`fault = flow_proven && rolling_std(CHW_flow, freeze_window) < epsilon_flow for window_minutes`",
    logic: "Deployable sensor FDD rule for a chilled water flow meter. It flags a flatlined flow value while the flow status indicates active flow."
  }
];

const BUILTIN_ALGORITHM_SEEDS: AlgorithmSeed[] = [
  ...AHU_PART_1,
  ...AHU_PART_2,
  ...CHILLER_RULE_BASED_EXAMPLES,
  ...CHILLER_DOC_RULES,
  ...SENSOR_RULE_BASED_EXAMPLES,
  {
    key: "chiller_low_cop_detection",
    name: "Chiller Low COP Detection",
    equipmentType: "chiller",
    faultType: "efficiency",
    method: "performance_indicator",
    categoryKey: "Chiller-Performance",
    categoryLabel: "Chiller-Performance",
    points: CHILLER_LOW_COP_POINTS,
    sourcePaperId: "chen-computing-hvac-fdd-review-2022",
    deployableRuntime: true,
    formula: "$$\nCOP = \\frac{Q_{cooling}}{P_{chiller}}\n$$\n`fault = chiller_on && Q_cooling > min_load && COP < COP_threshold for window_minutes`",
    logic: "When the chiller is running and cooling load is meaningful, calculate System COP from cooling output and electric power. If COP stays below the expected threshold or baseline over the configured window, flag a low COP fault status."
  }
];

function toAlgorithm(seed: AlgorithmSeed): FddAlgorithm {
  const category = inferredCategory(seed);
  const formula = seed.formula ?? AHU_DBN_FORMULA;
  return {
    id: `fddalg_${seed.key}_${BUILTIN_FDD_VERSION}`,
    scope: "global_builtin",
    algorithmKey: seed.key,
    version: BUILTIN_FDD_VERSION,
    name: seed.name,
    equipmentType: seed.equipmentType,
    faultType: seed.faultType,
    method: seed.method,
    categoryKey: category.categoryKey,
    categoryLabel: category.categoryLabel,
    requiredPoints: seed.points,
    outputs: FDD_OUTPUTS,
    parameters: seed.parameters ?? inferParameterSpecs(formula, seed.method),
    formula,
    logicSummary: seed.logic,
    ...(seed.sourcePaperId ? { sourcePaperId: seed.sourcePaperId } : {}),
    deployableRuntime: Boolean(seed.deployableRuntime) && hasExecutableFddEvaluator(seed.key)
  };
}

export function seedFddAlgorithms(): FddAlgorithm[] {
  return [...BUILTIN_ALGORITHM_SEEDS.map(toAlgorithm), ...importedEquipmentFddAlgorithms()];
}

export function ensureStoreFddLibrary(store: SeedStore): boolean {
  let changed = false;
  const builtins = seedFddAlgorithms();
  const communityAlgorithms = Array.isArray(store.fddAlgorithms)
    ? store.fddAlgorithms
      .filter((algorithm) => algorithm.scope === "global_community")
      .map((algorithm) => algorithm.deployableRuntime ? { ...algorithm, deployableRuntime: false } : algorithm)
    : [];
  const nextAlgorithms = [...builtins, ...communityAlgorithms];
  if (!Array.isArray(store.fddAlgorithms) || JSON.stringify(store.fddAlgorithms) !== JSON.stringify(nextAlgorithms)) {
    store.fddAlgorithms = nextAlgorithms;
    changed = true;
  }
  if (!store.fddTasksByProject) {
    store.fddTasksByProject = {};
    changed = true;
  } else {
    for (const tasks of Object.values(store.fddTasksByProject)) {
      for (const task of tasks) {
        const runtimeReady = task.source === "global_library"
          && task.algorithmSnapshot.scope === "global_builtin"
          && hasExecutableFddEvaluator(task.algorithmSnapshot.algorithmKey);
        if (task.algorithmSnapshot.deployableRuntime !== runtimeReady) {
          task.algorithmSnapshot = { ...task.algorithmSnapshot, deployableRuntime: runtimeReady };
          changed = true;
        }
        if (!runtimeReady && (task.status === "running" || task.status === "ready")) {
          task.status = "cannot_deploy";
          task.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
    }
  }
  if (!store.fddChecksByProject) {
    store.fddChecksByProject = {};
    changed = true;
  }
  if (!store.fddLibraryCheckRunsByProject) {
    store.fddLibraryCheckRunsByProject = {};
    changed = true;
  }
  return changed;
}

export function latestFddCheck(
  checks: FddDeployabilityCheck[],
  algorithmId: string,
  algorithmVersion: string
): FddDeployabilityCheck | null {
  return checks
    .filter((check) => check.algorithmId === algorithmId && check.algorithmVersion === algorithmVersion)
    .sort((left, right) => Date.parse(right.checkedAt) - Date.parse(left.checkedAt))[0] ?? null;
}

function normalizeQuantityKind(value: unknown, fallback: FddQuantityKind): FddQuantityKind {
  return typeof value === "string" && FDD_QUANTITY_KINDS.includes(value as FddQuantityKind)
    ? value as FddQuantityKind
    : fallback;
}

function normalizeFddParameterSpec(value: unknown): FddParameterSpec | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const type = record.type === "boolean" || record.type === "select" ? record.type : record.type === "number" ? "number" : null;
  if (!key || !label || !type) return null;
  const defaultValue = record.defaultValue;
  if (type === "number" && typeof defaultValue !== "number") return null;
  if (type === "boolean" && typeof defaultValue !== "boolean") return null;
  if (type === "select" && typeof defaultValue !== "string") return null;
  const resolvedDefaultValue = defaultValue as FddParameterValue;
  return {
    key,
    label,
    type,
    defaultValue: resolvedDefaultValue,
    ...(typeof record.unit === "string" && record.unit.trim() ? { unit: record.unit.trim() } : {}),
    ...(typeof record.min === "number" ? { min: record.min } : {}),
    ...(typeof record.max === "number" ? { max: record.max } : {}),
    ...(typeof record.step === "number" ? { step: record.step } : {}),
    ...(Array.isArray(record.options) ? { options: record.options.filter((option): option is string => typeof option === "string") } : {}),
    description: typeof record.description === "string" && record.description.trim() ? record.description.trim() : label,
    editable: record.editable !== false
  };
}

export function normalizeFddCreateInput(value: unknown): FddAlgorithmCreateInput | { error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "FDD payload must be an object." };
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return { error: "name is required." };
  const equipmentType = record.equipmentType;
  if (equipmentType !== "ahu" && equipmentType !== "chiller" && equipmentType !== "pump" && equipmentType !== "cooling_tower" && equipmentType !== "fcu" && equipmentType !== "vav" && equipmentType !== "sensor") {
    return { error: "equipmentType is invalid." };
  }
  const method = record.method;
  if (method !== "rule_based" && method !== "bayesian_network" && method !== "performance_indicator" && method !== "statistical") {
    return { error: "method is invalid." };
  }
  const sharingScope = record.sharingScope === "global_community" ? "global_community" : "project_only";
  const requiredPoints = Array.isArray(record.requiredPoints)
    ? record.requiredPoints.flatMap((entry): FddRequiredPoint[] => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
        const point = entry as Record<string, unknown>;
        const slot = typeof point.slot === "string" ? point.slot.trim() : "";
        const label = typeof point.label === "string" ? point.label.trim() : "";
        const semantic = typeof point.semantic === "string" ? point.semantic.trim() : "";
        if (!slot || !label || !semantic) return [];
        const acceptableUnits = Array.isArray(point.acceptableUnits) ? point.acceptableUnits.filter((unit): unit is string => typeof unit === "string") : undefined;
        const quantityKind = normalizeQuantityKind(point.quantityKind, inferQuantityKind(slot, label, semantic, acceptableUnits));
        return [{
          slot,
          label,
          semantic,
          required: point.required !== false,
          quantityKind,
          unitRoleDescription: typeof point.unitRoleDescription === "string" && point.unitRoleDescription.trim()
            ? point.unitRoleDescription.trim()
            : `${label} must provide ${quantityKind.replace(/_/gu, " ")} evidence for the FDD formula.`,
          ...(acceptableUnits ? { acceptableUnits } : {}),
          ...(Array.isArray(point.keywords) ? { keywords: point.keywords.filter((keyword): keyword is string => typeof keyword === "string") } : {}),
          historyRequirement: DEFAULT_HISTORY_REQUIREMENT
        }];
      })
    : [];
  const formula = typeof record.formula === "string" && record.formula.trim() ? record.formula.trim() : "fault = evaluate(required_points, thresholds, window)";
  const parameters = Array.isArray(record.parameters)
    ? record.parameters.map(normalizeFddParameterSpec).filter((entry): entry is FddParameterSpec => entry !== null)
    : inferParameterSpecs(formula, method);
  return {
    name,
    equipmentType,
    faultType: typeof record.faultType === "string" && record.faultType.trim() ? record.faultType.trim() : "custom",
    method,
    ...(typeof record.categoryKey === "string" && record.categoryKey.trim() ? { categoryKey: record.categoryKey.trim() } : {}),
    ...(typeof record.categoryLabel === "string" && record.categoryLabel.trim() ? { categoryLabel: record.categoryLabel.trim() } : {}),
    formula,
    logicSummary: typeof record.logicSummary === "string" && record.logicSummary.trim() ? record.logicSummary.trim() : "User-provided FDD algorithm.",
    requiredPoints: requiredPoints.length > 0
      ? requiredPoints
      : [requiredPoint("primary_signal", "Primary signal", "Primary BMS point required by this FDD", [name])],
    outputs: FDD_OUTPUTS,
    parameters,
    sharingScope
  };
}

export function createFddAlgorithmFromInput(input: FddAlgorithmCreateInput, userId: string): FddAlgorithm {
  const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom_fdd";
  const category = inferredCategory({
    key,
    name: input.name,
    equipmentType: input.equipmentType,
    faultType: input.faultType,
    method: input.method,
    ...(input.categoryKey ? { categoryKey: input.categoryKey } : {}),
    ...(input.categoryLabel ? { categoryLabel: input.categoryLabel } : {}),
    points: input.requiredPoints,
    logic: input.logicSummary
  });
  return {
    id: `fddalg_${key}_${Date.now().toString(36)}`,
    scope: "global_community",
    algorithmKey: key,
    version: "v1",
    name: input.name,
    equipmentType: input.equipmentType,
    faultType: input.faultType,
    method: input.method,
    categoryKey: category.categoryKey,
    categoryLabel: category.categoryLabel,
    requiredPoints: input.requiredPoints,
    outputs: input.outputs ?? FDD_OUTPUTS,
    parameters: input.parameters ?? inferParameterSpecs(input.formula, input.method),
    formula: input.formula,
    logicSummary: input.logicSummary,
    authorUserId: userId,
    // Community formulas are specifications until an executable evaluator is
    // explicitly registered. Treating every rule-based upload as runnable can
    // create a "running" task that only emits no_data.
    deployableRuntime: false
  };
}
