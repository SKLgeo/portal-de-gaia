/* Portal de Gaia — abertura cinematográfica + música ambiente gerada no próprio navegador (sem arquivo de áudio).
   Aparece em toda visita (uma vez por aba aberta; recarregar a mesma aba não repete). Música só começa com um toque (regra dos navegadores). */
(function () {
  "use strict";
  var CHAVE_INTRO = "gaia_intro_sessao", CHAVE_SOM = "gaia_som";
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function lerSessao(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function gravarSessao(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  var forcar = /[?&]intro=1/.test(location.search);
  var mostrar = forcar || !lerSessao(CHAVE_INTRO);
  // "Reduzir movimento" do aparelho → versão suave (?movimento=suave força, para conferir)
  var calmo = /[?&]movimento=suave/.test(location.search) || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (mostrar) document.documentElement.classList.add("com-intro");

  // =====================================================================
  // MÚSICA: acordes suaves (ré maior / lídio), sinos de cristal e um fundo grave.
  // =====================================================================
  var Som = (function () {
    var ctx = null, mestre = null, reverb = null, seco = null, tocando = false, agendador = null;
    var proxAcorde = 0, proxSino = 0, iAcorde = 0;
    var ACORDES = [[50, 57, 64, 66, 73], [47, 54, 62, 64, 69], [43, 50, 59, 66, 73], [45, 52, 59, 64, 71]];
    var SINOS = [74, 76, 78, 81, 83, 86, 88, 90];
    var DUR = 9.5;
    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function impulso(seg, queda) {
      var taxa = ctx.sampleRate, n = Math.floor(taxa * seg), buf = ctx.createBuffer(2, n, taxa);
      for (var c = 0; c < 2; c++) { var d = buf.getChannelData(c); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, queda); }
      return buf;
    }
    function montar() {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(ctx.destination);
      mestre = ctx.createGain(); mestre.gain.value = 0; mestre.connect(comp);
      reverb = ctx.createConvolver(); reverb.buffer = impulso(5, 2.6);
      var molhado = ctx.createGain(); molhado.gain.value = 0.75; reverb.connect(molhado); molhado.connect(mestre);
      seco = ctx.createGain(); seco.gain.value = 0.45; seco.connect(mestre);
      // fundo grave contínuo (ré + lá), respirando devagar
      [38, 45].forEach(function (m, k) {
        var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = "sine"; o.frequency.value = hz(m); g.gain.value = k ? 0.035 : 0.05;
        lfo.frequency.value = 0.07 + k * 0.03; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(seco); g.connect(reverb); o.start(); lfo.start();
      });
      return true;
    }
    function acorde(t, notas) {
      var filtro = ctx.createBiquadFilter(); filtro.type = "lowpass"; filtro.frequency.value = 900; filtro.Q.value = 0.4;
      var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 380; lfo.connect(lg); lg.connect(filtro.frequency); lfo.start(t); lfo.stop(t + DUR + 6);
      var env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.085, t + 3.5); env.gain.setValueAtTime(0.085, t + DUR - 1); env.gain.linearRampToValueAtTime(0, t + DUR + 4.5);
      filtro.connect(env); env.connect(seco); env.connect(reverb);
      notas.forEach(function (m) {
        [-7, 7].forEach(function (cents, k) {
          var o = ctx.createOscillator(); o.type = k ? "triangle" : "sine"; o.frequency.value = hz(m); o.detune.value = cents;
          var g = ctx.createGain(); g.gain.value = k ? 0.08 : 0.16; o.connect(g); g.connect(filtro); o.start(t); o.stop(t + DUR + 5);
        });
      });
    }
    function sino(t) {
      var f = hz(SINOS[Math.floor(Math.random() * SINOS.length)]);
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, env = ctx.createGain(), queda = 2.6 + Math.random() * 2;
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.045, t + 0.012); env.gain.exponentialRampToValueAtTime(0.0001, t + queda);
      if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; env.connect(pan); pan.connect(seco); pan.connect(reverb); } else { env.connect(seco); env.connect(reverb); }
      [[1, 1], [2.0, 0.42], [3.01, 0.2], [4.21, 0.1], [5.43, 0.05]].forEach(function (p) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f * p[0]; g.gain.value = p[1];
        o.connect(g); g.connect(env); o.start(t); o.stop(t + queda + 0.1);
      });
    }
    function agendar() {
      var agora = ctx.currentTime;
      while (proxAcorde < agora + 1.5) { acorde(proxAcorde, ACORDES[iAcorde % ACORDES.length]); iAcorde++; proxAcorde += DUR; }
      while (proxSino < agora + 1.5) { sino(proxSino); proxSino += 1.1 + Math.random() * 2.8; }
    }
    function ligar() {
      if (!ctx && !montar()) return false;
      if (ctx.state === "suspended") ctx.resume();
      var t = ctx.currentTime;
      if (!agendador) { proxAcorde = t + 0.1; proxSino = t + 1.8; agendador = setInterval(agendar, 300); agendar(); }
      mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(mestre.gain.value, t); mestre.gain.linearRampToValueAtTime(0.5, t + 4);
      tocando = true; gravar(CHAVE_SOM, "on"); atualizarBotao(); return true;
    }
    function desligar(lembrar) {
      if (!ctx) return;
      var t = ctx.currentTime; mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(mestre.gain.value, t); mestre.gain.linearRampToValueAtTime(0, t + 1.2);
      tocando = false; if (lembrar !== false) gravar(CHAVE_SOM, "off"); atualizarBotao();
      setTimeout(function () { if (!tocando && ctx) { ctx.suspend(); clearInterval(agendador); agendador = null; } }, 1400);
    }
    document.addEventListener("visibilitychange", function () {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else if (tocando) ctx.resume();
    });
    return { ligar: ligar, desligar: desligar, tocando: function () { return tocando; } };
  })();

  // botão de som da loja (canto de baixo à esquerda)
  var botaoSom = null;
  function atualizarBotao() {
    if (!botaoSom) return;
    var t = Som.tocando();
    botaoSom.classList.toggle("tocando", t); botaoSom.classList.toggle("desligado", !t);
    botaoSom.setAttribute("aria-label", t ? "Desligar a música" : "Ligar a música");
    botaoSom.title = t ? "Desligar a música" : "Ligar a música ambiente";
  }
  function criarBotaoSom() {
    botaoSom = document.createElement("button");
    botaoSom.className = "som desligado"; botaoSom.type = "button";
    botaoSom.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="ondas" d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/><path class="risco" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
    botaoSom.addEventListener("click", function () { if (Som.tocando()) Som.desligar(); else Som.ligar(); });
    document.body.appendChild(botaoSom); atualizarBotao();
  }

  // =====================================================================
  // ABERTURA
  // =====================================================================
  function slogan() {
    try { var c = JSON.parse(localStorage.getItem("gaia_cache_v1") || "null"); if (c && c.config && c.config.slogan) return c.config.slogan; } catch (e) {}
    return "Conecte-se com a Terra, desperte sua magia.";
  }
  function abertura() {
    var el = document.createElement("div");
    el.className = "intro"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Abertura do Portal de Gaia");
    var nome = "Portal de Gaia".split("").map(function (ch, i) { return ch === " " ? '<span class="esp"> </span>' : '<span style="transition-delay:' + (i * 70) + 'ms">' + ch + "</span>"; }).join("");
    el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="intro-halo" aria-hidden="true"></div>' +
      '<button type="button" class="intro-pular">Pular ›</button>' +
      '<div class="intro-centro"><img class="intro-logo" src="img/simbolo.png" alt="">' +
      '<p class="intro-nome" aria-label="Portal de Gaia">' + nome + '</p><div class="intro-luas" aria-hidden="true">☽ ● ☾</div>' +
      '<p class="intro-slogan"></p>' +
      '<div class="intro-acoes"><button type="button" class="intro-entrar">✦ Entrar com música</button><button type="button" class="intro-mudo">🔇 Entrar sem som</button></div></div>';
    el.querySelector(".intro-slogan").textContent = slogan();
    document.body.appendChild(el);

    var canvas = el.querySelector("canvas"), g = canvas.getContext("2d"), logo = el.querySelector(".intro-logo");
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0, particulas = [], poeira = [], inicio = 0, raf = 0, saiu = false, timers = [];
    function medir() { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    medir();
    window.addEventListener("resize", medir);
    function depois(ms, f) { timers.push(setTimeout(f, ms)); }
    function suave(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

    for (var i = 0; i < 70; i++) poeira.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.3, v: Math.random() * 0.25 + 0.05, f: Math.random() * 6.28 });

    function prepararParticulas() {
      var r = logo.getBoundingClientRect(); if (!r.width || !logo.naturalWidth) return;
      var off = document.createElement("canvas"), lw = Math.round(r.width), lh = Math.round(r.width * logo.naturalHeight / logo.naturalWidth);
      off.width = lw; off.height = lh; var og = off.getContext("2d"); og.drawImage(logo, 0, 0, lw, lh);
      var px = og.getImageData(0, 0, lw, lh).data, passo = Math.max(2, Math.round(lw / 120)), pontos = [];
      for (var y = 0; y < lh; y += passo) for (var x = 0; x < lw; x += passo) {
        var k = (y * lw + x) * 4; if (px[k + 3] > 150) pontos.push([x, y, px[k], px[k + 1], px[k + 2]]);
      }
      pontos.sort(function () { return Math.random() - 0.5; }); pontos = pontos.slice(0, 1700);
      var cx = r.left + r.width / 2, cy = r.top + lh / 2;
      particulas = pontos.map(function (p) {
        var ang = Math.random() * Math.PI * 2, raio = Math.max(W, H) * (0.45 + Math.random() * 0.5);
        return { sx: cx + Math.cos(ang) * raio, sy: cy + Math.sin(ang) * raio, tx: r.left + p[0], ty: r.top + p[1],
          cor: "rgb(" + p[2] + "," + p[3] + "," + p[4] + ")", atraso: Math.random() * 900, giro: (Math.random() - 0.5) * 2.2, tam: Math.random() * 1.2 + 0.7 };
      });
    }

    function quadro(agora) {
      if (!inicio) inicio = agora;
      var t = agora - inicio;
      g.clearRect(0, 0, W, H);
      // poeira dourada subindo devagar
      for (var i = 0; i < poeira.length; i++) {
        var p = poeira[i]; p.y -= p.v; p.f += 0.02; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        g.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(p.f)); g.fillStyle = "#e8cf94"; g.beginPath(); g.arc(p.x + Math.sin(p.f) * 6, p.y, p.r, 0, 6.283); g.fill();
      }
      // partículas formando o símbolo
      var desvanece = t > 3000 ? Math.max(0, 1 - (t - 3000) / 1500) : 1;
      if (particulas.length && desvanece > 0) {
        g.globalCompositeOperation = "lighter";
        for (var j = 0; j < particulas.length; j++) {
          var q = particulas[j], k = Math.min(1, Math.max(0, (t - 500 - q.atraso) / 1900)), e = suave(k);
          var dx = q.tx - q.sx, dy = q.ty - q.sy, curva = Math.sin(e * Math.PI) * q.giro * 120;
          var x = q.sx + dx * e - dy / Math.hypot(dx, dy) * curva, y = q.sy + dy * e + dx / Math.hypot(dx, dy) * curva;
          var brilho = k >= 1 ? 0.75 + 0.25 * Math.sin(t / 180 + j) : 0.35 + 0.55 * e;
          g.globalAlpha = brilho * desvanece; g.fillStyle = k > 0.6 ? q.cor : "#f1d58f";
          g.beginPath(); g.arc(x, y, q.tam * (k >= 1 ? 1 : 1.4 - 0.4 * e), 0, 6.283); g.fill();
        }
        g.globalCompositeOperation = "source-over";
      }
      g.globalAlpha = 1;
      if (!saiu) raf = requestAnimationFrame(quadro);
    }

    function entrar(comSom) {
      if (saiu) return; saiu = true;
      gravarSessao(CHAVE_INTRO, "1");
      if (comSom) Som.ligar();
      timers.forEach(clearTimeout);
      el.classList.add("saindo");
      setTimeout(function () {
        cancelAnimationFrame(raf); window.removeEventListener("resize", medir); el.remove();
        document.documentElement.classList.remove("com-intro");
        if (forcar && history.replaceState) history.replaceState(null, "", location.pathname + location.search.replace(/([?&])intro=1&?/, "$1").replace(/[?&]$/, "") + location.hash);
      }, 1500);
    }
    el.querySelector(".intro-entrar").addEventListener("click", function () { entrar(true); });
    el.querySelector(".intro-mudo").addEventListener("click", function () { entrar(false); });
    el.querySelector(".intro-pular").addEventListener("click", function () { entrar(false); });
    el.addEventListener("keydown", function (e) { if (e.key === "Escape") entrar(false); });

    if (calmo) {
      // versão suave: céu de estrelas parado + tudo aparece devagar, sem nada se deslocar
      el.classList.add("suave");
      g.fillStyle = "#e8cf94";
      for (var s = 0; s < poeira.length; s++) { g.globalAlpha = 0.2 + Math.random() * 0.4; g.beginPath(); g.arc(poeira[s].x, poeira[s].y, poeira[s].r, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
      depois(200, function () { el.classList.add("brilha", "logo-pronto"); });
      depois(1800, function () { el.classList.add("nome"); });
      depois(2900, function () { el.classList.add("slogan"); });
      depois(3700, function () { el.classList.add("pronto"); el.querySelector(".intro-entrar").focus({ preventScroll: true }); });
      return;
    }
    function comecar() { prepararParticulas(); raf = requestAnimationFrame(quadro); }
    if (logo.complete && logo.naturalWidth) comecar(); else { logo.onload = comecar; logo.onerror = function () { raf = requestAnimationFrame(quadro); }; }
    depois(2500, function () { el.classList.add("brilha"); });
    depois(3000, function () { el.classList.add("logo-pronto"); });
    depois(3500, function () { el.classList.add("nome"); });
    depois(4700, function () { el.classList.add("slogan"); });
    depois(5400, function () { el.classList.add("pronto"); el.querySelector(".intro-entrar").focus({ preventScroll: true }); });
  }

  function iniciar() {
    criarBotaoSom();
    if (mostrar) abertura();
    var ver = document.getElementById("verAbertura");
    if (ver) ver.addEventListener("click", function (e) { e.preventDefault(); if (Som.tocando()) Som.desligar(false); abertura(); document.documentElement.classList.add("com-intro"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
