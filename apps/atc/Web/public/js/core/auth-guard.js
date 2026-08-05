// Client-side 401 chokepoint for ATC (issue #154). ATC is User-role gated
// server-side, so a logged-out browser never reaches this page (the server 302s
// it to /auth/). But if the session expires while the page is open, the app's
// data requests start coming back 401 — this bounces the browser to the auth
// login, returning to the exact URL afterwards. Loaded before all app JS (right
// after jQuery), so the guards are installed before any request goes out.
(function () {
  'use strict';

  var redirecting = false;

  // Send the browser to the auth login, preserving where we are so login can
  // return us here. /auth/ is absolute (a sibling app behind the same proxy);
  // the redirect target is our own root-relative URL, which the auth app's
  // safeRedirect() accepts.
  function redirectToLogin() {
    if (redirecting) return;
    redirecting = true;
    var here = location.pathname + location.search + location.hash;
    location.assign('/auth/?redirect=' + encodeURIComponent(here));
  }

  // Covers the ~22 jQuery ajax/get/getJSON call sites in one place.
  if (window.jQuery) {
    window.jQuery.ajaxSetup({ statusCode: { 401: redirectToLogin } });
  }

  // Native fetch() call sites the jQuery hook does not cover (e.g.
  // js/features/heatmap-replay.js). Only same-origin 401s trigger the redirect,
  // so cross-origin calls (e.g. the RainViewer request in js/map/layers.js) are
  // left alone. Web-worker fetches (js/util/jsonWorker.js) run off the window and
  // are not covered here — that worker is disabled by default (g.jWorkers = 0).
  if (window.fetch) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      return originalFetch(input, init).then(function (res) {
        if (res.status === 401) {
          var url = input && input.url ? input.url : String(input);
          var sameOrigin = true;
          try {
            sameOrigin = new URL(url, location.href).origin === location.origin;
          } catch (e) {
            sameOrigin = true;
          }
          if (sameOrigin) redirectToLogin();
        }
        return res;
      });
    };
  }
})();
