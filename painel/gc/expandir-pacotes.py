import os
import json

ROOT = r"d:\DRIVE\IA\antigravity\vmixtwste\FreeMix"
GC_DIR = os.path.join(ROOT, "painel", "gc")
BIB_DIR = os.path.join(GC_DIR, "biblioteca")
THUMB_DIR = os.path.join(BIB_DIR, "thumbnails")
PACOTES_DIR = os.path.join(GC_DIR, "pacotes")

os.makedirs(PACOTES_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

NEW_DEFINITIONS = [
    {
        "kind": "breaking",
        "collection": "Jornalismo",
        "name": "Plantão / Urgente",
        "fields": [
            {"key": "badge", "label": "Tarja de Alerta", "type": "text", "default": "URGENTE • PLANTÃO"},
            {"key": "title", "label": "Notícia Principal", "type": "text", "default": "AVANÇO HISTÓRICO NAS NEGOCIAÇÕES INTERNACIONAIS"},
            {"key": "ticker", "label": "Texto Corrido / Linha de Apoio", "type": "text", "default": "Acordo assinado nesta manhã prevê cooperação bilateral imediata entre os países envolvidos"},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#e11d48"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#0f172a"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    },
    {
        "kind": "quote",
        "collection": "Jornalismo",
        "name": "Citação / Declaração",
        "fields": [
            {"key": "author", "label": "Autor da Citação", "type": "text", "default": "DR. ROBERTO ALENCAR"},
            {"key": "role", "label": "Cargo / Instituição", "type": "text", "default": "Diretor Geral de Pesquisas Clínicas"},
            {"key": "quote", "label": "Declaração / Frase", "type": "text", "default": "\"Os resultados obtidos superaram em 40% as nossas melhores expectativas para esta fase.\""},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#38bdf8"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#111827"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    },
    {
        "kind": "lineup",
        "collection": "Esportes",
        "name": "Escalação Tática",
        "fields": [
            {"key": "team", "label": "Equipe", "type": "text", "default": "SELEÇÃO BRASILEIRA"},
            {"key": "formation", "label": "Esquema Tático", "type": "text", "default": "4 - 3 - 3"},
            {"key": "coach", "label": "Treinador", "type": "text", "default": "Técnico: Dorival Júnior"},
            {"key": "players", "label": "Jogadores (um por linha)", "type": "text", "default": "1 Alisson\n2 Danilo\n3 Marquinhos\n4 Gabriel Magalhães\n6 Wendell\n5 Casemiro\n8 Bruno Guimarães\n10 Lucas Paquetá\n7 Vinicius Jr\n9 Rodrygo\n11 Raphinha"},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#eab308"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#064e3b"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    },
    {
        "kind": "podcast_host",
        "collection": "Eventos",
        "name": "Podcast / Entrevista",
        "fields": [
            {"key": "name", "label": "Nome do Convidado / Host", "type": "text", "default": "GABRIEL MEDEIROS"},
            {"key": "bio", "label": "Descrição / Especialidade", "type": "text", "default": "Criador de Conteúdo & Engenheiro de IA"},
            {"key": "handle", "label": "Rede Social / Canal", "type": "text", "default": "@gabrielmedeiros • youtube.com/gab"},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#8b5cf6"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#18181b"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    },
    {
        "kind": "superchat",
        "collection": "Eventos",
        "name": "Superchat / PIX",
        "fields": [
            {"key": "sender", "label": "Doador / Membro", "type": "text", "default": "LUCAS SILVEIRA"},
            {"key": "amount", "label": "Valor Contribuído", "type": "text", "default": "R$ 50,00"},
            {"key": "message", "label": "Mensagem do Apoiador", "type": "text", "default": "Parabéns pela transmissão impecável! Melhor cobertura ao vivo!"},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#10b981"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#0f172a"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    },
    {
        "kind": "speaker",
        "collection": "Eventos",
        "name": "Palestrante Corporativo",
        "fields": [
            {"key": "name", "label": "Nome do Palestrante", "type": "text", "default": "FERNANDA MONTENEGRO"},
            {"key": "title", "label": "Palestra / Keynote", "type": "text", "default": "O Futuro da Inteligência Artificial em Tempo Real"},
            {"key": "company", "label": "Empresa & Cargo", "type": "text", "default": "VP de Tecnologia • Cloud Systems Corp"},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#0ea5e9"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#1e293b"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    },
    {
        "kind": "product_deal",
        "collection": "Eventos",
        "name": "Live Commerce / Oferta",
        "fields": [
            {"key": "badge", "label": "Selo Promocional", "type": "text", "default": "OFERTA EXCLUSIVA AO VIVO"},
            {"key": "product", "label": "Nome do Produto", "type": "text", "default": "Câmera Broadcast 4K Studio Pro"},
            {"key": "price_old", "label": "Preço De", "type": "text", "default": "De: R$ 4.899,00"},
            {"key": "price_new", "label": "Preço Por", "type": "text", "default": "Por: R$ 3.290,00"},
            {"key": "coupon", "label": "Cupom de Desconto", "type": "text", "default": "CUPOM: FREEMIXVIP"},
            {"key": "accent", "label": "Cor de destaque", "type": "color", "default": "#f59e0b"},
            {"key": "background", "label": "Cor do painel", "type": "color", "default": "#09090b"},
            {"key": "foreground", "label": "Cor do texto", "type": "color", "default": "#ffffff"}
        ]
    }
]

HTML_TEMPLATE = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{title}</title><style>html,body{{margin:0;overflow:hidden;background:transparent}}#graphic{{opacity:0;transition:opacity .28s,transform .28s;transform:translateY(16px)}}#graphic.visible{{opacity:1;transform:translateY(0)}}svg{{display:block}}</style></head><body data-model="{model_id}"><div id="graphic"></div><script src="core.js"></script><script src="../gc.js"></script></body></html>"""

generated_files = []
for model_def in NEW_DEFINITIONS:
    kind = model_def["kind"]
    name = model_def["name"]
    for orientation in ["horizontal", "vertical"]:
        model_id = f"fm_{kind}_{orientation}"
        filename = f"{kind}_{orientation}.html"
        filepath = os.path.join(BIB_DIR, filename)
        title = f"{name} · {'Vertical' if orientation == 'vertical' else 'Horizontal'}"
        content = HTML_TEMPLATE.format(title=title, model_id=model_id)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        generated_files.append(filename)

print(f"Gerados {len(generated_files)} novos arquivos HTML de modelos em {BIB_DIR}")

PACOTES = [
    {
        "id": "hard-news-pro",
        "nome": "Pacote Broadcast Hard News Pro",
        "categoria": "Jornalismo",
        "descricao": "Identidade visual para telejornais, plantões, breaking news e coberturas ao vivo com tickers duplos e animação.",
        "paletas": [
            {"nome": "Crimson Urgente", "accent": "#e11d48", "bg": "#0f172a", "text": "#ffffff"},
            {"nome": "Royal Navy", "accent": "#38bdf8", "bg": "#0b1329", "text": "#ffffff"},
            {"nome": "Slate Gold", "accent": "#fbbf24", "bg": "#1e293b", "text": "#ffffff"}
        ]
    },
    {
        "id": "sports-arena-pro",
        "nome": "Pacote Esportes Arena Pro",
        "categoria": "Esportes",
        "descricao": "Placares dinâmicos, estatísticas, escalações, relógio progressivo e destaques individuais para jogos e torneios.",
        "paletas": [
            {"nome": "Estádio Ouro", "accent": "#facc15", "bg": "#064e3b", "text": "#ffffff"},
            {"nome": "Neon Cyan", "accent": "#06b6d4", "bg": "#0f172a", "text": "#ffffff"},
            {"nome": "Scarlet F1", "accent": "#dc2626", "bg": "#171717", "text": "#ffffff"}
        ]
    },
    {
        "id": "podcast-talk-show",
        "nome": "Pacote Podcast & Talk Show Ultra",
        "categoria": "Podcast",
        "descricao": "Lower thirds elegantes com redes sociais, destaque de superchats/doações via Pix e pautas em discussão.",
        "paletas": [
            {"nome": "Velvet Purple", "accent": "#a855f7", "bg": "#18181b", "text": "#ffffff"},
            {"nome": "Cyber Amber", "accent": "#f59e0b", "bg": "#09090b", "text": "#ffffff"},
            {"nome": "Emerald Glow", "accent": "#10b981", "bg": "#111827", "text": "#ffffff"}
        ]
    },
    {
        "id": "corporate-keynote",
        "nome": "Pacote Corporativo & Conferências",
        "categoria": "Corporativo",
        "descricao": "Crachás de palestrantes, agendas de congresso, tópicos de painel e cartelas institucionais limpas.",
        "paletas": [
            {"nome": "Enterprise Blue", "accent": "#0ea5e9", "bg": "#1e293b", "text": "#ffffff"},
            {"nome": "Fintech Emerald", "accent": "#059669", "bg": "#0f172a", "text": "#ffffff"},
            {"nome": "Monolith Dark", "accent": "#64748b", "bg": "#020617", "text": "#ffffff"}
        ]
    },
    {
        "id": "live-commerce-sales",
        "nome": "Pacote Live Commerce & Vendas",
        "categoria": "Variedades",
        "descricao": "Cards de produtos com preço De/Por, cronômetro de oferta relâmpago, cupons e destaque de depoimentos.",
        "paletas": [
            {"nome": "Sunset Amber", "accent": "#f59e0b", "bg": "#18181b", "text": "#ffffff"},
            {"nome": "Hot Coral", "accent": "#f43f5e", "bg": "#0f172a", "text": "#ffffff"},
            {"nome": "Vivid Purple", "accent": "#8b5cf6", "bg": "#09090b", "text": "#ffffff"}
        ]
    }
]

with open(os.path.join(PACOTES_DIR, "pacotes-manifesto.json"), "w", encoding="utf-8") as f:
    json.dump({"pacotes": PACOTES, "total_modelos": len(NEW_DEFINITIONS) * 2 + 22}, f, indent=2, ensure_ascii=False)

print("Manifesto de pacotes salvo com sucesso!")
