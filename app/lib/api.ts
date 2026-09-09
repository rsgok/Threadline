import { translateError } from "./i18n.ts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly rawMessage: string,
  ) {
    super(translateError(rawMessage));
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Rewind-Request": "1",
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || `HTTP ${response.status}`,
    );
  return data as T;
}
export function post<T>(
  path: string,
  data: unknown = {},
  method = "POST",
  signal?: AbortSignal,
) {
  return api<T>(path, { method, body: JSON.stringify(data), signal });
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
export function download(path: string, filename: string) {
  const link = document.createElement("a");
  link.href = path;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}
