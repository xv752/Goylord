import { describe, expect, test } from "bun:test";
import {
  ALL_FEATURES,
  canUserAccessFeature,
  createUser,
  deleteUser,
  getUserByUsername,
  getUserFeaturePermissions,
  resetUserFeaturePermissions,
  setUserFeaturePermission,
  setUserFeaturePermissions,
  type FeatureName,
} from "./users";

const createdUserIds: number[] = [];

async function createTempUser(role: "viewer" | "operator" | "admin") {
  const username = `fp_${role.slice(0, 3)}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
  const result = await createUser(username, "Aa1!VeryLongTestPassword_2026", role, "test");
  expect(result.success).toBe(true);
  const user = getUserByUsername(username);
  expect(user).not.toBeNull();
  createdUserIds.push(user!.id);
  return user!;
}

function cleanupCreatedUsers() {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop();
    if (typeof id === "number") {
      deleteUser(id);
    }
  }
}

describe("feature permissions", () => {
  test("ALL_FEATURES contains the expected feature keys", () => {
    expect(ALL_FEATURES).toEqual([
      "console",
      "remote_desktop",
      "backstage",
      "webcam",
      "file_browser",
      "processes",
      "keylogger",
      "voice",
      "disconnect",
      "reconnect",
      "uninstall",
      "client_metadata",
    ]);
  });

  test("admin always has every feature regardless of stored overrides", async () => {
    try {
      const admin = await createTempUser("admin");

      for (const f of ALL_FEATURES) {
        expect(canUserAccessFeature(admin.id, admin.role, f)).toBe(true);
      }

      // Even an explicit deny is ignored for admin role.
      setUserFeaturePermission(admin.id, "webcam", false);
      expect(canUserAccessFeature(admin.id, "admin", "webcam")).toBe(true);
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("viewer is denied every feature regardless of stored overrides", async () => {
    try {
      const viewer = await createTempUser("viewer");

      for (const f of ALL_FEATURES) {
        expect(canUserAccessFeature(viewer.id, viewer.role, f)).toBe(false);
      }

      // Granting access to a viewer at the per-feature level does not promote them.
      setUserFeaturePermission(viewer.id, "console", true);
      expect(canUserAccessFeature(viewer.id, "viewer", "console")).toBe(false);
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("operator defaults to having every feature enabled", async () => {
    try {
      const operator = await createTempUser("operator");

      for (const f of ALL_FEATURES) {
        expect(canUserAccessFeature(operator.id, operator.role, f)).toBe(true);
      }
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("setUserFeaturePermission disables a single feature for an operator", async () => {
    try {
      const operator = await createTempUser("operator");

      const result = setUserFeaturePermission(operator.id, "webcam", false);
      expect(result.success).toBe(true);

      expect(canUserAccessFeature(operator.id, operator.role, "webcam")).toBe(false);
      // Other features remain enabled.
      expect(canUserAccessFeature(operator.id, operator.role, "console")).toBe(true);
      expect(canUserAccessFeature(operator.id, operator.role, "file_browser")).toBe(true);
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("setUserFeaturePermission can re-enable a previously denied feature", async () => {
    try {
      const operator = await createTempUser("operator");

      setUserFeaturePermission(operator.id, "backstage", false);
      expect(canUserAccessFeature(operator.id, operator.role, "backstage")).toBe(false);

      setUserFeaturePermission(operator.id, "backstage", true);
      expect(canUserAccessFeature(operator.id, operator.role, "backstage")).toBe(true);
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("setUserFeaturePermissions applies a bulk update", async () => {
    try {
      const operator = await createTempUser("operator");

      const result = setUserFeaturePermissions(operator.id, {
        webcam: false,
        file_browser: false,
        keylogger: true,
      });
      expect(result.success).toBe(true);

      expect(canUserAccessFeature(operator.id, operator.role, "webcam")).toBe(false);
      expect(canUserAccessFeature(operator.id, operator.role, "file_browser")).toBe(false);
      expect(canUserAccessFeature(operator.id, operator.role, "keylogger")).toBe(true);
      // Untouched features keep their default (allowed).
      expect(canUserAccessFeature(operator.id, operator.role, "console")).toBe(true);
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("setUserFeaturePermissions ignores unknown feature keys", async () => {
    try {
      const operator = await createTempUser("operator");

      const result = setUserFeaturePermissions(operator.id, {
        webcam: false,
        // @ts-expect-error intentionally unknown feature key
        not_a_feature: true,
      });
      expect(result.success).toBe(true);

      const perms = getUserFeaturePermissions(operator.id);
      expect(perms.webcam).toBe(false);
      // Unknown keys never get persisted.
      expect((perms as any).not_a_feature).toBeUndefined();
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("setUserFeaturePermission rejects invalid feature names", async () => {
    try {
      const operator = await createTempUser("operator");

      const result = setUserFeaturePermission(
        operator.id,
        "not_a_feature" as FeatureName,
        false,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid feature");
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("getUserFeaturePermissions returns role-derived values", async () => {
    try {
      const admin = await createTempUser("admin");
      const operator = await createTempUser("operator");
      const viewer = await createTempUser("viewer");

      const adminPerms = getUserFeaturePermissions(admin.id);
      const operatorPerms = getUserFeaturePermissions(operator.id);
      const viewerPerms = getUserFeaturePermissions(viewer.id);

      for (const f of ALL_FEATURES) {
        expect(adminPerms[f]).toBe(true);
        expect(operatorPerms[f]).toBe(true);
        expect(viewerPerms[f]).toBe(false);
      }

      // After a deny, the operator's map reflects it.
      setUserFeaturePermission(operator.id, "processes", false);
      const updated = getUserFeaturePermissions(operator.id);
      expect(updated.processes).toBe(false);
      expect(updated.console).toBe(true);
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("resetUserFeaturePermissions restores defaults (all enabled for operator)", async () => {
    try {
      const operator = await createTempUser("operator");

      setUserFeaturePermissions(operator.id, {
        webcam: false,
        file_browser: false,
        keylogger: false,
      });
      expect(canUserAccessFeature(operator.id, operator.role, "webcam")).toBe(false);

      const result = resetUserFeaturePermissions(operator.id);
      expect(result.success).toBe(true);

      for (const f of ALL_FEATURES) {
        expect(canUserAccessFeature(operator.id, operator.role, f)).toBe(true);
      }
    } finally {
      cleanupCreatedUsers();
    }
  });

  test("getUserFeaturePermissions for a missing user returns all-false", () => {
    const perms = getUserFeaturePermissions(0);
    for (const f of ALL_FEATURES) {
      expect(perms[f]).toBe(false);
    }
  });

  test("feature denials are scoped to the affected user", async () => {
    try {
      const a = await createTempUser("operator");
      const b = await createTempUser("operator");

      setUserFeaturePermission(a.id, "webcam", false);

      expect(canUserAccessFeature(a.id, a.role, "webcam")).toBe(false);
      expect(canUserAccessFeature(b.id, b.role, "webcam")).toBe(true);
    } finally {
      cleanupCreatedUsers();
    }
  });
});
