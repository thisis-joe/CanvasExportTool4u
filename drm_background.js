// CanvasExportTool4u DRM Debugger - Background Service Worker (v1.1 - MV3 fixed)

const DRM_PATTERNS = [
  'markany', 'webdrm', 'drm-agent', 'drmgateway',
  'maws', 'madrm', 'agent.CanvasExportTool4u', 'drm.CanvasExportTool4u',
  'localhost:7777', 'localhost:8443',
  '127.0.0.1:7777', '127.0.0.1:8443'
];

let state = {
  enabled: false,
  interceptMode: 'monitor',
  logs: [],
  stats: { total: 0, intercepted: 0, blocked: 0, passed: 0 }
};

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['drmState'], (result) => {
  if (result.drmState) {
    state = { ...state, ...result.drmState, logs: result.drmState.logs || [] };
    syncBlockRules();
  }
});

// ── declarativeNetRequest: dynamic rules for actual blocking ──────────────────
// MV3 removed blocking from webRequest. Must use declarativeNetRequest instead.
async function syncBlockRules() {
  const shouldBlock = state.enabled && state.interceptMode === 'block';

  if (shouldBlock) {
    await applyDynamicBlockRules();
  } else {
    await removeDynamicBlockRules();
  }
}

async function applyDynamicBlockRules() {
  await removeDynamicBlockRules(); // clear first to avoid ID conflicts

  const patterns = [
    '*markany*', '*webdrm*', '*madrm*', '*maws*',
    '*drm-agent*', '*drmgateway*',
    '||localhost:7777/', '||localhost:8443/',
    '||127.0.0.1:7777/', '||127.0.0.1:8443/'
  ];

  const rules = patterns.map((urlFilter, i) => ({
    id: 1000 + i,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter,
      resourceTypes: [
        'xmlhttprequest', 'websocket', 'other', 'script',
        'ping', 'image', 'media', 'object',
        'stylesheet', 'font', 'sub_frame', 'main_frame'
      ]
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: rules,
    removeRuleIds: rules.map(r => r.id)
  });

  addLog('block', `차단 규칙 적용 완료 (${rules.length}개 패턴)`);
}

async function removeDynamicBlockRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = existing.map(r => r.id);
    if (ids.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
    }
  } catch (e) {
    console.warn('removeDynamicBlockRules:', e);
  }
}

// ── Logging helpers ───────────────────────────────────────────────────────────
function isDRMRequest(url) {
  if (!url) return false;
  return DRM_PATTERNS.some(p => url.toLowerCase().includes(p));
}

function getHost(url) {
  try { return new URL(url).host; } catch { return url.slice(0, 50); }
}

function addLog(type, message, detail = '') {
  const log = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    type, message, detail
  };
  state.logs.unshift(log);
  if (state.logs.length > 300) state.logs = state.logs.slice(0, 300);

  state.stats.total++;
  if (type === 'intercept') state.stats.intercepted++;
  if (type === 'block')     state.stats.blocked++;
  if (type === 'pass')      state.stats.passed++;

  saveState();
  broadcastUpdate();
}

function saveState() {
  chrome.storage.local.set({ drmState: { ...state, logs: state.logs.slice(0, 100) } });
}

function broadcastUpdate() {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: getSafeState() }).catch(() => {});
}

function getSafeState() {
  return {
    enabled: state.enabled,
    interceptMode: state.interceptMode,
    logs: state.logs.slice(0, 80),
    stats: state.stats
  };
}

