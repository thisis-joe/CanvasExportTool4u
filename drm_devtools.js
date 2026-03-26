// Registers "DRM Debugger" tab inside Chrome DevTools
chrome.devtools.panels.create(
  '🛡 DRM',           // tab title
  'icons/icon16.png', // icon
  'drm_panel.html',   // panel page
  (panel) => {
    console.log('[CanvasExportTool4u DRM Debugger] DevTools 패널 등록됨');
  }
);
