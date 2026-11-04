// Own graphics: typed text/style and hash-addressed local assets, without arbitrary URLs/scripts.
const text=(key,label,value)=>({key,label,type:'text',default:value});
const number=(key,label,value,min=0,max=9999)=>({key,label,type:'number',default:value,min,max});

const definitions=[
 ['headline','Jornalismo','Manchete', [text('tag','Editoria','AO VIVO'),text('title','Manchete','A cidade se prepara para um novo capítulo'),text('detail','Linha de apoio','Informação verificada • Atualização da redação')]],
 ['lowerthird','Jornalismo','Nome e cargo',[text('name','Nome','MARINA COSTA'),text('role','Cargo / descrição','Repórter • Centro da cidade'),text('location','Local','PORTO ALEGRE')]],
 ['two_names','Jornalismo','Dois entrevistados',[text('nameA','Nome à esquerda','ANA SOUZA'),text('roleA','Cargo à esquerda','Apresentadora'),text('nameB','Nome à direita','PAULO LIMA'),text('roleB','Cargo à direita','Convidado')]],
 ['breaking','Jornalismo','Plantão / Urgente',[text('badge','Alerta','URGENTE • PLANTÃO'),text('title','Notícia Principal','AVANÇO HISTÓRICO NAS NEGOCIAÇÕES'),text('ticker','Linha de apoio','Acordo assinado nesta manhã prevê cooperação bilateral imediata')]],
 ['quote','Jornalismo','Citação / Aspas',[text('author','Autor','DR. ROBERTO ALENCAR'),text('role','Cargo / Instituição','Diretor Geral de Pesquisas'),text('quote','Declaração','"Os resultados superaram em 40% as melhores expectativas."')]],
 ['credits','Eventos','Créditos',[text('title','Cabeçalho','EQUIPE'),text('lines','Linhas (Cargo | Nome)','Direção | Marina Costa\nProdução | Paulo Lima\nImagens | Ana Souza\nEdição | João Santos')]],
 ['agenda','Eventos','Agenda',[text('title','Título','PROGRAMAÇÃO'),text('date','Data / local','SÁBADO • AUDITÓRIO CENTRAL'),text('lines','Linhas (Hora | Atividade)','09:00 | Abertura\n10:30 | Painel de convidados\n14:00 | Oficinas\n17:00 | Encerramento')]],
 ['countdown','Eventos','Contagem regressiva',[text('title','Título','COMEÇAMOS EM INSTANTES'),text('detail','Mensagem','Prepare-se para acompanhar ao vivo'),number('seconds','Duração em segundos',300,0,86400)]],
 ['scoreboard','Esportes','Placar e relógio',[text('teamA','Equipe A','BRASIL'),text('teamB','Equipe B','ARGENTINA'),number('scoreA','Pontos A',2),number('scoreB','Pontos B',1),text('period','Período','2º TEMPO'),number('elapsed','Tempo inicial (segundos)',3420,0,86400)]],
 ['stats','Esportes','Comparativo estatístico',[text('teamA','Equipe A','BRASIL'),text('teamB','Equipe B','ARGENTINA'),text('title','Título','ESTATÍSTICAS'),text('lines','Linhas (A | Métrica | B)','58% | Posse de bola | 42%\n12 | Finalizações | 8\n6 | Escanteios | 3\n91% | Passes certos | 86%')]],
 ['lineup','Esportes','Escalação Tática',[text('team','Equipe','SELEÇÃO BRASILEIRA'),text('formation','Esquema','4 - 3 - 3'),text('coach','Treinador','Técnico: Dorival Júnior'),text('lines','Jogadores','1 Alisson | Goleiro\n2 Danilo | Lateral\n3 Marquinhos | Zagueiro\n4 Gabriel Magalhães | Zagueiro\n5 Casemiro | Volante\n10 Lucas Paquetá | Meia\n7 Vinicius Jr | Atacante\n9 Rodrygo | Atacante')]],
 ['bug','Marca','Marca e relógio',[text('brand','Marca','3MIX'),text('label','Etiqueta','AO VIVO')]],
 ['social','Eventos','Redes sociais',[text('network','Rede','INSTAGRAM'),text('handle','Perfil','@seu_evento'),text('message','Convite','Participe da conversa'),text('hashtag','Hashtag','#AoVivoComVoce')]],
 ['podcast_host','Eventos','Podcast / Entrevista',[text('name','Convidado','GABRIEL MEDEIROS'),text('bio','Especialidade','Engenheiro de IA & Criador de Conteúdo'),text('handle','Rede Social','@gabrielmedeiros • youtube.com/gab')]],
 ['superchat','Eventos','Superchat / PIX',[text('sender','Apoiador','LUCAS SILVEIRA'),text('amount','Valor','R$ 50,00'),text('message','Mensagem','Parabéns pela transmissão! Impecável!')]],
 ['speaker','Eventos','Palestrante',[text('name','Nome','FERNANDA MONTENEGRO'),text('title','Palestra','O Futuro da Inteligência Artificial'),text('company','Empresa','VP de Tecnologia • Cloud Systems')]],
 ['product_deal','Eventos','Live Commerce',[text('badge','Destaque','OFERTA EXCLUSIVA AO VIVO'),text('product','Produto','Câmera Broadcast 4K Studio Pro'),text('price_old','Preço De','De: R$ 4.899,00'),text('price_new','Preço Por','Por: R$ 3.290,00'),text('coupon','Cupom','CUPOM: 3MIXVIP')]],
 ['fullscreen','Jornalismo','Cartão de informação',[text('tag','Editoria','SERVIÇO'),text('title','Título','O QUE VOCÊ PRECISA SABER'),text('lines','Tópicos (um por linha)','Consulte os horários atualizados\nConfira os documentos necessários\nProcure os canais oficiais'),text('footer','Rodapé','Fonte: organização do evento')]],
 ['church_verse','Igreja','Versículo Bíblico',[text('book','Livro e Capítulo','JOÃO 3:16'),text('verse','Texto Bíblico','"Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito..."'),text('version','Versão','NVI • Nova Versão Internacional')]],
 ['breaking_ticker','Jornalismo','Tarja Urgente Ticker',[text('badge','Alerta','URGENTE'),text('title','Notícia','GOVERNO ANUNCIA NOVO PACOTE DE INVESTIMENTOS'),text('ticker','Ticker de Notícias','Bolsa opera em alta de +1.4% • Dólar fecha a R$ 5,12 • Inflação recua pelo terceiro mês consecutivo')]],
 ['election_poll','Jornalismo','Pesquisa Eleitoral',[text('title','Título da Pesquisa','INTENÇÃO DE VOTO • 1º TURNO'),text('candA','Candidato A','CANDIDATO 1'),number('pctA','Porcentagem A (%)',46,0,100),text('candB','Candidato B','CANDIDATO 2'),number('pctB','Porcentagem B (%)',38,0,100),text('candC','Candidato C','OUTROS / BRANCOS / NULOS'),number('pctC','Porcentagem C (%)',16,0,100),text('source','Instituto / Registro','DataPesquisa • Registro TSE BR-09412/2026 • Margem ±2%')]],
 ['weather','Jornalismo','Previsão do Tempo',[text('city','Cidade / Região','SÃO PAULO - SP'),text('temp','Temperatura Atual','24°C'),text('min_max','Mínima / Máxima','Mín 17°C • Máx 28°C'),text('condition','Condição','Ensolarado com poucas nuvens'),text('forecast','Previsão próximos dias','Amanhã: 26°C Sol • Quinta: 22°C Chuva')]],
 ['breaking_banner','Jornalismo','Banner Plantão Full',[text('badge','Badge de Alerta','PLANTÃO DA REDAÇÃO'),text('title','Manchete Principal','DECISÃO HISTÓRICA DO TRIBUNAL EM BRASÍLIA'),text('subtext','Detalhes','Julgamento concluído com repercussão geral imediata'),text('time','Horário / Status','15:30 AO VIVO')]],
 ['lowerthird_chanfro','Esportes','Chanfrado Angular',[text('name','Nome do Atleta','GABRIEL "FALLEN" TOLEDO'),text('team','Equipe / Posição','FURIA ESPORTS • CAPITÃO & AWPER'),text('stats','Estatísticas','K/D: 1.42 • MAP WIN: 78% • RATING: 1.28')]],
 ['lowerthird_pill','Moderno','Pill Cápsula Arredondada',[text('name','Nome do Convidado','DRA. BEATRIZ MENDES'),text('specialty','Especialidade / Cargo','Neurocientista & Pesquisadora Senior'),text('tag','Etiqueta / Badge','PAINEL ESPECIAL')]],
 ['lowerthird_glass','Corporativo','Glassmorphism Moderno',[text('name','Nome / Executivo','MARCELO CARVALHO'),text('title','Cargo / Função','Chief Technology Officer • FinTech'),text('company','Empresa / Evento','FORUM DE INOVAÇÃO & IA 2026')]],
 ['crypto_ticker','Finanças','Cotações & Criptomoedas',[text('title','Identificação','MERCADOS & CRIPTO'),text('asset1','Ativo 1','BTC/USD $68.450 (+3.8%)'),text('asset2','Ativo 2','ETH/USD $3.520 (+4.2%)'),text('asset3','Ativo 3','IBOV 128.400 pts (+1.1%)'),text('asset4','Ativo 4','DÓLAR R$ 5,14 (-0.6%)')]],
 ['poll_bar','Interatividade','Enquete Rápida Dual',[text('question','Pergunta da Enquete','QUEM DEVE VENCER A PREMIAÇÃO DESTAQUE DO ANO?'),text('optA','Opção A','Opção 1 • Gabriel Medeiros'),number('pctA','Percentual A (%)',62,0,100),text('optB','Opção B','Opção 2 • Lucas Silveira'),number('pctB','Percentual B (%)',38,0,100)]],
 ['gaming_esports','Esportes','Placar Gamer Match Point',[text('teamA','Time Alpha','LOUD'),number('scoreA','Pontos Time A',2),text('teamB','Time Beta','PAIN GAMING'),number('scoreB','Pontos Time B',1),text('map','Mapa Atual','MAPA 3 • BIND (MD5)'),text('status','Situação do Round','ROUND 14 • PLANT ATIVO')]],
 ['speaker_bio','Eventos','Card Lateral Palestrante',[text('name','Nome do Palestrante','PROF. CARLOS NOGUEIRA'),text('role','Especialidade','PhD em Computação em Nuvem'),text('bio','Mini-Biografia','Mais de 20 anos na indústria broadcast\nAutor de 4 livros técnicos de engenharia\nConsultor sênior de infraestrutura SRT e OMT')]],
 ['side_panel_info','Jornalismo','Painel Lateral de Destaques',[text('title','Título do Painel','DESTAQUES DO DIA'),text('item1','Pauta 1','1. Abertura do mercado com forte alta'),text('item2','Pauta 2','2. Votação de projetos estratégicos na câmara'),text('item3','Pauta 3','3. Previsão de tempo estável para o feriado'),text('footer','Rodapé','Fonte: Redação 3Mix News')]],
 ['corner_bug_pro','Marca','Bug com Relógio e Cidade',[text('brand','Nome da Emissora','3MIX HD'),text('location','Localidade','SÃO PAULO'),text('temp','Temperatura','24°C'),text('badge','Status','AO VIVO')]],
 ['music_nowplaying','Entretenimento','Música Tocando Agora',[text('track','Faixa / Música','Sinfonia Digital em Lá Menor'),text('artist','Artista / Banda','Banda Orquestral 3Mix'),text('album','Álbum / Detalhe','Transmissões Espaciais (Ao Vivo)'),text('duration','Duração','03:45')]],
 ['topbar_headline','Jornalismo','Barra de Notícias Superior',[text('category','Editoria / Tag','PLANTÃO RODOVIAS'),text('title','Manchete Superior','TRÂNSITO INTENSO NAS PRINCIPAIS SAÍDAS PARA O LITORAL'),text('source','Atualização','Monitoramento Viário em Tempo Real')]],
 ['versus_match','Esportes','Confronto Versus Face-to-Face',[text('title','Título da Luta / Jogo','DISPUTA PELO CINTURÃO MUNDIAL'),text('fighterA','Atleta A','ALEX "POATAN" PEREIRA'),text('recordA','Cartel / Stats A','12-2-0 • 9 KOs • Brasil'),text('fighterB','Atleta B','ISRAEL ADESANYA'),text('recordB','Cartel / Stats B','24-3-0 • 16 KOs • Nigéria'),text('category','Categoria de Peso','CATEGORIA PESO MEIO-PESADO')]],
 ['product_card_shop','Eventos','Live Commerce Card Oferta',[text('badge','Destaque','OFERTA RELÂMPAGO AO VIVO'),text('product','Nome do Produto','Console Switcher 3Mix Broadcast USB'),text('price','Preço Promocional','R$ 899,00'),text('discount','Selo Desconto','40% OFF'),text('code','Instrução','APONTE A CÂMERA PARA O QR CODE')]],
 ['citation_quote','Jornalismo','Aspas Centrais de Impacto',[text('quote','Citação Textual','"A simplicidade é o grau máximo da sofisticação."'),text('author','Autor da Frase','LEONARDO DA VINCI'),text('context','Contexto Histórico','Tratado de Pintura e Filosofia')]],
 ['podcast_minimal','Entretenimento','Lower Third Minimal Linha Fina',[text('name','Nome do Host','FELIPE ALBUQUERQUE'),text('role','Função','Host Principal & Criador'),text('social','Rede Social','@felipealbuquerque')]],
 ['stats_versus','Esportes','Comparativo Direto de Jogadores',[text('playerA','Jogador 1','VINICIUS JR (Real Madrid)'),text('playerB','Jogador 2','KYLIAN MBAPPÉ (Real Madrid)'),text('metric1','Métrica 1','Gols no Torneio: 24 | 28'),text('metric2','Métrica 2','Assistências: 11 | 9'),text('metric3','Métrica 3','Velocidade Máxima: 36.2 km/h | 37.1 km/h')]],
 ['social_card_highlight','Eventos','Card Social de Comentário',[text('author','Nome do Autor','Mariana Silveira'),text('handle','Arroba / Perfil','@mari_silveira'),text('network','Rede Social','TWITTER / X'),text('message','Comentário','"A transmissão em 4K e a latência zero no 3Mix estão simplesmente inacreditáveis!"'),text('tag','Hashtag','#3MixAoVivo')]],
 ['countdown_circle','Eventos','Contador Regressivo com Alerta',[text('title','Mensagem de Espera','NOSSA TRANSMISSÃO COMEÇA EM'),text('subtitle','Status da Conexão','Sincronizando feed de vídeo e áudio dos estúdios...'),number('seconds','Tempo em Segundos',180,0,86400)]],
 ['church_service','Igreja','Transmissão de Celebração / Culto',[text('title','Título do Encontro','CELEBRAÇÃO DA FAMÍLIA & FÉ'),text('preacher','Ministro / Preletor','Pastor David Oliveira'),text('theme','Tema da Mensagem','Tema: Edificados Sobre a Rocha Firme'),text('church','Comunidade / Local','Templo Central • Transmissão Oficial')]]
];