// ── webRequest: observe only (MV3 — no 'blocking' extraInfoSpec) ──────────────
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!state.enabled || !isDRMRequest(details.url)) return;
    const host = getHost(details.url);
    const method = details.method || 'GET';

    if (state.interceptMode === 'monitor') {
      addLog('intercept', `[감지] ${method} ${host}`, details.url);
    } else if (state.interceptMode === 'mock') {
      addLog('mock', `[모킹] ${host}`, details.url);
    } else if (state.interceptMode === 'block') {
      // declarativeNetRequest actually blocks it; this is just the log
      addLog('block', `[차단] ${host}`, details.url);
    }
  },
  { urls: ['<all_urls>'] }
  // ← No 'blocking' here — that's the MV3 fix
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!state.enabled || !isDRMRequest(details.url)) return;
    const status = details.statusCode;
    addLog(status >= 400 ? 'error' : 'pass',
      `[응답 ${status}] ${getHost(details.url)}`, details.url);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!state.enabled || !isDRMRequest(details.url)) return;
    // ERR_BLOCKED_BY_CLIENT = our declarativeNetRequest rule succeeded
    const blocked = details.error === 'net::ERR_BLOCKED_BY_CLIENT';
    addLog(blocked ? 'block' : 'error',
      blocked
        ? `[✓차단됨] ${getHost(details.url)}`
        : `[오류] ${details.error} — ${getHost(details.url)}`,
      details.url);
  },
  { urls: ['<all_urls>'] }
);

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'GET_STATE':
      sendResponse(getSafeState());
      break;

    case 'TOGGLE':
      state.enabled = message.enabled;
      addLog('info', state.enabled ? '🟢 DRM 테스트 모드 활성화' : '🔴 DRM 테스트 모드 비활성화');
      syncBlockRules();
      updateBadge();
      saveState();
      sendResponse(getSafeState());
      break;

    case 'SET_MODE':
      state.interceptMode = message.mode;
      addLog('info', `모드 변경 → ${getModeLabel(message.mode)}`);
      syncBlockRules();
      saveState();
      sendResponse(getSafeState());
      break;

    case 'CLEAR_LOGS':
      state.logs = [];
      state.stats = { total: 0, intercepted: 0, blocked: 0, passed: 0 };
      saveState();
      sendResponse(getSafeState());
      break;

    // content.js 요청: 현재 탭에 page_world.js를 MAIN world로 주입
    // - 파일 주입 방식이므로 페이지 CSP의 script-src 제약을 받지 않음
    case 'INJECT_PAGE_WORLD':
      if (sender.tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ['drm_page_world.js'],
          world: 'MAIN',          // 페이지 window에 직접 접근 가능
          injectImmediately: true,
        }).catch(err => {
          // 이미 주입되어 있거나 접근 불가 프레임은 무시
          console.warn('[DRM Debugger] page_world 주입 실패:', err.message);
        });
      }
      sendResponse({ ok: true });
      break;

    // page_world.js → content.js → background 로 올라오는 페이지 내부 로그
    case 'LOG_FROM_PAGE':
      if (state.enabled) {
        addLog(message.logType || 'intercept', message.message, message.detail || '');
      }
      sendResponse({ ok: true });
      break;

    case 'MONITOR_DEACTIVATED':
      sendResponse({ ok: true });
      break;

    case 'CHECK_DRM_AGENT':
      checkDRMAgent().then(sendResponse);
      return true;

    case 'PING_ENDPOINTS':
      pingAll().then(sendResponse);
      return true;

    case 'LOG_FROM_PAGE':
      if (state.enabled) addLog(message.logType || 'intercept', message.message, message.detail || '');
      break;

    case 'GET_BLOCK_RULES':
      chrome.declarativeNetRequest.getDynamicRules().then(rules => sendResponse(rules));
      return true;
  }
  return true;
});

function getModeLabel(mode) {
  return { monitor: '👁 모니터링', block: '🚫 차단', mock: '🎭 모킹' }[mode] || mode;
}

function updateBadge() {
  chrome.action.setBadgeText({ text: state.enabled ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: state.enabled ? '#00D4AA' : '#666' });
}

// ── DRM Agent check ───────────────────────────────────────────────────────────
async function checkDRMAgent() {
  const ports = [7777, 8443, 9443, 7443];
  return Promise.all(ports.map(async (port) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      await fetch(`http://localhost:${port}/`, { signal: ctrl.signal, mode: 'no-cors' });
      clearTimeout(timer);
      return { port, status: 'connected', reachable: true };
    } catch (e) {
      return { port, status: e.name === 'AbortError' ? 'timeout' : 'unreachable', reachable: false };
    }
  }));
}

async function pingAll() {
  addLog('info', '🔍 DRM 에이전트 포트 스캔 시작...');
  const results = await checkDRMAgent();
  const connected = results.filter(r => r.reachable);
  if (connected.length > 0) {
    addLog('pass', `에이전트 연결됨 — 포트: ${connected.map(r => r.port).join(', ')}`);
  } else {
    addLog('error', 'DRM 에이전트 미감지 — 설치/실행 여부를 확인하세요');
  }
  return results;
}

updateBadge();
