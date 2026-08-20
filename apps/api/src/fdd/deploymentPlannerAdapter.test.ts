import { describe, expect, it } from "vitest";
import { fddDeployabilityCheckIsTaskReady } from "./deploymentPlannerAdapter.js";

describe("fddDeployabilityCheckIsTaskReady", () => {
  it("uses an authorized FleetGuard Ready result even when legacy v4 is uncertain", () => {
    expect(fddDeployabilityCheckIsTaskReady({
      status: "uncertain",
      fleetGuard: { state: "ready", authorization: { policyVersion: "fleetguard-v1" } }
    })).toBe(true);
  });

  it("uses FleetGuard Blocked even when legacy v4 says can_deploy", () => {
    expect(fddDeployabilityCheckIsTaskReady({
      status: "can_deploy",
      fleetGuard: { state: "blocked" }
    })).toBe(false);
  });
});
