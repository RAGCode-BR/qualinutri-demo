export type ProfileRole = "administrador" | "comercial" | "consulta";

export type UserProfile = {
  id: string;
  login: string;
  displayName: string | null;
  role: ProfileRole;
  active: boolean;
  mustChangePassword: boolean;
};
