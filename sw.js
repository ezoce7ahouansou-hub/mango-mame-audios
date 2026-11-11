// Mango Mame : mode hors-ligne. Change VERSION à chaque mise à jour des fichiers.
var VERSION = "mango-audios-v8";
var OLD = ["mm-v1", "mm-v2", "mm-v3"];  // anciennes versions de CE site uniquement (les autres sites github.io partagent le même espace de cache)
var FILES = ["./", "index.html", "couverture.jpg", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
for (var i = 1; i <= 13; i++) FILES.push("audio/Mango_Mame_Page_" + ("0" + i).slice(-2) + ".mp3");

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // un par un (plus fiable sur réseau lent), 2 essais par fichier
    return FILES.reduce(function (p, f) {
      return p.then(function () { return c.add(f).catch(function () { return c.add(f).catch(function () {}); }); });
    }, Promise.resolve());
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION && (OLD.indexOf(k) > -1 || k.indexOf("mango-audios-") === 0); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function rangeResponse(req, res) {
  var m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (!m) return res;
  return res.arrayBuffer().then(function (buf) {
    var size = buf.byteLength, start = m[1] ? parseInt(m[1], 10) : 0, end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (!m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
    end = Math.min(end, size - 1);
    return new Response(buf.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg", "Content-Length": String(end - start + 1),
      "Content-Range": "bytes " + start + "-" + end + "/" + size, "Accept-Ranges": "bytes" } });
  });
}
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {  // la page elle-même : toujours la version la plus récente si internet, sinon la copie gardée
    e.respondWith(fetch(req).then(function (net) {
      if (net && net.status === 200) { var cp = net.clone(); caches.open(VERSION).then(function (c) { c.put("index.html", cp); }); }
      return net;
    }).catch(function () { return caches.open(VERSION).then(function (c) { return c.match("index.html"); }); }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true, ignoreVary: true }).then(function (hit) {
      if (hit) return rangeResponse(req, hit);
      var isAudio = /\.mp3$/.test(new URL(req.url).pathname);
      // audio absent du cache : on récupère le fichier entier, on le garde, puis on répond (même pour une demande par morceaux)
      return fetch(isAudio ? new Request(req.url) : req).then(function (net) {
        if (net && net.status === 200) { c.put(isAudio ? new Request(req.url) : req, net.clone()); return isAudio ? rangeResponse(req, net) : net; }
        return net;
      }).catch(function () { return req.mode === "navigate" ? c.match("index.html") : Response.error(); });
    });
  }));
});
