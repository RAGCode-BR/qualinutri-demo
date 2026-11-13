import type { Json } from "../../types/database.types";
import type { DemoUser, Row } from "../store/types";
import { addDays, isoDateTime, seededId } from "../store/ids";
import { chance, int, pick, type Rng } from "./random";

export const DEMO_ADMIN_ID = "demo-admin";

export function buildUsers(today: Date): DemoUser[] {
  const at = isoDateTime(addDays(today, -200));
  return [
    { id: DEMO_ADMIN_ID, login: "demonstracao", displayName: "Usuário Demonstração", role: "administrador", active: true, mustChangePassword: false, createdAt: at },
    { id: "demo-seller-1", login: "carla.mendes", displayName: "Carla Mendes", role: "comercial", active: true, mustChangePassword: false, createdAt: at },
    { id: "demo-seller-2", login: "rafael.prado", displayName: "Rafael Prado", role: "comercial", active: true, mustChangePassword: false, createdAt: at },
    { id: "demo-viewer", login: "consulta.fabrica", displayName: "Consulta Fábrica", role: "consulta", active: true, mustChangePassword: false, createdAt: at },
  ];
}

function digits(rng: Rng, count: number) {
  return Array.from({ length: count }, () => int(rng, 0, 9));
}

function checkDigit(numbers: number[], weights: number[]) {
  const sum = numbers.reduce((total, value, index) => total + value * weights[index], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function fakeCpf(rng: Rng) {
  const base = digits(rng, 9);
  if (new Set(base).size === 1) base[0] = (base[0] + 1) % 10;
  const d1 = checkDigit(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const all = [...base, d1, d2].join("");
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

function fakeCnpj(rng: Rng) {
  const base = [...digits(rng, 8), 0, 0, 0, 1];
  const d1 = checkDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const all = [...base, d1, d2].join("");
  return `${all.slice(0, 2)}.${all.slice(2, 5)}.${all.slice(5, 8)}/${all.slice(8, 12)}-${all.slice(12)}`;
}

const firstNames = ["João", "Maria", "Antônio", "Ana", "José", "Francisca", "Carlos", "Juliana", "Paulo", "Márcia", "Pedro", "Luciana", "Lucas", "Fernanda", "Marcos", "Patrícia", "Gabriel", "Aline", "Rodrigo", "Sandra"];
const lastNames = ["Oliveira", "Santos", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Ferreira", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Barbosa"];
const farmWords = ["Boa Vista", "Santa Luzia", "Três Irmãos", "Bela Vista", "São Jorge", "Recanto Verde", "Água Limpa", "Pôr do Sol", "Esperança", "Primavera", "Serra Dourada", "Ouro Verde", "Vale do Sol", "Rio Bonito", "Campo Alegre"];
const businessWords = ["Agropecuária", "Casa do Produtor", "Agro Center", "Comercial Rural", "Revenda Agro"];
const cities = ["Vale Verde", "Serra Azul", "Rio Claro", "Boa Esperança", "Nova Aurora", "Porto Campo", "Santa Rita do Norte", "Juruá do Norte"];
const streets = ["Rodovia MT-220, km ", "Estrada Vicinal ", "Avenida das Palmeiras, ", "Rua dos Pioneiros, "];

export function buildCustomers(rng: Rng, today: Date): { customers: Row<"customers">[]; properties: Row<"customer_properties">[] } {
  const customers: Row<"customers">[] = [];
  const properties: Row<"customer_properties">[] = [];
  const usedNames = new Set<string>();
  for (let index = 0; customers.length < 45; index += 1) {
    const isCompany = chance(rng, 0.3);
    const person = `${pick(rng, firstNames)} ${pick(rng, lastNames)} ${pick(rng, lastNames)}`;
    const legalName = isCompany ? `${pick(rng, businessWords)} ${pick(rng, farmWords)} Ltda` : person;
    if (usedNames.has(legalName)) continue;
    usedNames.add(legalName);
    const city = pick(rng, cities);
    const createdAt = addDays(today, customers.length < 7 ? -int(rng, 0, 26) : -int(rng, 30, 400));
    const id = seededId(rng);
    const phone = `(66) 9${int(rng, 8100, 9999)}-${int(rng, 1000, 9999)}`;
    const address: Json = { street: `${pick(rng, streets)}${int(rng, 10, 900)}`, complement: null, district: "Zona rural", city, state: "MT", postal_code: `78${int(rng, 100, 599)}-${int(rng, 100, 999)}` };
    customers.push({
      id,
      legal_name: legalName,
      trade_name: isCompany ? null : (chance(rng, 0.6) ? `Fazenda ${pick(rng, farmWords)}` : null),
      document: isCompany ? fakeCnpj(rng) : fakeCpf(rng),
      phone,
      email: chance(rng, 0.5) ? `${legalName.split(" ")[0].normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase()}${int(rng, 1, 99)}@exemplo.com.br` : null,
      address,
      notes: null,
      active: index % 23 !== 7,
      legacy_code: null,
      legacy_details: null,
      created_at: isoDateTime(createdAt),
      updated_at: isoDateTime(createdAt),
      created_by: DEMO_ADMIN_ID,
      updated_by: null,
    });
    const propertyCount = isCompany ? 0 : int(rng, 0, 2);
    for (let p = 0; p < propertyCount; p += 1) {
      properties.push({
        id: seededId(rng),
        customer_id: id,
        name: `Fazenda ${pick(rng, farmWords)}`,
        city: pick(rng, cities),
        state: "MT",
        notes: chance(rng, 0.4) ? `${int(rng, 120, 3800)} cabeças` : null,
        active: true,
        created_at: isoDateTime(createdAt),
        updated_at: isoDateTime(createdAt),
        created_by: DEMO_ADMIN_ID,
      });
    }
  }
  return { customers, properties };
}
