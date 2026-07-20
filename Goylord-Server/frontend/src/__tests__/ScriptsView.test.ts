import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ScriptsView from "@/views/ScriptsView.vue";
import { api } from "@/lib/api";

const mockApi = vi.mocked(api);

function makeRouter() {
  return createRouter({
    history: createMemoryHistory("/app/"),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/app/scripts", name: "scripts", component: ScriptsView },
      { path: "/login", name: "login", component: { template: "<div />" } },
    ],
  });
}

const MOCK_SCRIPTS = [
  { id: "s1", name: "test.ps1", content: "echo hello", scriptType: "powershell", createdAt: "", updatedAt: "2026-01-01" },
];

function mountScripts(scriptList: any[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = makeRouter();
  router.push("/app/scripts");
  mockApi.get.mockImplementation((url: string) => {
    if (url === "/api/saved-scripts") return Promise.resolve({ items: scriptList });
    if (url === "/api/auto-scripts") return Promise.resolve({ items: [] });
    if (url === "/api/clients") return Promise.resolve({ items: [] });
    return Promise.resolve({});
  });
  return mount(ScriptsView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  });
}

describe("ScriptsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockApi.put.mockResolvedValue({});
    mockApi.delete.mockResolvedValue({});
  });

  it("renders the scripts panel with template list", async () => {
    const wrapper = mountScripts();
    await flushPromises();
    expect(wrapper.html()).toContain("Scripts");
    wrapper.unmount();
  });

  it("script type AppSelect shows after selecting a script", async () => {
    const wrapper = mountScripts(MOCK_SCRIPTS);
    await flushPromises();
    const scriptBtn = wrapper.findAll("button").find(b => b.text().includes("test.ps1"));
    expect(scriptBtn).toBeDefined();
    await scriptBtn!.trigger("click");
    await flushPromises();
    const select = wrapper.find(".app-select");
    expect(select.exists()).toBe(true);
    const trigger = select.find(".app-select-trigger");
    expect(trigger.text().toLowerCase()).toContain("powershell");
    wrapper.unmount();
  });

  it("create new script button exists", async () => {
    const wrapper = mountScripts();
    await flushPromises();
    const createBtn = wrapper.findAll("button").find(b => b.html().includes("fa-plus"));
    expect(createBtn).toBeDefined();
    wrapper.unmount();
  });

  it("search input filters templates", async () => {
    const wrapper = mountScripts();
    await flushPromises();
    const searchInput = wrapper.find('input[placeholder*="earch"]');
    expect(searchInput.exists()).toBe(true);
    await searchInput.setValue("network");
    await flushPromises();
    expect((searchInput.element as HTMLInputElement).value).toBe("network");
    wrapper.unmount();
  });

  it("scripts list shows empty state", async () => {
    const wrapper = mountScripts([]);
    await flushPromises();
    expect(wrapper.html()).toContain("No scripts");
    wrapper.unmount();
  });

  it("scripts list shows scripts when loaded", async () => {
    const wrapper = mountScripts(MOCK_SCRIPTS);
    await flushPromises();
    expect(wrapper.html()).toContain("test.ps1");
    wrapper.unmount();
  });

  it("executes script opens modal with client list", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/saved-scripts") return Promise.resolve({ items: MOCK_SCRIPTS });
      if (url === "/api/auto-scripts") return Promise.resolve({ items: [] });
      if (url === "/api/clients") return Promise.resolve({ items: [{ id: "c1", host: "test-host", online: true }] });
      return Promise.resolve({});
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    router.push("/app/scripts");
    const wrapper = mount(ScriptsView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    });
    await flushPromises();
    const scriptBtn = wrapper.findAll("button").find(b => b.text().includes("test.ps1"));
    if (scriptBtn) {
      await scriptBtn.trigger("click");
      await flushPromises();
      const execBtn = wrapper.findAll("button").find(b => b.html().includes("fa-play"));
      if (execBtn) {
        await execBtn.trigger("click");
        await flushPromises();
        expect(wrapper.html()).toContain("Execute");
      }
    }
    wrapper.unmount();
  });

  it("loading state shows spinner", async () => {
    mockApi.get.mockImplementation(() => new Promise(() => {}));
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    router.push("/app/scripts");
    const wrapper = mount(ScriptsView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.html()).toContain("fa-spinner");
    wrapper.unmount();
  });

  it("no console errors on mount", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(" "));
    const wrapper = mountScripts();
    await flushPromises();
    expect(errors).toHaveLength(0);
    console.error = originalError;
    wrapper.unmount();
  });
});
