import { createHash } from "node:crypto";

export interface MinimalBrickFact {
  subjectKey: string;
  brickClass: string;
  label?: string;
  parentEntityKey?: string;
  unit?: string;
}

export interface FddInventoryAvailabilityEvidence {
  equipmentType: string;
  status: string;
  entityKeys?: string[];
}

export interface FddInventoryEquipmentEvidence {
  entityKey: string;
  equipmentType: string;
  brickClass: string;
}

export interface FddInventoryPointEvidence {
  subjectKey?: string;
  pointName: string;
  parentEntityKey: string;
  brickClass: string;
  unit?: string;
}

function unescapeTurtleString(value: string): string {
  return value.replace(/\\"/gu, "\"").replace(/\\\\/gu, "\\");
}

/**
 * Parses the deliberately small Turtle subset used by project Brick models.
 * It is not an RDF implementation; it recognizes one prefixed subject and one
 * `a brick:Class` per statement, plus label, isPointOf, and unit evidence.
 */
export function parseMinimalBrickFacts(ttl: string): MinimalBrickFact[] {
  const facts: MinimalBrickFact[] = [];
  const lines = ttl.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const start = /^\s*[A-Za-z][\w-]*:(?<local>[A-Za-z0-9_.-]+)\s+a\s+brick:(?<brickClass>[A-Za-z0-9_]+)(?:\s*[;,.]|\s*$)/u.exec(line);
    if (!start?.groups?.local || !start.groups.brickClass) continue;
    const blockLines = [line];
    while (!blockLines.at(-1)?.trimEnd().endsWith(".") && index + 1 < lines.length) {
      index += 1;
      blockLines.push(lines[index] ?? "");
    }
    const block = blockLines.join("\n");
    const labelMatch = /rdfs:label\s+"(?<label>[^"\\]*(?:\\.[^"\\]*)*)"/u.exec(block)?.groups?.label;
    const parentEntityKey = /brick:isPointOf\s+[A-Za-z][\w-]*:(?<local>[A-Za-z0-9_.-]+)/u.exec(block)?.groups?.local;
    const literalUnit = /(?:^|\s)[A-Za-z][\w-]*:unitHint\s+"(?<unit>[^"\\]+)"/u.exec(block)?.groups?.unit;
    const referencedUnit = /brick:hasUnit\s+[A-Za-z][\w-]*:(?<unit>[A-Za-z0-9_.-]+)/u.exec(block)?.groups?.unit;
    const label = labelMatch ? unescapeTurtleString(labelMatch).trim() : undefined;
    const unit = (literalUnit ?? referencedUnit)?.trim();
    facts.push({
      subjectKey: start.groups.local,
      brickClass: start.groups.brickClass,
      ...(label ? { label } : {}),
      ...(parentEntityKey ? { parentEntityKey } : {}),
      ...(unit ? { unit } : {})
    });
  }
  return facts;
}

export function fddKbSummaryHasCompleteEquipmentInventory(summaryText: string): boolean {
  return /^\s*#{1,6}\s+(?:\d+(?:\.\d+)*\.?\s+)?(?:full(?:[\s-]+)point\s+directory|full(?:[\s-]+)plant\s+brick\s+model|full\s+equipment\s+inventory)\b/imu.test(summaryText);
}

function compactUnit(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/degrees?/gu, "deg")
    .replace(/\s+/gu, "")
    .replace(/[·⋅]/gu, "")
    .replace(/³/gu, "3")
    .replace(/²/gu, "2")
    .replace(/\^/gu, "");
}

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  c: "degc",
  "°c": "degc",
  degc: "degc",
  degcelsius: "degc",
  celsius: "degc",
  f: "degf",
  "°f": "degf",
  degf: "degf",
  degfahrenheit: "degf",
  fahrenheit: "degf",
  w: "w",
  watt: "w",
  watts: "w",
  kw: "kw",
  kilowatt: "kw",
  kilowatts: "kw",
  mw: "mw",
  megawatt: "mw",
  megawatts: "mw",
  a: "a",
  amp: "a",
  amps: "a",
  ampere: "a",
  amperes: "a",
  "%": "%",
  pct: "%",
  percent: "%",
  percentage: "%",
  "%rh": "%rh",
  rh: "%rh",
  ratio: "ratio",
  dimensionless: "ratio",
  "1": "ratio",
  "m3/h": "m3/h",
  "m3/hr": "m3/h",
  "m3/hour": "m3/h",
  m3perhour: "m3/h",
  "m3/s": "m3/s",
  "m3/sec": "m3/s",
  "m3/second": "m3/s",
  m3persecond: "m3/s",
  "l/s": "l/s",
  "l/sec": "l/s",
  "l/second": "l/s",
  lpersecond: "l/s",
  lps: "l/s",
  cfm: "cfm",
  gpm: "gpm",
  pa: "pa",
  kpa: "kpa",
  bar: "bar",
  psi: "psi",
  inh2o: "inh2o",
  hz: "hz",
  rpm: "rpm",
  m: "m",
  cm: "cm",
  mm: "mm",
  ppm: "ppm",
  ppb: "ppb",
  rt: "rt",
  ton: "rt",
  tons: "rt",
  refrigerationton: "rt",
  refrigerationtons: "rt"
};

/** Normalizes spelling/symbol aliases only. It intentionally performs no conversion. */
export function normalizeFddEngineeringUnit(unit: string): string {
  const compact = compactUnit(unit);
  return UNIT_ALIASES[compact] ?? compact;
}

export function fddEngineeringUnitIsAccepted(actualUnit: string, acceptableUnits: string[]): boolean {
  const actual = normalizeFddEngineeringUnit(actualUnit);
  return acceptableUnits.some((acceptable) => normalizeFddEngineeringUnit(acceptable) === actual);
}

function normalizeInventoryEvidence(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toUpperCase();
}

export function fddInventoryEvidenceSignature(input: {
  authoritativeInventory: boolean;
  availability: FddInventoryAvailabilityEvidence[];
  equipment: FddInventoryEquipmentEvidence[];
  points: FddInventoryPointEvidence[];
}): string {
  const evidence = [
    `AUTHORITATIVE:${input.authoritativeInventory ? "YES" : "NO"}`,
    ...input.availability.map((entry) => [
      "AVAILABILITY",
      normalizeInventoryEvidence(entry.equipmentType),
      normalizeInventoryEvidence(entry.status),
      [...new Set(entry.entityKeys ?? [])].map(normalizeInventoryEvidence).sort().join(",")
    ].join(":")),
    ...input.equipment.map((entry) => [
      "EQUIPMENT",
      normalizeInventoryEvidence(entry.equipmentType),
      normalizeInventoryEvidence(entry.entityKey),
      normalizeInventoryEvidence(entry.brickClass)
    ].join(":")),
    ...input.points.map((entry) => [
      "POINT",
      normalizeInventoryEvidence(entry.subjectKey),
      normalizeInventoryEvidence(entry.pointName),
      normalizeInventoryEvidence(entry.parentEntityKey),
      normalizeInventoryEvidence(entry.brickClass),
      normalizeFddEngineeringUnit(entry.unit ?? "")
    ].join(":"))
  ].sort();
  return `sha256:${createHash("sha256").update(evidence.join("\n"), "utf8").digest("hex")}`;
}