const style=[
  {key:'accent',label:'Cor primária (Destaque)',type:'color',default:'#19c9aa'},
  {key:'secondary',label:'Cor secundária (Acento 2)',type:'color',default:'#0284c7'},
  {key:'background',label:'Cor do painel (Fundo)',type:'color',default:'#102330'},
  {key:'foreground',label:'Cor do texto',type:'color',default:'#ffffff'},
  {key:'designStyle',label:'Estilo Visual / Geometria',type:'select',default:'modern_internet',options:['modern_internet','classic_tv','swiss_square','esports_neon','corporate_glass','pill_capsule','cyber_bevel','minimal_flat']},
  number('opacity','Opacidade do painel (%)',96,0,100),
  number('fontSize','Tamanho do texto (%)',100,70,140),
  number('offsetX','Deslocamento horizontal (%)',0,-25,25),
  number('offsetY','Deslocamento vertical (%)',0,-25,25),
  number('scale','Escala (%)',100,60,120)
];

const assets=[
  {key:'fontFamily',label:'Família da fonte',type:'select',default:'Segoe UI',options:['Segoe UI','Arial','Montserrat','Bebas Neue','Roboto','Impact','Trebuchet MS','Georgia']},
  {key:'fontAsset',label:'Arquivo de fonte importado',type:'asset',kind:'font',default:''},
  {key:'imageAsset',label:'Imagem / logotipo',type:'asset',kind:'image',default:''},
  number('imageX','Imagem X (%)',5,0,100),
  number('imageY','Imagem Y (%)',5,0,100),
  number('imageWidth','Imagem largura (%)',15,1,100),
  number('imageHeight','Imagem altura (%)',15,1,100),
  number('imageOpacity','Imagem opacidade (%)',100,0,100)
];

