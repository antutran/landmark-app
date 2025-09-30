import { router } from "./shared/router.js";
import { applySettings } from "./logic/settings.js";
import { cleanupHistory } from "./logic/history.js";
import "./ui/AppShell.js";

window.addEventListener("DOMContentLoaded", async () => {
  applySettings();
  await cleanupHistory(); // dọn record quá 5 ngày + migrate localStorage
  router();
  window.addEventListener("hashchange", router);
});