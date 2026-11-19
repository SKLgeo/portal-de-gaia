/* Painel Portal de Gaia — Equipe (só administradora) e Minha ficha (todo mundo).
   Contas, senhas e e-mails passam pela Edge Function "equipe"; a ficha é salva pela RPC equipe_salvar_ficha.
   Fotos ficam no bucket PRIVADO "equipe" e aparecem por link temporário. */
(function () {
  "use strict";
  var P = window.GAIA_PAINEL, sb = P.sb, $ = P.$, esc = P.esc, toast = P.toast, erroMsg = P.erroMsg, ocupado = P.ocupado, estado = P.estado;
  var LINK_APP = location.origin + location.pathname.replace(/painel\/.*$/, "app");
  var PAPEL = { administrador: "Administradora", colaborador: "Colaboradora" };
  var CARGOS = ["Proprietária", "Atendimento", "Vendas", "Estoque e envios", "Redes sociais", "Financeiro", "Produção"];
  var CAMPOS = [
    { k: "nome", rot: "Nome completo", req: true, max: 120, auto: "name" },
    { k: "apelido", rot: "Como prefere ser chamada", max: 60, auto: "nickname" },
    { k: "cargo", rot: "Cargo / função", max: 80, lista: "listaCargos", ph: "Ex.: Atendimento" },
    { k: "celular", rot: "Celular / WhatsApp", tipo: "tel", max: 16, mascara: "cel", ph: "(66) 99999-9999", auto: "tel" },
    { k: "nascimento", rot: "Data de nascimento", tipo: "date" },
    { k: "cpf", rot: "CPF (opcional)", max: 14, mascara: "cpf", modo: "numeric", ph: "000.000.000-00" },
    { k: "instagram", rot: "Instagram", max: 60, ph: "@usuario" },
    { k: "cidade", rot: "Cidade", max: 120, auto: "address-level2" },
    { k: "endereco", rot: "Endereço", max: 240, largo: true, auto: "street-address" },
    { k: "observacoes", rot: "Observações", tipo: "textarea", max: 2000, largo: true, ph: "Horários, tamanho de camiseta, preferências..." }
  ];

  // ---------- utilidades ----------
  function soNum(s) { return String(s || "").replace(/\D/g, ""); }
  function fmtCel(s) { var d = soNum(s).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2); if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6); return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7); }
  function fmtCpf(s) { var d = soNum(s).slice(0, 11); return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2"); }
  function iniciais(nome) { var p = String(nome || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function chamar(p) { return (p.apelido || String(p.nome || "").split(" ")[0] || "").trim(); }
  function quando(iso) {
    if (!iso) return "nunca entrou";
    var min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 2) return "agora há pouco"; if (min < 60) return "há " + min + " min";
    var h = Math.round(min / 60); if (h < 24) return "há " + h + " h";
    var d = Math.round(h / 24); if (d === 1) return "ontem"; if (d < 30) return "há " + d + " dias";
    return new Date(iso).toLocaleDateString("pt-BR");
  }
  function gerarSenha() {
    var a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", v = new Uint32Array(10), s = "";
    crypto.getRandomValues(v); for (var i = 0; i < 10; i++) s += a[v[i] % a.length]; return s;
  }
  function funcao(corpo) {
    return sb.functions.invoke("equipe", { body: corpo }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      return (ctx && ctx.json ? ctx.json().catch(function () { return {}; }) : Promise.resolve({})).then(function (j) { throw new Error((j && j.erro) || r.error.message); });
    });
  }

  // ---------- fotos (bucket privado) ----------
  var links = {};
  function fotoUrl(path) {
    if (!path) return Promise.resolve(null);
    if (links[path]) return Promise.resolve(links[path]);
    return sb.storage.from("equipe").createSignedUrl(path, 3600).then(function (r) { return (links[path] = r.data && r.data.signedUrl) || null; });
  }
  function avatarHTML(p, tam) { return '<span class="avatar" style="--t:' + tam + 'px" data-foto="' + esc(p.foto_path || "") + '" aria-hidden="true">' + esc(iniciais(p.nome)) + "</span>"; }
  function carregarFotos(raiz) {
    (raiz || document).querySelectorAll(".avatar[data-foto]").forEach(function (a) {
      if (!a.dataset.foto) return;
      fotoUrl(a.dataset.foto).then(function (u) { if (u) { a.style.backgroundImage = 'url("' + u + '")'; a.classList.add("com-foto"); } });
    });
  }
  function enviarFoto(userId, blob) {
    var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    var caminho = userId + "/foto-" + Date.now() + "." + ext;
    return sb.storage.from("equipe").upload(caminho, blob, { contentType: blob.type, upsert: false }).then(function (r) { if (r.error) throw r.error; return caminho; });
  }
  function apagarFoto(path) { if (path) sb.storage.from("equipe").remove([path]).then(function () {}); }

  // ---------- ficha (mesmo formulário na Equipe e em Minha ficha) ----------
  var fichas = {}; // prefixo -> { pessoa, fotoNova, tirarFoto }
  function fichaHTML(px, p, opcoes) {
    opcoes = opcoes || {};
    var campos = CAMPOS.map(function (c) {
      var v = p[c.k] == null ? "" : p[c.k];
      if (c.mascara === "cel") v = fmtCel(v); if (c.mascara === "cpf") v = fmtCpf(v);
      var attrs = ' id="' + px + "_" + c.k + '" data-campo="' + c.k + '"' + (c.max ? ' maxlength="' + c.max + '"' : "") + (c.ph ? ' placeholder="' + esc(c.ph) + '"' : "") +
        (c.req ? " required" : "") + (c.auto ? ' autocomplete="' + c.auto + '"' : ' autocomplete="off"') + (c.modo ? ' inputmode="' + c.modo + '"' : "") + (c.lista ? ' list="' + px + "_cargos" + '"' : "") + (c.mascara ? ' data-mascara="' + c.mascara + '"' : "");
      var campo = c.tipo === "textarea" ? "<textarea rows=\"3\"" + attrs + ">" + esc(v) + "</textarea>" : '<input type="' + (c.tipo || "text") + '"' + attrs + ' value="' + esc(v) + '">';
      return '<label class="' + (c.largo ? "largo-col" : "") + '">' + c.rot + (c.req ? " *" : "") + campo + "</label>";
    }).join("");
    return '<div class="ficha-topo">' +
      '<div class="ficha-foto">' + avatarHTML(p, 104).replace('class="avatar"', 'class="avatar" id="' + px + '_avatar"') +
      '<label class="btn claro mini arquivo">📷 ' + (p.foto_path ? "Trocar foto" : "Pôr foto") + '<input type="file" accept="image/*" id="' + px + '_foto" hidden></label>' +
      '<button type="button" class="link" id="' + px + '_tirar"' + (p.foto_path ? "" : " hidden") + ">tirar foto</button></div>" +
      '<div class="ficha-titulo"><strong id="' + px + '_titulo">' + esc(p.nome || "Nova pessoa") + "</strong>" +
      '<span class="cargo" id="' + px + '_cargoTxt">' + esc(p.cargo || "") + "</span>" +
      (p.papel ? '<span class="papel ' + p.papel + '">' + PAPEL[p.papel] + "</span>" : "") +
      (opcoes.email ? '<span class="nota">' + esc(opcoes.email) + "</span>" : "") +
      (p.criado_em ? '<span class="nota">Na equipe desde ' + new Date(p.criado_em).toLocaleDateString("pt-BR") + "</span>" : "") +
      "</div></div>" +
      '<datalist id="' + px + '_cargos">' + CARGOS.map(function (c) { return '<option value="' + c + '">'; }).join("") + "</datalist>" +
      '<div class="ficha-grade">' + campos + "</div>";
  }
  function ligarFicha(px, raiz, pessoa) {
    fichas[px] = { pessoa: pessoa, fotoNova: null, tirarFoto: false };
    carregarFotos(raiz);
    raiz.querySelectorAll("[data-mascara]").forEach(function (i) {
      i.addEventListener("input", function () { var f = i.dataset.mascara === "cel" ? fmtCel : fmtCpf; i.value = f(i.value); });
    });
    var nome = $(px + "_nome"), cargo = $(px + "_cargo");
    nome.addEventListener("input", function () { $(px + "_titulo").textContent = nome.value.trim() || "Nova pessoa"; var a = $(px + "_avatar"); if (!a.classList.contains("com-foto")) a.textContent = iniciais(nome.value); });
    cargo.addEventListener("input", function () { $(px + "_cargoTxt").textContent = cargo.value; });
    $(px + "_foto").addEventListener("change", function () {
      var arq = this.files[0]; this.value = ""; if (!arq) return;
      P.comprimir(arq, 640).then(function (blob) {
        fichas[px].fotoNova = blob; fichas[px].tirarFoto = false;
        var a = $(px + "_avatar"); a.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")'; a.classList.add("com-foto");
        $(px + "_tirar").hidden = false;
      }).catch(function (e) { toast(erroMsg(e), true); });
    });
    $(px + "_tirar").addEventListener("click", function () {
      fichas[px].fotoNova = null; fichas[px].tirarFoto = true;
      var a = $(px + "_avatar"); a.style.backgroundImage = ""; a.classList.remove("com-foto"); a.textContent = iniciais(nome.value);
      this.hidden = true;
    });
  }
  function lerFicha(px) {
    var d = {};
    CAMPOS.forEach(function (c) { var el = $(px + "_" + c.k); d[c.k] = el ? el.value.trim() : ""; });
    d.celular = soNum(d.celular); d.cpf = soNum(d.cpf); d.instagram = d.instagram.replace(/^@/, "");
    return d;
  }
  function validar(px, d) {
    if (!d.nome) { toast("Preencha o nome completo.", true); $(px + "_nome").focus(); return false; }
    if (d.celular && (d.celular.length < 10 || d.celular.length > 11)) { toast("Celular incompleto. Use DDD + número.", true); $(px + "_celular").focus(); return false; }
    if (d.cpf && d.cpf.length !== 11) { toast("CPF incompleto (11 números) — ou deixe em branco.", true); $(px + "_cpf").focus(); return false; }
    return true;
  }
  // envia a foto escolhida (se houver) e devolve o que mudar em foto_path
  function resolverFoto(px, userId) {
    var f = fichas[px];
    if (f.fotoNova) return enviarFoto(userId, f.fotoNova).then(function (c) { return { foto_path: c, antiga: f.pessoa && f.pessoa.foto_path }; });
    if (f.tirarFoto) return Promise.resolve({ foto_path: "", antiga: f.pessoa && f.pessoa.foto_path });
    return Promise.resolve(null);
  }

  // ---------- quem está usando (barra lateral e topo do celular) ----------
  function desenharEu() {
    var eu = estado.eu; if (!eu) return;
    $("euChip").innerHTML = avatarHTML(eu, 40) + '<span><strong>Olá, ' + esc(chamar(eu) || "você") + "</strong><small>" + (PAPEL[eu.papel] || "") + "</small></span>";
    $("euMini").innerHTML = avatarHTML(eu, 34);
    carregarFotos($("euChip")); carregarFotos($("euMini"));
  }

  // ---------- MINHA FICHA ----------
  function desenharMinhaFicha() {
    var eu = estado.eu;
    $("minhaFicha").innerHTML = fichaHTML("m", eu, { email: eu.email });
    ligarFicha("m", $("minhaFicha"), eu);
  }
  $("formMinhaFicha").addEventListener("submit", function (e) {
    e.preventDefault();
    var d = lerFicha("m"); if (!validar("m", d)) return;
    var b = $("salvarMinhaFicha"); ocupado(b, true);
    var eu = estado.eu;
    resolverFoto("m", eu.user_id).then(function (foto) {
      if (foto) d.foto_path = foto.foto_path;
      return sb.rpc("equipe_salvar_ficha", { p_user: eu.user_id, p: d }).then(function (r) {
        if (r.error) throw r.error;
        if (foto && foto.antiga && foto.antiga !== d.foto_path) apagarFoto(foto.antiga);
        estado.eu = r.data; desenharEu(); desenharMinhaFicha(); toast("✦ Sua ficha foi salva");
      });
    }).catch(function (e2) { toast(erroMsg(e2), true); }).then(function () { ocupado(b, false); });
  });
  $("contaVerSenhas").addEventListener("change", function () {
    ["contaSenhaAtual", "contaSenha1", "contaSenha2"].forEach(function (id) { $(id).type = this.checked ? "text" : "password"; }, this);
  });
  $("formSenha").addEventListener("submit", function (e) {
    e.preventDefault();
    var atual = $("contaSenhaAtual").value, n1 = $("contaSenha1").value, n2 = $("contaSenha2").value;
    if (n1.length < 8) { toast("A nova senha precisa ter pelo menos 8 caracteres.", true); return; }
    if (n1 !== n2) { toast("As duas senhas novas não estão iguais.", true); return; }
    if (n1 === atual) { toast("A nova senha precisa ser diferente da atual.", true); return; }
    var b = $("btnTrocarSenha"); ocupado(b, true, "Trocando…");
    // confere a senha atual antes de trocar
    sb.auth.signInWithPassword({ email: estado.usuario.email, password: atual }).then(function (r) {
      if (r.error) throw new Error(/Invalid login/i.test(r.error.message) ? "A senha atual está errada." : r.error.message);
      return sb.auth.updateUser({ password: n1 });
    }).then(function (r) {
      if (r.error) throw r.error;
      ["contaSenhaAtual", "contaSenha1", "contaSenha2"].forEach(function (id) { $(id).value = ""; });
      toast("✦ Senha trocada. Use a nova no próximo acesso.");
    }).catch(function (e2) { toast(erroMsg(e2), true); }).then(function () { ocupado(b, false); });
  });

  // ---------- EQUIPE ----------
  function desenharEquipe() {
    $("listaEquipe").innerHTML = '<p class="carregando">Carregando equipe…</p>';
    sb.from("equipe").select("*").order("ativo", { ascending: false }).order("nome").then(function (r) {
      if (r.error) { $("listaEquipe").innerHTML = '<p class="erro">' + esc(erroMsg(r.error)) + "</p>"; return; }
      estado.equipe = r.data || [];
      $("listaEquipe").innerHTML = estado.equipe.map(function (p) {
        var cel = p.celular ? '<a class="mini-link" href="https://wa.me/55' + soNum(p.celular) + '" target="_blank" rel="noopener" data-parar>💬 ' + esc(fmtCel(p.celular)) + "</a>" : "";
        return '<article class="pessoa' + (p.ativo ? "" : " bloqueada") + '" data-pessoa="' + p.user_id + '" tabindex="0" role="button" aria-label="Abrir a ficha de ' + esc(p.nome) + '">' +
          avatarHTML(p, 64) + '<div class="pessoa-info"><strong>' + esc(p.nome) + (p.user_id === estado.eu.user_id ? ' <small>(você)</small>' : "") + "</strong>" +
          (p.cargo ? '<span class="cargo">' + esc(p.cargo) + "</span>" : "") +
          '<span class="linha-papel"><span class="papel ' + p.papel + '">' + PAPEL[p.papel] + "</span>" + (p.ativo ? "" : '<span class="papel bloq">Bloqueada</span>') + "</span>" +
          '<span class="nota">' + esc(p.email) + "</span>" + cel +
          '<span class="nota">Último acesso: ' + quando(p.ultimo_acesso) + "</span></div></article>";
      }).join("") || '<p class="vazio">Ninguém na equipe ainda.</p>';
      carregarFotos($("listaEquipe"));
    });
  }
  $("listaEquipe").addEventListener("click", function (e) {
    if (e.target.closest("[data-parar]")) return;
    var c = e.target.closest("[data-pessoa]"); if (c) abrirPessoa(estado.equipe.find(function (p) { return p.user_id === c.dataset.pessoa; }));
  });
  $("listaEquipe").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.dataset.pessoa) e.target.click(); });
  $("novaPessoa").onclick = function () { abrirPessoa(null); };

  var atual = null;
  function abrirPessoa(p) {
    atual = p;
    var novo = !p, eu = p && p.user_id === estado.eu.user_id;
    $("dlgPessoaTitulo").textContent = novo ? "Adicionar pessoa à equipe" : "Ficha de " + (chamar(p) || p.nome);
    $("pessoaFicha").innerHTML = fichaHTML("p", p || {}, {});
    ligarFicha("p", $("pessoaFicha"), p);
    $("pEmail").value = p ? p.email : ""; $("pEmail").readOnly = !novo; $("pEmail").required = novo;
    $("pPapel").value = p ? p.papel : "colaborador";
    $("pSenhaLinha").hidden = !novo; $("pSenha").value = novo ? gerarSenha() : ""; $("pSenha").required = novo;
    $("pAtivoLinha").hidden = novo || eu; $("pAtivo").checked = p ? p.ativo : true;
    $("pessoaAcoes").hidden = novo; $("pRemover").hidden = novo || eu;
    $("pSalvar").textContent = novo ? "Adicionar à equipe" : "Salvar ficha";
    atualizarWhats();
    $("dlgPessoa").showModal();
    if (novo) setTimeout(function () { $("p_nome").focus(); }, 50);
  }
  function atualizarWhats() {
    var p = atual, cel = soNum($("p_celular") ? $("p_celular").value : "");
    var a = $("pWhats"); a.hidden = !p || !cel;
    if (a.hidden) return;
    var msg = "Olá, " + (chamar(lerFicha("p")) || "") + "! ✨ Seu acesso ao painel da loja Portal de Gaia está pronto.\n\n" +
      "1. Instale o app: " + LINK_APP + "\n2. Entre com o e-mail: " + p.email + "\n3. A senha eu te passo em outra mensagem. No primeiro acesso, troque em “Minha ficha”.";
    a.href = "https://wa.me/55" + cel + "?text=" + encodeURIComponent(msg);
  }
  $("pessoaFicha").addEventListener("input", function (e) { if (e.target.id === "p_celular" || e.target.id === "p_apelido" || e.target.id === "p_nome") atualizarWhats(); });
  $("gerarSenha").onclick = function () { $("pSenha").value = gerarSenha(); };

  $("formPessoa").addEventListener("submit", function (e) {
    e.preventDefault();
    var d = lerFicha("p"); if (!validar("p", d)) return;
    var b = $("pSalvar"); ocupado(b, true);
    var fim = function () { ocupado(b, false); };
    if (!atual) {
      var email = $("pEmail").value.trim().toLowerCase(), senha = $("pSenha").value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("E-mail inválido.", true); fim(); $("pEmail").focus(); return; }
      if (senha.length < 8) { toast("A senha provisória precisa ter pelo menos 8 caracteres.", true); fim(); return; }
      funcao({ acao: "criar", email: email, senha: senha, nome: d.nome, papel: $("pPapel").value, ficha: d }).then(function (res) {
        var nova = res.pessoa;
        return resolverFoto("p", nova.user_id).then(function (foto) {
          if (!foto || !foto.foto_path) return nova;
          return sb.rpc("equipe_salvar_ficha", { p_user: nova.user_id, p: { foto_path: foto.foto_path } }).then(function (r) { return r.data || nova; });
        });
      }).then(function (nova) {
        fim(); desenharEquipe();
        abrirPessoa(nova);
        toast("✦ " + chamar(nova) + " entrou na equipe. Mande o acesso pelo WhatsApp e a senha em separado.");
      }).catch(function (e2) { fim(); toast(erroMsg(e2), true); });
      return;
    }
    resolverFoto("p", atual.user_id).then(function (foto) {
      if (foto) d.foto_path = foto.foto_path;
      d.papel = $("pPapel").value;
      if (!$("pAtivoLinha").hidden) d.ativo = $("pAtivo").checked;
      return sb.rpc("equipe_salvar_ficha", { p_user: atual.user_id, p: d }).then(function (r) {
        if (r.error) throw r.error;
        if (foto && foto.antiga && foto.antiga !== d.foto_path) apagarFoto(foto.antiga);
        if (r.data.user_id === estado.eu.user_id) { estado.eu = r.data; desenharEu(); }
        $("dlgPessoa").close(); desenharEquipe(); toast("✦ Ficha salva");
      });
    }).catch(function (e2) { toast(erroMsg(e2), true); }).then(fim);
  });

  $("pRedefinirSenha").onclick = function () {
    var s = prompt("Nova senha provisória para " + chamar(atual) + " (mínimo 8 caracteres).\nAnote e passe para ela em mensagem separada:", gerarSenha());
    if (s == null) return;
    if (s.length < 8) { toast("A senha precisa ter pelo menos 8 caracteres.", true); return; }
    funcao({ acao: "redefinir_senha", user_id: atual.user_id, senha: s }).then(function () { toast("✦ Senha de " + chamar(atual) + " redefinida"); }, function (e) { toast(erroMsg(e), true); });
  };
  $("pTrocarEmail").onclick = function () {
    var em = prompt("Novo e-mail de acesso de " + chamar(atual) + ":", atual.email);
    if (em == null || em.trim().toLowerCase() === atual.email) return;
    funcao({ acao: "trocar_email", user_id: atual.user_id, email: em.trim().toLowerCase() }).then(function () {
      atual.email = em.trim().toLowerCase(); $("pEmail").value = atual.email; atualizarWhats(); desenharEquipe();
      toast("✦ E-mail trocado. Ela entra com o e-mail novo e a mesma senha.");
    }, function (e) { toast(erroMsg(e), true); });
  };
  $("pRemover").onclick = function () {
    if (!confirm("Remover " + atual.nome + " da equipe?\n\nA conta e a ficha são apagadas e ela não entra mais no painel. Isso não pode ser desfeito.\n\nDica: para só bloquear por um tempo, desmarque “Acesso liberado”.")) return;
    funcao({ acao: "remover", user_id: atual.user_id }).then(function () {
      $("dlgPessoa").close(); desenharEquipe(); toast("Pessoa removida da equipe");
    }, function (e) { toast(erroMsg(e), true); });
  };

  window.GaiaEquipe = { aoEntrar: desenharEu, desenharEquipe: desenharEquipe, desenharMinhaFicha: desenharMinhaFicha };
})();
