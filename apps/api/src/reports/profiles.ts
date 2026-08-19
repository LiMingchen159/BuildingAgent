import type { EquipmentProfile, ReportAssetSourceKind } from "./contracts.js";

export const BRICK_NAMESPACE = "https://brickschema.org/schema/Brick#";

export interface EquipmentTypeMatcher {
  ruleId: string;
  sourceKind: ReportAssetSourceKind;
  /** Exact source type; no fuzzy or identifier-prefix inference is permitted. */
  sourceType: string;
}

export interface EquipmentProfileRegistration {
  profile: EquipmentProfile;
  matchers: EquipmentTypeMatcher[];
}

function freezeProfile(profile: EquipmentProfile): EquipmentProfile {
  Object.freeze(profile.fleetMetricKeys);
  Object.freeze(profile.fleetChartKeys);
  Object.freeze(profile.metricKeys);
  Object.freeze(profile.chartKeys);
  Object.freeze(profile.analysis);
  return Object.freeze(profile);
}

function freezeRegistration(registration: EquipmentProfileRegistration): EquipmentProfileRegistration {
  for (const matcher of registration.matchers) Object.freeze(matcher);
  Object.freeze(registration.matchers);
  return Object.freeze(registration);
}

const chillerProfile: EquipmentProfile = freezeProfile({
  profileId: "profile-chiller",
  version: 1,
  equipmentType: "chiller",
  groupTitle: "Chiller Performance",
  fleetMetricKeys: ["cooling_energy", "electricity", "average_cop", "average_plr"],
  fleetChartKeys: ["fleet_cop_comparison", "fleet_load_comparison"],
  metricKeys: ["runtime", "cooling_energy", "electricity", "average_cop", "average_plr", "starts"],
  chartKeys: ["cooling_load_and_power", "cop_trend", "plr_trend", "temperature_trend"],
  analysis: { performance: true, faultDiagnosis: true },
  order: 10
});

const chilledWaterPumpProfile: EquipmentProfile = freezeProfile({
  profileId: "profile-chilled-water-pump",
  version: 1,
  equipmentType: "chilled_water_pump",
  groupTitle: "Pump Performance",
  fleetMetricKeys: ["runtime", "electricity", "average_power"],
  fleetChartKeys: ["fleet_power_comparison"],
  metricKeys: ["runtime", "electricity", "average_power", "average_speed", "flow", "differential_pressure"],
  chartKeys: ["power_trend", "speed_trend", "flow_trend", "differential_pressure_trend"],
  analysis: { performance: true, faultDiagnosis: true },
  order: 20
});

/**
 * Versioned report profiles and exact source-type matchers. Adding a new asset
 * family is a registry change; the resolver never guesses from an equipment ID.
 */
export const DEFAULT_REPORT_EQUIPMENT_PROFILE_REGISTRY: EquipmentProfileRegistration[] = Object.freeze([
  freezeRegistration({
    profile: chillerProfile,
    matchers: [
      {
        ruleId: "brick-water-cooled-chiller-v1",
        sourceKind: "semantic_model",
        sourceType: `${BRICK_NAMESPACE}Water_Cooled_Chiller`
      },
      {
        ruleId: "brick-chiller-v1",
        sourceKind: "semantic_model",
        sourceType: `${BRICK_NAMESPACE}Chiller`
      },
      {
        ruleId: "project-chiller-v1",
        sourceKind: "project_metadata",
        sourceType: "chiller"
      },
      {
        ruleId: "bms-chiller-v1",
        sourceKind: "bms_metadata",
        sourceType: "chiller"
      }
    ]
  }),
  freezeRegistration({
    profile: chilledWaterPumpProfile,
    matchers: [
      {
        ruleId: "brick-chilled-water-pump-v1",
        sourceKind: "semantic_model",
        sourceType: `${BRICK_NAMESPACE}Chilled_Water_Pump`
      },
      {
        ruleId: "project-chilled-water-pump-v1",
        sourceKind: "project_metadata",
        sourceType: "chilled_water_pump"
      },
      {
        ruleId: "bms-chilled-water-pump-v1",
        sourceKind: "bms_metadata",
        sourceType: "chilled_water_pump"
      }
    ]
  })
]) as unknown as EquipmentProfileRegistration[];
