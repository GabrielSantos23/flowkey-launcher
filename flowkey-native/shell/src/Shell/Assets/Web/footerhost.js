/**
 * FlowKey footer chrome page: a pure renderer for the shell's FooterState
 * pushes. The shell owns every decision (what the left slot shows, the
 * primary action, the Ctrl+K hint, toasts); this page only turns state JSON
 * into DOM using the same --fk-* theme tokens as the extension pages.
 * The native XAML footer stays visible until this page reports ready.
 */
(function () {
  'use strict';

  var webview = window.chrome && window.chrome.webview;
  if (!webview) {
    return; // outside WebView2: the native fallback keeps rendering
  }

  var left = document.getElementById('left');
  var primary = document.getElementById('primary');
  var enter = document.getElementById('enter');
  var actionsHint = document.getElementById('actions-hint');
  var right = document.getElementById('right');
  var toast = document.getElementById('toast');
  var toastDot = document.getElementById('toast-dot');
  var toastTitle = document.getElementById('toast-title');
  var toastDetail = document.getElementById('toast-detail');

  webview.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'theme' && typeof data.css === 'string') {
      document.getElementById('fk-theme').textContent = data.css;
    } else if (data.type === 'state') {
      render(data);
    }
  });

  window.addEventListener('error', function (event) {
    webview.postMessage({
      type: 'log',
      level: 'error',
      message: 'footer page error: ' + event.message,
    });
  });

  function render(state) {
    renderLeft(state.left);
    var hasPrimary = typeof state.primaryTitle === 'string' && state.primaryTitle.length > 0;
    primary.textContent = hasPrimary ? state.primaryTitle : '';
    primary.hidden = !hasPrimary;
    enter.hidden = !hasPrimary;
    actionsHint.hidden = state.showActionsHint !== true;
    // The right pill only exists while it has something to say.
    right.hidden = !hasPrimary && state.showActionsHint !== true;
    renderToast(state.toast);
  }

  function renderLeft(leftState) {
    left.textContent = '';
    left.classList.toggle('settings', leftState && leftState.kind === 'settings');
    if (!leftState || typeof leftState.kind !== 'string') return;
    if (leftState.kind === 'command') {
      if (leftState.icon && leftState.icon.kind === 'image' && leftState.icon.dataUri) {
        var image = document.createElement('img');
        image.className = 'icon';
        image.alt = '';
        image.src = leftState.icon.dataUri;
        left.appendChild(image);
      } else if (leftState.icon && leftState.icon.kind === 'emoji' && leftState.icon.emoji) {
        var emoji = document.createElement('span');
        emoji.className = 'icon icon-emoji';
        emoji.textContent = leftState.icon.emoji;
        left.appendChild(emoji);
      }
      var title = document.createElement('span');
      title.className = 'title';
      title.textContent = leftState.title || '';
      left.appendChild(title);
    } else if (leftState.kind === 'settings') {
      left.appendChild(buildSettingsButton());
    }
  }

  function buildSettingsButton() {
    var gear = document.createElement('button');
    gear.id = 'settings';
    gear.type = 'button';
    gear.title = 'Settings';
    gear.textContent = '\uE700';
    gear.addEventListener('click', function () {
      webview.postMessage({ type: 'action', action: 'settings' });
    });
    return gear;
  }

  function renderToast(toastState) {
    if (!toastState || typeof toastState.title !== 'string') {
      toast.hidden = true;
      toast.classList.remove('error');
      left.hidden = false;
      return;
    }
    toastTitle.textContent = toastState.title;
    var hasDetail = typeof toastState.detail === 'string' && toastState.detail.length > 0;
    toastDetail.textContent = hasDetail ? toastState.detail : '';
    toastDetail.hidden = !hasDetail;
    toastDot.hidden = toastState.isError !== true;
    toast.classList.toggle('error', toastState.isError === true);
    left.hidden = true; // the toast replaces the left slot, like the native bar
    toast.hidden = false;
  }

  webview.postMessage({ type: 'ready' });
})();
