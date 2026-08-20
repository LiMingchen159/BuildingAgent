import { describe, expect, it } from "vitest";
import { createSeedStore } from "../seed.js";
import {
  createFddFleetGuardRolloutBindings,
  fddFleetGuardGlobalConfigFromEnv,
  isFddFleetGuardCanarySelected
} from "./fleetGuardRollout.js";

describe("FleetGuard canary rollout", () => {
  it("is default-off and requires both global and project/algorithm gates", () => {
    const store = createSeedStore();
    const bindings = createFddFleetGuardRolloutBindings(store, { now: () => "2026-08-20T00:00:00.000Z" });
    expect(bindings.get("project_element")).toMatchObject({ mode: "off", algorithmKeys: [], revision: 0 });
    const rollout = bindings.update("project_element", "admin", {
      baseRevision: 0,
      mode: "canary",
      algorithmKeys: ["chiller_ch_01_commanded_fails_to_start"]
    });
    expect(isFddFleetGuardCanarySelected({
      global: fddFleetGuardGlobalConfigFromEnv({}),
      rollout,
      algorithmKey: rollout.algorithmKeys[0]!
    })).toBe(false);
    expect(isFddFleetGuardCanarySelected({
      global: fddFleetGuardGlobalConfigFromEnv({ BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary" }),
      rollout,
      algorithmKey: rollout.algorithmKeys[0]!
    })).toBe(true);
  });

  it("uses revision CAS", () => {
    const bindings = createFddFleetGuardRolloutBindings(createSeedStore());
    bindings.update("project_element", "admin", { baseRevision: 0, mode: "off", algorithmKeys: [] });
    expect(() => bindings.update("project_element", "admin", { baseRevision: 0, mode: "canary", algorithmKeys: [] }))
      .toThrowError(/changed/u);
  });
});
