/* Portal de Gaia — loja (site público). Tudo vem do banco e é editado no painel. */
(function () {
  "use strict";
  var G = window.GAIA, P = G.prefixo, ic = window.gaiaIcone;
  var $ = function (id) { return document.getElementById(id); };
  var dados = { config: {}, setores: [], produtos: [], banners: [] };
  var heroTimer = null;

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function reais(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function img(u) { return u ? String(u) : ""; }
  function ler(chave, padrao) { try { var v = localStorage.getItem(P + chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravar(chave, v) { try { localStorage.setItem(P + chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  function semAcento(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2800); }
  function precoFinal(p) { return p.preco_promocional != null && Number(p.preco_promocional) < Number(p.preco) ? Number(p.preco_promocional) : Number(p.preco); }
  function setorDe(p) { return dados.setores.find(function (s) { return s.id === p.setor_id; }); }
  function whatsNumero() { var n = String(dados.config.whatsapp || "").replace(/\D/g, ""); if (!n) return ""; return n.length <= 11 ? "55" + n : n; }

  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    return fetch(G.url + "/rest/v1/" + caminho, {
      method: opcoes.method || "GET",
      headers: Object.assign({ apikey: G.chave, "Content-Type": "application/json" }, opcoes.headers || {}),
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { throw new Error(e.message || ("Erro " + r.status)); });
      return r.status === 204 ? null : r.json();
    });
  }

  // ---------- contador de acessos (sem cookie, sem IP) ----------
  var sessao = (function () {
    try { var s = sessionStorage.getItem(P + "sessao"); if (s) return s; s = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); sessionStorage.setItem(P + "sessao", s); return s; }
    catch (e) { return "s" + Date.now() + Math.random(); }
  })();
  var naoContar = (function () {
    try {
      if (/[?&]nao-contar=1/.test(location.search)) localStorage.setItem(P + "nao_contar", "1");
      if (/[?&]contar=1/.test(location.search)) localStorage.removeItem(P + "nao_contar");
      return localStorage.getItem(P + "nao_contar") === "1" || /^(localhost|127\.|\[::1\])/.test(location.hostname) || navigator.doNotTrack === "1";
    } catch (e) { return false; }
  })();
  function origem() {
    var m = location.search.match(/[?&]utm_source=([^&]+)/);
    if (m) return decodeURIComponent(m[1]).toLowerCase().slice(0, 40);
    if (!document.referrer) return "direto";
    try {
      var h = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (h === location.hostname) return "direto";
      if (/instagram/.test(h)) return "instagram";
      if (/facebook|fb\./.test(h)) return "facebook";
      if (/whatsapp|wa\.me/.test(h)) return "whatsapp";
      if (/google/.test(h)) return "google";
      return h.slice(0, 40);
    } catch (e) { return "outro"; }
  }
  function aparelho() { var w = Math.min(screen.width, screen.height); return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? (w >= 600 ? "tablet" : "celular") : (/iPad/.test(navigator.userAgent) ? "tablet" : "computador"); }
  var ultimoContado = { k: "", t: 0 };
  function contar(tipo, extra) {
    if (naoContar) return;
    extra = extra || {};
    var k = tipo + "|" + (extra.produto || "") + "|" + (extra.setor || "");
    if ((tipo === "produto" || tipo === "setor") && k === ultimoContado.k && Date.now() - ultimoContado.t < 5000) return;
    ultimoContado = { k: k, t: Date.now() };
    api("rpc/registrar_acesso", { method: "POST", body: {
      p_tipo: tipo, p_sessao: sessao, p_pagina: (location.hash || "#/").slice(0, 200),
      p_produto: extra.produto || null, p_setor: extra.setor || null, p_termo: extra.termo || null,
      p_origem: tipo === "visita" ? origem() : null, p_aparelho: aparelho()
    } }).catch(function () { /* contador nunca atrapalha a loja */ });
  }

  // ---------- carregar dados ----------
  function carregar() {
    var cache = ler("cache_v1", null);
    if (cache) { dados = cache; aplicarConfig(); montarSetores(); rotear(); }
    return Promise.all([
      api("loja_config?select=*&id=eq.1"),
      api("setores?select=*&ativo=eq.true&order=ordem,nome"),
      api("produtos?select=*&ativo=eq.true&order=ordem,nome"),
      api("banners?select=*&ativo=eq.true&order=ordem")
    ]).then(function (r) {
      dados = { config: r[0][0] || {}, setores: r[1] || [], produtos: r[2] || [], banners: r[3] || [] };
      gravar("cache_v1", dados);
      aplicarConfig(); montarSetores(); rotear(); atualizarContador();
    }).catch(function () {
      if (!cache) $("conteudo").innerHTML = '<div class="vazio">' + ic("lua") + "<p>Não foi possível carregar a loja agora. Verifique sua internet e tente de novo.</p></div>";
    });
  }

  function escurecer(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var c = function (x) { return Math.max(0, Math.min(255, Math.round(x * f))); };
    return "#" + [c(r), c(g), c(b)].map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }
  function clarear(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var c = function (x) { return Math.round(x + (255 - x) * f); };
    return "#" + [c(r), c(g), c(b)].map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }

  function aplicarConfig() {
    var c = dados.config, raiz = document.documentElement.style;
    if (c.cor_verde) { raiz.setProperty("--verde", c.cor_verde); raiz.setProperty("--verde-escuro", escurecer(c.cor_verde, .62)); document.querySelector('meta[name="theme-color"]').content = c.cor_verde; }
    if (c.cor_roxo) { raiz.setProperty("--roxo", c.cor_roxo); raiz.setProperty("--roxo-escuro", escurecer(c.cor_roxo, .64)); }
    if (c.cor_dourado) { raiz.setProperty("--ouro", c.cor_dourado); raiz.setProperty("--ouro-claro", clarear(c.cor_dourado, .45)); }
    var nome = c.nome || "Portal de Gaia";
    document.title = nome + " · Loja esotérica";
    if (c.logo_url) { $("logoImg").src = img(c.logo_url); $("logoGaveta").src = img(c.logo_url); }
    $("logoImg").alt = nome;
    $("avisoTopo").textContent = c.aviso_topo || "";
    $("avisoTopo").hidden = !c.aviso_topo;
    $("sobreTitulo").textContent = c.sobre_titulo || "";
    $("sobreTexto").textContent = c.sobre_texto || "";
    if (c.sobre_imagem_url) $("sobreImg").src = img(c.sobre_imagem_url);
    $("rodapeNome").textContent = nome;
    $("rodapeLema").textContent = c.rodape_texto || "";
    $("carrinhoFrete").textContent = c.frete_texto || "";
    $("pilares").innerHTML = [["lotus", "Conexão com Gaia"], ["lua", "Intuição e ciclos"], ["pentagrama", "Proteção e equilíbrio"], ["folha", "Transformação e renovação"]]
      .map(function (p) { return "<li>" + ic(p[0]) + esc(p[1]) + "</li>"; }).join("");

    var w = whatsNumero();
    var botoes = [];
    if (w) botoes.push('<a class="btn-dourado" data-contar="whatsapp" target="_blank" rel="noopener" href="https://wa.me/' + w + '?text=' + encodeURIComponent("Olá! Vim pelo site do " + nome + ".") + '">' + ic("whatsapp") + "Chamar no WhatsApp</a>");
    if (c.instagram) botoes.push('<a class="btn-contorno" data-contar="instagram" target="_blank" rel="noopener" href="https://instagram.com/' + encodeURIComponent(String(c.instagram).replace(/^@/, "")) + '">' + ic("instagram") + "@" + esc(String(c.instagram).replace(/^@/, "")) + "</a>");
    if (!botoes.length) botoes.push('<a class="btn-dourado" href="#/loja">' + ic("lotus") + "Conhecer os produtos</a>");
    $("contatoBotoes").innerHTML = botoes.join("");
    var info = [];
    if (c.endereco) info.push("<li>" + ic("local") + esc(c.endereco) + "</li>");
    if (c.horario) info.push("<li>" + ic("relogio") + esc(c.horario) + "</li>");
    if (c.email) info.push('<li>' + ic("email") + '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a></li>");
    $("contatoInfo").innerHTML = info.join("");
    var wf = $("whatsFlutuante");
    wf.hidden = !w;
    if (w) wf.href = "https://wa.me/" + w + "?text=" + encodeURIComponent("Olá! Vim pelo site do " + nome + ".");
  }

  function montarSetores() {
    var links = dados.setores.map(function (s) {
      return '<a href="#/setor/' + esc(s.slug) + '" data-slug="' + esc(s.slug) + '">' + ic(s.icone) + esc(s.nome) + "</a>";
    }).join("");
    $("faixaSetores").innerHTML = links;
    $("gavetaSetores").innerHTML = dados.setores.map(function (s) {
      return '<a href="#/setor/' + esc(s.slug) + '" data-fechar-menu>' + ic(s.icone) + esc(s.nome) + "</a>";
    }).join("");
  }

  // ---------- cartões de produto ----------
  function fotoHTML(p, classe) {
    var f = (p.imagens || [])[0];
    var s = setorDe(p);
    return f ? '<img src="' + esc(img(f)) + '" alt="' + esc(p.nome) + '" loading="lazy">'
      : '<div class="sem-foto ' + (classe || "") + '">' + ic(s ? s.icone : "lotus") + "</div>";
  }
  function selosHTML(p) {
    var s = [];
    if (p.esgotado) s.push('<span class="selo cinza">Esgotado</span>');
    else if (p.preco_promocional != null && Number(p.preco_promocional) < Number(p.preco)) s.push('<span class="selo ouro">Promoção</span>');
    if (p.novo && !p.esgotado) s.push('<span class="selo">Novo</span>');
    return s.length ? '<div class="selos">' + s.join("") + "</div>" : "";
  }
  function precoHTML(p) {
    var promo = p.preco_promocional != null && Number(p.preco_promocional) < Number(p.preco);
    return '<div class="preco">' + (promo ? '<span class="antigo">' + reais(p.preco) + "</span>" : "") + '<span class="atual">' + reais(precoFinal(p)) + "</span></div>";
  }
  function cardHTML(p) {
    return '<article class="card">' +
      '<a class="card-foto" href="#/produto/' + p.id + '" aria-label="' + esc(p.nome) + '">' + fotoHTML(p) + selosHTML(p) + "</a>" +
      '<div class="card-corpo"><a class="card-nome" href="#/produto/' + p.id + '">' + esc(p.nome) + "</a>" + precoHTML(p) +
      (p.esgotado ? '<button class="btn-roxo" disabled>Esgotado</button>' : '<button class="btn-roxo" data-adicionar="' + p.id + '">' + ic("carrinho") + "Adicionar</button>") +
      "</div></article>";
  }

  // ---------- páginas ----------
  function pararHero() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }

  function paginaInicio() {
    var c = dados.config;
    var slides = dados.banners.length ? dados.banners : [{ titulo: c.hero_titulo, subtitulo: c.hero_texto, imagem_url: c.hero_imagem_url || "img/hero-deusa.jpg", botao_texto: "Conhecer a loja" }];
    var hero = '<section class="hero" aria-roledescription="carrossel" aria-label="Destaques">' +
      '<div class="hero-trilho" id="heroTrilho">' + slides.map(function (b, i) {
        var link = b.link_setor ? "#/setor/" + esc(b.link_setor) : "#/loja";
        var H = i === 0 ? "h1" : "h2";
        return '<div class="hero-wrap" aria-hidden="' + (i ? "true" : "false") + '"><div class="hero-slide">' +
          '<div class="hero-texto"><p class="sobretitulo">' + esc(c.nome || "Portal de Gaia") + "</p>" +
          (b.titulo ? "<" + H + ">" + esc(b.titulo) + "</" + H + ">" : "") +
          (b.subtitulo ? '<p class="hero-sub">' + esc(b.subtitulo) + "</p>" : "") +
          '<a class="btn-dourado" href="' + link + '">' + esc(b.botao_texto || "Ver produtos") + ic("seta") + "</a></div>" +
          '<div class="hero-img"><img src="' + esc(img(b.imagem_url)) + '" alt="" ' + (i ? 'loading="lazy"' : 'fetchpriority="high"') + "></div>" +
          "</div></div>";
      }).join("") + "</div>" +
      (slides.length > 1 ? '<button class="hero-seta esq" data-hero="-1" aria-label="Anterior">' + ic("voltar") + '</button><button class="hero-seta dir" data-hero="1" aria-label="Próximo">' + ic("seta") + "</button>" +
        '<div class="hero-pontos">' + slides.map(function (_, i) { return '<button data-hero-ir="' + i + '" aria-label="Ir para o destaque ' + (i + 1) + '"' + (i ? "" : ' class="ativo"') + "></button>"; }).join("") + "</div>" : "") +
      "</section>";

    var pilares = '<div class="pilares-faixa"><ul>' + [["lotus", "Conexão com Gaia"], ["triplice", "Intuição e ciclos"], ["pentagrama", "Proteção e equilíbrio"], ["folha", "Transformação e renovação"]]
      .map(function (p) { return "<li>" + ic(p[0]) + "<span>" + p[1] + "</span></li>"; }).join("") + "</ul></div>";

    var destaques = dados.produtos.filter(function (p) { return p.destaque; });
    var html = hero + pilares;
    if (destaques.length) html += secaoHTML("Escolhidos com intenção", "Os queridinhos do Portal", "estrela", destaques, "#/loja");
    dados.setores.forEach(function (s) {
      var lista = dados.produtos.filter(function (p) { return p.setor_id === s.id; });
      if (lista.length) html += secaoHTML(s.nome, s.descricao, s.icone, lista.slice(0, 12), "#/setor/" + s.slug);
    });
    if (!dados.produtos.length) html += '<div class="vazio">' + ic("lotus") + "<p>Em breve, novos produtos por aqui.</p></div>";
    $("conteudo").innerHTML = html;
    iniciarHero(slides.length);
  }

  function secaoHTML(titulo, sub, icone, lista, link) {
    return '<section class="secao"><div class="secao-cab"><div><h2>' + ic(icone) + esc(titulo) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") +
      '</div><a class="ver-todos" href="' + link + '">Ver todos' + ic("seta") + "</a></div>" +
      '<div class="fileira">' + lista.map(cardHTML).join("") + "</div></section>";
  }

  function iniciarHero(n) {
    pararHero();
    if (n < 2) return;
    var atual = 0, trilho = $("heroTrilho");
    function ir(i) {
      atual = (i + n) % n;
      trilho.style.transform = "translateX(" + (-100 * atual) + "%)";
      trilho.querySelectorAll(".hero-wrap").forEach(function (w, k) { w.setAttribute("aria-hidden", k === atual ? "false" : "true"); });
      document.querySelectorAll("[data-hero-ir]").forEach(function (b, k) { b.classList.toggle("ativo", k === atual); });
    }
    iniciarHero.ir = function (d) { ir(atual + d); reiniciar(); };
    iniciarHero.irPara = function (i) { ir(i); reiniciar(); };
    function reiniciar() { pararHero(); heroTimer = setInterval(function () { ir(atual + 1); }, 6500); }
    // arrastar no celular
    var x0 = null;
    trilho.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    trilho.addEventListener("touchend", function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) iniciarHero.ir(dx < 0 ? 1 : -1); x0 = null; });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) reiniciar();
  }

  function paginaLista(titulo, sub, lista, opcoes) {
    opcoes = opcoes || {};
    var ordem = ler("ordem", "relevancia");
    function ordenar(l) {
      l = l.slice();
      if (ordem === "menor") l.sort(function (a, b) { return precoFinal(a) - precoFinal(b); });
      else if (ordem === "maior") l.sort(function (a, b) { return precoFinal(b) - precoFinal(a); });
      else if (ordem === "nome") l.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
      return l;
    }
    function desenhar() {
      var l = ordenar(lista);
      $("gradeLista").innerHTML = l.length ? l.map(cardHTML).join("") : "";
      $("vazioLista").hidden = !!l.length;
    }
    $("conteudo").innerHTML =
      '<div class="pagina-cab"><p class="sobretitulo">' + esc(opcoes.sobre || "Loja") + "</p><h1>" + esc(titulo) + "</h1>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>" +
      '<section class="secao"><div class="filtros"><span>' + lista.length + (lista.length === 1 ? " produto" : " produtos") + "</span>" +
      '<label>Ordenar: <select id="ordemLista"><option value="relevancia">Destaques</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="nome">Nome (A–Z)</option></select></label></div>' +
      '<div class="grade" id="gradeLista"></div><div class="vazio" id="vazioLista" hidden>' + ic("lua") + "<p>" + esc(opcoes.vazio || "Nenhum produto por aqui ainda.") + '</p><a class="btn-contorno" href="#/loja">Ver toda a loja</a></div></section>';
    $("ordemLista").value = ordem;
    $("ordemLista").addEventListener("change", function () { ordem = this.value; gravar("ordem", ordem); desenhar(); });
    desenhar();
  }

  function paginaProduto(id) {
    var p = dados.produtos.find(function (x) { return x.id === id; });
    if (!p) { $("conteudo").innerHTML = '<div class="vazio">' + ic("lua") + '<p>Produto não encontrado.</p><a class="btn-contorno" href="#/loja">Ver a loja</a></div>'; return; }
    var s = setorDe(p), fotos = (p.imagens || []).filter(Boolean), qtd = 1;
    document.title = p.nome + " · " + (dados.config.nome || "Portal de Gaia");
    $("conteudo").innerHTML = '<div class="produto">' +
      '<nav class="trilha"><a href="#/">Início</a>›' + (s ? '<a href="#/setor/' + esc(s.slug) + '">' + esc(s.nome) + "</a>›" : "") + "<span>" + esc(p.nome) + "</span></nav>" +
      '<div class="produto-grade"><div><div class="galeria-principal" id="galeria">' + (fotos.length ? '<img id="fotoGrande" src="' + esc(img(fotos[0])) + '" alt="' + esc(p.nome) + '">' : fotoHTML(p)) + selosHTML(p) + "</div>" +
      (fotos.length > 1 ? '<div class="miniaturas">' + fotos.map(function (f, i) { return '<button data-foto="' + i + '"' + (i ? "" : ' class="ativo"') + ' aria-label="Foto ' + (i + 1) + '"><img src="' + esc(img(f)) + '" alt=""></button>'; }).join("") + "</div>" : "") +
      "</div>" +
      '<div class="produto-info">' + (s ? '<p class="sobretitulo">' + esc(s.nome) + "</p>" : "") + "<h1>" + esc(p.nome) + "</h1>" + precoHTML(p) +
      (p.descricao ? '<div class="produto-desc">' + esc(p.descricao) + "</div>" : '<div class="produto-desc"></div>') +
      (p.esgotado ? '<p class="produto-nota">' + ic("lua") + 'Este produto está esgotado no momento. Chame no WhatsApp para saber quando volta.</p>' :
        '<div class="qtd-linha"><span style="font-family:var(--ui);font-size:15px">Quantidade</span><div class="qtd"><button id="qMenos" aria-label="Menos">' + ic("menos") + '</button><span id="qValor">1</span><button id="qMais" aria-label="Mais">' + ic("mais") + "</button></div></div>" +
        '<div class="produto-acoes"><button class="btn-roxo largo" id="addProduto">' + ic("carrinho") + 'Adicionar ao carrinho</button>' +
        (whatsNumero() ? '<a class="btn-dourado largo" id="pedirAgora" target="_blank" rel="noopener" href="#">' + ic("whatsapp") + "Pedir agora pelo WhatsApp</a>" : "") + "</div>") +
      '<p class="produto-nota">' + ic("lotus") + esc(dados.config.frete_texto || "Frete combinado pelo WhatsApp.") + "</p>" +
      "</div></div></div>";

    var relacionados = dados.produtos.filter(function (x) { return x.setor_id === p.setor_id && x.id !== p.id; }).slice(0, 8);
    if (relacionados.length) $("conteudo").insertAdjacentHTML("beforeend", secaoHTML("Combina com você", "Do mesmo setor", s ? s.icone : "lotus", relacionados, s ? "#/setor/" + s.slug : "#/loja"));

    document.querySelectorAll("[data-foto]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("fotoGrande").src = img(fotos[+b.dataset.foto]);
        document.querySelectorAll("[data-foto]").forEach(function (x) { x.classList.toggle("ativo", x === b); });
      });
    });
    if (!p.esgotado) {
      var mostrar = function () { $("qValor").textContent = qtd; atualizarPedirAgora(); };
      $("qMenos").onclick = function () { qtd = Math.max(1, qtd - 1); mostrar(); };
      $("qMais").onclick = function () { qtd = Math.min(99, qtd + 1); mostrar(); };
      $("addProduto").onclick = function () { adicionar(p.id, qtd); };
      var atualizarPedirAgora = function () {
        var a = $("pedirAgora"); if (!a) return;
        var msg = (dados.config.mensagem_pedido || "Olá! Quero fazer este pedido:") + "\n\n• " + qtd + "x " + p.nome + " — " + reais(precoFinal(p) * qtd);
        a.href = "https://wa.me/" + whatsNumero() + "?text=" + encodeURIComponent(msg);
      };
      atualizarPedirAgora();
      if ($("pedirAgora")) $("pedirAgora").addEventListener("click", function () { contar("whatsapp", { produto: p.id }); });
    }
    contar("produto", { produto: p.id, setor: s ? s.slug : null });
  }

  // ---------- roteador ----------
  function rotear() {
    pararHero();
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    var partes = h.split("/");
    document.querySelectorAll(".faixa-setores a").forEach(function (a) { a.classList.toggle("ativo", partes[0] === "setor" && a.dataset.slug === partes[1]); });
    document.title = (dados.config.nome || "Portal de Gaia") + " · Loja esotérica";
    if (partes[0] === "produto" && partes[1]) paginaProduto(partes[1]);
    else if (partes[0] === "setor" && partes[1]) {
      var s = dados.setores.find(function (x) { return x.slug === partes[1]; });
      if (!s) { paginaLista("Setor não encontrado", "", [], {}); return; }
      paginaLista(s.nome, s.descricao, dados.produtos.filter(function (p) { return p.setor_id === s.id; }), { sobre: "Setor" });
      contar("setor", { setor: s.slug });
    } else if (partes[0] === "busca") {
      var termo = partes.slice(1).join("/");
      var t = semAcento(termo).trim();
      var lista = dados.produtos.filter(function (p) { var s2 = setorDe(p); return semAcento(p.nome + " " + (p.descricao || "") + " " + (s2 ? s2.nome : "")).indexOf(t) >= 0; });
      paginaLista("Busca: " + termo, "", lista, { sobre: "Resultado da busca", vazio: "Não achamos nada com esse nome. Que tal chamar no WhatsApp? A gente te ajuda a encontrar." });
      $("campoBusca").value = termo;
    } else if (partes[0] === "loja") {
      var todos = dados.produtos.slice().sort(function (a, b) { return (b.destaque - a.destaque); });
      paginaLista("Toda a loja", dados.config.slogan, todos, { sobre: dados.config.nome || "Portal de Gaia" });
    } else if (h === "sobre" || h === "contato") {
      paginaInicio(); setTimeout(function () { var el = $(h); if (el) el.scrollIntoView(); }, 50);
    } else paginaInicio();
  }

  // ---------- carrinho ----------
  function carrinho() { return ler("carrinho", []).filter(function (i) { return dados.produtos.some(function (p) { return p.id === i.id && !p.esgotado; }); }); }
  function salvarCarrinho(c) { gravar("carrinho", c); atualizarContador(); }
  function atualizarContador() {
    var n = carrinho().reduce(function (t, i) { return t + i.qtd; }, 0);
    $("contadorCarrinho").textContent = n; $("contadorCarrinho").hidden = !n;
  }
  function adicionar(id, qtd) {
    var c = ler("carrinho", []), i = c.find(function (x) { return x.id === id; });
    if (i) i.qtd = Math.min(99, i.qtd + (qtd || 1)); else c.push({ id: id, qtd: qtd || 1 });
    salvarCarrinho(c);
    var p = dados.produtos.find(function (x) { return x.id === id; });
    toast("✦ " + (p ? p.nome : "Produto") + " no carrinho");
    contar("carrinho", { produto: id });
  }
  function desenharCarrinho() {
    var c = carrinho(), total = 0;
    $("carrinhoItens").innerHTML = c.length ? c.map(function (i) {
      var p = dados.produtos.find(function (x) { return x.id === i.id; }); var v = precoFinal(p) * i.qtd; total += v;
      return '<div class="item"><div class="item-foto">' + fotoHTML(p) + '</div><div><div class="item-nome">' + esc(p.nome) + '</div><div class="item-preco">' + reais(precoFinal(p)) + " cada · " + reais(v) + '</div><button class="item-remover" data-remover="' + p.id + '">Remover</button></div>' +
        '<div class="qtd"><button data-q="-1" data-id="' + p.id + '" aria-label="Menos">' + ic("menos") + "</button><span>" + i.qtd + '</span><button data-q="1" data-id="' + p.id + '" aria-label="Mais">' + ic("mais") + "</button></div></div>";
    }).join("") : '<div class="vazio">' + ic("lotus") + '<p>Seu carrinho está vazio.</p><a class="btn-contorno" href="#/loja" data-fechar-carrinho>Ver produtos</a></div>';
    $("carrinhoTotal").textContent = reais(total);
    $("carrinhoRodape").hidden = !c.length;
    var w = whatsNumero();
    $("finalizarPedido").innerHTML = ic("whatsapp") + (w ? "Enviar pedido pelo WhatsApp" : "WhatsApp da loja ainda não cadastrado");
    $("finalizarPedido").disabled = !w;
  }
  function abrirCarrinho() { desenharCarrinho(); $("carrinho").hidden = false; document.body.style.overflow = "hidden"; $("fecharCarrinho").focus(); }
  function fecharCarrinho() { $("carrinho").hidden = true; document.body.style.overflow = ""; }

  function finalizar() {
    var c = carrinho(); if (!c.length) return;
    var w = whatsNumero(); if (!w) return;
    var botao = $("finalizarPedido"); botao.disabled = true; botao.textContent = "Preparando seu pedido…";
    var nome = $("pedidoNome").value.trim(), obs = $("pedidoObs").value.trim();
    gravar("nome", nome);
    function montar(numero) {
      var total = 0;
      var linhas = c.map(function (i) { var p = dados.produtos.find(function (x) { return x.id === i.id; }); var v = precoFinal(p) * i.qtd; total += v; return "• " + i.qtd + "x " + p.nome + " — " + reais(v); });
      return (dados.config.mensagem_pedido || "Olá! Quero fazer este pedido:") + "\n\n" + (numero ? "*Pedido nº " + numero + "*\n" : "") + linhas.join("\n") +
        "\n\n*Total: " + reais(total) + "*" + (nome ? "\nNome: " + nome : "") + (obs ? "\nObservação: " + obs : "");
    }
    var tempo = new Promise(function (ok) { setTimeout(function () { ok(null); }, 6000); });
    Promise.race([api("rpc/registrar_pedido", { method: "POST", body: { p_sessao: sessao, p_itens: c.map(function (i) { return { produto_id: i.id, qtd: i.qtd }; }), p_nome: nome || null, p_obs: obs || null } }).catch(function () { return null; }), tempo])
      .then(function (r) {
        contar("pedido");
        var url = "https://wa.me/" + w + "?text=" + encodeURIComponent(montar(r && r.id));
        salvarCarrinho([]); $("pedidoObs").value = ""; fecharCarrinho();
        toast("✦ Pedido pronto! Abrindo o WhatsApp…");
        setTimeout(function () { location.href = url; }, 400);
      });
  }

  // ---------- eventos ----------
  function ligar() {
    $("abrirMenu").innerHTML = ic("menu"); $("fecharMenu").innerHTML = ic("fechar"); $("fecharCarrinho").innerHTML = ic("fechar");
    $("btnBusca").innerHTML = ic("busca"); $("icCarrinho").innerHTML = ic("carrinho"); $("whatsFlutuante").innerHTML = ic("whatsapp");
    $("ano").textContent = new Date().getFullYear();
    $("pedidoNome").value = ler("nome", "");

    $("abrirMenu").onclick = function () { $("gavetaMenu").hidden = false; };
    $("abrirCarrinho").onclick = abrirCarrinho;
    $("finalizarPedido").onclick = finalizar;
    $("formBusca").addEventListener("submit", function (e) {
      e.preventDefault(); var t = $("campoBusca").value.trim(); if (!t) return;
      contar("busca", { termo: t }); location.hash = "#/busca/" + encodeURIComponent(t);
    });
    document.addEventListener("click", function (e) {
      var a;
      if ((a = e.target.closest("[data-adicionar]"))) { adicionar(a.dataset.adicionar, 1); return; }
      if ((a = e.target.closest("[data-hero]"))) { iniciarHero.ir(+a.dataset.hero); return; }
      if ((a = e.target.closest("[data-hero-ir]"))) { iniciarHero.irPara(+a.dataset.heroIr); return; }
      if ((a = e.target.closest("[data-q]"))) {
        var c = ler("carrinho", []), i = c.find(function (x) { return x.id === a.dataset.id; });
        if (i) { i.qtd = Math.max(1, Math.min(99, i.qtd + (+a.dataset.q))); salvarCarrinho(c); desenharCarrinho(); } return;
      }
      if ((a = e.target.closest("[data-remover]"))) { salvarCarrinho(ler("carrinho", []).filter(function (x) { return x.id !== a.dataset.remover; })); desenharCarrinho(); return; }
      if ((a = e.target.closest("[data-contar]"))) contar(a.dataset.contar);
      if (e.target.closest("#whatsFlutuante")) contar("whatsapp");
      if ((a = e.target.closest("[data-rolar]"))) { e.preventDefault(); var el = $(a.dataset.rolar); if (el) el.scrollIntoView({ behavior: "smooth" }); }
      if (e.target.closest("[data-fechar-menu]")) $("gavetaMenu").hidden = true;
      if (e.target.closest("[data-fechar-carrinho]")) fecharCarrinho();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { fecharCarrinho(); $("gavetaMenu").hidden = true; } });
    window.addEventListener("hashchange", function () { rotear(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
  }

  ligar();
  $("conteudo").innerHTML = '<div class="carregando">' + ic("lotus") + "<p>Abrindo o portal…</p></div>";
  carregar().then(function () { contar("visita"); });
})();
