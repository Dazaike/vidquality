if (globalThis.__vq) {
  // Reinjection from a second popup open.
} else {
  const videos = new Map();
  let nextId = 0;
  let host = null;
  let shadow = null;
  let picking = false;
  let selectedId = null;
  let autoHoldId = null;
  let manualLock = false;
  let autoInspectEnabled = false;
  let activated = false;

  let rvfcHandle = null;
  let rvfcVideo = null;
  let fpsFrames = 0;
  let fpsWindowStart = 0;
  let fpsValue = null;
  let fpsSupported = true;
  let videoSample = null;
  let audioSample = null;
  let videoRateNa = false;
  let audioRateNa = false;
  let pickClickBound = false;
  let rateTimer = null;

  const YT_LABELS = {
    highres: "highres",
    hd2160: "2160p",
    hd1440: "1440p",
    hd1080: "1080p",
    hd720: "720p",
    large: "480p",
    medium: "360p",
    small: "240p",
    tiny: "144p",
    auto: "auto",
  };

  function tier(w, h) {
    if (w === 0 || h === 0) return { label: "…", badge: "" };
    const p = Math.min(w, h);
    if (p >= 2000) return { label: "4K", badge: "4K" };
    if (p >= 1400) return { label: "1440p", badge: "1440" };
    if (p >= 1000) return { label: "1080p", badge: "1080" };
    if (p >= 700) return { label: "720p", badge: "720" };
    if (p >= 450) return { label: "480p", badge: "480" };
    if (p >= 300) return { label: "360p", badge: "360" };
    if (p >= 200) return { label: "240p", badge: "240" };
    if (p > 0) return { label: `${p}p`, badge: String(p).slice(0, 4) };
    return { label: "…", badge: "" };
  }

  function mapYt(value) {
    const key = String(value);
    return Object.prototype.hasOwnProperty.call(YT_LABELS, key) ? YT_LABELS[key] : key;
  }

  function isYouTube() {
    const hostName = location.hostname;
    return (
      hostName === "www.youtube.com" ||
      hostName === "youtube.com" ||
      hostName === "m.youtube.com" ||
      hostName === "www.youtube-nocookie.com"
    );
  }

  function setBadge(text) {
    try {
      chrome.runtime.sendMessage({ type: "badge", text });
    } catch {
      /* extension context can vanish on unload */
    }
  }

  function ensureHost() {
    if (host && host.isConnected && shadow) return;
    host = document.createElement("div");
    host.id = "vq-host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .chip, .panel { all: initial; }
      .chip {
        position: fixed;
        pointer-events: auto;
        background: #111827;
        color: #2dd4bf;
        font: 11px ui-sans-serif, system-ui, sans-serif;
        padding: 2px 6px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        z-index: 1;
      }
      .chip.picking { outline: 2px solid #2dd4bf; }
      .panel {
        position: fixed;
        pointer-events: auto;
        box-sizing: border-box;
        width: 280px;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        overflow-y: auto;
        background: #111827;
        color: #f9fafb;
        font: 13px ui-sans-serif, system-ui, sans-serif;
        padding: 12px;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.45);
        z-index: 2;
      }
      .head { display: flex; align-items: baseline; gap: 8px; }
      .tier { color: #2dd4bf; font-size: 20px; font-weight: 700; }
      .exact { color: #9ca3af; }
      .close {
        margin-left: auto;
        background: transparent;
        color: #f9fafb;
        border: none;
        cursor: pointer;
        font: 16px ui-sans-serif, system-ui, sans-serif;
        padding: 0;
      }
      .row { display: flex; gap: 8px; margin-top: 4px; }
      .k { color: #9ca3af; min-width: 64px; flex: none; }
    `;
    shadow.appendChild(style);
    placeHost();
  }

  let fsWrap = null;
  let fsBusy = false;

  function restoreFsWrap() {
    if (!fsWrap) return;
    const saved = fsWrap;
    fsWrap = null;
    const { video, parent, next, wrap, cssWidth, cssHeight, cssFit } = saved;
    if (video.isConnected) {
      video.style.width = cssWidth;
      video.style.height = cssHeight;
      video.style.objectFit = cssFit;
      if (parent && parent.isConnected) {
        if (next && next.parentNode === parent) parent.insertBefore(video, next);
        else parent.appendChild(video);
      }
    }
    wrap.remove();
  }

  function maybeWrapFullscreenVideo(video) {
    if (fsBusy || fsWrap || !video.parentNode) return;
    if (!navigator.userActivation || !navigator.userActivation.isActive) return;
    fsBusy = true;
    const parent = video.parentNode;
    const next = video.nextSibling;
    const wrap = document.createElement("div");
    wrap.dataset.vqFsWrap = "1";
    wrap.style.cssText = "background:#000;display:flex;align-items:center;justify-content:center;width:100%;height:100%;";
    const cssWidth = video.style.width;
    const cssHeight = video.style.height;
    const cssFit = video.style.objectFit;
    parent.insertBefore(wrap, video);
    wrap.appendChild(video);
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    wrap.appendChild(host);
    fsWrap = { video, parent, next, wrap, cssWidth, cssHeight, cssFit };
    const fail = () => {
      restoreFsWrap();
      if (host && document.documentElement && host.parentNode !== document.documentElement) {
        document.documentElement.appendChild(host);
      }
      fsBusy = false;
    };
    const enter = () => {
      wrap.requestFullscreen().then(() => {
        fsBusy = false;
      }, fail);
    };
    if (document.fullscreenElement) document.exitFullscreen().then(enter, enter);
    else enter();
  }

  function placeHost() {
    if (!host || fsBusy) return;
    const fs = document.fullscreenElement;
    if (!fs) {
      if (fsWrap) restoreFsWrap();
      if (host.parentNode !== document.documentElement) document.documentElement.appendChild(host);
      return;
    }
    if (fsWrap && fs === fsWrap.wrap) {
      if (host.parentNode !== fs) fs.appendChild(host);
      return;
    }
    if (fs instanceof HTMLMediaElement) {
      maybeWrapFullscreenVideo(fs);
      return;
    }
    if (host.parentNode !== fs) fs.appendChild(host);
  }

  function assignId(video) {
    if (!video.dataset.vqId) {
      nextId += 1;
      video.dataset.vqId = String(nextId);
    }
    videos.set(video.dataset.vqId, video);
    return video.dataset.vqId;
  }

  function collectVideos() {
    const out = [];
    const seen = new Set();
    function walk(root) {
      if (!root || typeof root.querySelectorAll !== "function") return;
      for (const video of root.querySelectorAll("video")) {
        if (seen.has(video)) continue;
        seen.add(video);
        out.push(video);
      }
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }
    walk(document);
    const live = new Set();
    for (const video of out) {
      if (video.isConnected) live.add(assignId(video));
    }
    for (const id of [...videos.keys()]) {
      const el = videos.get(id);
      if (!el || !el.isConnected || !live.has(id)) videos.delete(id);
    }
    return out.filter((video) => video.isConnected);
  }

  function isShown(video) {
    const rect = video.getBoundingClientRect();
    const hasRect = rect.width >= 2 && rect.height >= 2;
    const hasClient = video.clientWidth >= 2 && video.clientHeight >= 2;
    if (!hasRect && !hasClient) return false;
    try {
      const style = window.getComputedStyle(video);
      if (style.display === "none" || style.visibility === "hidden") return false;
    } catch {
      /* style computation optional */
    }
    return true;
  }

  function playbackState(video) {
    if (video.ended) return "ended";
    if (video.paused) return "paused";
    return "playing";
  }

  function chipFor(id) {
    return shadow ? shadow.querySelector(`.chip[data-id="${id}"]`) : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function placeChip(button, video) {
    const rect = video.getBoundingClientRect();
    const width = button.offsetWidth || 40;
    const height = button.offsetHeight || 18;
    const left = clamp(rect.right - 8 - width, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clamp(rect.top + 8, 8, Math.max(8, window.innerHeight - height - 8));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  }

  function reconcile() {
    const found = collectVideos();
    // Bind play listener for auto inspect
    for (const video of found) {
      if (!video.dataset.vqBound) {
        video.dataset.vqBound = "1";
        video.addEventListener("play", () => {
          if (autoInspectEnabled && !manualLock) {
            if (video.dataset.vqId && video.dataset.vqId !== autoHoldId) {
              select(video.dataset.vqId, false);
            }
          }
        });
      }
    }

    if (!activated && !autoInspectEnabled) {
      return found;
    }

    ensureHost();
    const visibleIds = new Set();
    for (const video of found) {
      if (!isShown(video)) continue;
      const id = video.dataset.vqId;
      visibleIds.add(id);
      let button = chipFor(id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.dataset.id = id;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          disarmPick();
          select(id, true);
        });
        shadow.appendChild(button);
      }
      const info = tier(video.videoWidth, video.videoHeight);
      button.textContent = info.label;
      if (picking) button.classList.add("picking");
      else button.classList.remove("picking");
      placeChip(button, video);
    }
    for (const button of [...shadow.querySelectorAll(".chip")]) {
      if (!visibleIds.has(button.dataset.id)) button.remove();
    }
    return found;
  }

  function markPicking() {
    if (!shadow) return;
    for (const button of shadow.querySelectorAll(".chip")) {
      button.classList.toggle("picking", picking);
    }
  }

  function intersectsViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth && rect.width >= 2 && rect.height >= 2;
  }

  function placePanel(panel, video) {
    const rect = video.getBoundingClientRect();
    const panelWidth = Math.min(280, Math.max(160, window.innerWidth - 16));
    let left;
    let top;
    if (!intersectsViewport(rect)) {
      left = window.innerWidth - panelWidth - 8;
      top = 8;
    } else if (rect.right - (panelWidth + 8) < 8) {
      left = Math.max(8, rect.left + 8);
      top = Math.max(8, rect.top + 8);
    } else {
      left = Math.max(8, rect.right - 8 - panelWidth);
      top = Math.max(8, rect.top + 8);
    }
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
    top = Math.max(8, Math.min(top, Math.max(8, window.innerHeight - 40)));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function cancelRvfc() {
    if (rvfcVideo && rvfcHandle != null && typeof rvfcVideo.cancelVideoFrameCallback === "function") {
      try {
        rvfcVideo.cancelVideoFrameCallback(rvfcHandle);
      } catch {
        /* already cancelled */
      }
    }
    rvfcHandle = null;
    rvfcVideo = null;
  }

  function startFps(video) {
    cancelRvfc();
    fpsFrames = 0;
    fpsWindowStart = performance.now();
    fpsValue = null;
    fpsSupported = typeof video.requestVideoFrameCallback === "function";
    if (!fpsSupported) return;
    const pump = () => {
      if (videos.get(selectedId) !== video) return;
      fpsFrames += 1;
      const now = performance.now();
      if (now - fpsWindowStart >= 1000) {
        const elapsed = now - fpsWindowStart;
        fpsValue = (fpsFrames * 1000) / elapsed;
        fpsFrames = 0;
        fpsWindowStart = now;
      }
      rvfcHandle = video.requestVideoFrameCallback(pump);
      rvfcVideo = video;
    };
    rvfcHandle = video.requestVideoFrameCallback(pump);
    rvfcVideo = video;
  }

  function clearRateTimer() {
    if (rateTimer != null) {
      clearTimeout(rateTimer);
      rateTimer = null;
    }
  }

  function startRates(video) {
    const now = performance.now();
    videoRateNa = false;
    audioRateNa = false;
    clearRateTimer();
    if ("webkitVideoDecodedByteCount" in video) {
      videoSample = { bytes: video.webkitVideoDecodedByteCount, t: now, started: now, value: null };
    } else {
      videoSample = null;
      videoRateNa = true;
    }
    if ("webkitAudioDecodedByteCount" in video) {
      audioSample = { bytes: video.webkitAudioDecodedByteCount, t: now, started: now, value: null };
    } else {
      audioSample = null;
      audioRateNa = true;
    }
    rateTimer = setTimeout(() => {
      rateTimer = null;
      if (videos.get(selectedId) !== video) return;
      if (!video.paused && videoSample && videoSample.value == null && video.webkitVideoDecodedByteCount === videoSample.bytes) {
        videoRateNa = true;
      }
      if (!video.paused && audioSample && audioSample.value == null && video.webkitAudioDecodedByteCount === audioSample.bytes) {
        audioRateNa = true;
      }
      if (shadow && shadow.querySelector(".panel")) renderPanel(video);
    }, 2000);
  }

  function sampleRate(video, sample, prop, naFlag, scale) {
    if (naFlag || !sample) return "n/a";
    const now = performance.now();
    const bytes = video[prop];
    if (now - sample.t >= 500 && bytes !== sample.bytes) {
      const deltaBytes = bytes - sample.bytes;
      const deltaMs = now - sample.t;
      sample.value = (deltaBytes * 8) / (deltaMs / 1000) / scale;
      sample.bytes = bytes;
      sample.t = now;
      return sample.value.toFixed(1);
    }
    if (!video.paused && sample.value == null && bytes === sample.bytes && now - sample.started >= 2000) {
      if (prop === "webkitVideoDecodedByteCount") videoRateNa = true;
      else audioRateNa = true;
      return "n/a";
    }
    if (sample.value == null) return "measuring…";
    return sample.value.toFixed(1);
  }

  function sourceLine(video) {
    const src = video.currentSrc || "";
    if (!src) return "no src";
    if (src.startsWith("blob:")) return "stream (blob/MSE)";
    try {
      const path = new URL(src, location.href).pathname;
      const match = path.match(/\.([a-z0-9]+)$/i);
      if (match) return `.${match[1].toLowerCase()}`;
    } catch {
      /* non-URL src */
    }
    return "url";
  }

  function readYouTube() {
    if (!isYouTube()) return null;
    let quality = null;
    let levels = null;
    const player = document.getElementById("movie_player");
    try {
      if (player && typeof player.getPlaybackQuality === "function") {
        quality = player.getPlaybackQuality();
        if (typeof player.getAvailableQualityLevels === "function") {
          levels = player.getAvailableQualityLevels();
        }
      }
    } catch {
      return null;
    }
    if (quality == null) {
      document.dispatchEvent(new CustomEvent("vq-yt-read"));
      const raw = document.documentElement.getAttribute("data-vq-yt");
      if (!raw) return null;
      const [q, levelText] = raw.split("\n");
      if (!q) return null;
      quality = q;
      levels = levelText ? levelText.split(" ").filter(Boolean) : [];
    }
    let text = mapYt(quality);
    if (Array.isArray(levels) && levels.length) {
      text += ` · available ${levels.map((level) => mapYt(level)).join(" ")}`;
    }
    return text;
  }

  function bufferAhead(video) {
    const time = video.currentTime;
    const buffered = video.buffered;
    try {
      for (let i = 0; i < buffered.length; i += 1) {
        if (buffered.start(i) <= time && time <= buffered.end(i)) {
          return buffered.end(i) - time;
        }
      }
    } catch {
      return 0;
    }
    return 0;
  }

  function droppedLine(video) {
    try {
      if (typeof video.getVideoPlaybackQuality !== "function") return "n/a";
      const q = video.getVideoPlaybackQuality();
      const dropped = q.droppedVideoFrames;
      const total = q.totalVideoFrames;
      const pct = total > 0 ? ((dropped / total) * 100).toFixed(1) : "0.0";
      return `${dropped} / ${total} (${pct}%)`;
    } catch {
      return "n/a";
    }
  }

  function fpsLine(video) {
    if (!fpsSupported) return "n/a";
    const paused = video.paused && !video.ended;
    if (fpsValue == null) return paused ? "measuring… (paused)" : "measuring…";
    const text = fpsValue.toFixed(1);
    return paused ? `${text} (paused)` : text;
  }

  function displayLine(video) {
    const size = `${video.clientWidth}×${video.clientHeight}`;
    if (!(video.videoHeight > 0)) return size;
    const scale = video.clientHeight / video.videoHeight;
    const shown = scale.toFixed(1);
    if (scale > 1.05) return `${size} · ${shown}× upscale`;
    if (scale < 0.95) return `${size} · ${shown}× downscale`;
    return `${size} · native`;
  }

  function stateLine(video) {
    let text = playbackState(video);
    if (video.playbackRate !== 1) text += ` @ ${video.playbackRate}×`;
    return text;
  }

  function addRow(parent, label, value) {
    const row = document.createElement("div");
    row.className = "row";
    const key = document.createElement("span");
    key.className = "k";
    key.textContent = label;
    const val = document.createElement("span");
    val.textContent = value;
    row.append(key, val);
    parent.append(row);
  }

  function renderPanel(video) {
    ensureHost();
    let panel = shadow.querySelector(".panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "panel";
      shadow.appendChild(panel);
    }
    panel.replaceChildren();
    const info = tier(video.videoWidth, video.videoHeight);
    const head = document.createElement("div");
    head.className = "head";
    const tierEl = document.createElement("span");
    tierEl.className = "tier";
    tierEl.textContent = info.label;
    const exact = document.createElement("span");
    exact.className = "exact";
    exact.textContent = `${video.videoWidth}×${video.videoHeight}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePanel(true);
    });
    head.append(tierEl, exact, close);
    panel.append(head);
    addRow(panel, "State", stateLine(video));
    addRow(panel, "FPS", fpsLine(video));
    addRow(panel, "Dropped", droppedLine(video));
    const videoRate = sampleRate(video, videoSample, "webkitVideoDecodedByteCount", videoRateNa, 1e6);
    addRow(panel, "Bitrate", videoRate === "n/a" || videoRate === "measuring…" ? videoRate : `${videoRate} Mbps`);
    const audioRate = sampleRate(video, audioSample, "webkitAudioDecodedByteCount", audioRateNa, 1000);
    addRow(panel, "Audio", audioRate === "n/a" || audioRate === "measuring…" ? audioRate : `${audioRate} kbps`);
    addRow(panel, "Display", displayLine(video));
    addRow(panel, "Buffer", `${bufferAhead(video).toFixed(1)}s`);
    addRow(panel, "Source", sourceLine(video));
    const yt = readYouTube();
    if (yt) addRow(panel, "YouTube", yt);
    placePanel(panel, video);
    setBadge(info.badge);
  }

  function selectedVideo() {
    if (selectedId == null) return null;
    const video = videos.get(selectedId);
    if (!video || !video.isConnected) return null;
    return video;
  }

  function onMove() {
    if (!shadow) return;
    placeHost();
    for (const button of shadow.querySelectorAll(".chip")) {
      const video = videos.get(button.dataset.id);
      if (video && isShown(video)) placeChip(button, video);
    }
    const panel = shadow.querySelector(".panel");
    const video = selectedVideo();
    if (panel && video) placePanel(panel, video);
  }

  function maybeAutoInspect() {
    if (!autoInspectEnabled) return;
    if (selectedId != null && manualLock) return;
    const found = collectVideos().filter(isShown);
    if (found.length === 0) return;

    const playing = found.filter((v) => !v.paused && !v.ended);
    let target = null;
    if (playing.length > 0) {
      target = playing.reduce((best, cur) =>
        (cur.videoWidth || 0) * (cur.videoHeight || 0) > (best.videoWidth || 0) * (best.videoHeight || 0) ? cur : best
      );
    } else {
      target = found.reduce((best, cur) =>
        (cur.videoWidth || 0) * (cur.videoHeight || 0) > (best.videoWidth || 0) * (best.videoHeight || 0) ? cur : best
      );
    }

    if (target && target.dataset.vqId) {
      if (selectedId === target.dataset.vqId) return;
      if (target.dataset.vqId === autoHoldId) return;
      select(target.dataset.vqId, false);
    }
  }

  function tick() {
    reconcile();
    if (autoInspectEnabled && selectedId == null) {
      maybeAutoInspect();
    }
    const video = selectedVideo();
    if (selectedId != null && !video) {
      closePanel(false);
      return;
    }
    if (video && shadow && shadow.querySelector(".panel")) renderPanel(video);
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    disarmPick();
    if (selectedId != null) closePanel(true);
  }

  function onPickClick(event) {
    if (!picking) return;
    const path = event.composedPath();
    if (host && path.includes(host)) return;
    const video = path.find((node) => node instanceof HTMLVideoElement);
    if (!video) return;
    const paused = video.paused;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const id = video.dataset.vqId || assignId(video);
    disarmPick();
    select(id, true);
    setTimeout(() => {
      if (!video.isConnected || video.paused === paused) return;
      if (paused) video.pause();
      else video.play().catch(() => {});
    }, 0);
  }

  function scan() {
    activated = true;
    const found = reconcile();
    return found.filter(isShown).map((video) => {
      const info = tier(video.videoWidth, video.videoHeight);
      return {
        id: video.dataset.vqId,
        label: info.label,
        exact: `${video.videoWidth}×${video.videoHeight}`,
        state: playbackState(video),
        w: video.videoWidth,
        h: video.videoHeight,
      };
    });
  }

  function armPick() {
    activated = true;
    ensureHost();
    reconcile();
    picking = true;
    markPicking();
    if (!pickClickBound) {
      window.addEventListener("click", onPickClick, true);
      pickClickBound = true;
    }
  }

  function disarmPick() {
    picking = false;
    markPicking();
  }

  function select(id, isManual = true) {
    const video = videos.get(String(id)) || [...videos.values()].find((el) => el.dataset.vqId === String(id));
    if (!video || !video.isConnected) {
      collectVideos();
      const retry = videos.get(String(id));
      if (!retry) return { ok: false };
      return select(retry.dataset.vqId, isManual);
    }
    activated = true;
    ensureHost();
    cancelRvfc();
    selectedId = video.dataset.vqId;
    if (isManual) {
      manualLock = true;
      autoHoldId = null;
    }
    startFps(video);
    startRates(video);
    renderPanel(video);
    disarmPick();
    try {
      chrome.runtime.sendMessage({ type: "disarmPick" });
    } catch {
      /* runtime optional */
    }
    return { ok: true };
  }

  function closePanel(isUser = true) {
    cancelRvfc();
    clearRateTimer();
    videoSample = null;
    audioSample = null;
    videoRateNa = false;
    audioRateNa = false;
    fpsValue = null;
    if (isUser && selectedId != null) {
      autoHoldId = selectedId;
      manualLock = false;
    }
    selectedId = null;
    if (shadow) {
      const panel = shadow.querySelector(".panel");
      if (panel) panel.remove();
    }
    setBadge("");
  }

  function install() {
    if (chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get("autoInspect", (res) => {
          if (chrome.runtime?.lastError) return;
          autoInspectEnabled = Boolean(res?.autoInspect);
          if (autoInspectEnabled) {
            activated = true;
            maybeAutoInspect();
          }
        });
      } catch {
        /* storage read fallback */
      }
    }

    if (chrome.storage && chrome.storage.onChanged) {
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === "local" && "autoInspect" in changes) {
            autoInspectEnabled = Boolean(changes.autoInspect.newValue);
            if (autoInspectEnabled) {
              activated = true;
              manualLock = false;
              autoHoldId = null;
              maybeAutoInspect();
            } else if (!manualLock && selectedId != null) {
              closePanel(false);
            }
          }
        });
      } catch {
        /* storage listener fallback */
      }
    }

    if (chrome.runtime && chrome.runtime.onMessage) {
      try {
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg?.type === "autoInspectChanged") {
            autoInspectEnabled = Boolean(msg.enabled);
            if (autoInspectEnabled) {
              activated = true;
              manualLock = false;
              autoHoldId = null;
              maybeAutoInspect();
            } else if (!manualLock && selectedId != null) {
              closePanel(false);
            }
          }
          if (msg?.type === "disarmPick") {
            disarmPick();
          }
        });
      } catch {
        /* message listener fallback */
      }
    }

    document.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    document.addEventListener("fullscreenchange", () => {
      placeHost();
      onMove();
    });
    window.addEventListener("keydown", onKey, true);
    const observer = new MutationObserver(() => {
      reconcile();
      if (autoInspectEnabled && selectedId == null) {
        maybeAutoInspect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(tick, 500);
    reconcile();
  }

  globalThis.__vq = { scan, armPick, disarmPick, select, closePanel, autoInspect: () => autoInspectEnabled };
  install();
}
