const EXECUTABLE_FDD_ALGORITHM_KEYS = new Set<string>([
  "chiller_low_chw_delta_t",
  "chiller_chw_flow_proving_fault",
  "chiller_cooling_load_plausibility",
  "chiller_status_consistency",
  "chiller_ch_01_commanded_fails_to_start",
  "chiller_ch_02_uncommanded_operation",
  "chiller_ch_03_abnormal_shutdown",
  "chiller_ch_04_running_no_cooling_output",
  "chiller_ch_05_prolonged_low_load",
  "chiller_ch_06_loading_response_fault",
  "chiller_ch_07_unloading_failure",
  "chiller_ch_08_high_chw_supply_temp",
  "chiller_ch_09_low_chw_supply_temp",
  "chiller_ch_10_insufficient_capacity",
  "chiller_ch_11_chw_supply_temp_hunting",
  "chiller_ch_12_insufficient_chw_flow",
  "chiller_ch_13_excessive_chw_flow",
  "chiller_ch_14_low_chw_delta_t",
  "chiller_ch_15_high_chw_delta_t",
  "chiller_ch_16_high_evaporator_pressure",
  "chiller_ch_17_low_evaporator_pressure",
  "chiller_ch_18_evaporator_heat_transfer_degradation",
  "chiller_ch_19_chw_freezing_risk",
  "chiller_ch_20_chw_flow_while_off",
  "chiller_ch_21_reversed_chw_delta_t",
  "chiller_ch_22_high_condenser_entering_water_temp",
  "chiller_ch_23_low_condenser_entering_water_temp",
  "chiller_ch_24_insufficient_cw_flow",
  "chiller_ch_25_excessive_cw_flow",
  "chiller_ch_26_condenser_heat_transfer_degradation",
  "chiller_ch_27_high_condensing_pressure",
  "chiller_ch_28_low_condensing_pressure",
  "chiller_ch_29_low_condenser_water_delta_t",
  "chiller_ch_30_high_condenser_water_delta_t",
  "chiller_ch_31_low_suction_pressure",
  "chiller_ch_32_high_suction_pressure",
  "chiller_ch_33_high_discharge_pressure",
  "chiller_ch_34_low_discharge_pressure",
  "chiller_ch_35_refrigerant_undercharge_or_leak",
  "chiller_ch_36_refrigerant_overcharge",
  "chiller_ch_37_exv_underfeeding_or_stuck_closed",
  "chiller_ch_38_exv_overfeeding_or_stuck_open",
  "chiller_ch_39_compressor_overload",
  "chiller_ch_40_low_chw_setpoint",
  "chiller_ch_41_high_chw_setpoint",
  "chiller_ch_42_chw_setpoint_reset_failure",
  "chiller_ch_43_chw_supply_temp_sensor_fault",
  "chiller_ch_44_chw_return_temp_sensor_fault",
  "chiller_ch_45_chw_flow_sensor_fault",
  "chiller_ch_46_cw_supply_temp_sensor_fault",
  "chiller_ch_47_cw_return_temp_sensor_fault",
  "chiller_ch_48_cw_flow_sensor_fault",
  "chiller_ch_49_chw_differential_pressure_sensor_fault",
  "chiller_ch_50_cw_differential_pressure_sensor_fault",
  "chiller_ch_51_heat_balance_sensor_consistency",
  "sensor_chw_supply_temp_flatline",
  "sensor_chw_return_temp_flatline",
  "sensor_chw_flow_flatline",
  "chiller_low_cop_detection"
]);

export function hasExecutableFddEvaluator(algorithmKey: string): boolean {
  return EXECUTABLE_FDD_ALGORITHM_KEYS.has(algorithmKey);
}

export function isExecutableFddAlgorithm(algorithm: {
  scope: string;
  algorithmKey: string;
  deployableRuntime: boolean;
}): boolean {
  return algorithm.scope === "global_builtin"
    && algorithm.deployableRuntime
    && hasExecutableFddEvaluator(algorithm.algorithmKey);
}

export function executableFddAlgorithmKeys(): string[] {
  return [...EXECUTABLE_FDD_ALGORITHM_KEYS].sort();
}
