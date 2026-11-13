import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readRlmFile } from "../../src/demo/nutrition/rlmImport";

function compressedTable(expandedSize?: number) {
  const xml = new TextEncoder().encode('<DATAPACKET Version="2.0"><METADATA><FIELDS/></METADATA><ROWDATA/></DATAPACKET>');
  const compressed = deflateSync(xml);
  const name = new TextEncoder().encode("Alim.xml");
  const packedSize = 50 + 4 + compressed.length;
  const end = 30 + name.length + packedSize;
  const bytes = new Uint8Array(end + 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x05045c61, true);
  // Incorrect checksum verifies rejection before XML parsing or any import mutation.
  view.setUint32(14, 0, true);
  view.setUint32(18, packedSize, true);
  view.setUint32(22, expandedSize ?? xml.length, true);
  view.setUint32(26, name.length, true);
  bytes.set(name, 30);
  view.setUint32(30 + name.length + 50, compressed.length, true);
  bytes.set(compressed, 30 + name.length + 54);
  view.setUint32(end, 0x03025c61, true);
  return bytes;
}

describe("RLM export import boundaries", () => {
  it("rejects empty files and unrelated binaries", async () => {
    await expect(readRlmFile(new File([], "empty.R3A"))).rejects.toThrow("até 32 MB");
    await expect(readRlmFile(new File(["not an RLM file"], "sample.R3F"))).rejects.toThrow("não corresponde");
  });

  it("rejects externally defined XML entities before parsing", async () => {
    const xml = '<!DOCTYPE DATAPACKET [<!ENTITY external SYSTEM "file:///private">]><DATAPACKET/>';
    await expect(readRlmFile(new File([xml], "unsafe.xml"))).rejects.toThrow("declarações externas");
  });

  it("rejects a decompressed record whose checksum differs", async () => {
    await expect(readRlmFile(new File([compressedTable()], "corrupt.R3A"))).rejects.toThrow("integridade");
  });

  it("enforces the declared expanded size while decompressing", async () => {
    await expect(readRlmFile(new File([compressedTable(1)], "oversized.R3A"))).rejects.toThrow("descomprimir");
  });

  it("rejects a compressed record extending beyond the file", async () => {
    const data = compressedTable();
    const truncated = data.slice(0, data.length - 12);
    await expect(readRlmFile(new File([truncated], "truncated.R3A"))).rejects.toThrow("Tamanho inválido");
  });
});
