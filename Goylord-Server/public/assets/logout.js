import { goylordAlert, goylordConfirm } from "./ui.js";

window.handleLogout = async function () {
  if (!(await goylordConfirm("Are you sure you want to logout?"))) return;

  try {
    const res = await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      window.location.href = "/";
    } else {
      await goylordAlert("Logout failed. Please try again.");
    }
  } catch (err) {
    console.error("Logout error:", err);
    await goylordAlert("Logout failed. Please try again.");
  }
};
