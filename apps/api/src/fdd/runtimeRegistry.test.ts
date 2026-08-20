import { describe, expect, it } from "vitest";
import {
  fddEvaluatorRegistrationCanonicalSignature,
  fleetGuardEvaluatorRegistration,
  fleetGuardEvaluatorRegistrations,
  hasExecutableFddEvaluator
} from "./runtimeRegistry.js";

describe("versioned FleetGuard evaluator registry", () => {
  it("registers only CH-01/02/03 with explicit handler versions", () => {
    const registrations = fleetGuardEvaluatorRegistrations();
    expect(registrations.map((entry) => entry.algorithmKey)).toEqual([
      "chiller_ch_01_commanded_fails_to_start",
      "chiller_ch_02_uncommanded_operation",
      "chiller_ch_03_abnormal_shutdown"
    ]);
    expect(new Set(registrations.map((entry) => entry.evaluatorVersion)).size).toBe(3);
    expect(registrations.every((entry) => entry.handler === "evaluateFddRuleSample" && hasExecutableFddEvaluator(entry.algorithmKey))).toBe(true);
    expect(fleetGuardEvaluatorRegistration("chiller_ch_04_running_no_cooling_output")).toBeUndefined();
  });

  it("includes the real evaluator version in its canonical signature", () => {
    const registration = fleetGuardEvaluatorRegistration("chiller_ch_01_commanded_fails_to_start")!;
    expect(fddEvaluatorRegistrationCanonicalSignature(registration)).toContain("ch01-command-state-v1");
  });
});
