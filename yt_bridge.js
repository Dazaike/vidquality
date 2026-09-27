if (!globalThis.__vqYtBridge) {
  globalThis.__vqYtBridge = true;
  document.addEventListener("vq-yt-read", () => {
    const root = document.documentElement;
    if (!root) return;
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
}
