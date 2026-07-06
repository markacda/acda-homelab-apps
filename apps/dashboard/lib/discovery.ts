import Docker from "dockerode";
import type { AppEntry, Config } from "./config.ts";

let docker: Docker | null = null;

function getDocker(): Docker {
  if (!docker) {
    // Defaults to /var/run/docker.sock on *nix; honors DOCKER_HOST if set.
    docker = new Docker();
  }
  return docker;
}

const LABEL_PREFIX = "homelab.";

type Labels = Record<string, string> | undefined;

function label(labels: Labels, key: string): string | undefined {
  return labels?.[LABEL_PREFIX + key];
}

function stripName(name: string | undefined): string {
  return (name || "").replace(/^\//, "");
}

/**
 * Guess an icon slug from an image name, e.g.
 * "lscr.io/linuxserver/sonarr:latest" -> "sonarr".
 */
function guessIcon(image: string | undefined): string | null {
  if (!image) return null;
  const noTag = image.split("@")[0].split(":")[0];
  const parts = noTag.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Pick the published TCP port to link to. Prefers an explicit `homelab.port`
 * label; otherwise the first published (host-mapped) TCP port.
 */
function pickPort(container: Docker.ContainerInfo, labels: Labels): number | null {
  const explicit = label(labels, "port");
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n)) return n;
  }
  const ports = (container.Ports || [])
    .filter((p) => p.Type === "tcp" && p.PublicPort)
    .map((p) => p.PublicPort)
    .sort((a, b) => a - b);
  return ports[0] || null;
}

/**
 * List running containers and map them to app entries. Returns [] if the
 * Docker socket is unreachable (e.g. during local dev without Docker).
 */
export async function discoverApps(config: Config): Promise<AppEntry[]> {
  if (!config.settings.autoDiscover) return [];

  let containers: Docker.ContainerInfo[];
  try {
    containers = await getDocker().listContainers({ all: false });
  } catch (err) {
    console.error(`[discovery] Cannot reach Docker socket: ${(err as Error).message}`);
    return [];
  }

  const apps: AppEntry[] = [];
  for (const container of containers) {
    const labels = container.Labels || {};
    const containerName = stripName(container.Names?.[0]);

    // Filtering rules
    if (config.discovery.ignore.includes(containerName)) continue;
    const enable = label(labels, "enable");
    if (enable === "false") continue;
    if (config.discovery.requireLabel && enable !== "true") continue;

    const port = pickPort(container, labels);
    const url = label(labels, "url");

    // Skip containers with nothing to link to (no url override, no published port).
    if (!url && !port) continue;

    apps.push({
      source: "docker",
      containerName,
      name: label(labels, "name") || containerName,
      url: url || null,
      port: url ? null : port,
      icon: label(labels, "icon") || guessIcon(container.Image),
      group: label(labels, "group") || null,
    });
  }

  return apps;
}
