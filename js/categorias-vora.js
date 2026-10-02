// Taxonomia VORA 313 — uma única árvore para organizar categorias sem
// alterar os valores antigos já guardados. A categoria continua a ser o
// campo principal; a subcategoria é um complemento opcional.
export const CATEGORIAS_VORA = [
  { id: 'eletronicos', label: 'Eletrónicos & Tecnologia', icon: '📱', sellerValue: 'Eletrónicos', legacy: ['Eletrónicos'], subcategorias: [
    ['acessorios', 'Acessórios e suprimentos'], ['fotografia', 'Câmara e foto'], ['celulares', 'Telefones celulares e acessórios'],
    ['computadores', 'Computadores e acessórios'], ['gps', 'GPS e navegação'], ['audio', 'Áudio e colunas'], ['fones', 'Fones de ouvido'],
    ['tv-video', 'Televisão e vídeo'], ['automotivo-eletronico', 'Eletrónicos para veículos'], ['escritorio', 'Eletrónicos para escritório'],
    ['seguranca', 'Segurança e vigilância'], ['servicos', 'Planos de serviço']
  ]},
  { id: 'moda', label: 'Moda & Calçado', icon: '👗', sellerValue: 'Moda', legacy: ['Moda'], subcategorias: [
    ['feminino', 'Moda feminina'], ['masculino', 'Moda masculina'], ['calcados', 'Calçados'], ['joias', 'Joias e acessórios'],
    ['relogios', 'Relógios'], ['oculos', 'Óculos'], ['malas-mochilas', 'Malas e mochilas']
  ]},
  { id: 'beleza', label: 'Beleza & Perfumaria', icon: '💄', sellerValue: 'Beleza', legacy: ['Beleza'], subcategorias: [
    ['perfumaria', 'Perfumaria'], ['cosmeticos', 'Cosméticos'], ['cuidados-pessoais', 'Cuidados pessoais'], ['cabelo', 'Cabelo']
  ]},
  { id: 'casa', label: 'Casa & Cozinha', icon: '🏠', sellerValue: 'Casa', legacy: ['Casa'], subcategorias: [
    ['cozinha', 'Cozinha'], ['utensilios-cozinha', 'Utensílios de cozinha'], ['eletrodomesticos', 'Eletrodomésticos'],
    ['limpeza', 'Limpeza'], ['decoracao', 'Decoração']
  ]},
  { id: 'games', label: 'Games & Consolas', icon: '🎮', sellerValue: 'Games', legacy: ['Games'], subcategorias: [
    ['consolas', 'Consolas'], ['jogos', 'Jogos'], ['gamer', 'Acessórios Gamer'], ['equipamentos-gamer', 'Equipamentos Gamer']
  ]},
  { id: 'automotivo', label: 'Automotivo', icon: '🚗', sellerValue: 'Automotivo', legacy: ['Automotivo', 'Automóveis'], subcategorias: [
    ['pecas', 'Peças e componentes'], ['acessorios-auto', 'Acessórios automotivos'], ['eletronicos-auto', 'Eletrónicos automotivos'], ['ferramentas-auto', 'Ferramentas automotivas']
  ]},
  { id: 'ferramentas-construcao', label: 'Ferramentas & Construção', icon: '🔧', sellerValue: 'Ferramentas & Construção', legacy: ['Ferramentas', 'Construção'], subcategorias: [
    ['ferramentas', 'Ferramentas'], ['construcao', 'Construção'], ['equipamentos', 'Equipamentos']
  ]},
  { id: 'livros-papelaria', label: 'Livros & Papelaria', icon: '📚', sellerValue: 'Livros & Papelaria', legacy: ['Livros', 'Papelaria'], subcategorias: [
    ['livros', 'Livros'], ['papelaria', 'Papelaria'], ['material-escolar', 'Material escolar']
  ]},
  { id: 'saude-bem-estar', label: 'Saúde & Bem-estar', icon: '❤️', sellerValue: 'Saúde & Bem-estar', legacy: ['Saúde e Bem-estar'], subcategorias: [
    ['saude', 'Saúde'], ['fitness', 'Fitness'], ['bem-estar', 'Bem-estar']
  ]},
  { id: 'jardim-exterior', label: 'Jardim & Exterior', icon: '🌱', sellerValue: 'Jardim & Exterior', legacy: ['Jardinagem'], subcategorias: [
    ['jardinagem', 'Jardinagem'], ['exterior', 'Exterior']
  ]},
  { id: 'artesanato-festas', label: 'Artesanato & Festas', icon: '🎨', sellerValue: 'Artesanato & Festas', legacy: ['Artesanato', 'Festas'], subcategorias: [
    ['artesanato', 'Artesanato'], ['festas', 'Festas']
  ]},
  { id: 'viagem', label: 'Viagem & Acessórios', icon: '✈️', sellerValue: 'Viagem & Acessórios', legacy: ['Viagem'], subcategorias: [
    ['viagem', 'Viagem'], ['acessorios-viagem', 'Acessórios de viagem']
  ]},
  { id: 'outros', label: 'Outros', icon: '🛍️', sellerValue: 'Outros', legacy: ['Outros'], subcategorias: [
    ['outros', 'Outros produtos']
  ]}
];

