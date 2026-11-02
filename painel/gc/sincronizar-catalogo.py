import os
import re

ROOT = r"d:\DRIVE\IA\antigravity\vmixtwste\FreeMix"
CORE_PATH = os.path.join(ROOT, "painel", "gc", "biblioteca", "core.js")
CATALOGO_PATH = os.path.join(ROOT, "painel", "gc", "catalogo-biblioteca.js")

# Ler core.js para extrair a lista exata de models gerada por models = definitions.flatMap(...)
# Podemos usar node para executar uma pequena avaliação e cuspir o JSON exato de models!
import subprocess

node_eval = """
const fs = require('fs');
let code = fs.readFileSync('""" + CORE_PATH.replace('\\', '/') + """', 'utf8');

// Mock browser objects
global.document = { currentScript: { src: 'http://localhost/core.js' }, body: { dataset: { model: 'fm_headline_horizontal' }, style: {} }, getElementById: () => ({ innerHTML: '' }) };
global.window = {};

// Tirar IIFE externa para acessar variaveis locais
code = code.replace(/^\\s*\\(\\(\\)\\s*=>\\s*\\{/, '').replace(/\\}\\)\\(\\);?\\s*$/, '');
eval(code);

// Extrair models
console.log(JSON.stringify(models));
"""

result = subprocess.run(["node", "-e", node_eval], capture_output=True, text=True)
if result.returncode != 0:
    print("Erro ao avaliar core.js:", result.stderr)
    exit(1)

models_json = result.stdout.strip()
print(f"Sucesso! Extraídos {len(eval(models_json))} modelos de core.js.")

# Montar o arquivo catalogo-biblioteca.js
new_catalogo = f"""// Modelos próprios mesclados em memória; o catálogo do operador permanece intacto.
// Biblioteca Expandida Broadcast FreeMix (News, Sports, Events, Brand, Podcast, Corporate, Commerce)
(()=>{{
 const own={models_json};
 window.FreeMixGCCatalogMerge=list=>{{const result=Array.isArray(list)?list.slice():[],ids=new Set(result.map(x=>x.id));for(const item of own)if(!ids.has(item.id)){{result.push(item);ids.add(item.id);}}return result;}};
 window.GC_CATALOG=window.FreeMixGCCatalogMerge(window.GC_CATALOG);
}})();
"""

with open(CATALOGO_PATH, "w", encoding="utf-8") as f:
    f.write(new_catalogo)

print("catalogo-biblioteca.js atualizado com sucesso!")
