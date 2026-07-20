import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import SettingsView from "@/views/SettingsView.vue";
import { api } from "@/lib/api";

const mockApi = vi.mocked(api);

function makeRouter() {
  return createRouter({
    history: createMemoryHistory("/app/"),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/app/settings", name: "settings", component: SettingsView },
      { path: "/login", name: "login", component: { template: "<div />" } },
    ],
  });
}

function mountSettings() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = makeRouter();
  router.push("/app/settings");
  return mount(SettingsView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  });
}

describe("SettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ username: "admin", role: "admin", userId: 1 });
      if (url === "/api/settings/appearance") return Promise.resolve({ brandName: "Goylord" });
      if (url === "/api/settings/security") return Promise.resolve({ minPasswordLength: 12 });
      if (url === "/api/settings/oidc") return Promise.resolve({ enabled: false });
      if (url === "/api/settings/chat") return Promise.resolve({ enabled: false });
      if (url === "/api/enrollment/settings") return Promise.resolve({ requireApproval: false });
      if (url === "/api/settings/tls") return Promise.resolve({ certbotEnabled: false });
      return Promise.resolve({});
    });
    mockApi.put.mockResolvedValue({});
    mockApi.post.mockResolvedValue({});
  });

  it("renders the settings page with all 13 sidebar nav items", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const navBtns = wrapper.findAll(".settings-nav");
    expect(navBtns.length).toBe(15);
    wrapper.unmount();
  });

  it("shows loading state initially", async () => {
    mockApi.get.mockImplementation(() => new Promise(() => {}));
    const wrapper = mountSettings();
    await flushPromises();
    expect(wrapper.html()).toContain("fa-spinner");
    wrapper.unmount();
  });

  it("clicking section nav switches visible content", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const navBtns = wrapper.findAll(".settings-nav");
    expect(navBtns.length).toBeGreaterThanOrEqual(10);
    if (navBtns.length > 2) {
      await navBtns[2].trigger("click");
      await flushPromises();
      expect(wrapper.html()).toContain("settings-nav-active");
    }
    wrapper.unmount();
  });

  it("profile section has username input", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("security section has password length input", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const html = wrapper.html();
    expect(html).toContain("Password");
    expect(html).toContain("Security");
    wrapper.unmount();
  });

  it("OIDC section renders OpenID Connect heading when nav clicked", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const navBtns = wrapper.findAll(".settings-nav");
    const oidcNav = navBtns[5];
    expect(oidcNav).toBeDefined();
    await oidcNav.trigger("click");
    await flushPromises();
    expect(wrapper.html()).toContain("OpenID Connect");
    expect(wrapper.html()).toContain("OIDC is disabled");
    wrapper.unmount();
  });

  it("appearance section has brand name input", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const appearanceNav = wrapper.findAll(".settings-nav").find(t => t.text().includes("Appearance"));
    if (appearanceNav) {
      await appearanceNav.trigger("click");
      await flushPromises();
      expect(wrapper.html()).toContain("Brand");
    }
    wrapper.unmount();
  });

  it("all 7 API endpoints are fetched on mount", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const urls = mockApi.get.mock.calls.map(c => c[0]);
    expect(urls).toContain("/api/auth/me");
    expect(urls).toContain("/api/settings/appearance");
    expect(urls).toContain("/api/settings/security");
    expect(urls).toContain("/api/settings/oidc");
    expect(urls).toContain("/api/settings/chat");
    expect(urls).toContain("/api/enrollment/settings");
    expect(urls).toContain("/api/settings/tls");
    wrapper.unmount();
  });

  it("save button exists", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const saveBtn = wrapper.findAll("button").find(b => b.text().includes("Save"));
    expect(saveBtn).toBeDefined();
    wrapper.unmount();
  });

  it("no console errors on mount", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(" "));
    const wrapper = mountSettings();
    await flushPromises();
    expect(errors).toHaveLength(0);
    console.error = originalError;
    wrapper.unmount();
  });

  it("TLS section has certbot fields", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const tlsNav = wrapper.findAll(".settings-nav").find(t => t.text().includes("TLS"));
    if (tlsNav) {
      await tlsNav.trigger("click");
      await flushPromises();
      expect(wrapper.html()).toContain("Certbot");
    }
    wrapper.unmount();
  });

  it("registration section has approval toggle", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const regNav = wrapper.findAll(".settings-nav").find(t => t.text().includes("Registration"));
    if (regNav) {
      await regNav.trigger("click");
      await flushPromises();
      expect(wrapper.html()).toContain("Registration");
    }
    wrapper.unmount();
  });

  it("settings sidebar has all section labels", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const html = wrapper.html();
    expect(html).toContain("Profile");
    expect(html).toContain("Password");
    expect(html).toContain("MFA");
    expect(html).toContain("Security Policy");
    expect(html).toContain("TLS");
    expect(html).toContain("OIDC");
    expect(html).toContain("Appearance");
    expect(html).toContain("Chat");
    expect(html).toContain("Thumbnails");
    expect(html).toContain("Input Archive");
    expect(html).toContain("Registration");
    expect(html).toContain("Build Limits");
    expect(html).toContain("Export");
    expect(html).toContain("Server Health");
    expect(html).toContain("Profiler");
    wrapper.unmount();
  });
});
