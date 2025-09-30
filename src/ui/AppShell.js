const ROUTES = [
  { hash: "#/home", icon: "home", label: "Trang chủ" },
  { hash: "#/settings", icon: "settings", label: "Cài đặt" },
  { hash: "#/history", icon: "history", label: "Lịch sử" },
];

let shellRef = null;

export function ensureShell(root = document.getElementById("app")) {
  if (shellRef && document.body.contains(shellRef.wrapper)) {
    return shellRef;
  }

  if (!root) throw new Error("Không tìm thấy #app để gắn layout");
  root.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "app-shell layout";

  const aside = document.createElement("aside");
  aside.className = "side-nav";

  const top = document.createElement("div");
  top.className = "side-top";

  const bottom = document.createElement("div");
  bottom.className = "side-bottom";

  const navButtons = new Map();
  ROUTES.forEach((route) => {
    const btn = document.createElement("button");
    btn.className = "circle-btn";
    btn.innerHTML = `<span class="material-icons">${route.icon}</span>`;
    btn.title = route.label;
    btn.dataset.route = route.hash;
    btn.addEventListener("click", () => {
      if (window.location.hash === route.hash) return;
      window.location.hash = route.hash;
    });
    navButtons.set(route.hash, btn);
    top.appendChild(btn);
  });

  aside.append(top, bottom);

  const main = document.createElement("div");
  main.className = "main-slot";

  wrapper.append(aside, main);
  root.appendChild(wrapper);

  shellRef = {
    wrapper,
    sidebar: aside,
    sidebarTop: top,
    sidebarBottom: bottom,
    main,
    navButtons,
    setActive(route) {
      navButtons.forEach((btn, hash) => {
        btn.classList.toggle("active", hash === route);
      });
    },
    clearSidebarExtras() {
      bottom.innerHTML = "";
    },
  };

  return shellRef;
}
