chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "badge" && sender.tab?.id != null) {
    const text = typeof msg.text === "string" ? msg.text.slice(0, 4) : "";
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#0f766e" });
    return;
  }
  if (msg?.type === "disarmPick" && sender.tab?.id != null) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "disarmPick" }).catch(() => {});
  }
});
