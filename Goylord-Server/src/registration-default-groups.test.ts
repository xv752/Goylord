import { afterEach, describe, expect, test } from "bun:test";
import { getConfig, updateRegistrationConfig } from "./config";
import {
  approvePendingRegistration,
  createPendingRegistration,
  createPermissionGroup,
  deletePermissionGroup,
  deleteUser,
  getUserByUsername,
  getUserGrantedPermissions,
  getUserGroupIds,
  registerUser,
} from "./users";

const PASSWORD = "Aa1!RegDefaultGroupsTestPass";

const createdUserIds: number[] = [];
const createdGroupIds: number[] = [];
let savedDefaultGroupIds: number[] | null = null;

function tempGroup(name: string, permissions: string[]) {
  const result = createPermissionGroup(
    `${name}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    null,
    permissions,
    null,
  );
  expect(result.success).toBe(true);
  createdGroupIds.push(result.group!.id);
  return result.group!;
}

async function withDefaultGroupIds(ids: number[], fn: () => Promise<void>): Promise<void> {
  if (savedDefaultGroupIds === null) {
    savedDefaultGroupIds = [...(getConfig().registration.defaultGroupIds || [])];
  }
  await updateRegistrationConfig({ defaultGroupIds: ids });
  try {
    await fn();
  } finally {
    // restored in afterEach
  }
}

afterEach(async () => {
  if (savedDefaultGroupIds !== null) {
    await updateRegistrationConfig({ defaultGroupIds: savedDefaultGroupIds });
    savedDefaultGroupIds = null;
  }
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop();
    if (typeof id === "number") deleteUser(id);
  }
  while (createdGroupIds.length > 0) {
    const id = createdGroupIds.pop();
    if (typeof id === "number") deletePermissionGroup(id);
  }
});

describe("registration default groups", () => {
  test("registerUser assigns configured default groups", async () => {
    const g1 = tempGroup("default_a", ["clients:metadata"]);
    const g2 = tempGroup("default_b", ["clients:disconnect"]);

    await withDefaultGroupIds([g1.id, g2.id], async () => {
      const username = `regdg_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      const result = await registerUser(username, PASSWORD, "open", "operator");
      expect(result.success).toBe(true);
      createdUserIds.push(result.userId!);

      const assigned = new Set(getUserGroupIds(result.userId!));
      expect(assigned.has(g1.id)).toBe(true);
      expect(assigned.has(g2.id)).toBe(true);

      // The granted-permission union should include the group's perms.
      const granted = getUserGrantedPermissions(result.userId!);
      expect(granted.has("clients:metadata")).toBe(true);
      expect(granted.has("clients:disconnect")).toBe(true);
    });
  });

  test("approvePendingRegistration assigns configured default groups", async () => {
    const admin = await registerUser(
      `regdg_admin_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      PASSWORD,
      "open",
      "operator",
    );
    expect(admin.success).toBe(true);
    createdUserIds.push(admin.userId!);

    const g = tempGroup("approval_default", ["clients:metadata"]);

    await withDefaultGroupIds([g.id], async () => {
      const username = `regdg_pending_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: "bcrypt", cost: 10 });
      const pending = createPendingRegistration(username, passwordHash);
      expect(pending.success).toBe(true);

      const approval = await approvePendingRegistration(pending.id!, admin.userId!, "operator");
      expect(approval.success).toBe(true);
      createdUserIds.push(approval.userId!);

      const assigned = new Set(getUserGroupIds(approval.userId!));
      expect(assigned.has(g.id)).toBe(true);
    });
  });

  test("stale group ids in config are silently filtered (signup still succeeds)", async () => {
    const validGroup = tempGroup("valid_only", ["clients:metadata"]);

    // Use a definitely-nonexistent id alongside the valid one. Signup must NOT
    // fail just because one stale id is in the config.
    const STALE_ID = 9999999;
    await withDefaultGroupIds([STALE_ID, validGroup.id], async () => {
      const username = `regdg_stale_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      const result = await registerUser(username, PASSWORD, "open", "operator");
      expect(result.success).toBe(true);
      createdUserIds.push(result.userId!);

      const assigned = getUserGroupIds(result.userId!);
      expect(assigned).toContain(validGroup.id);
      expect(assigned).not.toContain(STALE_ID);
    });
  });

  test("empty defaultGroupIds leaves the new user with no groups", async () => {
    await withDefaultGroupIds([], async () => {
      const username = `regdg_empty_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      const result = await registerUser(username, PASSWORD, "open", "operator");
      expect(result.success).toBe(true);
      createdUserIds.push(result.userId!);
      expect(getUserGroupIds(result.userId!)).toEqual([]);
    });
  });
});
