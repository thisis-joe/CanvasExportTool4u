(() => {
    if (window.__canvasPageSaverContentLoaded__) {
        return;
    }
    window.__canvasPageSaverContentLoaded__ = true;

    function createController() {
        const state = {
            running: false,
            observer: null,
            scrollTimer: null,
            scrollTarget: null,
            scanLock: false,
            savedPages: new Set(),
            inFlightPages: new Set(),
            config: null,
            lastError: ""
        };

        const DEFAULTS = {
            selectorPage: ".page",
            selectorCanvas: "canvas",
            pageNumberAttr: "data-page-number",
            filenamePrefix: "page",
            renderWaitMs: 1200,
            minBlobSize: 3000,
            autoScroll: false,
            scrollStepPx: 900,
            scrollIntervalMs: 1400,
            scrollContainerSelector: "#viewerContainer"
        };

        function normalizeConfig(config) {
            const merged = { ...DEFAULTS, ...(config || {}) };

            merged.selectorPage = String(merged.selectorPage || ".page").trim();
            merged.selectorCanvas = String(merged.selectorCanvas || "canvas").trim();
            merged.pageNumberAttr = String(merged.pageNumberAttr || "data-page-number").trim();
            merged.filenamePrefix = String(merged.filenamePrefix || "page").trim() || "page";
            merged.scrollContainerSelector = String(
                merged.scrollContainerSelector || "#viewerContainer"
            ).trim();

            merged.renderWaitMs = Number(merged.renderWaitMs) || 1200;
            merged.minBlobSize = Number(merged.minBlobSize) || 3000;
            merged.autoScroll = Boolean(merged.autoScroll);
            merged.scrollStepPx = Number(merged.scrollStepPx) || 900;
            merged.scrollIntervalMs = Number(merged.scrollIntervalMs) || 1400;

            return merged;
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function getPages() {
            const { selectorPage } = state.config;
            return [...document.querySelectorAll(selectorPage)];
        }

        function getCanvasFromPage(pageEl) {
            const { selectorCanvas } = state.config;
            return pageEl.querySelector(selectorCanvas);
        }

        function parsePageNumberFromText(text) {
            if (!text) return null;

            const patterns = [
                /page\s*[:#]?\s*(\d+)/i,
                /p\s*[:#]?\s*(\d+)/i,
                /(\d+)\s*\/\s*\d+/,
                /\b(\d{1,5})\b/
            ];

            for (const pattern of patterns) {
                const m = text.match(pattern);
                if (m) {
                    const n = Number(m[1]);
                    if (Number.isFinite(n)) return n;
                }
            }
            return null;
        }

        function getPageNumber(pageEl, canvas) {
            const { pageNumberAttr } = state.config;

            const attrValue = pageEl.getAttribute(pageNumberAttr);
            if (attrValue && /^\d+$/.test(attrValue)) {
                return Number(attrValue);
            }

            const candidates = [
                canvas?.getAttribute?.("aria-label") || "",
                pageEl?.getAttribute?.("aria-label") || "",
                pageEl?.getAttribute?.("data-page-label") || "",
                pageEl?.innerText || "",
                pageEl?.textContent || ""
            ];

            for (const text of candidates) {
                const n = parsePageNumberFromText(text);
                if (n !== null) return n;
            }

            return null;
        }

        function findScrollContainer() {
            const explicitSelector = state.config?.scrollContainerSelector;
            if (explicitSelector) {
                const explicit = document.querySelector(explicitSelector);
                if (explicit) {
                    console.log("[Canvas Page Saver] using explicit scroll container:", explicit);
                    return explicit;
                }
            }

            const pageEls = getPages();
            if (!pageEls.length) {
                console.log("[Canvas Page Saver] no pages found, fallback to window");
                return window;
            }

            let el = pageEls[0].parentElement;
            while (el && el !== document.body && el !== document.documentElement) {
                const style = getComputedStyle(el);
                const canScrollY =
                    (style.overflowY === "auto" || style.overflowY === "scroll") &&
                    el.scrollHeight > el.clientHeight + 20;

                if (canScrollY) {
                    console.log("[Canvas Page Saver] auto-detected scroll container:", el);
                    return el;
                }
                el = el.parentElement;
            }

            console.log("[Canvas Page Saver] scroll container fallback to window");
            return window;
        }

        function getScrollInfo(target) {
            if (target === window) {
                const top = window.scrollY;
                const clientHeight = window.innerHeight;
                const scrollHeight = Math.max(
                    document.documentElement.scrollHeight,
                    document.body.scrollHeight
                );
                return { top, clientHeight, scrollHeight };
            }

            return {
                top: target.scrollTop,
                clientHeight: target.clientHeight,
                scrollHeight: target.scrollHeight
            };
        }

        function setScrollTop(target, top) {
            if (target === window) {
                window.scrollTo(0, top);
            } else {
                target.scrollTop = top;
            }
        }

        function isVisible(pageEl) {
            const rect = pageEl.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < window.innerHeight;
        }

        function sanitizeFilename(name) {
            return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
        }

        async function saveCanvas(canvas, pageNumber) {
            return new Promise(resolve => {
                try {
                    canvas.toBlob(blob => {
                        if (!blob || blob.size < state.config.minBlobSize) {
                            console.log(
                                `[Canvas Page Saver] skip ${pageNumber}: blob too small`,
                                blob?.size
                            );
                            resolve(false);
                            return;
                        }

                        const fileName = sanitizeFilename(
                            `${state.config.filenamePrefix}-${String(pageNumber).padStart(4, "0")}.png`
                        );

                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = fileName;
                        a.style.display = "none";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();

                        setTimeout(() => URL.revokeObjectURL(a.href), 4000);

                        console.log(`[Canvas Page Saver] saved ${fileName} (${blob.size} bytes)`);
                        resolve(true);
                    }, "image/png");
                } catch (error) {
                    console.error("[Canvas Page Saver] saveCanvas error:", error);
                    resolve(false);
                }
            });
        }

        async function saveOne(pageEl) {
            const canvas = getCanvasFromPage(pageEl);
            if (!canvas) return false;

            const pageNumber = getPageNumber(pageEl, canvas);
            if (!pageNumber) return false;

            if (state.savedPages.has(pageNumber)) return false;
            if (state.inFlightPages.has(pageNumber)) return false;

            state.inFlightPages.add(pageNumber);

            try {
                await sleep(state.config.renderWaitMs);

                if (!state.running) return false;

                if (!canvas || canvas.width === 0 || canvas.height === 0) {
                    console.log(`[Canvas Page Saver] skip ${pageNumber}: canvas empty`);
                    return false;
                }

                const ok = await saveCanvas(canvas, pageNumber);
                if (ok) {
                    state.savedPages.add(pageNumber);
                }
                return ok;
            } catch (error) {
                state.lastError = error?.message || String(error);
                console.error("[Canvas Page Saver] saveOne error:", error);
                return false;
            } finally {
                state.inFlightPages.delete(pageNumber);
            }
        }

        async function scanVisible() {
            if (!state.running) return;
            if (state.scanLock) return;

            state.scanLock = true;
            try {
                console.log("[Canvas Page Saver] scanVisible running");
                const pages = getPages();

                for (const pageEl of pages) {
                    if (!state.running) break;
                    if (!isVisible(pageEl)) continue;
                    await saveOne(pageEl);
                }
            } catch (error) {
                state.lastError = error?.message || String(error);
                console.error("[Canvas Page Saver] scanVisible error:", error);
            } finally {
                state.scanLock = false;
            }
        }

        function onScroll() {
            scanVisible();
        }

        function attachScrollListener() {
            detachScrollListener();

            const target = state.scrollTarget || findScrollContainer();
            state.scrollTarget = target;

            if (target === window) {
                window.addEventListener("scroll", onScroll, { passive: true });
            } else {
                target.addEventListener("scroll", onScroll, { passive: true });
            }

            console.log("[Canvas Page Saver] scroll listener attached:", target);
        }

        function detachScrollListener() {
            if (!state.scrollTarget) {
                window.removeEventListener("scroll", onScroll);
                return;
            }

            if (state.scrollTarget === window) {
                window.removeEventListener("scroll", onScroll);
            } else {
                state.scrollTarget.removeEventListener("scroll", onScroll);
            }
        }

        function startAutoScroll() {
            stopAutoScroll();

            if (!state.config.autoScroll) {
                console.log("[Canvas Page Saver] autoScroll disabled");
                return;
            }

            const scrollTarget = state.scrollTarget || findScrollContainer();
            state.scrollTarget = scrollTarget;

            console.log("[Canvas Page Saver] autoScroll target:", scrollTarget);

            state.scrollTimer = setInterval(() => {
                if (!state.running) return;

                const { top, clientHeight, scrollHeight } = getScrollInfo(scrollTarget);
                const maxTop = Math.max(0, scrollHeight - clientHeight);
                const nextTop = Math.min(top + state.config.scrollStepPx, maxTop);

                console.log("[Canvas Page Saver] autoScroll tick", {
                    top,
                    clientHeight,
                    scrollHeight,
                    nextTop,
                    maxTop
                });

                setScrollTop(scrollTarget, nextTop);

                if (nextTop >= maxTop) {
                    console.log("[Canvas Page Saver] autoScroll reached end");
                    stopAutoScroll();
                }
            }, state.config.scrollIntervalMs);
        }

        function stopAutoScroll() {
            if (state.scrollTimer) {
                clearInterval(state.scrollTimer);
                state.scrollTimer = null;
            }
        }

        function attachObserver() {
            detachObserver();

            state.observer = new MutationObserver(() => {
                scanVisible();
            });

            state.observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            console.log("[Canvas Page Saver] observer attached");
        }

        function detachObserver() {
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
        }

        async function start(config) {
            if (state.running) {
                stop();
            }

            state.config = normalizeConfig(config);
            state.running = true;
            state.lastError = "";
            state.savedPages.clear();
            state.inFlightPages.clear();

            state.scrollTarget = findScrollContainer();

            attachObserver();
            attachScrollListener();
            startAutoScroll();

            await scanVisible();

            console.log("[Canvas Page Saver] started", state.config);
        }

        function stop() {
            state.running = false;
            detachObserver();
            stopAutoScroll();
            detachScrollListener();
            console.log("[Canvas Page Saver] stopped");
        }

        function getStatus() {
            return {
                running: state.running,
                savedCount: state.savedPages.size,
                savedPages: [...state.savedPages].sort((a, b) => a - b),
                inFlightPages: [...state.inFlightPages].sort((a, b) => a - b),
                lastError: state.lastError,
                config: state.config
            };
        }

        return {
            start,
            stop,
            getStatus
        };
    }

    if (!window.__canvasPageSaverController__) {
        window.__canvasPageSaverController__ = createController();
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        (async () => {
            const controller = window.__canvasPageSaverController__;
            console.log("[Canvas Page Saver] message received:", message);

            if (message?.type === "START_SAVER") {
                await controller.start(message.config || {});
                console.log("[Canvas Page Saver] started");
                sendResponse({ ok: true, status: controller.getStatus() });
                return;
            }

            if (message?.type === "STOP_SAVER") {
                controller.stop();
                console.log("[Canvas Page Saver] stopped");
                sendResponse({ ok: true, status: controller.getStatus() });
                return;
            }

            if (message?.type === "GET_SAVER_STATUS") {
                const status = controller.getStatus();
                console.log("[Canvas Page Saver] status requested:", status);
                sendResponse(status);
                return;
            }
        })();

        return true;
    });
})();