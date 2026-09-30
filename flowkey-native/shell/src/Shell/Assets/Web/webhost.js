/**
 * FlowKey webview host page: pumps host messages into DOM events, exposes a
 * post helper, injects the theme, and loads the extension's web bundle.
 * The extension bundle (built with the FlowKey CLI) registers its own
 * component and calls mountWebCommand from @flowkey-cli/native-sdk/web.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var extensionId = params.get('ext') || '';
  var entry = params.get('entry') || 'main.web.js';
  window.__FLOWKEY_EXTENSION_ID__ = extensionId;

  var webview = window.chrome && window.chrome.webview;
  if (!webview) {
    showLoadError('This page must run inside the FlowKey WebView2 host.');
    return;
  }

  window.flowkeyPost = function (message) {
    webview.postMessage(message);
  };

  window.addEventListener('error', function (event) {
    webview.postMessage({
      type: 'log',
      level: 'error',
      message: 'webview page error: ' + event.message,
    });
  });
  window.addEventListener('unhandledrejection', function (event) {
    webview.postMessage({
      type: 'log',
      level: 'error',
      message: 'webview unhandled rejection: ' + event.reason,
    });
  });

  // Host-injected capability API (the web analog of the tree SDK's
  // createCapabilities): every call is relayed through the sidecar and gated
  // by the shell's manifest/consent policy.
  var pendingCalls = new Map();
  var bridgeSeq = 1;

  function call(method, params, options) {
    var bridgeId = 'w' + bridgeSeq++;
    return new Promise(function (resolve, reject) {
      var settled = false;
      var signal = options && options.signal;
      var settle = function (fn) {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        pendingCalls.delete(bridgeId);
        fn();
      };
      var onAbort = function () {
        settle(function () {
          reject({ code: 'aborted', message: 'native method ' + method + ' aborted' });
          webview.postMessage({ type: 'webAbort', bridgeId: bridgeId, extensionId: extensionId });
        });
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      pendingCalls.set(bridgeId, function (resultMessage) {
        if (resultMessage.ok) resolve(resultMessage.result);
        else reject(resultMessage.error || { code: 'webFailed', message: 'web call failed' });
      });
      webview.postMessage({
        type: 'webCall',
        bridgeId: bridgeId,
        extensionId: extensionId,
        method: method,
        params: params,
        timeoutMs: options && options.timeoutMs,
      });
    });
  }

  function unwrapOk(result, method) {
    if (result && result.ok === false) throw new Error('native call ' + method + ' failed');
  }

  function createCapabilities() {
    var httpFetch = function (url, options) {
      options = options || {};
      var params = {
        url: url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        auth: options.auth,
        discardBody: options.discardBody,
        timeoutMs: options.timeoutMs,
      };
      return call('http.fetch', params, { signal: options.signal });
    };
    return {
      http: {
        fetch: httpFetch,
        fetchJson: function (url, options) {
          return httpFetch(url, options).then(function (r) {
            return JSON.parse(r.bodyText || '{}');
          });
        },
        upload: function (url, options) {
          options = options || {};
          return call(
            'http.upload',
            {
              url: url,
              bytes: options.bytes,
              method: options.method,
              headers: options.headers,
              timeoutMs: options.timeoutMs,
            },
            { signal: options.signal },
          );
        },
      },
      clipboard: {
        read: function () {
          return call('clipboard.read').then(function (r) {
            return r.text || null;
          });
        },
        write: function (text) {
          return call('clipboard.write', { text: text });
        },
        paste: function (text) {
          return call('clipboard.paste', { text: text });
        },
        history: function (options) {
          return call('clipboard.history', {
            query: options && options.query,
            limit: options && options.limit,
          }).then(function (r) {
            return r.items || [];
          });
        },
        clearHistory: function () {
          return call('clipboard.clearHistory', {});
        },
        deleteEntry: function (id) {
          return call('clipboard.deleteEntry', { id: id });
        },
        copyEntry: function (id) {
          return call('clipboard.copyEntry', { id: id });
        },
        pasteEntry: function (id) {
          return call('clipboard.pasteEntry', { id: id });
        },
        editEntry: function (id) {
          return call('clipboard.editEntry', { id: id });
        },
        writeContent: function (content) {
          return call('clipboard.write', content);
        },
        readContent: function () {
          return call('clipboard.read');
        },
        clear: function () {
          return call('clipboard.clear', {});
        },
      },
      storage: {
        get: function (key) {
          return call('storage.get', { key: key }).then(function (r) {
            unwrapOk(r, 'storage.get');
            return r.value === undefined ? null : r.value;
          });
        },
        set: function (key, value) {
          return call('storage.set', { key: key, value: value });
        },
        delete: function (key) {
          return call('storage.delete', { key: key });
        },
        keys: function () {
          return call('storage.keys').then(function (r) {
            return r.keys || [];
          });
        },
        allItems: function () {
          return this.keys().then(function (keys) {
            return Promise.all(
              keys.map(function (key) {
                return call('storage.get', { key: key }).then(function (r) {
                  return [key, r.value === undefined ? null : r.value];
                });
              }),
            ).then(function (entries) {
              var out = {};
              entries.forEach(function (entry) {
                if (entry[1] !== null) out[entry[0]] = entry[1];
              });
              return out;
            });
          });
        },
      },
      cache: {
        get: function (key) {
          return call('cache.get', { key: key }).then(function (r) {
            unwrapOk(r, 'cache.get');
            return r.value === undefined ? null : r.value;
          });
        },
        set: function (key, value, options) {
          return call('cache.set', {
            key: key,
            value: value,
            ttlSeconds: options && options.ttlSeconds,
          });
        },
        delete: function (key) {
          return call('cache.delete', { key: key });
        },
        clear: function () {
          return call('cache.clear', {});
        },
      },
      secrets: {
        get: function (key) {
          return call('secrets.get', { key: key }).then(function (r) {
            unwrapOk(r, 'secrets.get');
            return r.value || null;
          });
        },
        set: function (key, value) {
          return call('secrets.set', { key: key, value: value });
        },
        delete: function (key) {
          return call('secrets.delete', { key: key });
        },
      },
      shell: {
        openUrl: function (url) {
          return call('shell.openUrl', { url: url });
        },
        openPath: function (path) {
          return call('shell.openPath', { path: path });
        },
        revealPath: function (path) {
          return call('shell.revealPath', { path: path });
        },
      },
      fs: {
        readText: function (path) {
          return call('fs.readText', { path: path }).then(function (r) {
            unwrapOk(r, 'fs.readText');
            return r.content || '';
          });
        },
        writeText: function (path, content, options) {
          return call('fs.writeText', {
            path: path,
            content: content,
            append: !!(options && options.append),
          });
        },
        delete: function (path) {
          return call('fs.delete', { path: path });
        },
        glob: function (pattern, options) {
          return call('fs.glob', { pattern: pattern, limit: options && options.limit }).then(
            function (r) {
              unwrapOk(r, 'fs.glob');
              return r.entries || [];
            },
          );
        },
        stat: function (path) {
          return call('fs.stat', { path: path });
        },
        mkdir: function (path) {
          return call('fs.mkdir', { path: path });
        },
        exists: function (path) {
          return call('fs.exists', { path: path }).then(function (r) {
            return r.exists === true;
          });
        },
        copy: function (from, to) {
          return call('fs.copy', { from: from, to: to });
        },
        move: function (from, to) {
          return call('fs.move', { from: from, to: to });
        },
        trash: function (path) {
          return call('fs.trash', { path: path });
        },
      },
      apps: {
        list: function (query) {
          return call('apps.list', { query: query }).then(function (r) {
            return r.apps || [];
          });
        },
        launch: function (id) {
          return call('apps.launch', { id: id });
        },
        frontmost: function () {
          return call('apps.frontmost').then(function (r) {
            return r.app || null;
          });
        },
        defaultFor: function (path) {
          return call('apps.default', { path: path }).then(function (r) {
            return r.path || null;
          });
        },
      },
      media: {
        current: function () {
          return call('media.current');
        },
        control: function (command) {
          return call('media.control', { command: command });
        },
      },
      image: {
        fetch: function (url) {
          return call('image.fetch', { url: url }).then(function (r) {
            unwrapOk(r, 'image.fetch');
            return r.uri || '';
          });
        },
      },
      system: {
        selectedText: function (options) {
          return call('system.selectedText', {
            allowFallback: !!(options && options.allowFallback),
          }).then(function (r) {
            return r.text || null;
          });
        },
      },
      oauth: {
        authorize: function (provider, options) {
          return call(
            'oauth.authorize',
            { provider: provider, clientId: options && options.clientId },
            { signal: options && options.signal, timeoutMs: options && options.timeoutMs },
          );
        },
        status: function (provider, options) {
          return call('oauth.status', { provider: provider }, options);
        },
        disconnect: function (provider) {
          return call('oauth.disconnect', { provider: provider });
        },
      },
      hud: {
        show: function (options) {
          return call('hud.show', options);
        },
      },
      toast: {
        show: function (options) {
          return call('toast.show', options);
        },
      },
      alert: {
        confirm: function (options) {
          return call('alert.confirm', options).then(function (r) {
            return r.confirmed === true;
          });
        },
      },
    };
  }

  window.flowkey = {
    extensionId: extensionId,
    post: function (message) {
      webview.postMessage(message);
    },
    onMessage: function (handler) {
      webview.addEventListener('message', function (event) {
        var data = event.data;
        if (data && typeof data === 'object' && data.type !== 'theme') handler(data);
      });
    },
    capabilities: createCapabilities(),
  };

  webview.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'theme' && typeof data.css === 'string') {
      document.getElementById('fk-theme').textContent = data.css;
    }
    window.dispatchEvent(new MessageEvent('flowkey-message', { data: data }));
  });

  // The shell maps extensions.flowkey.local to the mounted extension's bundle
  // folder (installed package dir, or the first-party repo dist during dev),
  // so the entry loads straight from the host root. Every extension bundles
  // its web UI under the same file name (app.web.js), so the extension id
  // rides in the query string: the URL is the HTTP cache key, and a shared
  // cache would otherwise hand one extension's bundle to another.
  var script = document.createElement('script');
  script.src =
    'https://extensions.flowkey.local/' +
    encodeURIComponent(entry) +
    '?ext=' +
    encodeURIComponent(extensionId);
  script.onerror = function () {
    showLoadError('Failed to load the extension interface (' + extensionId + '/' + entry + ').');
    window.flowkeyPost({
      type: 'log',
      level: 'error',
      message: 'web bundle load failed: ' + extensionId + '/' + entry,
    });
  };
  document.body.appendChild(script);

  function showLoadError(message) {
    var element = document.getElementById('load-error');
    element.textContent = message;
    element.style.display = 'block';
  }
})();
