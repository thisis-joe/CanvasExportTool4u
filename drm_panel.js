// CanvasExportTool4u DRM Debugger - DevTools Panel Script

const $ = id => document.getElementById(id);

let state = { enabled: false, interceptMode: 'monitor', logs: [], stats: { total:0, intercepted:0, blocked:0, passed:0 } };
let activeFilter = 'all';
let searchQuery = '';
let expandedRows = new Set();

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, applyState);
  bindEvents();
  setInterval(poll, 1200);
  runInitialPing();
});

function poll() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, s => { if (s) applyState(s); });
}

// ── State ─────────────────────────────────────────
function applyState(s) {
  if (!s) return;
  state = s;

  // Toggle
  $('masterToggle').checked = s.enabled;
  $('statusDot').className = 'status-dot' + (s.enabled ? ' on' : '');
  $('toggleLabel').textContent = s.enabled ? '활성화' : '비활성화';

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === s.interceptMode);
  });

  // Stats
  $('sTotal').textContent       = s.stats.total;
  $('sIntercepted').textContent = s.stats.intercepted;
  $('sBlocked').textContent     = s.stats.blocked;
  $('sPassed').textContent      = s.stats.passed;

  // Rule info
  updateRuleInfo(s);

  // Logs
  renderLogs(s.logs);
}

function updateRuleInfo(s) {
  const el = $('ruleInfo');
  if (s.enabled && s.interceptMode === 'block') {
    el.innerHTML = '<span class="rule-active">● 활성화 (동적 규칙)</span><br>DRM 요청 차단 중...';
    chrome.runtime.sendMessage({ type: 'GET_BLOCK_RULES' }, rules => {
      if (rules) {
        el.innerHTML = `<span class="rule-active">● ${rules.length}개 규칙 활성화</span><br>${rules.map(r => r.condition?.urlFilter || '').filter(Boolean).join('<br>')}`;
      }
    });
  } else {
    el.innerHTML = '<span class="rule-inactive">● 비활성화됨</span><br>차단 모드 ON 시 활성화';
  }
}

// ── Events ────────────────────────────────────────
function bindEvents() {
  $('masterToggle').addEventListener('change', e => {
    chrome.runtime.sendMessage({ type: 'TOGGLE', enabled: e.target.checked }, applyState);
  });

  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SET_MODE', mode: btn.dataset.mode }, applyState);
    });
  });

  $('btnPing').addEventListener('click', () => {
    setAgentChecking();
    $('btnPing').textContent = '스캔 중...';
    $('btnPing').disabled = true;
    chrome.runtime.sendMessage({ type: 'PING_ENDPOINTS' }, results => {
      $('btnPing').textContent = '🔍 포트 스캔';
      $('btnPing').disabled = false;
      if (results) renderAgentStatus(results);
    });
  });

  $('btnClear').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, applyState);
    expandedRows.clear();
  });

  $('btnExport').addEventListener('click', exportLogs);

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.style.fontWeight = '');
      btn.style.fontWeight = '700';
      renderLogs(state.logs);
    });
  });

  // Search
  $('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderLogs(state.logs);
  });

  // Runtime messages
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'STATE_UPDATE' && msg.state) applyState(msg.state);
  });
}

// ── Log Rendering ─────────────────────────────────
const TYPE_LABEL = {
  intercept: '감지', block: '차단', pass: '통과',
  info: '정보', error: '오류', mock: '모킹'
};

function renderLogs(logs) {
  const tbody = $('logBody');
  const empty = $('emptyState');
  $('logCount').textContent = logs.length;

  let filtered = logs;
  if (activeFilter !== 'all') filtered = filtered.filter(l => l.type === activeFilter);
  if (searchQuery) filtered = filtered.filter(l =>
    (l.message || '').toLowerCase().includes(searchQuery) ||
    (l.detail  || '').toLowerCase().includes(searchQuery)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour12: false });
    const label = TYPE_LABEL[log.type] || log.type;
    const detailRow = log.detail
      ? `<tr class="row-detail${expandedRows.has(log.id) ? ' open' : ''}" data-detail="${log.id}"><td colspan="4">${esc(log.detail)}</td></tr>`
      : '';
    return `
      <tr data-id="${log.id}" class="log-row">
        <td><span class="badge badge-${log.type}">${label}</span></td>
        <td class="td-time">${time}</td>
        <td class="td-msg">${esc(log.message)}</td>
        <td class="td-url" title="${esc(log.detail || '')}">${esc(log.detail || '—')}</td>
      </tr>${detailRow}`;
  }).join('');

  // Row click to expand
  tbody.querySelectorAll('.log-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = parseFloat(row.dataset.id);
      const detailEl = tbody.querySelector(`.row-detail[data-detail="${id}"]`);
      if (!detailEl) return;
      if (expandedRows.has(id)) {
        expandedRows.delete(id);
        detailEl.classList.remove('open');
      } else {
        expandedRows.add(id);
        detailEl.classList.add('open');
      }
    });
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Agent Status ──────────────────────────────────
function setAgentChecking() {
  $('agentList').innerHTML = [7777,8443,9443,7443].map(p => `
    <div class="agent-row">
      <span class="a-dot wait"></span>
      <span class="a-port">:${p}</span>
      <span class="a-status">스캔 중...</span>
    </div>`).join('');
}

function renderAgentStatus(results) {
  $('agentList').innerHTML = results.map(r => `
    <div class="agent-row">
      <span class="a-dot ${r.reachable ? 'ok' : 'fail'}"></span>
      <span class="a-port">:${r.port}</span>
      <span class="a-status">${r.reachable ? '연결됨' : r.status}</span>
    </div>`).join('');
}

function runInitialPing() {
  chrome.runtime.sendMessage({ type: 'CHECK_DRM_AGENT' }, results => {
    if (results) renderAgentStatus(results);
  });
}

// ── Export ────────────────────────────────────────
function exportLogs() {
  const logs = state.logs;
  if (!logs.length) { alert('내보낼 로그가 없습니다.'); return; }
  const lines = [
    '# CanvasExportTool4u DRM Debugger — 네트워크 로그',
    `내보내기: ${new Date().toLocaleString('ko-KR')}`,
    `모드: ${state.interceptMode} | 전체:${state.stats.total} 감지:${state.stats.intercepted} 차단:${state.stats.blocked} 통과:${state.stats.passed}`,
    '', '---', '',
    ...logs.map(l => {
      const t = new Date(l.timestamp).toLocaleString('ko-KR');
      return `[${t}] [${(l.type||'').padEnd(9)}] ${l.message}${l.detail ? '\n  → '+l.detail : ''}`;
    })
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `CanvasExportTool4u-drm-${Date.now()}.txt`
  });
  a.click();
}
