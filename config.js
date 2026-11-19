// Portal de Gaia — conexão com o banco da loja (projeto Supabase próprio).
// A chave abaixo é a pública (publishable): pode ficar no site. Nunca colocar a service_role aqui.
window.GAIA = {
  url: "https://iccgrebydpqbyzqbgrav.supabase.co",
  chave: "sb_publishable_8bDrjPqi_-483sxmY75QLQ_JfRxg0Qs",
  prefixo: "gaia_" // tudo que o site guarda no aparelho usa este prefixo
};

// Ícones em linha (traço dourado), usados no site e no painel
window.GAIA_ICONES = {
  lua: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  cristal: '<path d="M12 2l5 6-5 14-5-14z"/><path d="M7 8h10M12 2v20M9.5 8L12 22l2.5-14"/>',
  folha: '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/><path d="M5 19L14 10"/>',
  lotus: '<path d="M12 20c-4 0-8-3-9-7 3 0 6 1 9 4 3-3 6-4 9-4-1 4-5 7-9 7z"/><path d="M12 17c-2-2-3-5-3-8 1 1 2.2 2 3 3.5.8-1.5 2-2.5 3-3.5 0 3-1 6-3 8z"/><path d="M12 12.5C11 10 11 7 12 4c1 3 1 6 0 8.5z"/>',
  pentagrama: '<circle cx="12" cy="12" r="9.5"/><path d="M12 3.5l5 15.5L4 9.5h16L7 19z"/>',
  vela: '<path d="M8 10h8v11H8z"/><path d="M12 10V7"/><path d="M12 2.5c1.5 1.6 1.5 3.2 0 4.5-1.5-1.3-1.5-2.9 0-4.5z"/>',
  estrela: '<path d="M12 2l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-2.8z"/>',
  arvore: '<path d="M12 21v-8"/><path d="M12 13c-4 0-7-2.5-7-6a7 7 0 0 1 14 0c0 3.5-3 6-7 6z"/><path d="M9 21h6"/>',
  sol: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  triplice: '<circle cx="12" cy="12" r="3.6"/><path d="M7.2 6.2a6 6 0 0 0 0 11.6M16.8 6.2a6 6 0 0 1 0 11.6"/>',
  carrinho: '<path d="M3 4h2.2l2.3 11h10.8L21 7H6.4"/><circle cx="9.5" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8"/>',
  whatsapp: '<path d="M4 20l1.2-4A8 8 0 1 1 8 18.8z"/><path d="M9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .8c-1-.5-2-1.5-2.4-2.4l.8-1-1-2z"/>',
  local: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6l8.5 7 8.5-7"/>',
  seta: '<path d="M9 5l7 7-7 7"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
};
window.gaiaIcone = function (nome, classe) {
  var d = window.GAIA_ICONES[nome] || window.GAIA_ICONES.estrela;
  return '<svg class="ic ' + (classe || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
};
