const saverEls = {
  selectorPage: document.getElementById("selectorPage"),
  selectorCanvas: document.getElementById("selectorCanvas"),
  pageNumberAttr: document.getElementById("pageNumberAttr"),
  filenamePrefix: document.getElementById("filenamePrefix"),
  renderWaitMs: document.getElementById("renderWaitMs"),
  minBlobSize: document.getElementById("minBlobSize"),
  autoScroll: document.getElementById("autoScroll"),
  scrollStepPx: document.getElementById("scrollStepPx"),
  scrollIntervalMs: document.getElementById("scrollIntervalMs"),
  saveSettings: document.getElementById("saveSettings"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  currentTab: document.getElementById("currentTab"),
  runningStatus: document.getElementById("runningStatus"),
  savedCount: document.getElementById("savedCount"),
  savedPages: document.getElementById("savedPages"),
  lastError: document.getElementById("lastError"),
  message: document.getElementById("saverMessage")
};

const saverDefaults = {
  selectorPage: ".page",
  selectorCanvas: "canvas",
  pageNumberAttr: "data-page-number",
  filenamePrefix: "page",
  renderWaitMs: 1200,
  minBlobSize: 3000,
  autoScroll: true,
  scrollStepPx: 900,
  scrollIntervalMs: 1400
};

function setSaverMessage(text, isError = false) {
  saverEls.message.textContent = text;
  saverEls.message.style.color = isError ? "#b91c1c" : "#0f766e";
}

async function loadSaverSettings() {
  const saved = await chrome.storage.local.get(Object.keys(saverDefaults));
  const config = { ...saverDefaults, ...saved };

  saverEls.selectorPage.value = config.selectorPage;
  saverEls.selectorCanvas.value = config.selectorCanvas;
  saverEls.pageNumberAttr.value = config.pageNumberAttr;
  saverEls.filenamePrefix.value = config.filenamePrefix;
  saverEls.renderWaitMs.value = config.renderWaitMs;
  saverEls.minBlobSize.value = config.minBlobSize;
  saverEls.autoScroll.checked = config.autoScroll;
  saverEls.scrollStepPx.value = config.scrollStepPx;
  saverEls.scrollIntervalMs.value = config.scrollIntervalMs;
}

function readSaverSettings() {
  return {
    selectorPage: saverEls.selectorPage.value.trim() || saverDefaults.selectorPage,
    selectorCanvas: saverEls.selectorCanvas.value.trim() || saverDefaults.selectorCanvas,
    pageNumberAttr: saverEls.pageNumberAttr.value.trim() || saverDefaults.pageNumberAttr,
    filenamePrefix: saverEls.filenamePrefix.value.trim() || saverDefaults.filenamePrefix,
    renderWaitMs: Number(saverEls.renderWaitMs.value) || saverDefaults.renderWaitMs,
    minBlobSize: Number(saverEls.minBlobSize.value) || saverDefaults.minBlobSize,
    autoScroll: saverEls.autoScroll.checked,
    scrollStepPx: Number(saverEls.scrollStepPx.value) || saverDefaults.scrollStepPx,
    scrollIntervalMs: Number(saverEls.scrollIntervalMs.value) || saverDefaults.scrollIntervalMs
  };
}

async function saveSaverSettingsOnly() {
  const config = readSaverSettings();
  await chrome.storage.local.set(config);
  setSaverMessage("설정을 저장했습니다.");
}

async function getSaverActiveTabInfo() {
  const response = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" });

  if (response?.ok) {
    saverEls.currentTab.textContent = response.url || "(알 수 없음)";
  } else {
    saverEls.currentTab.textContent = "(탭 정보 없음)";
  }
}

async function refreshSaverStatus() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  const status = response?.status || {};

  saverEls.runningStatus.textContent = status.running ? "실행 중" : "중지됨";
  saverEls.savedCount.textContent = String(status.savedCount || 0);
  saverEls.savedPages.textContent = Array.isArray(status.savedPages) && status.savedPages.length
    ? status.savedPages.join(", ")
    : "-";
  saverEls.lastError.textContent = status.lastError || "-";
}

async function startSaver() {
  try {
    const config = readSaverSettings();
    await chrome.storage.local.set(config);

    const response = await chrome.runtime.sendMessage({
      type: "INJECT_AND_START",
      config
    });

    if (!response?.ok) {
      throw new Error(response?.error || "시작 실패");
    }

    setSaverMessage("저장을 시작했습니다.");
    await refreshSaverStatus();
  } catch (error) {
    setSaverMessage(error?.message || String(error), true);
  }
}

async function stopSaver() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP" });
    if (!response?.ok) {
      throw new Error(response?.error || "중지 실패");
    }

    setSaverMessage("저장을 중지했습니다.");
    await refreshSaverStatus();
  } catch (error) {
    setSaverMessage(error?.message || String(error), true);
  }
}

function bindSaverEvents() {
  saverEls.saveSettings.addEventListener("click", saveSaverSettingsOnly);
  saverEls.startBtn.addEventListener("click", startSaver);
  saverEls.stopBtn.addEventListener("click", stopSaver);
  saverEls.refreshBtn.addEventListener("click", refreshSaverStatus);
}

const drmGet = (id) => document.getElementById(id);

let drmState = {
  enabled: false,
  interceptMode: "monitor",
  logs: [],
  stats: { total: 0, intercepted: 0, blocked: 0, passed: 0 }
};

const drmTypeLabels = {
  intercept: "감지",
  block: "차단",
  pass: "통과",
  info: "정보",
  error: "오류",
  mock: "모킹"
};

function drmModeDesc(mode) {
  return { monitor: "모니터링", block: "차단", mock: "모킹" }[mode] || mode;
}

