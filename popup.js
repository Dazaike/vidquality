function restricted(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (
    lower.startsWith("chrome://") ||
    lower.startsWith("chrome-extension://") ||
    lower.startsWith("edge://") ||
    lower.startsWith("about:")
  ) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "chromewebstore.google.com") return true;
    if (parsed.hostname === "chrome.google.com" && parsed.pathname.toLowerCase().startsWith("/webstore")) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function showStatus(text) {
  const status = document.getElementById("status");
  status.hidden = false;
  status.textContent = text;
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function executeOnAllFrames(tabId, details) {
  try {
    const res = await chrome.scripting.executeScript({
      ...details,
      target: { tabId, allFrames: true },
    });
    return Array.isArray(res) ? res : [];
  } catch {
    // If allFrames fails (e.g. sandboxed iframe), query frames and run per-frame
  }

  const results = [];
  let frameIds = [0];
  if (chrome.webNavigation && typeof chrome.webNavigation.getAllFrames === "function") {
    try {
      const all = await chrome.webNavigation.getAllFrames({ tabId });
      if (Array.isArray(all) && all.length > 0) {
        frameIds = all.map((f) => f.frameId);
      }
    } catch {
      /* fall back to top frame */
    }
  }

  for (const frameId of frameIds) {
    try {
      const res = await chrome.scripting.executeScript({
        ...details,
        target: { tabId, frameIds: [frameId] },
      });
      if (Array.isArray(res)) results.push(...res);
    } catch {
      /* ignore restricted or inaccessible frame */
    }
  }
  return results;
}

async function inject(tabId) {
  await executeOnAllFrames(tabId, {
    files: ["content.js"],
  });

  try {
    await executeOnAllFrames(tabId, {
      world: "MAIN",
      func: () => {
        if (globalThis.__vqYtBridge) return;
        globalThis.__vqYtBridge = true;
        document.addEventListener("vq-yt-read", () => {
          const root = document.documentElement;
          if (!root) return;
          const host = location.hostname;
          const youtube =
            host === "www.youtube.com" ||
            host === "youtube.com" ||
            host === "m.youtube.com" ||
            host === "www.youtube-nocookie.com";
          if (!youtube) {
            root.setAttribute("data-vq-yt", "");
            return;
          }
          const player = document.getElementById("movie_player");
          try {
            if (!player || typeof player.getPlaybackQuality !== "function") {
              root.setAttribute("data-vq-yt", "");
              return;
            }
            const quality = String(player.getPlaybackQuality());
            let levels = "";
            if (typeof player.getAvailableQualityLevels === "function") {
              levels = (player.getAvailableQualityLevels() || []).join(" ");
            }
            root.setAttribute("data-vq-yt", quality + "\n" + levels);
          } catch {
            root.setAttribute("data-vq-yt", "");
          }
        });
      },
    });
  } catch {
    /* MAIN-world injection backup */
  }
}

function findBestVideoRow(rows) {
  if (!rows || rows.length === 0) return null;
  const playing = rows.filter((r) => r.item.state === "playing");
  if (playing.length > 0) {
    return playing.reduce((best, cur) =>
      (cur.item.w || 0) * (cur.item.h || 0) > (best.item.w || 0) * (best.item.h || 0) ? cur : best
    );
  }
  return rows.reduce((best, cur) =>
    (cur.item.w || 0) * (cur.item.h || 0) > (best.item.w || 0) * (best.item.h || 0) ? cur : best
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  const pick = document.getElementById("pick");
  const list = document.getElementById("list");
  const autoInspectToggle = document.getElementById("auto-inspect");

  let autoInspectEnabled = false;
  try {
    const data = await chrome.storage.local.get("autoInspect");
    autoInspectEnabled = Boolean(data?.autoInspect);
  } catch {
    /* storage read failure fallback */
  }
  if (autoInspectToggle) {
    autoInspectToggle.checked = autoInspectEnabled;
  }

  const tab = await activeTab();
  if (!tab || restricted(tab.url)) {
    pick.hidden = true;
    if (autoInspectToggle) autoInspectToggle.disabled = true;
    showStatus("Cannot inspect this page.");
    return;
  }

  try {
    await inject(tab.id);
  } catch (err) {
    pick.hidden = true;
    if (autoInspectToggle) autoInspectToggle.disabled = true;
    const message = err && err.message ? err.message : String(err);
    showStatus("Cannot inspect this page. " + message);
    return;
  }

  let frames = [];
  try {
    frames = await executeOnAllFrames(tab.id, {
      func: () => (globalThis.__vq ? globalThis.__vq.scan() : []),
    });
  } catch (err) {
    pick.hidden = true;
    if (autoInspectToggle) autoInspectToggle.disabled = true;
    const message = err && err.message ? err.message : String(err);
    showStatus("Cannot inspect this page. " + message);
    return;
  }

  const rows = [];
  for (const frame of frames) {
    const items = Array.isArray(frame.result) ? frame.result : [];
    for (const item of items) {
      rows.push({ frameId: frame.frameId, item });
    }
  }

  if (rows.length === 0) {
    showStatus("No videos on this page.");
  }

  async function inspectRow(row) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [row.frameId] },
      func: (id) => (globalThis.__vq ? globalThis.__vq.select(id) : { ok: false }),
      args: [row.item.id],
    });
  }

  if (autoInspectToggle) {
    autoInspectToggle.addEventListener("change", async () => {
      const enabled = autoInspectToggle.checked;
      await chrome.storage.local.set({ autoInspect: enabled });
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "autoInspectChanged", enabled });
      } catch {
        /* tab messaging optional */
      }
      if (enabled && rows.length > 0) {
        const best = findBestVideoRow(rows);
        if (best) await inspectRow(best);
      }
    });
  }

  // If auto inspect is already enabled and videos are present, auto inspect the best video
  if (autoInspectEnabled && rows.length > 0) {
    const best = findBestVideoRow(rows);
    if (best) {
      inspectRow(best).catch(() => {});
    }
  }

  for (const row of rows) {
    const li = document.createElement("li");
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${row.item.label} · ${row.item.exact} · ${row.item.state}`;
    if (row.frameId > 0) {
      const embedBadge = document.createElement("span");
      embedBadge.className = "embed-badge";
      embedBadge.textContent = "embed";
      meta.appendChild(embedBadge);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Inspect";
    button.addEventListener("click", async () => {
      await inspectRow(row);
      window.close();
    });
    li.append(meta, button);
    list.append(li);
  }

  pick.addEventListener("click", async () => {
    await executeOnAllFrames(tab.id, {
      func: () => {
        if (globalThis.__vq) globalThis.__vq.armPick();
      },
    });
    window.close();
  });
});
