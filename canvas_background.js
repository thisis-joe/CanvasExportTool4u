chrome.runtime.onInstalled.addListener(async () => {
    console.log("[BG] installed");

    const existing = await chrome.storage.local.get([
        "selectorPage",
        "selectorCanvas",
        "pageNumberAttr",
        "filenamePrefix",
        "renderWaitMs",
        "minBlobSize",
        "autoScroll",
        "scrollStepPx",
        "scrollIntervalMs"
    ]);

    const defaults = {
        selectorPage: ".page",
        selectorCanvas: "canvas",
        pageNumberAttr: "data-page-number",
        filenamePrefix: "page",
        renderWaitMs: 1200,
        minBlobSize: 3000,
        autoScroll: false,
        scrollStepPx: 900,
        scrollIntervalMs: 1400
    };

    const toSet = {};
    for (const [key, value] of Object.entries(defaults)) {
        if (existing[key] === undefined) {
            toSet[key] = value;
        }
    }

    if (Object.keys(toSet).length > 0) {
        await chrome.storage.local.set(toSet);
        console.log("[BG] defaults saved", toSet);
    }
});

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}

async function sendMessageToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
}

async function injectContentScript(tabId) {
    console.log("[BG] injecting content.js into tab", tabId);
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        console.log("[BG] message received:", message);

        if (message?.type === "GET_ACTIVE_TAB") {
            const tab = await getActiveTab();
            console.log("[BG] active tab:", tab?.id, tab?.url);
            sendResponse({ ok: true, tabId: tab?.id ?? null, url: tab?.url ?? "" });
            return;
        }

        if (message?.type === "INJECT_AND_START") {
            const tab = await getActiveTab();

            if (!tab?.id) {
                sendResponse({ ok: false, error: "활성 탭을 찾을 수 없음." });
                return;
            }

            try {
                // 1차: 이미 content.js가 있으면 바로 START 전송
                try {
                    console.log("[BG] trying START_SAVER without injection");
                    const res = await sendMessageToTab(tab.id, {
                        type: "START_SAVER",
                        config: message.config
                    });
                    console.log("[BG] START_SAVER success without injection:", res);
                    sendResponse({ ok: true, mode: "direct", response: res });
                    return;
                } catch (firstError) {
                    console.warn("[BG] direct START_SAVER failed, will inject:", firstError);
                }

                // 2차: 없으면 주입 후 다시 START 전송
                await injectContentScript(tab.id);

                const res = await sendMessageToTab(tab.id, {
                    type: "START_SAVER",
                    config: message.config
                });

                console.log("[BG] START_SAVER success after injection:", res);
                sendResponse({ ok: true, mode: "inject", response: res });
                return;
            } catch (error) {
                console.error("[BG] INJECT_AND_START failed:", error);
                sendResponse({
                    ok: false,
                    error: error?.message || String(error)
                });
                return;
            }
        }

        if (message?.type === "STOP") {
            const tab = await getActiveTab();

            if (!tab?.id) {
                sendResponse({ ok: false, error: "활성 탭을 찾을 수 없음." });
                return;
            }

            try {
                const res = await sendMessageToTab(tab.id, { type: "STOP_SAVER" });
                console.log("[BG] STOP_SAVER response:", res);
                sendResponse({ ok: true, response: res });
            } catch (error) {
                console.error("[BG] STOP failed:", error);
                sendResponse({
                    ok: false,
                    error: error?.message || String(error)
                });
            }
            return;
        }

        if (message?.type === "GET_STATUS") {
            const tab = await getActiveTab();

            if (!tab?.id) {
                sendResponse({ ok: false, error: "활성 탭을 찾을 수 없음." });
                return;
            }

            try {
                const response = await sendMessageToTab(tab.id, { type: "GET_SAVER_STATUS" });
                console.log("[BG] status response:", response);
                sendResponse({ ok: true, status: response });
            } catch (error) {
                console.warn("[BG] GET_STATUS fallback:", error);
                sendResponse({
                    ok: true,
                    status: {
                        running: false,
                        savedCount: 0,
                        savedPages: [],
                        inFlightPages: [],
                        lastError: ""
                    }
                });
            }
            return;
        }
    })();

    return true;
});