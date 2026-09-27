# VidQuality

[![Version](https://img.shields.io/badge/version-1.1.1-0f766e.svg)](CHANGELOG.md)
[![Manifest](https://img.shields.io/badge/manifest-v3-2dd4bf.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/platform-Chromium%20%7C%20Edge-informational.svg)](README.md)

Lightweight Chromium Manifest V3 browser extension that reveals the real-time playback quality, frame rate, dropped frames, bitrate, and resolution of HTML5 `<video>` elements, including cross-origin embedded iframes (YouTube, Vimeo, streaming players).

## Features

- **Live On-Video Cards:** Pin a metrics overlay directly onto any video showing tier (`4K`, `1440p`, `1080p`, etc.), exact resolution, state, FPS (`requestVideoFrameCallback`), dropped frames, video/audio bitrate, buffer ahead, and display scaling.
- **Embedded Video Detection:** Discovers videos in nested frames and cross-origin iframes with fallback resilience against sandboxed ad frames.
- **Auto-Inspect Mode:** Automatically selects and attaches quality panels to active videos as you browse.
- **Interactive Pick Mode:** Click any video on a page to inspect it without interrupting playback.
- **Toolbar Badge:** Displays the active video's quality tier directly on the extension icon.
- **YouTube Native Integration:** Reads quality labels directly from the player API across watch pages and embeds.

## Installation

### Load Unpacked (Chrome / Edge / Brave)

1. Clone or download this repository.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extension directory.

## Usage

- Click the **VidQuality** icon in the toolbar on any page with video content.
- Click **Inspect** next to any detected video to open its live metrics card.
- Click **Pick a video** to click directly on any video on the page.
- Toggle **Auto inspect** to automatically pin metrics cards whenever a video starts playing.
- Press **Escape** or click the **×** button on the card to dismiss it.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full release history.
