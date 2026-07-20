import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import BuildView from "@/views/BuildView.vue";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory("/app/"),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/app/build", name: "build", component: BuildView },
      { path: "/login", name: "login", component: { template: "<div />" } },
    ],
  });
}

function mountBuild() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = makeRouter();
  router.push("/app/build");
  return mount(BuildView, {
    global: {
      plugins: [pinia, router],
    },
    attachTo: document.body,
  });
}

const PLATFORM_VALUES = [
  "windows-amd64", "windows-386", "windows-arm64",
  "linux-amd64", "linux-arm64", "linux-armv7",
  "darwin-amd64", "darwin-arm64",
  "freebsd-amd64", "freebsd-arm64",
  "android-arm64", "android-amd64", "android-armv7",
  "ios-arm64", "ios-amd64",
];

function findPlatformDivs(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button[data-platform]');
}

function findPlatformDiv(wrapper: ReturnType<typeof mount>, platformValue: string) {
  return wrapper.find(`button[data-platform="${platformValue}"]`);
}

function findTabButton(wrapper: ReturnType<typeof mount>, name: string) {
  return wrapper.findAll("button").find((b) => b.text().toLowerCase().includes(name));
}

function expectBuilderAlive(wrapper: ReturnType<typeof mount>) {
  const html = wrapper.html();
  expect(html).toContain("Builder");
  expect(html).toContain("hammer");
  expect(html.length).toBeGreaterThan(200);
}

