import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

test("troca de perfil muda o usuário e as permissões", async () => {
  const { getDemoViewer, setDemoRole } = await import("../../src/demo/app/session");
  const { canAccessTab } = await import("../../src/layouts/AppSidebar");
  expect(getDemoViewer().role).toBe("administrador");
  setDemoRole("consulta");
  const viewer = getDemoViewer();
  expect(viewer.role).toBe("consulta");
  expect(canAccessTab("quotes", viewer)).toBe(false);
  expect(canAccessTab("dashboard", viewer)).toBe(true);
  expect(canAccessTab("policy", viewer)).toBe(true);
  setDemoRole("comercial");
  expect(canAccessTab("quotes", getDemoViewer())).toBe(true);
}, 20_000);
