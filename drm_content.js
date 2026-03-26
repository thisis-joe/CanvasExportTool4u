// CanvasExportTool4u DRM Debugger - Content Script (ISOLATED world)
// 페이지 CSP와 무관하게 동작합니다.
// XHR/Fetch 패치는 page_world.js를 MAIN world로 주입하여 처리합니다.
// ❌ 수정 전: document.createElement('script') + script.textContent 인라인 주입
//             → 페이지 CSP의 script-src 'unsafe-inline' 없으면 차단됨
// ✅ 수정 후: chrome.scripting.executeScript({ files: ['page_world.js'], world: 'MAIN' })
//             → 확장 프로그램 파일로 주입하므로 CSP 적용 대상 아님

(function () {
  'use strict';

  let messageListenerAttached = false;
  let monitorActive = false;

  // ── 초기 상태 확인 ──────────────────────────────────
  chrome.storage.local.get(['drmState'], (result) => {
    if (result.drmState?.enabled) {
      activateMonitor();
    }
  });

  // ── background / popup 에서 오는 상태 변경 수신 ────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      if (message.state.enabled) {
        activateMonitor();
      } else {
        deactivateMonitor();
      }
    }
  });

  // ── 모니터 활성화 ────────────────────────────────────
  function activateMonitor() {
    if (monitorActive) return;
    monitorActive = true;

    // background.js에 현재 탭 주입 요청
    // (content script에는 chrome.scripting API가 없으므로 background에 위임)
    chrome.runtime.sendMessage({ type: 'INJECT_PAGE_WORLD' });

    // window.postMessage 수신 리스너 (page_world.js → content script → background 릴레이)
    if (!messageListenerAttached) {
      messageListenerAttached = true;
      window.addEventListener('message', onPageMessage);
    }
  }

  // ── 모니터 비활성화 ──────────────────────────────────
  function deactivateMonitor() {
    if (!monitorActive) return;
    monitorActive = false;
    // 주입된 page_world.js의 패치는 페이지 새로고침 전까지 유지되나,
    // postMessage를 받아도 background로 전달하지 않으면 로그에 기록되지 않음
    chrome.runtime.sendMessage({ type: 'MONITOR_DEACTIVATED' });
  }

  // ── 페이지 → content script → background 릴레이 ──────
  function onPageMessage(event) {
    if (event.source !== window) return;
    if (!monitorActive) return;

    const { type, ...data } = event.data || {};

    if (type === '__CanvasExportTool4u_DRM_XHR__') {
      chrome.runtime.sendMessage({
        type: 'LOG_FROM_PAGE',
        logType: 'intercept',
        message: `[XHR] ${data.method} ${data.url}`,
        detail: data.url,
      });
    } else if (type === '__CanvasExportTool4u_DRM_FETCH__') {
      chrome.runtime.sendMessage({
        type: 'LOG_FROM_PAGE',
        logType: 'intercept',
        message: `[Fetch] ${data.url}`,
        detail: data.url,
      });
    } else if (type === '__CanvasExportTool4u_DRM_GLOBAL__') {
      chrome.runtime.sendMessage({
        type: 'LOG_FROM_PAGE',
        logType: 'info',
        message: `DRM 전역 객체 감지: ${(data.objects || []).join(', ')}`,
      });
    }
  }
})();
