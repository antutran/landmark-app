import { HomeView } from "../ui/HomeView.js";
import { SettingsView } from "../ui/SettingsView.js";
import { HistoryView } from "../ui/HistoryView.js";
import { ensureShell } from "../ui/AppShell.js";

export function router() {
  const route = window.location.hash || "#/home";
  const shell = ensureShell();

  shell.setActive(route);
  shell.main.innerHTML = "";
  shell.clearSidebarExtras();

  let view = null;
  if (route === "#/home") view = HomeView(shell);
  else if (route === "#/settings") view = SettingsView(shell);
  else if (route === "#/history") view = HistoryView(shell);
  else {
    const notFound = document.createElement("div");
    notFound.className = "not-found";
    notFound.textContent = "404";
    view = notFound;
  }

  if (view) shell.main.appendChild(view);
}