function applyDrmState(state) {
  if (!state) {
    return;
  }

  drmState = state;
  const panel = drmGet("panelDrm");
  const toggle = drmGet("masterToggle");
  toggle.checked = state.enabled;

  const pill = drmGet("statusPill");
  pill.textContent = state.enabled ? "ON" : "OFF";
  pill.className = `status-pill ${state.enabled ? "on" : "off"}`;

  drmGet("toggleDesc").textContent = state.enabled
    ? `활성화 — ${drmModeDesc(state.interceptMode)} 모드`
    : "비활성화 — 일반 DRM 환경";

  panel.classList.toggle("drm-off", !state.enabled);

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.interceptMode);
  });

  drmGet("statTotal").textContent = String(state.stats.total);
  drmGet("statIntercepted").textContent = String(state.stats.intercepted);
  drmGet("statBlocked").textContent = String(state.stats.blocked);
  drmGet("statPassed").textContent = String(state.stats.passed);

  renderDrmLogs(state.logs || []);
  drmGet("footerInfo").textContent = `마지막 업데이트: ${new Date().toLocaleTimeString("ko-KR")}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderDrmLogs(logs) {
  const list = drmGet("logList");
  drmGet("logCount").textContent = String(logs.length);

  if (!logs.length) {
    list.innerHTML = '<div class="log-empty">DRM 테스트 모드를 활성화하면 네트워크 요청이 기록됩니다.</div>';
    return;
  }

  list.innerHTML = logs.map((log) => {
    const time = new Date(log.timestamp).toLocaleTimeString("ko-KR", { hour12: false });
    const label = drmTypeLabels[log.type] || log.type;
    return `
      <div class="log-item">
        <span class="log-badge ${log.type}">${label}</span>
        <div class="log-content">
          <div class="log-msg">${escapeHtml(log.message)}</div>
          <div class="log-time">${time}</div>
        </div>
      </div>`;
  }).join("");
}

function showDrmAgentChecking() {
  const section = drmGet("agentSection");
  const grid = drmGet("agentGrid");
  section.classList.add("visible");

  grid.innerHTML = [7777, 8443, 9443, 7443].map((port) => `
    <div class="agent-item">
      <div class="agent-dot checking"></div>
      <div class="agent-text">
        <div class="agent-port">:${port}</div>
        <div class="agent-status">점검 중...</div>
      </div>
    </div>`).join("");
}

function renderDrmAgentStatus(results) {
  const grid = drmGet("agentGrid");
  grid.innerHTML = results.map((result) => {
    const cls = result.reachable ? "connected" : "disconnected";
    const label = result.reachable ? "연결됨" : result.status;
    return `
      <div class="agent-item">
        <div class="agent-dot ${cls}"></div>
        <div class="agent-text">
          <div class="agent-port">:${result.port}</div>
          <div class="agent-status">${label}</div>
        </div>
      </div>`;
  }).join("");
}

function exportDrmLogs() {
  const logs = drmState.logs || [];
  if (!logs.length) {
    alert("내보낼 로그가 없습니다.");
    return;
  }

  const content = [
    "# CanvasExportTool4u DRM Debugger - 네트워크 로그",
    `내보내기 시각: ${new Date().toLocaleString("ko-KR")}`,
    `모드: ${drmModeDesc(drmState.interceptMode)}`,
    `통계: 전체 ${drmState.stats.total} | 감지 ${drmState.stats.intercepted} | 차단 ${drmState.stats.blocked} | 통과 ${drmState.stats.passed}`,
    "",
    "---",
    "",
    ...logs.map((log) => {
      const time = new Date(log.timestamp).toLocaleString("ko-KR");
      return `[${time}] [${(log.type || "").toUpperCase().padEnd(9)}] ${log.message}${log.detail ? `\n  → ${log.detail}` : ""}`;
    })
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `CanvasExportTool4u-drm-log-${Date.now()}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bindDrmEvents() {
  drmGet("masterToggle").addEventListener("change", (event) => {
    chrome.runtime.sendMessage({ type: "TOGGLE", enabled: event.target.checked }, applyDrmState);
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "SET_MODE", mode: btn.dataset.mode }, applyDrmState);
    });
  });

  drmGet("btnPing").addEventListener("click", () => {
    const btn = drmGet("btnPing");
    btn.disabled = true;
    btn.textContent = "점검 중...";
    showDrmAgentChecking();

    chrome.runtime.sendMessage({ type: "PING_ENDPOINTS" }, (results) => {
      btn.disabled = false;
      btn.textContent = "에이전트 점검";
      if (results) {
        renderDrmAgentStatus(results);
      }
    });
  });

  drmGet("btnExport").addEventListener("click", exportDrmLogs);

  drmGet("btnClear").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_LOGS" }, applyDrmState);
    drmGet("agentSection").classList.remove("visible");
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_UPDATE" && message.state) {
      applyDrmState(message.state);
    }
  });
}

function startDrmPolling() {
  window.setInterval(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      if (state) {
        applyDrmState(state);
      }
    });
  }, 1500);
}

function bindTabs() {
  const tabButtons = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;

      tabButtons.forEach((tabBtn) => {
        tabBtn.classList.toggle("active", tabBtn === btn);
        tabBtn.setAttribute("aria-selected", tabBtn === btn ? "true" : "false");
      });

      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === targetId);
      });
    });
  });
}

async function init() {
  bindTabs();
  bindSaverEvents();
  bindDrmEvents();

  await loadSaverSettings();
  await getSaverActiveTabInfo();
  await refreshSaverStatus();

  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  applyDrmState(state);
  startDrmPolling();
}

init();
