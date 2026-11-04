# -*- coding: utf-8 -*-
"""Teste de encaixe do apresentador atrás do púlpito/bancada (Seção 5 do SUPERPROMPT 3Mix).

Compõe fundo + silhueta de teste + bancada (nessa ordem, igual à ordem real de camadas
do 3Mix: fundo -> câmera/pessoa -> bancada por cima) e gera um PREVIEW só para inspeção
visual humana. A silhueta é material de teste apenas; nunca é incluída nos PNGs finais do
pack (Seção 5 é explícita sobre isso).

Não decide sozinho se o encaixe "passou": gera a imagem composta para que um humano (ou a
Claude, olhando a imagem) responda as 6 perguntas sim/não do briefing.
"""
import argparse
import sys
from pathlib import Path
from PIL import Image, ImageDraw


def gerar_silhueta_teste(largura, altura, escala_altura=0.62):
    """Gera uma silhueta humana simples (cabeça + ombros + torso), em pé, de frente,
    como um corte de papelão para teste de proporção — nunca fotorrealista, pra nunca
    ser confundida com um apresentador real num preview."""
    img = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cor = (255, 100, 180, 235)  # magenta chapado: fácil de distinguir de qualquer cenário real

    altura_pessoa = int(altura * escala_altura)
    base_y = altura  # pés no chão do quadro (o enquadramento já deve estar correto)
    topo_y = base_y - altura_pessoa
    cx = largura // 2

    largura_ombro = int(altura_pessoa * 0.34)
    largura_cabeca = int(altura_pessoa * 0.11)
    altura_cabeca = largura_cabeca

    pescoco_y = topo_y + altura_cabeca
    # cabeça
    d.ellipse([cx - largura_cabeca // 2, topo_y, cx + largura_cabeca // 2, pescoco_y], fill=cor)
    # torso trapezoidal (ombros largos, afunila um pouco até a base)
    torso_base_largura = int(largura_ombro * 0.82)
    d.polygon([
        (cx - largura_ombro // 2, pescoco_y + int(altura_cabeca * 0.3)),
        (cx + largura_ombro // 2, pescoco_y + int(altura_cabeca * 0.3)),
        (cx + torso_base_largura // 2, base_y),
        (cx - torso_base_largura // 2, base_y),
    ], fill=cor)
    return img


def compor(fundo_path, bancada_path, saida_path, escala_altura=0.62, offset_x=0.0):
    fundo = Image.open(fundo_path).convert("RGBA")
    W, H = fundo.size

    bancada = None
    if bancada_path:
        bancada = Image.open(bancada_path).convert("RGBA")
        if bancada.size != fundo.size:
            print(f"AVISO: bancada {bancada.size} != fundo {W}x{H}; redimensionando bancada "
                  f"para o canvas do fundo (isso NÃO deveria ser necessário num pack correto — "
                  f"dimensões divergentes já são um defeito a reportar).", file=sys.stderr)
            bancada = bancada.resize((W, H), Image.LANCZOS)

    silhueta = gerar_silhueta_teste(W, H, escala_altura)
    if offset_x:
        silhueta = silhueta.transform(silhueta.size, Image.AFFINE,
                                       (1, 0, -int(offset_x * W), 0, 1, 0))

    composto = fundo.copy()
    composto.alpha_composite(silhueta)
    if bancada is not None:
        composto.alpha_composite(bancada)

    composto.convert("RGB").save(saida_path, quality=95)
    print(f"OK: preview de encaixe salvo em {saida_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--fundo", required=True)
    ap.add_argument("--bancada", default=None, help="opcional; cenários sem bancada não precisam")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--escala-altura", type=float, default=0.62,
                     help="fração da altura do quadro ocupada pela silhueta (padrão 0.62)")
    ap.add_argument("--offset-x", type=float, default=0.0,
                     help="deslocamento horizontal da silhueta, fração da largura (-0.5..0.5)")
    args = ap.parse_args()
    compor(args.fundo, args.bancada, args.saida, args.escala_altura, args.offset_x)
