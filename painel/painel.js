/* Painel da loja Portal de Gaia — a dona edita tudo daqui (produtos, setores, banners, logo, cores, textos, contato). */
(function () {
  "use strict";
  var G = window.GAIA, ic = window.gaiaIcone;
  var sb = window.supabase.createClient(G.url, G.chave, { auth: { storageKey: "gaia-painel-auth", persistSession: true, autoRefreshToken: true } });
  var $ = function (id) { return document.getElementById(id); };
  var estado = { usuario: null, config: {}, setores: [], produtos: [], banners: [], pedidos: [] };
  var CORES_ORIGINAIS = { cor_verde: "#16301f", cor_roxo: "#5b2a86", cor_dourado: "#c9a45c" };
  var ICONES_SETOR = ["cristal", "vela", "folha", "pentagrama", "lotus", "lua", "triplice", "estrela", "arvore", "sol"];
  var STATUS = { novo: "Novo", em_conversa: "Em conversa", pago: "Pago", enviado: "Enviado", concluido: "Concluído", cancelado: "Cancelado" };

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function reais(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function url(u) { if (!u) return ""; return /^(https?:|data:|blob:)/.test(u) ? u : "../" + u; }
  function toast(msg, erro) { var t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " erro-t" : ""); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, erro ? 5000 : 2600); }
  function dinheiro(s) {
    s = String(s || "").replace(/[R$\s]/g, ""); if (!s) return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var n = Number(s); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }
  function fmtNum(v) { return v == null ? "" : Number(v).toFixed(2).replace(".", ","); }
  function slugify(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
  function erroMsg(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Este e-mail ainda não foi confirmado.";
    if (/duplicate key.*slug/i.test(m)) return "Já existe um setor com esse endereço. Escolha outro.";
    if (/row-level security|FORBIDDEN|permission/i.test(m)) return "Sua conta não tem permissão para isso.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com a internet. Tente de novo.";
    if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
    if (/same.*password|different from the old/i.test(m)) return "A nova senha precisa ser diferente da atual.";
    return m;
  }
  function ocupado(botao, sim, texto) { if (!botao) return; if (sim) { botao.dataset.t = botao.textContent; botao.textContent = texto || "Salvando…"; botao.disabled = true; } else { botao.textContent = botao.dataset.t || botao.textContent; botao.disabled = false; } }

  // ---------- imagens ----------
  function comprimir(arquivo, maxLado, manterPng) {
    return new Promise(function (ok, falha) {
      var leitor = new Image(), u = URL.createObjectURL(arquivo);
      leitor.onload = function () {
        var w = leitor.naturalWidth, h = leitor.naturalHeight, f = Math.min(1, maxLado / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * f); c.height = Math.round(h * f);
        var ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(leitor, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        var tipo = manterPng ? "image/png" : "image/webp";
        c.toBlob(function (b) {
          if (!b) return falha(new Error("Não consegui ler esta imagem."));
          if (!manterPng && b.type !== "image/webp") { c.toBlob(function (j) { ok(j); }, "image/jpeg", 0.86); return; }
          ok(b);
        }, tipo, 0.86);
      };
      leitor.onerror = function () { URL.revokeObjectURL(u); falha(new Error("Arquivo de imagem inválido.")); };
      leitor.src = u;
    });
  }
  function enviarImagem(arquivo, pasta, opcoes) {
    opcoes = opcoes || {};
    if (!/^image\//.test(arquivo.type)) return Promise.reject(new Error("Escolha um arquivo de imagem."));
    return comprimir(arquivo, opcoes.max || 1400, opcoes.png).then(function (blob) {
      var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      var caminho = pasta + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      return sb.storage.from("loja").upload(caminho, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false }).then(function (r) {
        if (r.error) throw r.error;
        return sb.storage.from("loja").getPublicUrl(caminho).data.publicUrl;
      });
    });
  }
  function caminhoNoBalde(u) { var m = String(u || "").split("/storage/v1/object/public/loja/"); return m.length === 2 ? decodeURIComponent(m[1].split("?")[0]) : null; }
  function apagarImagens(lista) {
    var caminhos = (lista || []).map(caminhoNoBalde).filter(Boolean);
    if (caminhos.length) sb.storage.from("loja").remove(caminhos).then(function () {});
  }

  // ---------- entrada ----------
  function mostrarEntrada(msg) {
    $("telaApp").hidden = true; $("telaEntrada").hidden = false; $("formEntrada").hidden = false; $("formNovaSenha").hidden = true;
    if (msg) { $("entErro").textContent = msg; $("entErro").hidden = false; }
    try { $("entEmail").value = localStorage.getItem("gaia_painel_email") || ""; } catch (e) {}
  }
  $("verSenha").onclick = function () { var i = $("entSenha"); i.type = i.type === "password" ? "text" : "password"; };
  $("formEntrada").addEventListener("submit", function (e) {
    e.preventDefault(); $("entErro").hidden = true;
    var b = $("btnEntrar"); ocupado(b, true, "Entrando…");
    var email = $("entEmail").value.trim().toLowerCase();
    sb.auth.signInWithPassword({ email: email, password: $("entSenha").value }).then(function (r) {
      ocupado(b, false);
      if (r.error) { $("entErro").textContent = erroMsg(r.error); $("entErro").hidden = false; return; }
      try { localStorage.setItem("gaia_painel_email", email); } catch (e2) {}
      $("entSenha").value = ""; entrar(r.data.user);
    });
  });
  $("esqueciSenha").onclick = function () {
    var email = $("entEmail").value.trim();
    if (!email) { $("entErro").textContent = "Escreva seu e-mail acima e toque de novo em “Esqueci minha senha”."; $("entErro").hidden = false; return; }
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
      $("entErro").hidden = false;
      $("entErro").className = r.error ? "erro" : "ok";
      $("entErro").textContent = r.error ? erroMsg(r.error) : "Se o e-mail estiver cadastrado, chega um link para criar a senha nova. Confira também o spam.";
    });
  };
  $("formNovaSenha").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = $("novaSenha1").value, b = $("novaSenha2").value;
    if (a !== b) { $("novaSenhaErro").textContent = "As duas senhas não estão iguais."; $("novaSenhaErro").hidden = false; return; }
    sb.auth.updateUser({ password: a }).then(function (r) {
      if (r.error) { $("novaSenhaErro").textContent = erroMsg(r.error); $("novaSenhaErro").hidden = false; return; }
      toast("✦ Senha nova salva"); history.replaceState(null, "", location.pathname); entrar(r.data.user);
    });
  });

  function entrar(usuario) {
    estado.usuario = usuario;
    sb.rpc("e_admin").then(function (r) {
      if (r.error || r.data !== true) {
        sb.auth.signOut({ scope: "local" });
        mostrarEntrada(r.error ? erroMsg(r.error) : "Esta conta não tem acesso ao painel da loja.");
        return;
      }
      $("telaEntrada").hidden = true; $("telaApp").hidden = false;
      $("contaEmail").textContent = usuario.email;
      carregarTudo().then(function () { irPara(localStorage.getItem("gaia_painel_aba") || "resumo"); });
      ouvirPedidos();
    });
  }
  $("sair").onclick = $("sairConta").onclick = function () { sb.auth.signOut({ scope: "local" }).then(function () { mostrarEntrada(); }); };

  // ---------- dados ----------
  function carregarTudo() {
    return Promise.all([
      sb.from("loja_config").select("*").eq("id", 1).single(),
      sb.from("setores").select("*").order("ordem").order("nome"),
      sb.from("produtos").select("*").order("ordem").order("nome"),
      sb.from("banners").select("*").order("ordem")
    ]).then(function (r) {
      var erro = r.find(function (x) { return x.error; }); if (erro) throw erro.error;
      estado.config = r[0].data || {}; estado.setores = r[1].data || []; estado.produtos = r[2].data || []; estado.banners = r[3].data || [];
      $("lojaNome").textContent = estado.config.nome || "Portal de Gaia";
      $("avisoWhats").hidden = !!String(estado.config.whatsapp || "").replace(/\D/g, "");
      contarPedidosNovos();
    }).catch(function (e) { toast(erroMsg(e), true); });
  }

  // ---------- navegação ----------
  function irPara(aba) {
    if (!$("aba-" + aba)) aba = "resumo";
    document.querySelectorAll(".aba").forEach(function (s) { s.hidden = s.id !== "aba-" + aba; });
    document.querySelectorAll("#menu button").forEach(function (b) { b.classList.toggle("ativo", b.dataset.aba === aba); });
    try { localStorage.setItem("gaia_painel_aba", aba); } catch (e) {}
    ({ resumo: desenharResumo, pedidos: carregarPedidos, produtos: desenharProdutos, setores: desenharSetores, banners: desenharBanners, aparencia: preencherAparencia, contato: preencherContato, conta: function () {} })[aba]();
    window.scrollTo(0, 0);
  }
  $("menu").addEventListener("click", function (e) { var b = e.target.closest("button[data-aba]"); if (b) irPara(b.dataset.aba); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-ir]"); if (a) irPara(a.dataset.ir);
    var f = e.target.closest("[data-fechar]"); if (f) { var d = f.closest("dialog"); if (d) d.close("cancelar"); }
  });

  // ---------- resumo ----------
  function barras(alvo, lista, rotulo, valor, formato) {
    if (!lista || !lista.length) { $(alvo).innerHTML = '<p class="vazio">Ainda sem dados neste período.</p>'; return; }
    var max = Math.max.apply(null, lista.map(valor)) || 1;
    $(alvo).innerHTML = lista.map(function (x) {
      var v = valor(x);
      return '<div class="barra-linha"><span class="nome">' + esc(rotulo(x)) + '</span><span class="valor">' + (formato ? formato(x) : v) + '</span><span class="trilho"><i style="width:' + Math.max(3, v / max * 100) + '%"></i></span></div>';
    }).join("");
  }
  function grafico(dias) {
    if (!dias || !dias.length) { $("grafico").innerHTML = '<p class="vazio">Ainda sem visitas.</p>'; return; }
    var W = 700, H = 190, pad = 24, n = dias.length, max = Math.max(4, Math.max.apply(null, dias.map(function (d) { return d.visitas; })));
    var larg = (W - pad * 2) / n, barrasSvg = "", rot = "";
    dias.forEach(function (d, i) {
      var h = (d.visitas / max) * (H - 50), x = pad + i * larg;
      barrasSvg += '<rect x="' + (x + larg * 0.15).toFixed(1) + '" y="' + (H - 26 - h).toFixed(1) + '" width="' + Math.max(1, larg * 0.7).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="2" fill="#5b2a86"><title>' + d.dia.split("-").reverse().join("/") + ": " + d.visitas + " visitas, " + d.pedidos + " pedidos</title></rect>";
      if (d.pedidos) barrasSvg += '<circle cx="' + (x + larg / 2).toFixed(1) + '" cy="' + (H - 32 - h).toFixed(1) + '" r="3.5" fill="#c9a45c"/>';
      var passo = Math.ceil(n / 8);
      if (i % passo === 0 || i === n - 1) rot += '<text x="' + (x + larg / 2).toFixed(1) + '" y="' + (H - 8) + '" font-size="11" text-anchor="middle" fill="#6f6250">' + d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7) + "</text>";
    });
    $("grafico").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Visitas por dia">' +
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + (H - 26) + '" y2="' + (H - 26) + '" stroke="#e4d8bd"/>' + barrasSvg + rot +
      '<text x="' + pad + '" y="14" font-size="11" fill="#6f6250">máx. ' + max + " visitas/dia · ● dia com pedido</text></svg>";
  }
  function desenharResumo() {
    $("kpis").innerHTML = '<p class="carregando">Carregando números…</p>';
    sb.rpc("painel_metricas", { p_dias: +$("periodo").value }).then(function (r) {
      if (r.error) { $("kpis").innerHTML = '<p class="erro">' + esc(erroMsg(r.error)) + "</p>"; return; }
      var m = r.data;
      var conv = m.visitantes ? Math.round(m.pedidos / m.visitantes * 1000) / 10 : 0;
      $("kpis").innerHTML = [
        ["Visitas", m.visitas, m.visitantes + " pessoas diferentes"],
        ["Produtos vistos", m.produtos_vistos, m.carrinho + " vezes no carrinho"],
        ["Cliques no WhatsApp", m.whatsapp, m.instagram + " no Instagram"],
        ["Pedidos enviados", m.pedidos, conv + "% das pessoas", "roxo"],
        ["Valor dos pedidos", reais(m.pedidos_valor), "todos os não cancelados"],
        ["Vendido", reais(m.vendas_valor), "pagos, enviados e concluídos", "roxo"]
      ].map(function (k) { return '<div class="kpi ' + (k[3] || "") + '"><span>' + k[0] + "</span><strong>" + k[1] + "</strong><small>" + k[2] + "</small></div>"; }).join("");
      grafico(m.por_dia);
      barras("topProdutos", m.top_produtos, function (x) { return x.nome; }, function (x) { return x.vistos; });
      barras("maisPedidos", m.mais_pedidos, function (x) { return x.nome; }, function (x) { return x.qtd; }, function (x) { return x.qtd + " un. · " + reais(x.valor); });
      var nomeOrigem = { direto: "Direto (link ou digitou)", instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", google: "Google" };
      barras("origens", m.origens, function (x) { return nomeOrigem[x.origem] || x.origem; }, function (x) { return x.n; });
      barras("aparelhos", m.aparelhos, function (x) { return { celular: "📱 Celular", tablet: "📱 Tablet", computador: "💻 Computador" }[x.aparelho] || x.aparelho; }, function (x) { return x.n; });
      var nomeSetor = {}; estado.setores.forEach(function (s) { nomeSetor[s.slug] = s.nome; });
      barras("setoresVistos", m.setores, function (x) { return nomeSetor[x.setor] || x.setor; }, function (x) { return x.n; });
      barras("buscas", m.buscas, function (x) { return "“" + x.termo + "”"; }, function (x) { return x.n; });
    });
  }
  $("periodo").addEventListener("change", desenharResumo);
  $("naoContarMeu").onclick = function () {
    var w = window.open("../?nao-contar=1", "_blank", "noopener");
    toast(w ? "✦ Pronto: a loja não conta mais os acessos deste aparelho." : "Abra a loja com ?nao-contar=1 no final do endereço.");
  };

  // ---------- pedidos ----------
  function contarPedidosNovos() {
    sb.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "novo").then(function (r) {
      var n = r.count || 0; $("novosPedidos").textContent = n; $("novosPedidos").hidden = !n;
    });
  }
  function carregarPedidos() {
    $("listaPedidos").innerHTML = '<p class="carregando">Carregando pedidos…</p>';
    var q = sb.from("pedidos").select("*").order("criado_em", { ascending: false }).limit(200);
    if ($("filtroPedidos").value) q = q.eq("status", $("filtroPedidos").value);
    q.then(function (r) {
      if (r.error) { $("listaPedidos").innerHTML = '<p class="erro">' + esc(erroMsg(r.error)) + "</p>"; return; }
      estado.pedidos = r.data || [];
      $("listaPedidos").innerHTML = estado.pedidos.length ? estado.pedidos.map(function (p) {
        var data = new Date(p.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
        return '<article class="pedido ' + (p.status === "novo" ? "novo" : "") + '"><div><div class="pedido-cab"><strong>Pedido nº ' + p.id + "</strong><span>" + data + "</span>" + (p.cliente_nome ? "<span>· " + esc(p.cliente_nome) + "</span>" : "") + "</div>" +
          "<ul>" + (p.itens || []).map(function (i) { return "<li>" + i.qtd + "× " + esc(i.nome) + " — " + reais(i.preco * i.qtd) + "</li>"; }).join("") + "</ul>" +
          '<div class="total">Total: ' + reais(p.total) + "</div>" + (p.observacao ? '<div class="obs">💬 ' + esc(p.observacao) + "</div>" : "") + "</div>" +
          '<div class="pedido-lado"><label>Situação<select data-status="' + p.id + '">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === p.status ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") + "</select></label>" +
          '<label>Anotação (só você vê)<textarea rows="2" data-anotacao="' + p.id + '" maxlength="500">' + esc(p.anotacao || "") + "</textarea></label></div></article>";
      }).join("") : '<p class="vazio">Nenhum pedido ' + ($("filtroPedidos").value ? "nesta situação" : "ainda") + ". Quando um cliente enviar o carrinho pelo WhatsApp, ele aparece aqui.</p>";
    });
  }
  $("filtroPedidos").addEventListener("change", carregarPedidos);
  $("listaPedidos").addEventListener("change", function (e) {
    var s = e.target.closest("[data-status]"), a = e.target.closest("[data-anotacao]");
    if (s) sb.from("pedidos").update({ status: s.value }).eq("id", s.dataset.status).then(function (r) { if (r.error) toast(erroMsg(r.error), true); else { toast("✦ Situação atualizada"); contarPedidosNovos(); s.closest(".pedido").classList.toggle("novo", s.value === "novo"); } });
    if (a) sb.from("pedidos").update({ anotacao: a.value }).eq("id", a.dataset.anotacao).then(function (r) { if (r.error) toast(erroMsg(r.error), true); else toast("✦ Anotação salva"); });
  });
  function ouvirPedidos() {
    if (ouvirPedidos.canal) return;
    ouvirPedidos.canal = sb.channel("pedidos-novos").on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos" }, function (m) {
      toast("🧾 Pedido novo nº " + m.new.id + " — " + reais(m.new.total));
      contarPedidosNovos();
      if (!$("aba-pedidos").hidden) carregarPedidos();
    }).subscribe();
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && estado.usuario) contarPedidosNovos(); });

  // ---------- produtos ----------
  function nomeSetor(id) { var s = estado.setores.find(function (x) { return x.id === id; }); return s ? s.nome : "Sem setor"; }
  function opcoesSetor(alvo, vazio) {
    $(alvo).innerHTML = (vazio ? '<option value="">' + vazio + "</option>" : "") + estado.setores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + (s.ativo ? "" : " (escondido)") + "</option>"; }).join("");
  }
  function desenharProdutos() {
    var atual = $("filtroSetor").value;
    opcoesSetor("filtroSetor", "Todos os setores"); $("filtroSetor").value = atual;
    var t = $("buscaProduto").value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    var lista = estado.produtos.filter(function (p) {
      return (!$("filtroSetor").value || p.setor_id === $("filtroSetor").value) && (!t || p.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().indexOf(t) >= 0);
    });
    $("listaProdutos").innerHTML = lista.length ? lista.map(function (p) {
      var f = (p.imagens || [])[0], promo = p.preco_promocional != null && Number(p.preco_promocional) < Number(p.preco);
      var etq = [];
      if (!p.ativo) etq.push('<span class="etq cinza">Escondido</span>');
      if (p.esgotado) etq.push('<span class="etq verm">Esgotado</span>');
      if (p.destaque) etq.push('<span class="etq ouro">Destaque</span>');
      if (p.novo) etq.push('<span class="etq">Novo</span>');
      return '<button class="prod" data-produto="' + p.id + '"><div class="prod-foto">' + (f ? '<img src="' + esc(url(f)) + '" alt="" loading="lazy">' : '<span class="sem">✦</span>') + '<div class="etqs">' + etq.join("") + "</div></div>" +
        '<div class="prod-corpo"><strong>' + esc(p.nome) + '</strong><span class="setor">' + esc(nomeSetor(p.setor_id)) + '</span><span class="valor">' + (promo ? "<s>" + reais(p.preco) + "</s>" + reais(p.preco_promocional) : reais(p.preco)) + "</span></div></button>";
    }).join("") : '<p class="vazio">Nenhum produto encontrado. Toque em “+ Novo produto” para cadastrar.</p>';
  }
  $("buscaProduto").addEventListener("input", desenharProdutos);
  $("filtroSetor").addEventListener("change", desenharProdutos);
  $("listaProdutos").addEventListener("click", function (e) { var b = e.target.closest("[data-produto]"); if (b) abrirProduto(estado.produtos.find(function (p) { return p.id === b.dataset.produto; })); });
  $("novoProduto").onclick = function () { abrirProduto(null); };

  var edicao = null; // { produto, fotos, originais, novas }
  function abrirProduto(p) {
    opcoesSetor("pSetor", "— Sem setor —");
    edicao = { produto: p, fotos: p ? (p.imagens || []).slice() : [], originais: p ? (p.imagens || []).slice() : [], novas: [] };
    $("dlgProdutoTitulo").textContent = p ? "Editar produto" : "Novo produto";
    $("pNome").value = p ? p.nome : "";
    $("pSetor").value = p ? (p.setor_id || "") : ($("filtroSetor").value || (estado.setores[0] ? estado.setores[0].id : ""));
    $("pPreco").value = p ? fmtNum(p.preco) : "";
    $("pPromo").value = p && p.preco_promocional != null ? fmtNum(p.preco_promocional) : "";
    $("pDesc").value = p ? (p.descricao || "") : "";
    $("pAtivo").checked = p ? p.ativo : true;
    $("pDestaque").checked = p ? p.destaque : false;
    $("pNovo").checked = p ? p.novo : true;
    $("pEsgotado").checked = p ? p.esgotado : false;
    $("pOrdem").value = p ? p.ordem : 0;
    $("excluirProduto").hidden = !p;
    desenharFotos();
    $("dlgProduto").showModal();
  }
  function desenharFotos() {
    $("fotosLista").innerHTML = edicao.fotos.map(function (f, i) {
      if (f === "__enviando") return '<div class="foto-item enviando">Enviando…</div>';
      return '<div class="foto-item"><img src="' + esc(url(f)) + '" alt="">' + (i === 0 ? '<span class="capa">Capa</span>' : "") +
        '<div class="ctl"><button type="button" data-mover="' + i + '" data-d="-1" aria-label="Mover para a esquerda">◀</button><button type="button" data-tirar="' + i + '" aria-label="Tirar foto">🗑</button><button type="button" data-mover="' + i + '" data-d="1" aria-label="Mover para a direita">▶</button></div></div>';
    }).join("");
  }
  $("fotosLista").addEventListener("click", function (e) {
    var m = e.target.closest("[data-mover]"), t = e.target.closest("[data-tirar]");
    if (m) { var i = +m.dataset.mover, j = i + (+m.dataset.d); if (j < 0 || j >= edicao.fotos.length) return; var x = edicao.fotos[i]; edicao.fotos[i] = edicao.fotos[j]; edicao.fotos[j] = x; desenharFotos(); }
    if (t) { edicao.fotos.splice(+t.dataset.tirar, 1); desenharFotos(); }
  });
  $("arquivoFotos").addEventListener("change", function () {
    var arquivos = Array.prototype.slice.call(this.files || []); this.value = "";
    if (edicao.fotos.length + arquivos.length > 10) { toast("Até 10 fotos por produto.", true); arquivos = arquivos.slice(0, Math.max(0, 10 - edicao.fotos.length)); }
    var pasta = "produtos/" + (edicao.produto ? edicao.produto.id : "novo");
    arquivos.reduce(function (cadeia, arq) {
      return cadeia.then(function () {
        edicao.fotos.push("__enviando"); desenharFotos();
        return enviarImagem(arq, pasta).then(function (u) {
          edicao.fotos[edicao.fotos.indexOf("__enviando")] = u; edicao.novas.push(u); desenharFotos();
        }).catch(function (e) { edicao.fotos.splice(edicao.fotos.indexOf("__enviando"), 1); desenharFotos(); toast(erroMsg(e), true); });
      });
    }, Promise.resolve());
  });
  $("dlgProduto").addEventListener("close", function () {
    if ($("dlgProduto").returnValue !== "salvo" && edicao) apagarImagens(edicao.novas); // fotos enviadas e não usadas
    $("dlgProduto").returnValue = "";
  });
  $("formProduto").addEventListener("submit", function (e) {
    e.preventDefault();
    if (edicao.fotos.indexOf("__enviando") >= 0) { toast("Espere as fotos terminarem de enviar.", true); return; }
    var preco = dinheiro($("pPreco").value), promo = dinheiro($("pPromo").value);
    if (preco == null || isNaN(preco)) { toast("Preço inválido. Ex.: 79,90", true); $("pPreco").focus(); return; }
    if (isNaN(promo)) { toast("Preço promocional inválido. Deixe vazio se não houver promoção.", true); return; }
    var dados = {
      nome: $("pNome").value.trim(), setor_id: $("pSetor").value || null, preco: preco, preco_promocional: promo,
      descricao: $("pDesc").value.trim() || null, imagens: edicao.fotos, ativo: $("pAtivo").checked, destaque: $("pDestaque").checked,
      novo: $("pNovo").checked, esgotado: $("pEsgotado").checked, ordem: parseInt($("pOrdem").value, 10) || 0
    };
    var b = $("salvarProduto"); ocupado(b, true);
    var q = edicao.produto ? sb.from("produtos").update(dados).eq("id", edicao.produto.id).select().single() : sb.from("produtos").insert(dados).select().single();
    q.then(function (r) {
      ocupado(b, false);
      if (r.error) { toast(erroMsg(r.error), true); return; }
      var removidas = edicao.originais.filter(function (u) { return edicao.fotos.indexOf(u) < 0; });
      apagarImagens(removidas);
      var i = estado.produtos.findIndex(function (p) { return p.id === r.data.id; });
      if (i >= 0) estado.produtos[i] = r.data; else estado.produtos.push(r.data);
      estado.produtos.sort(function (a, b2) { return a.ordem - b2.ordem || a.nome.localeCompare(b2.nome, "pt-BR"); });
      $("dlgProduto").close("salvo"); desenharProdutos();
      toast("✦ " + r.data.nome + (r.data.ativo ? " já está na loja" : " salvo (escondido da loja)"));
    });
  });
  $("excluirProduto").onclick = function () {
    var p = edicao.produto; if (!p || !confirm("Excluir “" + p.nome + "” da loja? Isso não pode ser desfeito.\n\nDica: para tirar só por um tempo, desmarque “Aparece na loja”.")) return;
    sb.from("produtos").delete().eq("id", p.id).then(function (r) {
      if (r.error) { toast(erroMsg(r.error), true); return; }
      apagarImagens(edicao.originais.concat(edicao.novas));
      edicao.novas = [];
      estado.produtos = estado.produtos.filter(function (x) { return x.id !== p.id; });
      $("dlgProduto").close("salvo"); desenharProdutos(); toast("Produto excluído");
    });
  };

  // ---------- setores ----------
  function desenharSetores() {
    $("listaSetores").innerHTML = estado.setores.length ? estado.setores.map(function (s) {
      var n = estado.produtos.filter(function (p) { return p.setor_id === s.id; }).length;
      return '<div class="linha">' + ic(s.icone) + '<div class="info"><strong>' + esc(s.nome) + (s.ativo ? "" : " · escondido") + "</strong><span>" + n + (n === 1 ? " produto" : " produtos") + " · ordem " + s.ordem + " · /" + esc(s.slug) + '</span></div><button class="btn claro mini" data-setor="' + s.id + '">Editar</button></div>';
    }).join("") : '<p class="vazio">Nenhum setor. Crie o primeiro para organizar a loja.</p>';
  }
  var setorAtual = null, slugManual = false;
  $("listaSetores").addEventListener("click", function (e) { var b = e.target.closest("[data-setor]"); if (b) abrirSetor(estado.setores.find(function (s) { return s.id === b.dataset.setor; })); });
  $("novoSetor").onclick = function () { abrirSetor(null); };
  function abrirSetor(s) {
    setorAtual = s; slugManual = !!s;
    $("dlgSetorTitulo").textContent = s ? "Editar setor" : "Novo setor";
    $("sNome").value = s ? s.nome : ""; $("sSlug").value = s ? s.slug : ""; $("sDesc").value = s ? (s.descricao || "") : "";
    $("sOrdem").value = s ? s.ordem : (estado.setores.length + 1); $("sAtivo").checked = s ? s.ativo : true;
    var icone = s ? s.icone : "lua";
    $("sIcones").innerHTML = ICONES_SETOR.map(function (n) { return '<button type="button" data-icone="' + n + '" class="' + (n === icone ? "ativo" : "") + '" aria-label="Ícone ' + n + '">' + ic(n) + "</button>"; }).join("");
    $("excluirSetor").hidden = !s;
    $("dlgSetor").showModal();
  }
  $("sNome").addEventListener("input", function () { if (!slugManual) $("sSlug").value = slugify(this.value); });
  $("sSlug").addEventListener("input", function () { slugManual = true; });
  $("sIcones").addEventListener("click", function (e) { var b = e.target.closest("[data-icone]"); if (!b) return; $("sIcones").querySelectorAll("button").forEach(function (x) { x.classList.toggle("ativo", x === b); }); });
  $("formSetor").addEventListener("submit", function (e) {
    e.preventDefault();
    var ativo = $("sIcones").querySelector(".ativo");
    var dados = { nome: $("sNome").value.trim(), slug: slugify($("sSlug").value), descricao: $("sDesc").value.trim() || null, icone: ativo ? ativo.dataset.icone : "lua", ordem: parseInt($("sOrdem").value, 10) || 0, ativo: $("sAtivo").checked };
    if (!dados.slug) { toast("Endereço inválido.", true); return; }
    var antigoSlug = setorAtual && setorAtual.slug;
    var q = setorAtual ? sb.from("setores").update(dados).eq("id", setorAtual.id).select().single() : sb.from("setores").insert(dados).select().single();
    q.then(function (r) {
      if (r.error) { toast(erroMsg(r.error), true); return; }
      if (antigoSlug && antigoSlug !== r.data.slug) sb.from("banners").update({ link_setor: r.data.slug }).eq("link_setor", antigoSlug).then(function () { carregarTudo(); });
      var i = estado.setores.findIndex(function (s) { return s.id === r.data.id; });
      if (i >= 0) estado.setores[i] = r.data; else estado.setores.push(r.data);
      estado.setores.sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"); });
      $("dlgSetor").close(); desenharSetores(); toast("✦ Setor salvo");
    });
  });
  $("excluirSetor").onclick = function () {
    var s = setorAtual, n = estado.produtos.filter(function (p) { return p.setor_id === s.id; }).length;
    if (!confirm("Excluir o setor “" + s.nome + "”?" + (n ? "\n\n" + n + " produto(s) ficarão sem setor (continuam em “Toda a loja”)." : ""))) return;
    sb.from("setores").delete().eq("id", s.id).then(function (r) {
      if (r.error) { toast(erroMsg(r.error), true); return; }
      estado.setores = estado.setores.filter(function (x) { return x.id !== s.id; });
      estado.produtos.forEach(function (p) { if (p.setor_id === s.id) p.setor_id = null; });
      $("dlgSetor").close(); desenharSetores(); toast("Setor excluído");
    });
  };

  // ---------- banners ----------
  function desenharBanners() {
    $("listaBanners").innerHTML = estado.banners.length ? estado.banners.map(function (b) {
      return '<button class="banner" data-banner="' + b.id + '"><img src="' + esc(url(b.imagem_url)) + '" alt="" loading="lazy"><div><strong>' + esc(b.titulo || "(sem título)") + "</strong><span>" + (b.ativo ? "Aparece na loja" : "Escondido") + " · ordem " + b.ordem + "</span></div></button>";
    }).join("") : '<p class="vazio">Sem banners: a loja mostra o título e o texto principal de “Logo, cores e textos”.</p>';
  }
  var bannerAtual = null, bannerImg = null, bannerNova = null;
  $("listaBanners").addEventListener("click", function (e) { var b = e.target.closest("[data-banner]"); if (b) abrirBanner(estado.banners.find(function (x) { return x.id === b.dataset.banner; })); });
  $("novoBanner").onclick = function () { abrirBanner(null); };
  function previaBanner() { $("bPrevia").innerHTML = bannerImg ? '<img src="' + esc(url(bannerImg)) + '" alt="">' : "Escolha uma imagem (de preferência deitada, 16:9)"; }
  function abrirBanner(b) {
    bannerAtual = b; bannerImg = b ? b.imagem_url : null; bannerNova = null;
    $("dlgBannerTitulo").textContent = b ? "Editar banner" : "Novo banner";
    $("bTitulo").value = b ? (b.titulo || "") : ""; $("bSub").value = b ? (b.subtitulo || "") : "";
    $("bBotao").value = b ? (b.botao_texto || "") : "Ver produtos";
    $("bSetor").innerHTML = '<option value="">Toda a loja</option>' + estado.setores.map(function (s) { return '<option value="' + esc(s.slug) + '">' + esc(s.nome) + "</option>"; }).join("");
    $("bSetor").value = b ? (b.link_setor || "") : "";
    $("bOrdem").value = b ? b.ordem : estado.banners.length + 1; $("bAtivo").checked = b ? b.ativo : true;
    $("excluirBanner").hidden = !b; previaBanner(); $("dlgBanner").showModal();
  }
  $("arquivoBanner").addEventListener("change", function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    $("bPrevia").textContent = "Enviando…";
    enviarImagem(f, "banners", { max: 1800 }).then(function (u) { if (bannerNova) apagarImagens([bannerNova]); bannerNova = u; bannerImg = u; previaBanner(); })
      .catch(function (e) { previaBanner(); toast(erroMsg(e), true); });
  });
  $("dlgBanner").addEventListener("close", function () { if ($("dlgBanner").returnValue !== "salvo" && bannerNova) apagarImagens([bannerNova]); $("dlgBanner").returnValue = ""; });
  $("formBanner").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!bannerImg) { toast("Escolha a imagem do banner.", true); return; }
    var dados = { titulo: $("bTitulo").value.trim() || null, subtitulo: $("bSub").value.trim() || null, botao_texto: $("bBotao").value.trim() || "Ver produtos", link_setor: $("bSetor").value || null, imagem_url: bannerImg, ordem: parseInt($("bOrdem").value, 10) || 0, ativo: $("bAtivo").checked };
    var antiga = bannerAtual && bannerAtual.imagem_url;
    var q = bannerAtual ? sb.from("banners").update(dados).eq("id", bannerAtual.id).select().single() : sb.from("banners").insert(dados).select().single();
    q.then(function (r) {
      if (r.error) { toast(erroMsg(r.error), true); return; }
      if (antiga && antiga !== bannerImg) apagarImagens([antiga]);
      var i = estado.banners.findIndex(function (x) { return x.id === r.data.id; });
      if (i >= 0) estado.banners[i] = r.data; else estado.banners.push(r.data);
      estado.banners.sort(function (a, b) { return a.ordem - b.ordem; });
      $("dlgBanner").close("salvo"); desenharBanners(); toast("✦ Banner salvo");
    });
  });
  $("excluirBanner").onclick = function () {
    if (!confirm("Excluir este banner?")) return;
    var b = bannerAtual;
    sb.from("banners").delete().eq("id", b.id).then(function (r) {
      if (r.error) { toast(erroMsg(r.error), true); return; }
      apagarImagens([b.imagem_url]); estado.banners = estado.banners.filter(function (x) { return x.id !== b.id; });
      $("dlgBanner").close("salvo"); desenharBanners(); toast("Banner excluído");
    });
  };

  // ---------- aparência e contato (loja_config) ----------
  var pendente = {};
  function preencher(form) {
    pendente = {};
    $(form).querySelectorAll("[data-cfg]").forEach(function (el) { var v = estado.config[el.dataset.cfg]; el.value = v == null ? "" : v; });
  }
  function preencherAparencia() {
    preencher("formAparencia");
    $("previaLogo").src = url(estado.config.logo_url || "img/logo.png");
    $("previaSobre").src = url(estado.config.sobre_imagem_url || "img/foto-vela-cristais.jpg");
  }
  function preencherContato() { preencher("formContato"); atualizarTesteWhats(); }
  function atualizarTesteWhats() {
    var n = $("formContato").querySelector('[data-cfg="whatsapp"]').value.replace(/\D/g, "");
    $("testarWhats").hidden = !n; $("testarWhats").href = "https://wa.me/" + (n.length <= 11 ? "55" + n : n) + "?text=" + encodeURIComponent("Teste do site Portal de Gaia");
  }
  $("formContato").querySelector('[data-cfg="whatsapp"]').addEventListener("input", atualizarTesteWhats);
  function salvarConfig(form, extra) {
    var dados = Object.assign({}, extra || {});
    $(form).querySelectorAll("[data-cfg]").forEach(function (el) {
      var v = el.value.trim(); if (el.dataset.cfg === "whatsapp") v = v.replace(/\D/g, ""); if (el.dataset.cfg === "instagram") v = v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
      dados[el.dataset.cfg] = v;
    });
    var b = $(form).querySelector("button.primario"); ocupado(b, true);
    return sb.from("loja_config").update(dados).eq("id", 1).select().single().then(function (r) {
      ocupado(b, false);
      if (r.error) { toast(erroMsg(r.error), true); return; }
      var antes = estado.config; estado.config = r.data; pendente = {};
      ["logo_url", "sobre_imagem_url"].forEach(function (k) { if (antes[k] && antes[k] !== r.data[k]) apagarImagens([antes[k]]); });
      $("lojaNome").textContent = r.data.nome; $("avisoWhats").hidden = !!r.data.whatsapp;
      toast("✦ Salvo! A loja já mostra a mudança.");
    });
  }
  $("formAparencia").addEventListener("submit", function (e) { e.preventDefault(); salvarConfig("formAparencia", pendente); });
  $("formContato").addEventListener("submit", function (e) { e.preventDefault(); salvarConfig("formContato"); });
  $("coresOriginais").onclick = function () { Object.keys(CORES_ORIGINAIS).forEach(function (k) { $("formAparencia").querySelector('[data-cfg="' + k + '"]').value = CORES_ORIGINAIS[k]; }); toast("Cores originais escolhidas. Toque em “Salvar aparência”."); };
  $("logoOriginal").onclick = function () { pendente.logo_url = "img/logo.png"; $("previaLogo").src = url("img/logo.png"); toast("Toque em “Salvar aparência” para confirmar."); };
  $("arquivoLogo").addEventListener("change", function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    enviarImagem(f, "marca", { max: 900, png: f.type === "image/png" }).then(function (u) { pendente.logo_url = u; $("previaLogo").src = u; toast("Logo enviado. Toque em “Salvar aparência”."); }).catch(function (e) { toast(erroMsg(e), true); });
  });
  $("arquivoSobre").addEventListener("change", function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    enviarImagem(f, "marca", { max: 1400 }).then(function (u) { pendente.sobre_imagem_url = u; $("previaSobre").src = u; toast("Foto enviada. Toque em “Salvar aparência”."); }).catch(function (e) { toast(erroMsg(e), true); });
  });

  // ---------- conta ----------
  $("formSenha").addEventListener("submit", function (e) {
    e.preventDefault();
    if ($("contaSenha1").value !== $("contaSenha2").value) { toast("As duas senhas não estão iguais.", true); return; }
    sb.auth.updateUser({ password: $("contaSenha1").value }).then(function (r) {
      if (r.error) { toast(erroMsg(r.error), true); return; }
      $("contaSenha1").value = $("contaSenha2").value = ""; toast("✦ Senha trocada");
    });
  });
  // ---------- instalar o app (iPhone, Android, computador) ----------
  var pedidoInstalar = null, ua = navigator.userAgent;
  var instalado = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var eIphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var eAndroid = /Android/.test(ua);
  var navegadorInterno = /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|Snapchat|TikTok|; wv\)/.test(ua);
  document.querySelectorAll("[data-instalar]").forEach(function (b) { b.hidden = instalado; });
  $("notaInstalado").hidden = !instalado;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); pedidoInstalar = e; });
  window.addEventListener("appinstalled", function () { toast("✦ App instalado! Abra pelo ícone Painel Gaia."); });
  function abrirInstalar() {
    if (pedidoInstalar && !navegadorInterno) {
      pedidoInstalar.prompt();
      pedidoInstalar.userChoice.then(function () { pedidoInstalar = null; });
      return;
    }
    var passo = navegadorInterno ? "interno" : eIphone ? "iphone" : eAndroid ? "android" : "computador";
    $("dlgInstalar").querySelectorAll("[data-passo]").forEach(function (d) { d.hidden = d.dataset.passo !== passo; });
    $("dlgInstalar").showModal();
  }
  document.addEventListener("click", function (e) { if (e.target.closest("[data-instalar]")) abrirInstalar(); });
  $("copiarLink").onclick = function () {
    var link = location.origin + location.pathname.replace(/painel\/.*$/, "app");
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast("Link copiado. Cole no Safari ou no Chrome."); }, function () { prompt("Copie o link:", link); });
  };
  if (/[?&]instalar=1/.test(location.search) && !instalado) setTimeout(abrirInstalar, 600);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});

  // ---------- início ----------
  sb.auth.onAuthStateChange(function (evento) {
    if (evento === "PASSWORD_RECOVERY") { $("telaApp").hidden = true; $("telaEntrada").hidden = false; $("formEntrada").hidden = true; $("formNovaSenha").hidden = false; }
  });
  if (/type=recovery/.test(location.hash)) { $("telaEntrada").hidden = false; $("formEntrada").hidden = true; $("formNovaSenha").hidden = false; }
  else sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) entrar(s.user); else mostrarEntrada();
  });
})();