const animations=[
  {key:'animation',label:'Efeito de Transição',type:'select',default:'slide',options:['none','fade','slide','zoom','rotate','blur_fade','wipe']},
  number('animationInMs','Entrada (ms)',280,0,5000),
  number('animationOutMs','Saída (ms)',280,0,5000),
  {key:'animationEasing',label:'Curva da animação',type:'select',default:'ease-out',options:['linear','ease-in','ease-out','ease-in-out','cubic-bezier(0.16, 1, 0.3, 1)']}
];

export const models=definitions.flatMap(([kind,collection,name,fields])=>['horizontal','vertical'].map(orientation=>({
  id:`fm_${kind}_${orientation}`,
  kind,
  orientation,
  name:`${name} · ${orientation==='vertical'?'Vertical':'Horizontal'}`,
  collection,
  category:name,
  width:orientation==='vertical'?1080:1920,
  height:orientation==='vertical'?1920:1080,
  file:`biblioteca/${kind}_${orientation}.html`,
  thumbnail:`biblioteca/thumbnails/${kind}_${orientation}.png`,
  fields:[...fields,...style,...assets,...animations]
})));

export function model(id){const found=models.find(m=>m.id===id);if(!found)throw Error('Modelo próprio não encontrado');return found;}
export function defaults(id){return Object.fromEntries(model(id).fields.map(f=>[f.key,f.default]));}

