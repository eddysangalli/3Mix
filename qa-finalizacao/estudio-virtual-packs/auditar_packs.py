# -*- coding: utf-8 -*-
"""Auditoria técnica real (pixel-level) dos packs de cenário em
D:/Users/eddyr/Downloads/3Mix_3_Packs_04_05_06_CAMADAS_4K.

Não assume nada do MANIFESTO.json anterior: mede de verdade com Pillow.
"""
import json, os
from pathlib import Path
from PIL import Image

SRC = Path(r"D:/Users/eddyr/Downloads/3Mix_3_Packs_04_05_06_CAMADAS_4K")

def alpha_stats(img: Image.Image):
    if img.mode != "RGBA":
        return {"tem_alpha": False, "modo": img.mode}
    a = img.getchannel("A")
    hist = a.histogram()
    total = img.width * img.height
    transparentes = hist[0]
    opacos = hist[255]
    meio = total - transparentes - opacos
    # bounding box da área transparente (onde A < 10), útil pra achar o "buraco" do telão
    mask = a.point(lambda v: 255 if v < 10 else 0)
    bbox = mask.getbbox()
    return {
        "tem_alpha": True,
        "modo": img.mode,
        "pct_transparente": round(100 * transparentes / total, 2),
        "pct_opaco": round(100 * opacos / total, 2),
        "pct_meio_termo": round(100 * meio / total, 2),
        "bbox_area_transparente_px": bbox,
    }

def inspect_file(path: Path):
    try:
        with Image.open(path) as img:
            img.load()
            info = {
                "arquivo": path.name,
                "bytes": path.stat().st_size,
                "dimensoes": [img.width, img.height],
                **alpha_stats(img),
            }
            return info
    except Exception as e:
        return {"arquivo": path.name, "erro": str(e)}

def main():
    report = {}
    if not SRC.exists():
        print(json.dumps({"erro": f"pasta não encontrada: {SRC}"}, ensure_ascii=False))
        return
    packs = sorted([p for p in SRC.iterdir() if p.is_dir() and p.name.startswith("Pack_")])
    for pack_dir in packs:
        files = sorted([f for f in pack_dir.iterdir() if f.is_file()])
        entry = {"pasta": pack_dir.name, "arquivos": [f.name for f in files], "imagens": []}
        for f in files:
            if f.suffix.lower() in (".png", ".jpg", ".jpeg"):
                entry["imagens"].append(inspect_file(f))
        report[pack_dir.name] = entry
    out = Path(__file__).parent / "auditoria-packs-raw.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"OK: {len(packs)} packs auditados -> {out}")

if __name__ == "__main__":
    main()
