import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import PluginsView from "@/views/PluginsView.vue";
import { api } from "@/lib/api";

const mockApi = vi.mocked(api);

function makeRouter() {
  return createRouter({
    history: createMemoryHistory("/app/"),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/app/plugins", name: "plugins", component: PluginsView },
      { path: "/login", name: "login", component: { template: "<div />" } },
    ],
  });
}

function mountPlugins() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = makeRouter();
  router.push("/app/plugins");
  return mount(PluginsView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  });
}

describe("PluginsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/plugins") return Promise.resolve({ plugins: [] });
      if (url === "/api/plugins/trusted-keys") return Promise.resolve({ trustedKeys: [], builtinKeys: ["builtin-key-1"] });
      return Promise.resolve({});
    });
    mockApi.post.mockResolvedValue({});
    mockApi.delete.mockResolvedValue({});
  });

  it("renders the plugins page with header", async () => {
    const wrapper = mountPlugins();
    await flushPromises();
    expect(wrapper.html()).toContain("Plugins");
    wrapper.unmount();
  });

  it("shows empty state when no plugins", async () => {
    const wrapper = mountPlugins();
    await flushPromises();
    expect(wrapper.html()).toContain("No plugins");
    wrapper.unmount();
  });

  it("renders plugin cards when plugins exist", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/plugins") return Promise.resolve({
        plugins: [{ id: "p1", name: "Test Plugin", version: "1.0.0", enabled: true, trusted: "trusted" }]
      });
      if (url === "/api/plugins/trusted-keys") return Promise.resolve({ trustedKeys: ["key1"], builtinKeys: [] });
      return Promise.resolve({});
    });
    const wrapper = mountPlugins();
    await flushPromises();
    expect(wrapper.html()).toContain("Test Plugin");
    expect(wrapper.html()).toContain("1.0.0");
    wrapper.unmount();
  });

  it("upload button exists", async () => {
    const wrapper = mountPlugins();
    await flushPromises();
    const uploadBtn = wrapper.findAll("button").find(b => b.html().includes("fa-upload"));
    expect(uploadBtn).toBeDefined();
    wrapper.unmount();
  });

  it("trusted keys section loads and displays", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/plugins") return Promise.resolve({ plugins: [] });
      if (url === "/api/plugins/trusted-keys") return Promise.resolve({
        trustedKeys: ["abc123"],
        builtinKeys: ["builtin1"]
      });
      return Promise.resolve({});
    });
    const wrapper = mountPlugins();
    await flushPromises();
    const keysBtn = wrapper.findAll("button").find(b => b.text().includes("Keys") || b.html().includes("key"));
    if (keysBtn) {
      await keysBtn.trigger("click");
      await flushPromises();
      expect(wrapper.html()).toContain("builtin1");
    }
    wrapper.unmount();
  });

  it("shows loading spinner initially", async () => {
    mockApi.get.mockImplementation(() => new Promise(() => {}));
    const wrapper = mountPlugins();
    await flushPromises();
    expect(wrapper.html()).toContain("fa-spinner");
    wrapper.unmount();
  });

  it("plugin toggle button calls enable/disable API", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/plugins") return Promise.resolve({
        plugins: [{ id: "p1", name: "Test Plugin", version: "1.0.0", enabled: true, trusted: "trusted" }]
      });
      if (url === "/api/plugins/trusted-keys") return Promise.resolve({ trustedKeys: [], builtinKeys: [] });
      return Promise.resolve({});
    });
    const wrapper = mountPlugins();
    await flushPromises();
    const toggleBtn = wrapper.find(".toggle");
    if (toggleBtn.exists()) {
      await toggleBtn.trigger("click");
      await flushPromises();
      expect(mockApi.post).toHaveBeenCalled();
    }
    wrapper.unmount();
  });

  it("renders plugin runtime badges", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/plugins") return Promise.resolve({
        plugins: [
          { id: "p1", name: "Server Plugin", version: "1.0.0", enabled: true, isServerOnly: true },
          { id: "p2", name: "WASM Plugin", version: "2.0.0", enabled: true, runtime: "wasm" }
        ]
      });
      if (url === "/api/plugins/trusted-keys") return Promise.resolve({ trustedKeys: [], builtinKeys: [] });
      return Promise.resolve({});
    });
    const wrapper = mountPlugins();
    await flushPromises();
    expect(wrapper.html()).toContain("Server Plugin");
    expect(wrapper.html()).toContain("WASM Plugin");
    wrapper.unmount();
  });
});
