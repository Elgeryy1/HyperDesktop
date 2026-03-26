export type VmState =
  | "PROVISIONING"
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "REBOOTING"
  | "ERROR"
  | "DELETING"
  | "DELETED";

export type UserRole = "ADMINISTRADOR" | "PROFESOR" | "ALUMNO";
