// CanvasExportTool4u DRM Debugger - Page World Script
// MAIN world에서 실행되어 window.XHR / window.fetch에 직접 접근합니다.
// content.js가 chrome.scripting.executeScript({ world: 'MAIN' })로 주입합니다.

(function () {
  // 중복 주입 방지
  if (window.__CanvasExportTool4u_DRM_INJECTED__) return;
  window.__CanvasExportTool4u_DRM_INJECTED__ = true;

  const DRM_PATTERNS = ['markany', 'webdrm', 'drm-agent', 'maws', 'madrm'];

  // ── XHR 패치 ──────────────────────────────────────
  const OriginalXHR = window.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new OriginalXHR();
    const origOpen = xhr.open.bind(xhr);

    xhr.open = function (method, url, ...args) {
      if (DRM_PATTERNS.some(p => String(url).toLowerCase().includes(p))) {
        window.postMessage(
          { type: '__CanvasExportTool4u_DRM_XHR__', method, url: String(url) },
          '*'
        );
      }
      return origOpen(method, url, ...args);
    };

    return xhr;
  }

  // prototype 체인 유지 (instanceof 등이 깨지지 않도록)
  PatchedXHR.prototype = OriginalXHR.prototype;
  Object.setPrototypeOf(PatchedXHR, OriginalXHR);
  window.XMLHttpRequest = PatchedXHR;

  // ── Fetch 패치 ─────────────────────────────────────
  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : String(input ?? '');

    if (DRM_PATTERNS.some(p => url.toLowerCase().includes(p))) {
      window.postMessage({ type: '__CanvasExportTool4u_DRM_FETCH__', url }, '*');
    }
    return originalFetch.apply(this, arguments);
  };

  // ── DRM 전역 객체 감지 ──────────────────────────────
  const DRM_GLOBALS = ['MarkAny', 'WebDRM', 'MaWebDRM', 'MAWebDRM', 'maWebDRM'];

  function checkDRMGlobals() {
    const found = DRM_GLOBALS.filter(name => typeof window[name] !== 'undefined');
    if (found.length > 0) {
      window.postMessage({ type: '__CanvasExportTool4u_DRM_GLOBAL__', objects: found }, '*');
    }
  }

  setTimeout(checkDRMGlobals, 500);
  setTimeout(checkDRMGlobals, 2000);
  setTimeout(checkDRMGlobals, 5000);

  console.log(
    '%c[CanvasExportTool4u DRM Debugger] 모니터링 활성화됨 (page world)',
    'color: #00D4AA; font-weight: bold; font-size: 12px;'
  );
})();
