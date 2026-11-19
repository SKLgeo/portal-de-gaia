// Painel Portal de Gaia: só deixa o painel instalável. Sempre busca da internet (dados ao vivo).
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* rede normal */ });
