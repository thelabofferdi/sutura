"use node";

import { createHash } from "crypto";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveBaseUrl } from "./aiProvider";

function hashObject(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

type Recommendation = {
  priority: "high" | "medium" | "low";
  category: "production" | "pricing" | "audience" | "content" | "risk";
  message: string;
  rationale?: string;
};

type Result = {
  provider: "local" | "imole";
  dataPolicy: string;
  recommendations: Recommendation[];
  generatedAt: string;
};

function localRecommendations(count: number): Recommendation[] {
  return count < 10
    ? [{ priority: "high", category: "content", message: "Collecte davantage de réponses avant d'engager la production.", rationale: `${count}/30 réponses : l'échantillon reste fragile.` }]
    : [{ priority: "medium", category: "production", message: "Commence par une petite série et réévalue après les premières ventes.", rationale: "Cette approche limite le risque d'invendu tout en validant la demande." }];
}

function parseRecommendations(value: unknown): Recommendation[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { recommendations?: unknown }).recommendations)) return null;
  const items = (value as { recommendations: unknown[] }).recommendations;
  if (items.length < 1 || items.length > 10) return null;
  const priorities = ["high", "medium", "low"];
  const categories = ["production", "pricing", "audience", "content", "risk"];
  const result: Recommendation[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return null;
    const recommendation = item as Record<string, unknown>;
    if (!priorities.includes(String(recommendation.priority)) || !categories.includes(String(recommendation.category))) return null;
    if (typeof recommendation.message !== "string" || recommendation.message.trim().length < 1 || recommendation.message.length > 500) return null;
    if (recommendation.rationale !== undefined && (typeof recommendation.rationale !== "string" || recommendation.rationale.length > 1000)) return null;
    result.push({ priority: recommendation.priority as Recommendation["priority"], category: recommendation.category as Recommendation["category"], message: recommendation.message.trim(), rationale: typeof recommendation.rationale === "string" ? recommendation.rationale.trim() || undefined : undefined });
  }
  return result;
}

