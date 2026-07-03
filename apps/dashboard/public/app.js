const REFRESH_MS = 30_000;

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const contentEl = document.getElementById("content");

/** Build the click-through URL. Prefer an explicit url; otherwise use the
 * browser's current hostname + the published port so links work from any
 * client on the network. */
function resolveHref(app) {
  if (app.url) return app.url;
  if (app.port) return `${location.protocol}//${location.hostname}:${app.port}`;
  return "#";
}

function iconEl(app) {
  if (app.icon && /^(https?:\/\/|\/)/.test(app.icon)) {
    const img = document.createElement("img");
    img.className = "tile-icon";
    img.src = app.icon;
    img.alt = "";
    img.loading = "lazy";
    // Fall back to a letter avatar if the image fails to load.
    img.onerror = () => img.replaceWith(letterIcon(app.name));
    return img;
  }
  if (app.icon) {
    // Treat as a slug: try the dashboard-icons CDN, fall back to a letter.
    const img = document.createElement("img");
    img.className = "tile-icon";
    img.src = `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${app.icon}.png`;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => img.replaceWith(letterIcon(app.name));
    return img;
  }
  return letterIcon(app.name);
}

function letterIcon(name) {
  const wrap = document.createElement("div");
  wrap.className = "tile-icon";
  wrap.textContent = (name || "?").trim().charAt(0).toUpperCase();
  return wrap;
}

function tileEl(app) {
  const href = resolveHref(app);
  const a = document.createElement("a");
  a.className = "tile";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  a.appendChild(iconEl(app));

  const body = document.createElement("div");
  body.className = "tile-body";
  const name = document.createElement("div");
  name.className = "tile-name";
  name.textContent = app.name || "Unnamed";
  const sub = document.createElement("div");
  sub.className = "tile-sub";
  sub.textContent = href === "#" ? "no url" : href.replace(/^https?:\/\//, "");
  body.append(name, sub);
  a.appendChild(body);

  const dot = document.createElement("span");
  dot.className = `status-dot ${app.status || "unknown"}`;
  dot.title = `Status: ${app.status || "unknown"}`;
  a.appendChild(dot);

  return a;
}

function render(data) {
  const { title, apps } = data;
  if (title) {
    titleEl.textContent = title;
    document.title = title;
  }

  contentEl.innerHTML = "";
  if (!apps || apps.length === 0) {
    contentEl.innerHTML =
      '<p class="placeholder">No apps found. Check your config or Docker labels.</p>';
    metaEl.textContent = "";
    return;
  }

  const hasGroups = apps.some((a) => a.group);
  if (hasGroups) {
    const groups = new Map();
    for (const app of apps) {
      const key = app.group || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(app);
    }
    for (const [group, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const h = document.createElement("h2");
      h.className = "group-title";
      h.textContent = group;
      contentEl.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "grid";
      list.forEach((app) => grid.appendChild(tileEl(app)));
      contentEl.appendChild(grid);
    }
  } else {
    const grid = document.createElement("div");
    grid.className = "grid";
    apps.forEach((app) => grid.appendChild(tileEl(app)));
    contentEl.appendChild(grid);
  }

  const up = apps.filter((a) => a.status === "up").length;
  metaEl.textContent = `${apps.length} app${apps.length === 1 ? "" : "s"} · ${up} up`;
}

async function refresh() {
  try {
    const res = await fetch("/api/apps");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (err) {
    contentEl.innerHTML = `<p class="placeholder">Failed to load apps: ${err.message}</p>`;
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