describe("BuildView — realistic browser click interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("platform clicks (simulates real browser click on platform div)", () => {
    it("clicking a platform div toggles selection AND preserves all UI", async () => {
      const wrapper = mountBuild();
      expect(findPlatformDivs(wrapper).length).toBe(15);

      const linuxDiv = findPlatformDiv(wrapper, "linux-amd64");
      expect(linuxDiv).toBeDefined();

      await linuxDiv!.trigger("click");
      await flushPromises();

      expectBuilderAlive(wrapper);
      expect(findPlatformDivs(wrapper).length).toBe(15);

      // The Linux platform should now be selected (aria-checked="true")
      expect(linuxDiv!.attributes("aria-checked")).toBe("true");
      wrapper.unmount();
    });

    it("clicking every platform one-by-one never causes disappearance", async () => {
      const wrapper = mountBuild();

      for (const val of PLATFORM_VALUES) {
        const div = findPlatformDiv(wrapper, val);
        expect(div, `Platform div for ${val} should exist`).toBeDefined();

        await div!.trigger("click");
        await flushPromises();

        // Critical: after EVERY click, the builder must still be alive
        expectBuilderAlive(wrapper);
        expect(findPlatformDivs(wrapper).length).toBe(15);
      }
      wrapper.unmount();
    });

    it("clicking same platform twice toggles it back", async () => {
      const wrapper = mountBuild();

      const linuxDiv = findPlatformDiv(wrapper, "linux-amd64")!;

      // First click: select
      await linuxDiv.trigger("click");
      await flushPromises();
      expect(linuxDiv.attributes("aria-checked")).toBe("true");

      // Second click: deselect
      await linuxDiv.trigger("click");
      await flushPromises();
      expect(linuxDiv.attributes("aria-checked")).toBe("false");

      expectBuilderAlive(wrapper);
      wrapper.unmount();
    });

    it("selecting ALL platforms and then deselecting ALL does not crash", async () => {
      const wrapper = mountBuild();

      // First, deselect the pre-selected windows-amd64 so all start unchecked
      const winDiv = findPlatformDiv(wrapper, "windows-amd64")!;
      if (winDiv.attributes("aria-checked") === "true") {
        await winDiv.trigger("click");
        await flushPromises();
      }

      // Now select all
      for (const val of PLATFORM_VALUES) {
        const div = findPlatformDiv(wrapper, val)!;
        if (div.attributes("aria-checked") !== "true") {
          await div.trigger("click");
          await flushPromises();
        }
      }

      // Verify all checked
      for (const val of PLATFORM_VALUES) {
        expect(findPlatformDiv(wrapper, val)!.attributes("aria-checked")).toBe("true");
      }

      // Deselect all
      for (const val of PLATFORM_VALUES) {
        const div = findPlatformDiv(wrapper, val)!;
        await div.trigger("click");
        await flushPromises();
      }

      // Verify all unchecked
      for (const val of PLATFORM_VALUES) {
        expect(findPlatformDiv(wrapper, val)!.attributes("aria-checked")).toBe("false");
      }

      expectBuilderAlive(wrapper);
      wrapper.unmount();
    });
  });

  describe("tab switching preserves all content", () => {
    it("clicking each tab button keeps builder alive", async () => {
      const wrapper = mountBuild();

      for (const tab of ["target", "connection", "features", "packaging"]) {
        const btn = findTabButton(wrapper, tab)!;
        await btn.trigger("click");
        await flushPromises();
        expectBuilderAlive(wrapper);
      }
      wrapper.unmount();
    });

    it("rapid tab switching 20 times does not crash", async () => {
      const wrapper = mountBuild();
      const tabs = ["target", "connection", "features", "packaging"];

      for (let i = 0; i < 20; i++) {
        const tab = tabs[i % tabs.length];
        const btn = findTabButton(wrapper, tab)!;
        await btn.trigger("click");
        await flushPromises();
      }

      expectBuilderAlive(wrapper);
      expect(findPlatformDivs(wrapper).length).toBe(15);
      wrapper.unmount();
    });
  });

  describe("combined interactions (click platform + switch tabs)", () => {
    it("select platform -> switch to features -> switch back -> platform still selected", async () => {
      const wrapper = mountBuild();

      // Select Linux
      const linuxDiv = findPlatformDiv(wrapper, "linux-amd64")!;
      await linuxDiv.trigger("click");
      await flushPromises();
      expect(linuxDiv.attributes("aria-checked")).toBe("true");

      // Switch to features
      await findTabButton(wrapper, "features")!.trigger("click");
      await flushPromises();
      expectBuilderAlive(wrapper);

      // Switch back to target
      await findTabButton(wrapper, "target")!.trigger("click");
      await flushPromises();

      // Linux should still be selected
      expect(findPlatformDiv(wrapper, "linux-amd64")!.attributes("aria-checked")).toBe("true");
      expect(findPlatformDivs(wrapper).length).toBe(15);
      wrapper.unmount();
    });

    it("select platforms -> switch tabs -> toggle features -> back to target", async () => {
      const wrapper = mountBuild();

      // Deselect pre-selected windows-amd64 first
      const winDiv = findPlatformDiv(wrapper, "windows-amd64")!;
      if (winDiv.attributes("aria-checked") === "true") {
        await winDiv.trigger("click");
        await flushPromises();
      }

      // Select 3 platforms via clicks (all start unchecked now)
      await findPlatformDiv(wrapper, "windows-amd64")!.trigger("click");
      await findPlatformDiv(wrapper, "linux-amd64")!.trigger("click");
      await findPlatformDiv(wrapper, "darwin-arm64")!.trigger("click");
      await flushPromises();

      // Switch to features, toggle something
      await findTabButton(wrapper, "features")!.trigger("click");
      await flushPromises();
      const toggles = wrapper.findAll("button.toggle");
      if (toggles.length > 0) await toggles[0].trigger("click");
      await flushPromises();

      // Switch to connection
      await findTabButton(wrapper, "connection")!.trigger("click");
      await flushPromises();

      // Back to target
      await findTabButton(wrapper, "target")!.trigger("click");
      await flushPromises();

      // All selections preserved
      expect(findPlatformDiv(wrapper, "windows-amd64")!.attributes("aria-checked")).toBe("true");
      expect(findPlatformDiv(wrapper, "linux-amd64")!.attributes("aria-checked")).toBe("true");
      expect(findPlatformDiv(wrapper, "darwin-arm64")!.attributes("aria-checked")).toBe("true");
      expectBuilderAlive(wrapper);
      wrapper.unmount();
    });
  });

  describe("toggle button clicks", () => {
    it("clicking toggle buttons in features tab preserves everything", async () => {
      const wrapper = mountBuild();

      await findTabButton(wrapper, "features")!.trigger("click");
      await flushPromises();

      const toggles = wrapper.findAll("button.toggle");
      expect(toggles.length).toBeGreaterThan(0);

      // Click each toggle
      for (const toggle of toggles) {
        await toggle.trigger("click");
        await flushPromises();
        expectBuilderAlive(wrapper);
      }
      wrapper.unmount();
    });

    it("clicking toggle buttons in packaging tab preserves everything", async () => {
      const wrapper = mountBuild();

      await findTabButton(wrapper, "packaging")!.trigger("click");
      await flushPromises();

      const toggles = wrapper.findAll("button.toggle");
      for (const toggle of toggles) {
        await toggle.trigger("click");
        await flushPromises();
        expectBuilderAlive(wrapper);
      }
      wrapper.unmount();
    });
  });

  describe("action buttons", () => {
    it("Start Build button is present and disabled when no platforms", async () => {
      const wrapper = mountBuild();

      // Deselect all platforms by clicking each div
      for (const val of PLATFORM_VALUES) {
        const div = findPlatformDiv(wrapper, val);
        if (div && div.attributes("aria-checked") === "true") {
          await div.trigger("click");
          await flushPromises();
        }
      }

      const buildBtn = wrapper.findAll("button").find((b) => b.text().includes("Start Build"))!;
      expect(buildBtn.attributes("disabled")).toBeDefined();
      wrapper.unmount();
    });

    it("Build & Upload button exists", () => {
      const wrapper = mountBuild();
      const btn = wrapper.findAll("button").find((b) => b.text().includes("Build & Upload"));
      expect(btn).toBeDefined();
      wrapper.unmount();
    });

    it("profile buttons exist", () => {
      const wrapper = mountBuild();
      const buttons = wrapper.findAll("button");
      expect(buttons.find((b) => b.text().includes("Save"))).toBeDefined();
      wrapper.unmount();
    });
  });

  describe("no console errors during interactions", () => {
    it("selecting platforms does not emit console errors", async () => {
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));

      const wrapper = mountBuild();

      for (const val of PLATFORM_VALUES) {
        const div = findPlatformDiv(wrapper, val)!;
        await div.trigger("click");
        await flushPromises();
      }

      console.error = origError;
      expect(errors).toEqual([]);
      wrapper.unmount();
    });

    it("tab switching does not emit console errors", async () => {
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));

      const wrapper = mountBuild();

      for (let i = 0; i < 5; i++) {
        for (const tab of ["target", "connection", "features", "packaging"]) {
          const btn = findTabButton(wrapper, tab)!;
          await btn.trigger("click");
          await flushPromises();
        }
      }

      console.error = origError;
      expect(errors).toEqual([]);
      wrapper.unmount();
    });
  });
});
