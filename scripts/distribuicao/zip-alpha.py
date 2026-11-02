"""Gera o ZIP do alpha a partir de um pacote selado e verificado, com a pasta interna chamada 3Mix-Alpha."""
import argparse
import hashlib
import json
import pathlib
import stat
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--receipt', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()

receipt = json.loads(pathlib.Path(args.receipt).read_text(encoding='utf-8'))
assert receipt['status'] == 'PASS' and receipt['signatureVerified'] and receipt['allHashesVerified'], 'Pacote sem verificação'
root = pathlib.Path(receipt['root']).resolve()
output = pathlib.Path(args.output).resolve()
assert not output.exists(), 'ZIP já existe; não substituir'
assert root not in output.parents, 'O ZIP não pode ficar dentro do pacote'
raw = (root / 'manifest.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == receipt['manifestHash'], 'Manifesto mudou depois da verificação'
manifest = json.loads(raw)
esperados = {item['path'] for item in manifest['files']} | {'manifest.json', 'manifest.sig'}
pasta = '3Mix-Alpha-' + receipt['version'].split('.')[-1]

arquivos = []
for file in sorted(root.rglob('*')):
    info = file.lstat()
    assert not file.is_symlink() and not (getattr(info, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT), str(file)
    if file.is_file():
        arquivos.append(file)
vistos = {f.relative_to(root).as_posix() for f in arquivos}
assert vistos == esperados, 'Arquivos diferentes do manifesto: ' + str(sorted(vistos ^ esperados)[:5])

with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
    for file in arquivos:
        z.write(file, pasta + '/' + file.relative_to(root).as_posix())

with zipfile.ZipFile(output) as z:
    ruim = z.testzip()
    assert ruim is None, 'Arquivo corrompido no ZIP: ' + ruim
    nomes = {n[len(pasta) + 1:] for n in z.namelist()}
    assert nomes == esperados, 'ZIP diferente do manifesto'
    assert hashlib.sha256(z.read(pasta + '/manifest.json')).hexdigest() == receipt['manifestHash']

h = hashlib.sha256()
with output.open('rb') as f:
    for bloco in iter(lambda: f.read(1024 * 1024), b''):
        h.update(bloco)
resultado = {'status': 'PASS', 'zip': str(output), 'pasta': pasta, 'bytes': output.stat().st_size, 'sha256': h.hexdigest(), 'arquivos': len(esperados), 'version': receipt['version']}
pathlib.Path(str(output) + '.json').write_text(json.dumps(resultado, indent=2), encoding='utf-8')
print(json.dumps(resultado))
