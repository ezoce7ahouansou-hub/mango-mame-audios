// Mango Mame : l'application hors-ligne a été retirée. Ce fichier nettoie les téléphones qui l'avaient installée.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var ks = await caches.keys();
    for (var i = 0; i < ks.length; i++) { if (ks[i].indexOf("mango-audios-") === 0 || ks[i].indexOf("mm-") === 0) await caches.delete(ks[i]); }
    await self.registration.unregister();
    var cs = await self.clients.matchAll({ type: "window" });
    cs.forEach(function (c) { c.navigate(c.url); });
  })());
});