export const CATEGORIAS_PRODUTO_LEGADAS = [
  ['eletronicos', 'Eletrónicos'], ['consolas', 'Consolas'], ['beleza', 'Beleza'], ['casa', 'Casa'], ['moda', 'Moda'],
  ['automotivo', 'Automotivo'], ['perfumaria', 'Perfumaria'], ['gamer', 'Acessórios Gamer'], ['cozinha', 'Cozinha'],
  ['colunas', 'Colunas'], ['ferramentas', 'Ferramentas'], ['feminino', 'Feminino'], ['masculino', 'Masculino'],
  ['calcados', 'Sapatos'], ['joias', 'Pulseiras / Joias'], ['automoveis', 'Carros'], ['papelaria', 'Papelaria'],
  ['jardinagem', 'Jardinagem'], ['energia-solar', 'Energia Solar'], ['seguranca', 'Segurança'], ['relogios', 'Relógios'],
  ['oculos', 'Óculos'], ['malas-mochilas', 'Malas e Mochilas'], ['instrumentos', 'Instrumentos Musicais'], ['artesanato', 'Artesanato'],
  ['festas', 'Festas'], ['construcao', 'Construção'], ['limpeza', 'Limpeza'], ['saude', 'Saúde e Bem-estar'],
  ['eletrodomesticos', 'Eletrodomésticos'], ['fotografia', 'Fotografia'], ['utensilios-cozinha', 'Utensílios de Cozinha'], ['viagem', 'Viagem']
];

export function encontrarCategoria(idOuValor) {
  const valor = String(idOuValor || '').trim();
  return CATEGORIAS_VORA.find((categoria) => categoria.id === valor || categoria.sellerValue === valor || categoria.legacy.includes(valor) || categoria.subcategorias.some(([id]) => id === valor)) || null;
}

export function nomeSubcategoria(id) {
  const valor = String(id || '');
  for (const categoria of CATEGORIAS_VORA) {
    const item = categoria.subcategorias.find(([subId]) => subId === valor);
    if (item) return item[1];
  }
  return valor;
}

export function preencherCategoriaVendedor(select, valorAtual = '') {
  if (!select) return;
  const valor = String(valorAtual || '');
  select.innerHTML = '<option value="">Selecionar categoria principal</option>' + CATEGORIAS_VORA.map((categoria) => `<option value="${categoria.sellerValue}">${categoria.icon} ${categoria.label}</option>`).join('');
  if (valor && !Array.from(select.options).some((opcao) => opcao.value === valor)) {
    const legado = document.createElement('option');
    legado.value = valor;
    legado.textContent = `Categoria anterior: ${valor}`;
    select.appendChild(legado);
  }
  select.value = valor || '';
}

export function preencherSubcategoria(select, categoriaValor = '', valorAtual = '') {
  if (!select) return;
  const categoria = encontrarCategoria(categoriaValor);
  const atual = String(valorAtual || '');
  const opcoes = categoria?.subcategorias || [];
  select.innerHTML = '<option value="">Selecionar subcategoria (opcional)</option>' + opcoes.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
  if (atual && !opcoes.some(([id]) => id === atual)) {
    const legado = document.createElement('option');
    legado.value = atual;
    legado.textContent = `Subcategoria anterior: ${atual}`;
    select.appendChild(legado);
  }
  select.value = atual || '';
  select.disabled = !categoria;
}

export function preencherCategoriaProduto(select, valorAtual = '') {
  if (!select) return;
  const atual = String(valorAtual || '');
  const usados = new Set();
  select.innerHTML = '<option value="">Selecionar categoria</option>';
  CATEGORIAS_VORA.forEach((categoria) => {
    const grupo = document.createElement('optgroup');
    grupo.label = `${categoria.icon} ${categoria.label}`;
    const principal = document.createElement('option');
    principal.value = categoria.id;
    principal.textContent = categoria.label;
    grupo.appendChild(principal);
    usados.add(categoria.id);
    categoria.subcategorias.forEach(([id, label]) => {
      const opcao = document.createElement('option');
      opcao.value = id;
      opcao.textContent = label;
      grupo.appendChild(opcao);
      usados.add(id);
    });
    select.appendChild(grupo);
  });
  const legacy = CATEGORIAS_PRODUTO_LEGADAS.filter(([id]) => !usados.has(id));
  if (legacy.length) {
    const grupo = document.createElement('optgroup');
    grupo.label = 'Compatibilidade com categorias antigas';
    legacy.forEach(([id, label]) => {
      const opcao = document.createElement('option');
      opcao.value = id;
      opcao.textContent = label;
      grupo.appendChild(opcao);
    });
    select.appendChild(grupo);
  }
  if (atual && !Array.from(select.options).some((opcao) => opcao.value === atual)) {
    const opcao = document.createElement('option');
    opcao.value = atual;
    opcao.textContent = `Categoria anterior: ${atual}`;
    select.appendChild(opcao);
  }
  select.value = atual || '';
}
