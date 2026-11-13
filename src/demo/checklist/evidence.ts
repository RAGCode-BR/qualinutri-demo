import { newId } from "../store/ids";
import type { EvidenceRef } from "./types";

const DB_NAME = "qualinutri-demo-evidence";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Sem IndexedDB")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

/** Guarda o arquivo no navegador (fotos reduzidas) e devolve a referência. */
export async function storeEvidence(file: File): Promise<EvidenceRef> {
  const blob = await shrinkImage(file);
  const ref: EvidenceRef = { id: newId(), name: file.name, type: blob.type || file.type, size: blob.size };
  try {
    const database = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, ref.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memory.set(ref.id, blob);
  }
  return ref;
}

const memory = new Map<string, Blob>();

export async function loadEvidence(id: string): Promise<Blob | null> {
  if (memory.has(id)) return memory.get(id)!;
  try {
    const database = await open();
    return await new Promise<Blob | null>((resolve) => {
      const request = database.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Imagem de exemplo desenhada para as evidências fictícias do seed. */
export function placeholderSvg(label: string, seed: number): string {
  const hues = [138, 96, 160, 74, 120];
  const hue = hues[seed % hues.length];
  const safe = label.replace(/[<&>"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480' viewBox='0 0 640 480'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue} 45% 32%)'/><stop offset='1' stop-color='hsl(${hue + 20} 55% 18%)'/></linearGradient></defs><rect width='640' height='480' fill='url(#g)'/><circle cx='520' cy='90' r='120' fill='hsl(80 70% 55%)' opacity='.18'/><rect x='40' y='300' width='560' height='120' rx='18' fill='rgba(255,255,255,.12)'/><text x='60' y='352' font-family='Arial' font-size='26' font-weight='700' fill='#fff'>${safe}</text><text x='60' y='392' font-family='Arial' font-size='18' fill='rgba(255,255,255,.75)'>Evidência de exemplo · demonstração</text><path d='M80 230l70-80 60 60 50-40 90 90' stroke='rgba(255,255,255,.55)' stroke-width='10' fill='none' stroke-linejoin='round'/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
