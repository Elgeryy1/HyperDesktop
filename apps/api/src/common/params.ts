import { HttpError } from "./http-error.js";

export function getParam(value: string | string[] | undefined, name: string): string {
  if (!value) {
    throw new HttpError(400, "VALIDATION_ERROR", `Missing route param: ${name}`);
  }
  return Array.isArray(value) ? value[0] : value;
}

