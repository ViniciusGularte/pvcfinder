// Same-origin installs automatically inherit their mount path (for example /grveye).
// Set an absolute URL here only when the frontend is hosted separately from the API.
window.EYE_API = window.EYE_API || (() => {
  const script = document.currentScript;
  if (!script) return "";
  const url = new URL(".", script.src);
  const sameOriginApi = ["localhost", "127.0.0.1", "api.theyasked.co"].includes(location.hostname);
  return sameOriginApi && url.origin === location.origin
    ? url.pathname.replace(/\/$/, "")
    : "https://api.theyasked.co/grveye";
})();
