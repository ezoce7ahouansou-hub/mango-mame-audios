/* Mango Mame : les audios — mode sans Internet.
   La page est toujours redemandée à Internet en premier (chaque mise à jour arrive tout de suite) ; la copie de l'appareil ne sert que
   hors ligne. Les audios sont gardés dans l'appareil et rendus par morceaux (Range), ce qu'exige Safari sur iPhone.
   Pour publier une nouvelle version : changer VERSION et NUM ci-dessous, version.txt, et VERSION_PAGE dans index.html (même numéro). */
var VERSION = "mango-audios-v20", NUM = 20;
var CORE = ["./index.html", "./manifest.webmanifest", "./couverture.jpg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  // cache "reload" : on ignore la mémoire du navigateur pour ne jamais ranger une ancienne version ; les audios ne bloquent pas l'installation
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(new Request(u, { cache: "reload" })); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var noms = await caches.keys();
    // seulement les copies de CE site (le même domaine héberge aussi l'atelier de coloriage)
    var anciens = noms.filter(function (n) { return n !== VERSION && (/^mango-audios-/.test(n) || n === "mm-v1" || n === "mm-v2" || n === "mm-v3"); });
    var ancienne = anciens.some(function (n) { var m = n.match(/v(\d+)$/); return !m || +m[1] < NUM; });
    await Promise.all(anciens.map(function (n) { return caches.delete(n); }));
    await self.clients.claim();
    if (ancienne) { // passage unique depuis les anciennes versions : leurs pages ouvertes sont rechargées une fois
      var pages = await self.clients.matchAll({ type: "window" });
      pages.forEach(function (p) { try { p.navigate(p.url); } catch (err) {} });
    }
  })());
});

async function plage(req, rep) {
  var m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (!m) return rep;
  var buf = await rep.arrayBuffer();
  var taille = buf.byteLength, debut = m[1] ? parseInt(m[1], 10) : 0, fin = m[2] ? parseInt(m[2], 10) : taille - 1;
  if (!m[1] && m[2]) { debut = taille - parseInt(m[2], 10); fin = taille - 1; }
  fin = Math.min(fin, taille - 1);
  if (debut > fin) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + taille } });
  return new Response(buf.slice(debut, fin + 1), { status: 206, statusText: "Partial Content", headers: {
    "Content-Type": rep.headers.get("Content-Type") || "audio/mpeg", "Content-Length": String(fin - debut + 1),
    "Content-Range": "bytes " + debut + "-" + fin + "/" + taille, "Accept-Ranges": "bytes" } });
}

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (/\/version\.txt$/.test(url.pathname)) return; // toujours demandé à Internet
  var estAudio = /\.mp3$/.test(url.pathname);

  // la page elle-même : Internet d'abord (4 s maximum), puis la copie de l'appareil.
  // (un téléchargement d'audio est aussi une « navigation » : il ne doit pas recevoir la page à la place du fichier)
  if (req.mode === "navigate" && !estAudio) {
    e.respondWith((async function () {
      try {
        var rep = await Promise.race([fetch("./index.html", { cache: "no-cache" }), new Promise(function (_, ko) { setTimeout(function () { ko(new Error("lent")); }, 4000); })]);
        if (rep && rep.ok) { var copie = rep.clone(); caches.open(VERSION).then(function (c) { c.put("./index.html", copie); }); return rep; }
      } catch (err) { /* hors ligne ou trop lent : on prend la copie */ }
      var c = await caches.open(VERSION);
      return (await c.match("./index.html")) || fetch(req);
    })());
    return;
  }

  // le reste (audios, image, icônes) : la copie de l'appareil d'abord
  e.respondWith((async function () {
    var c = await caches.open(VERSION);
    var trouve = await c.match(req, { ignoreSearch: true, ignoreVary: true });
    if (trouve) return estAudio ? await plage(req, trouve) : trouve;
    try {
      // audio absent : on récupère le fichier entier, on le garde, puis on répond (même pour une demande par morceaux)
      var net = await fetch(estAudio ? new Request(req.url) : req);
      if (net && net.status === 200) {
        c.put(estAudio ? new Request(req.url) : req, net.clone());
        return estAudio ? await plage(req, net) : net;
      }
      return net;
    } catch (err) { return Response.error(); }
  })());
});
