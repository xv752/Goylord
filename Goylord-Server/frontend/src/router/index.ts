import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

import AppLayout from "@/components/layout/AppLayout.vue";
import LoginView from "@/views/LoginView.vue";
import DashboardView from "@/views/DashboardView.vue";
import ConsoleView from "@/views/ConsoleView.vue";
import RemoteDesktopView from "@/views/RemoteDesktopView.vue";
import BackstageView from "@/views/BackstageView.vue";
import FileBrowserView from "@/views/FileBrowserView.vue";
import ProcessesView from "@/views/ProcessesView.vue";
import KeyloggerView from "@/views/KeyloggerView.vue";
import BuildView from "@/views/BuildView.vue";
import SettingsView from "@/views/SettingsView.vue";
import UsersView from "@/views/UsersView.vue";
import ScriptsView from "@/views/ScriptsView.vue";
import MetricsView from "@/views/MetricsView.vue";
import GraphView from "@/views/GraphView.vue";
import ScreenshotsView from "@/views/ScreenshotsView.vue";
import NotificationsView from "@/views/NotificationsView.vue";
import PurgatoryView from "@/views/PurgatoryView.vue";
import DeployView from "@/views/DeployView.vue";
import PluginsView from "@/views/PluginsView.vue";
import LogsView from "@/views/LogsView.vue";
import Socks5View from "@/views/Socks5View.vue";
import SolPublishView from "@/views/SolPublishView.vue";
import WinREView from "@/views/WinREView.vue";
import WebcamView from "@/views/WebcamView.vue";
import VoiceView from "@/views/VoiceView.vue";
import UserClientAccessView from "@/views/UserClientAccessView.vue";
import ChangePasswordView from "@/views/ChangePasswordView.vue";

const router = createRouter({
  history: createWebHistory("/app/"),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { requiresAuth: false },
    },
    {
      path: "/change-password",
      name: "change-password",
      component: ChangePasswordView,
      meta: { requiresAuth: false },
    },
    {
      path: "/",
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: "", name: "dashboard", component: DashboardView },
        { path: "users", name: "users", component: UsersView, meta: { access: "admin" } },
        { path: "user-client-access", name: "user-client-access", component: UserClientAccessView, meta: { access: "admin" } },
        { path: "logs", name: "logs", component: LogsView },
        { path: "notifications", name: "notifications", component: NotificationsView, meta: { access: "admin-or-operator" } },
        { path: "purgatory", name: "purgatory", component: PurgatoryView, meta: { access: "admin-or-operator" } },
        { path: "screenshots", name: "screenshots", component: ScreenshotsView, meta: { access: "no-viewer" } },
        { path: "scripts", name: "scripts", component: ScriptsView, meta: { access: "no-viewer" } },
        { path: "socks5", name: "socks5", component: Socks5View, meta: { access: "no-viewer" } },
        { path: "sol-publish", name: "sol-publish", component: SolPublishView, meta: { access: "admin" } },
        { path: "build", name: "build", component: BuildView, meta: { access: "admin-or-operator" } },
        { path: "plugins", name: "plugins", component: PluginsView, meta: { access: "admin-or-operator" } },
        { path: "deploy", name: "deploy", component: DeployView, meta: { access: "admin" } },
        { path: "winre", name: "winre", component: WinREView, meta: { access: "admin" } },
        { path: "metrics", name: "metrics", component: MetricsView },
        { path: "graph", name: "graph", component: GraphView },
        { path: "settings", name: "settings", component: SettingsView },
        { path: "console/:id", name: "console", component: ConsoleView },
        { path: "remotedesktop/:id", name: "remotedesktop", component: RemoteDesktopView },
        { path: "backstage/:id", name: "backstage", component: BackstageView },
        { path: "filebrowser/:id", name: "filebrowser", component: FileBrowserView },
        { path: "processes/:id", name: "processes", component: ProcessesView },
        { path: "keylogger/:id", name: "keylogger", component: KeyloggerView },
        { path: "webcam/:id", name: "webcam", component: WebcamView },
        { path: "voice/:id", name: "voice", component: VoiceView },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth === false) return true;

  const auth = useAuthStore();
  if (!auth.isAuthenticated) {
    await auth.fetchUser();
    if (!auth.isAuthenticated) {
      return { name: "login" };
    }
  }

  if (to.meta.access === "no-viewer" && auth.user?.role === "viewer") {
    return { name: "dashboard" };
  }
  if (to.meta.access === "admin" && auth.user?.role !== "admin") {
    return { name: "dashboard" };
  }
  if (to.meta.access === "admin-or-operator" && auth.user?.role !== "admin" && auth.user?.role !== "operator") {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
