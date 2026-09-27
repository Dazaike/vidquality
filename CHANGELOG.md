# Changelog

All notable changes to VidQuality will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-09-27

### Added
- Auto-inspect option in popup toolbar with persistent state stored in `chrome.storage.local`.
- Support for detecting and inspecting embedded videos across cross-origin `<iframe>` elements (YouTube, Vimeo, custom video stream players).
- Resilient multi-frame script execution in `popup.js` that falls back to `chrome.webNavigation.getAllFrames` so sandboxed ad frames do not interrupt video discovery.
- MAIN-world YouTube quality bridge (`yt_bridge.js`) loaded across watch pages and embed frames.
- Viewport clamping and responsive sizing for quality panels inside small embed iframes.
- On-page quality chips positioned over visible videos with real-time tier indicators.
- Live detail card overlay measuring FPS via `requestVideoFrameCallback`, dropped frame percentage, decoded video and audio bitrate, buffer ahead, and display scaling.
- Interactive video pick mode to target and pin cards by clicking directly on videos.
- Dynamic toolbar action badge reflecting the selected video's playback tier.