export const generate = action({
  args: { testId: v.id("fashionTests"), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Result> => {
    const creatorId = (await ctx.auth.getUserIdentity())?.subject;
    if (!creatorId) throw new Error("Vous devez être connecté.");
    const data = await ctx.runQuery(internal.recommendationStore.context, { testId: args.testId, creatorId }) as { test: { title: string; description?: string }; responseCount: number; answerSummary: unknown; cached: { responseCount: number; generatedAt: number; inputHash?: string; configHash?: string; aggregationVersion?: string; promptVersion?: string; model?: string; provider: "local" | "imole"; dataPolicy: string; recommendations: Recommendation[] } | null; canCallExternal: boolean; aggregationVersion: string };
    const pipelinePreview = await ctx.runQuery(internal.admin.getPipelineWithKeyInternal, { step: "recommendations" }) as { enabled: boolean; provider: string; model: string; baseUrl?: string; apiKeyId?: import("./_generated/dataModel").Id<"aiApiKeys">; fallbackToLocal: boolean; promptVersion: string } | null;
    const inputHash = hashObject({ responseCount: data.responseCount, answerSummary: data.answerSummary, aggregationVersion: data.aggregationVersion });
    const configHash = hashObject({ provider: pipelinePreview?.provider ?? "auto", model: pipelinePreview?.model ?? "gpt-5.6-luna", baseUrl: pipelinePreview?.baseUrl ?? "", promptVersion: pipelinePreview?.promptVersion ?? "1", enabled: pipelinePreview?.enabled ?? true });
    if (!args.force && data.cached && data.cached.responseCount === data.responseCount && data.cached.inputHash === inputHash && data.cached.configHash === configHash) {
      return { ...data.cached, generatedAt: new Date(data.cached.generatedAt).toISOString() };
    }
    // Rate limiting: 10/min and 60/hour per user:test
    await ctx.runMutation(internal.recommendationStore.checkRateLimit, { key: `${creatorId}:${String(args.testId)}:min`, max: 10, windowMs: 60_000 });
    await ctx.runMutation(internal.recommendationStore.checkRateLimit, { key: `${creatorId}:${String(args.testId)}:hour`, max: 60, windowMs: 60 * 60_000 });
    await ctx.runMutation(internal.recommendationStore.acquireLock, { testId: args.testId, creatorId, step: "recommendations", ttlMs: 30_000 });

    let provider: "local" | "imole" = "local";
    let recommendations = localRecommendations(data.responseCount);
    const pipeline = pipelinePreview;
    const enabled = pipeline?.enabled ?? true;
    const pipelineProvider = pipeline?.provider ?? "auto";
    let apiKey: string | undefined = process.env.IMOLE_API_KEY;
    if (pipeline?.apiKeyId) {
      const secret = await ctx.runAction(internal.aiSecrets.getDecrypted, { id: pipeline.apiKeyId });
      apiKey = secret?.rawKey;
    }
    const rawBase = pipeline?.baseUrl ?? process.env.IMOLE_BASE_URL ?? "https://api.imole.app/v1";
    const baseUrl = resolveBaseUrl(pipelineProvider === "local" ? "local" : "imole", rawBase);
    const model = pipeline?.model ?? process.env.IMOLE_MODEL ?? "gpt-5.6-luna";
    if (pipeline && !enabled) apiKey = undefined;
    else if (pipelineProvider === "local") apiKey = undefined;
    else if (pipelineProvider === "imole" && !apiKey) apiKey = undefined;
    const canCallExternal = (data as { canCallExternal?: boolean }).canCallExternal ?? data.responseCount >= 5;
    if (!canCallExternal) apiKey = undefined;

    let finalResult: Result;
    try {
      if (apiKey && enabled && baseUrl) {
        let lastError: unknown = null;
        let shouldRetry = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const response = await fetch(`${baseUrl}/responses`, {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                input: [
                  { role: "system", content: `Tu aides un créateur de mode. Prompt v${pipeline?.promptVersion ?? "1"}. Réponds uniquement en JSON conforme au schéma, avec des conseils prudents fondés sur les données.` },
                  { role: "user", content: JSON.stringify({ test: data.test, responseCount: data.responseCount, answerSummary: data.answerSummary }) },
                ],
                reasoning: { effort: "medium" },
                text: { format: { type: "json_schema", name: "sutura_recommendations", strict: true, schema: {
                  type: "object", additionalProperties: false, required: ["recommendations"], properties: {
                    recommendations: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", additionalProperties: false, required: ["priority", "category", "message"], properties: {
                      priority: { enum: ["high", "medium", "low"] }, category: { enum: ["production", "pricing", "audience", "content", "risk"] }, message: { type: "string", maxLength: 500 }, rationale: { type: "string", maxLength: 1000 },
                    } } },
                  },
                } } },
              }),
              signal: controller.signal,
              redirect: "error",
            } as RequestInit);
            if (!response.ok) {
              const retryable = response.status === 408 || response.status === 429 || (response.status >= 500 && response.status < 600);
              shouldRetry = retryable;
              throw new Error(`Imọlẹ ${response.status}`);
            }
            const payload = await response.json();
            const text = payload.output_text ?? payload.output?.flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? []).find((item: { type: string }) => item.type === "output_text")?.text;
            if (!text) throw new Error("Imọlẹ réponse vide");
            const parsed = parseRecommendations(JSON.parse(text));
            if (parsed) { recommendations = parsed; provider = "imole"; break; }
            else throw new Error("Imọlẹ parsing échoué");
          } catch (error) {
            lastError = error;
            const msg = String((error as Error)?.message ?? "");
            const isAbort = msg.includes("abort") || (error as Error)?.name === "AbortError";
            shouldRetry = shouldRetry || isAbort || msg.includes("429") || msg.includes("408") || msg.includes("5");
            console.error(`Imọlẹ tentative ${attempt + 1} échouée`, error);
            if (attempt < 1 && shouldRetry) {
              const delay = 800 * (attempt + 1) + Math.floor(Math.random() * 200);
              await new Promise((r) => setTimeout(r, delay));
              shouldRetry = false;
            } else if (attempt < 1 && !shouldRetry) {
              break;
            }
          } finally {
            clearTimeout(timeout);
          }
        }
        if (provider === "local" && lastError && (pipeline?.fallbackToLocal ?? true)) console.error("Imọlẹ fallback définitif", lastError);
        else if (provider === "local" && lastError) throw lastError;
      }
      const usesExternal = provider === "imole";
      const dataPolicy = usesExternal
        ? "Statistiques agrégées anonymisées (k=3) et texte du test transmis; aucune identité, réponse libre ou cellule <3 n'est envoyée."
        : !canCallExternal
          ? "Échantillon trop petit (<5) : aucune donnée externe transmise, recommandation locale uniquement."
          : "Seuls le texte du test et des statistiques agrégées anonymisées sont utilisés en local; aucune donnée externe transmise.";
      await ctx.runMutation(internal.recommendationStore.save, { testId: args.testId, creatorId, responseCount: data.responseCount, provider, dataPolicy, recommendations, inputHash, configHash, aggregationVersion: data.aggregationVersion, promptVersion: pipeline?.promptVersion ?? "1", model });
      finalResult = { provider, dataPolicy, recommendations, generatedAt: new Date().toISOString() };
    } finally {
      await ctx.runMutation(internal.recommendationStore.releaseLock, { testId: args.testId, step: "recommendations" });
    }
    return finalResult;
  },
});