export function normalizeData(id,raw={},strict=true){
  const m=model(id);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Campos inválidos');
  if(strict&&Object.keys(raw).some(k=>!m.fields.some(f=>f.key===k)))throw Error('Campo não suportado pelo modelo');
  return Object.fromEntries(m.fields.map(f=>{
    let v=raw[f.key]??f.default;
    if(f.type==='number'){
      v=Number(v);
      if(!Number.isFinite(v)||v<f.min||v>f.max)throw Error(`${f.label}: use ${f.min} a ${f.max}`);
    }else{
      v=String(v);
      if(f.type==='select'&&!f.options.includes(v))throw Error(f.label+': opção inválida');
      if(f.type==='asset'&&v&&!new RegExp('^[a-f0-9]{64}\\.'+(f.kind==='font'?'(?:ttf|otf|woff2)':'(?:png|jpg|webp|bmp)')+'$').test(v))throw Error('Importe um arquivo local válido para '+f.label);
      if(f.key==='fontFamily'&&!/^[\p{L}\p{N} _-]{1,80}$/u.test(v))throw Error('Nome da família de fonte inválido');
      if(f.type==='color'&&!/^#[a-f\d]{6}$/i.test(v))throw Error('Cor deve usar #RRGGBB');
      if(v.length>(f.key==='lines'?2000:300)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw Error('Texto inválido ou extenso');
      if(f.key==='lines'&&v.split('\n').length>12)throw Error('Use até 12 linhas');
    }
    return [f.key,v];
  }));
}
