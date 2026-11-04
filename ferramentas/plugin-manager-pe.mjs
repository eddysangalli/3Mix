// Static PE inspection only. Reading these tables never loads a third-party DLL.
function stringAt(bytes, offset, limit = 512) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length) throw Error('Tabela PE fora do arquivo');
  let end = offset;
  while (end < bytes.length && end - offset < limit && bytes[end]) end++;
  if (end === bytes.length || end - offset === limit) throw Error('String PE sem terminador');
  return bytes.toString('ascii', offset, end);
}

export function inspectPe(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 0x100 || bytes.readUInt16LE(0) !== 0x5a4d) throw Error('DLL não é um arquivo PE válido');
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 0x40 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x4550) throw Error('Cabeçalho PE inválido');
  const machine = bytes.readUInt16LE(pe + 4), count = bytes.readUInt16LE(pe + 6);
  const size = bytes.readUInt16LE(pe + 20), optional = pe + 24;
  if (machine !== 0x8664 || count < 1 || count > 96 || size < 128 || optional + size > bytes.length || bytes.readUInt16LE(optional) !== 0x20b) throw Error('Plugin requer DLL Windows x64 (PE32+)');
  const imageBase = bytes.readBigUInt64LE(optional + 24);
  const sectionStart = optional + size;
  if (sectionStart + count * 40 > bytes.length) throw Error('Seções PE truncadas');
  const sections = [];
  for (let i = 0; i < count; i++) {
    const at = sectionStart + i * 40;
    sections.push({ rva: bytes.readUInt32LE(at + 12), virtual: bytes.readUInt32LE(at + 8), raw: bytes.readUInt32LE(at + 20), size: bytes.readUInt32LE(at + 16) });
  }
  const offsetOf = (rva, length = 1) => {
    if (!rva || !Number.isSafeInteger(rva + length)) throw Error('RVA PE inválido');
    const section = sections.find(s => rva >= s.rva && rva + length <= s.rva + Math.max(s.virtual, s.size));
    if (!section) throw Error('Tabela PE fora das seções');
    const offset = section.raw + rva - section.rva;
    if (rva - section.rva + length > section.size || offset + length > bytes.length) throw Error('Tabela PE truncada');
    return offset;
  };
  const directory = n => ({ rva: bytes.readUInt32LE(optional + 112 + n * 8), size: bytes.readUInt32LE(optional + 116 + n * 8) });
  const exports = new Set(), imports = [];
  const exp = directory(0);
  if (exp.rva && exp.size) {
    const at = offsetOf(exp.rva, 40), names = bytes.readUInt32LE(at + 24), namesRva = bytes.readUInt32LE(at + 32);
    if (names > 100000) throw Error('Tabela de exports PE excessiva');
    for (let i = 0; i < names; i++) exports.add(stringAt(bytes, offsetOf(bytes.readUInt32LE(offsetOf(namesRva + i * 4, 4)))));
  }
  const imp = directory(1);
  if (imp.rva && imp.size) {
    let terminator = false;
    for (let i = 0; i < Math.min(2048, Math.ceil(imp.size / 20)); i++) {
      const at = offsetOf(imp.rva + i * 20, 20);
      const lookup = bytes.readUInt32LE(at), nameRva = bytes.readUInt32LE(at + 12), firstThunk = bytes.readUInt32LE(at + 16);
      if (!lookup && !nameRva && !firstThunk) { terminator = true; break; }
      const dll = stringAt(bytes, offsetOf(nameRva)).toLowerCase(), symbols = [];
      const thunk = lookup || firstThunk;
      for (let j = 0; j < 100000; j++) {
        const value = bytes.readBigUInt64LE(offsetOf(thunk + j * 8, 8));
        if (!value) break;
        if (value & (1n << 63n)) symbols.push('#' + String(value & 0xffffn));
        else symbols.push(stringAt(bytes, offsetOf(Number(value) + 2)));
        if (j === 99999) throw Error('Tabela de imports PE excessiva');
      }
      imports.push({ dll, symbols });
    }
    if (!terminator) throw Error('Tabela de imports PE sem terminador');
  }
  return { machine: 'x64', imageBase: imageBase.toString(), exports: [...exports], imports };
}
