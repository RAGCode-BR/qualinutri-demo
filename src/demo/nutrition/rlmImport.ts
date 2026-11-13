/** Tables read from the RLM 3.x XML export container. Values retain their source units. */
export type RlmField = {
  name: string;
  type: string;
  required: boolean;
  attributes: Record<string, string>;
};

export type RlmTable = {
  name: string;
  fields: RlmField[];
  rows: Record<string, string>[];
};

export type RlmArchive = {
  fileName: string;
  tables: RlmTable[];
};

const RECORD_SIGNATURE = 0x05045c61;
const DIRECTORY_SIGNATURE = 0x03025c61;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TABLE_BYTES = 24 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_TABLES = 128;
const MAX_ROWS = 200_000;
const decoder = new TextDecoder("utf-8", { fatal: true });

const crcTable = Uint32Array.from({ length: 256 }, (_, number) => {
  let remainder = number;
  for (let bit = 0; bit < 8; bit++) {
    remainder = remainder & 1 ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
  }
  return remainder;
});

function crc32(bytes: Uint8Array): number {
  let remainder = -1;
  for (const byte of bytes) remainder = (remainder >>> 8) ^ crcTable[(remainder ^ byte) & 255];
  return (remainder ^ -1) >>> 0;
}

function attributes(node: Element): Record<string, string> {
  return Object.fromEntries(Array.from(node.attributes, (attribute) => [attribute.name, attribute.value]));
}

function parseTable(xml: string, name: string): RlmTable {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("O XML contém declarações externas não suportadas.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  if (root.tagName !== "DATAPACKET" || document.querySelector("parsererror")) {
    throw new Error(`Tabela XML inválida: ${name}.`);
  }
  const rowsNode = Array.from(root.children).find((node) => node.tagName === "ROWDATA");
  const metadataNode = Array.from(root.children).find((node) => node.tagName === "METADATA");
  const fieldsNode = metadataNode && Array.from(metadataNode.children).find((node) => node.tagName === "FIELDS");
  if (!rowsNode || !fieldsNode) throw new Error(`A tabela ${name} está sem dados ou metadados.`);
  if (rowsNode.children.length > MAX_ROWS || fieldsNode.children.length > 10_000) {
    throw new Error(`A tabela ${name} excede o limite de registros ou campos.`);
  }

  const seenFields = new Set<string>();
  const fields = Array.from(fieldsNode.children, (field) => {
    const values = attributes(field);
    const fieldName = values.attrname;
    if (field.tagName !== "FIELD" || !fieldName || seenFields.has(fieldName) || field.children.length) {
      throw new Error(`Metadados de campo inválidos ou não suportados em ${name}.`);
    }
    seenFields.add(fieldName);
    return {
      name: fieldName,
      type: values.fieldtype ?? "string",
      required: values.required?.toLowerCase() === "true",
      attributes: values,
    };
  });
  const rows = Array.from(rowsNode.children, (row) => {
    if (row.tagName !== "ROW" || row.children.length) throw new Error(`Registro XML não suportado em ${name}.`);
    return attributes(row);
  });
  return { name, fields, rows };
}

async function inflateInto(bytes: Uint8Array<ArrayBuffer>, output: Uint8Array, offset: number): Promise<number> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return offset;
      if (offset + value.length > output.length) {
        await reader.cancel();
        throw new Error("O XML descomprimido é maior que o tamanho declarado.");
      }
      output.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

function xmlTableName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return `${stem || "Tabela"}.xml`;
}

/** Reads locally. It never executes the exported file or fetches its references. */
export async function readRlmFile(file: File): Promise<RlmArchive> {
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error("Selecione um arquivo RLM ou XML de até 32 MB.");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength !== file.size) throw new Error("O arquivo não foi lido por completo.");
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const prefix = new TextDecoder().decode(bytes.subarray(0, 256)).replace(/^\uFEFF/, "").trimStart();
  if (prefix.startsWith("<")) {
    return { fileName: file.name, tables: [parseTable(decoder.decode(bytes), xmlTableName(file.name))] };
  }
  if (bytes.length < 30 || view.getUint32(0, true) !== RECORD_SIGNATURE) {
    throw new Error("O arquivo não corresponde a uma biblioteca R3A, dieta R3F ou XML DATAPACKET.");
  }

  const tables: RlmTable[] = [];
  const names = new Set<string>();
  let cursor = 0;
  let total = 0;
  let rowCount = 0;
  while (cursor + 4 <= bytes.length && view.getUint32(cursor, true) === RECORD_SIGNATURE) {
    if (cursor + 30 > bytes.length || tables.length >= MAX_TABLES) throw new Error("Cabeçalho RLM incompleto ou tabelas em excesso.");
    const expectedCrc = view.getUint32(cursor + 14, true);
    const packedSize = view.getUint32(cursor + 18, true);
    const expandedSize = view.getUint32(cursor + 22, true);
    const nameLength = view.getUint32(cursor + 26, true);
    const start = cursor + 30 + nameLength;
    const end = start + packedSize;
    total += expandedSize;
    if (nameLength < 5 || nameLength > 128 || packedSize <= 54 || end > bytes.length
      || expandedSize > MAX_TABLE_BYTES || total > MAX_DECOMPRESSED_BYTES) {
      throw new Error("Tamanho inválido ou limite de descompressão excedido no arquivo RLM.");
    }
    const name = decoder.decode(bytes.subarray(cursor + 30, start));
    const identity = name.toLowerCase();
    if (!/^[A-Za-z0-9_]+\.xml$/i.test(name) || names.has(identity)) throw new Error("O arquivo contém uma tabela com nome inválido ou duplicado.");
    names.add(identity);

    const output = new Uint8Array(expandedSize);
    let chunkCursor = start + 50;
    let outputOffset = 0;
    let chunks = 0;
    while (chunkCursor < end) {
      if (chunkCursor + 4 > end || ++chunks > 256) throw new Error(`Bloco comprimido incompleto em ${name}.`);
      const chunkSize = view.getUint32(chunkCursor, true);
      chunkCursor += 4;
      if (chunkSize < 6 || chunkCursor + chunkSize > end) throw new Error(`Tamanho de bloco comprimido inválido em ${name}.`);
      try {
        outputOffset = await inflateInto(bytes.subarray(chunkCursor, chunkCursor + chunkSize), output, outputOffset);
      } catch {
        throw new Error(`Falha ao descomprimir a tabela ${name}.`);
      }
      chunkCursor += chunkSize;
    }
    if (outputOffset !== expandedSize || crc32(output) !== expectedCrc) throw new Error(`Falha na verificação de integridade de ${name}.`);
    const table = parseTable(decoder.decode(output), name);
    rowCount += table.rows.length;
    if (rowCount > MAX_ROWS) throw new Error("O arquivo excede o limite total de registros.");
    tables.push(table);
    cursor = end;
  }
  if (cursor + 4 > bytes.length || view.getUint32(cursor, true) !== DIRECTORY_SIGNATURE) {
    throw new Error("O diretório final do arquivo RLM está incompleto ou em formato não suportado.");
  }
  if (!names.has("alim.xml") && !names.has("dieta.xml")) throw new Error("O arquivo não contém uma biblioteca de alimentos ou dietas.");
  return { fileName: file.name, tables };
}
