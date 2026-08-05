// atc — session-expiry guard. atc's frontend is vendored plain JS (tar1090); this is
// its one compiled client module (issue #177). It installs the shared same-origin
// "401 -> /auth/ login" redirect over window.fetch, and wires jQuery's ajax the same
// way so tar1090's $.ajax polls are covered too. Served under the /atc/ proxy prefix
// (stripped), so the redirect target uses the browser's true path.
//
// Loaded as a deferred ES module (see index.html), so it installs a touch later than
// the old classic script did. That's fine: it only needs to catch *future* 401s
// (a logged-out initial page load is already handled by the server's 302 on the page
// itself), and jQuery.ajaxSetup applies to every subsequent call regardless of when
// it runs.
import { installAuthRedirect, redirectToLogin } from '../../../Common/auth-client/index.ts';

installAuthRedirect();

// tar1090 uses jQuery.ajax for some polls; route their 401s through the same redirect.
// window.jQuery is untyped here (the client build sets types: []), so narrow via unknown.
interface JQueryLike {
  ajaxSetup(options: { statusCode: Record<number, () => void> }): void;
}
const jq = (window as unknown as { jQuery?: JQueryLike }).jQuery;
if (jq) jq.ajaxSetup({ statusCode: { 401: redirectToLogin } });
