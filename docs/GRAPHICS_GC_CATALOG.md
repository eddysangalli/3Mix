# Catálogo de Gráficos (GCs), Galeria e Fontes de Dados — 3Mix

> **Especificação do Módulo de Gráficos e Operação On-Air**

---

## 1. Arquitetura de Camadas (Layers) Sem Conflitos

O 3Mix organiza os elementos gráficos em três camadas lógicas de sobreposição:

| Camada | Função Primária | Exemplos de Templates | Comportamento no Ar |
| :---: | :--- | :--- | :--- |
| **Camada 1** | Elementos Permanentes de Canto e Placar | Bug/Logo do Canal, Relógio ao Vivo, Placar Esportivo fixo | Ficam ativos continuamente durante a transmissão sem conflitar com tarjas. |
| **Camada 2** | Informativos Contínuos e Tickers | Barra de Ticker inferior, notícias em rolagem contínua, cotações | Rola na base da tela sem interromper a identificação de pessoas. |
| **Camada 3** | Tarjas Operacionais e Lower Thirds | Identificação de Entrevistado, Tarja Urgente/Plantão, Citação | Entram sob demanda do operador (Take In), com saída animada (Take Out). |

---

## 2. Inventário de Coleções e Templates Inclusos

### 📰 Coleção: Jornalismo
* **`jornal_lower_third`**: Tarja clássica com gradiente escuro, borda colorida personalizável, Nome em destaque e Cargo/Função.
* **`jornal_urgente`**: Tarja de Plantão / Breaking News com badge vermelho pulsante e caixa de texto de alta visibilidade.
* **`jornal_ticker`**: Ticker de rodapé com rolagem horizontal de manchetes.

### ⚽ Coleção: Esportes
* **`esporte_placar`**: Placar dinâmico de futebol/futsal com nomes das equipes, gols, período (1º T, 2º T) e cronômetro progressivo em tempo real.

### 🏷️ Coleção: Marca & Comercial
* **`marca_bug_relogio`**: Marca translúcida de canto superior direito acompanhada de relógio digital sincronizado à hora exata do computador da transmissão.

---

## 3. Fontes de Dados (DataSources)

O módulo de Gráficos do 3Mix integra nativamente:
1. **Preenchimento Manual**: Edição instantânea em formulário na própria interface.
2. **Planilhas CSV**: Vínculo com arquivos `.csv` (com separador `,` ou `;`), permitindo carregar centenas de nomes de palestrantes ou atletas e preencher a arte com 1 clique.
3. **Feeds JSON (Local ou HTTP)**: Consulta a endpoints REST para atualização de dados esportivos ou financeiros sem reiniciar a animação.

---

## 4. Contrato de Template e Operação On-Air

Cada template exporta a API padrão:
- `window.GC.play(data)`: Inicia a animação de entrada com os dados preenchidos.
- `window.GC.update(data)`: Atualiza o texto ou valor sem recriar a animação (ideal para placar e relógio).
- `window.GC.stop()`: Executa a animação de saída e recolhe a arte de forma suave.
