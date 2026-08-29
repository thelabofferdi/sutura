export const PROVIDER_HOSTS: Record<string, string[]> = {
  imole: ["api.imole.app"],
};

export function resolveBaseUrl(provider: string, baseUrl?: string): string {
  const normalized = provider === "imole" ? "imole" : provider;
  if (normalized === "local") return "";
  const raw = baseUrl?.trim() || (normalized === "imole" ? "https://api.imole.app/v1" : "");
  if (!raw) throw new Error("Base URL requise pour ce provider.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("La base URL doit être une URL HTTPS valide.");
  }
  if (url.protocol !== "https:") throw new Error("La base URL doit utiliser HTTPS.");
  if (url.username || url.password) throw new Error("La base URL ne doit pas contenir d'identifiants.");
  const hosts = PROVIDER_HOSTS[normalized];
  if (hosts && !hosts.includes(url.hostname)) throw new Error(`Hôte non autorisé pour ${normalized}.`);
  // Port explicite non autorisé sauf 443
  if (url.port && url.port !== "443") throw new Error("Port non autorisé.");
  // Path must start with /v1 or / for imole
  return url.toString().replace(/\/$/, "");
}

export function validatePipelineProvider(provider: string, apiKeyProvider?: string) {
  if (provider === "local" && apiKeyProvider) throw new Error("Provider local ne doit pas avoir de clé.");
  if (provider === "imole" && apiKeyProvider && apiKeyProvider !== "imole") throw new Error("Clé incompatible avec provider imole.");
  if (provider === "auto" && apiKeyProvider && !["imole", "openai", "generic"].includes(apiKeyProvider)) throw new Error("Provider de clé invalide.");
}
