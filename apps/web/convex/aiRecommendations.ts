"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

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
    const data = await ctx.runQuery(internal.recommendationStore.context, { testId: args.testId, creatorId });
    if (!args.force && data.cached && data.cached.responseCount === data.responseCount) {
      return { ...data.cached, generatedAt: new Date(data.cached.generatedAt).toISOString() };
    }

    let provider: "local" | "imole" = "local";
    let recommendations = localRecommendations(data.responseCount);
    const key = process.env.IMOLE_API_KEY;
    if (key) {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(`${process.env.IMOLE_BASE_URL ?? "https://api.imole.app/v1"}/responses`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: process.env.IMOLE_MODEL ?? "gpt-5.6-luna",
              input: [
                { role: "system", content: "Tu aides un créateur de mode. Réponds uniquement en JSON conforme au schéma, avec des conseils prudents fondés sur les données." },
                { role: "user", content: JSON.stringify({ test: data.test, responseCount: data.responseCount, answerSummary: data.answerSummary }) },
              ],
              reasoning: { effort: "medium" },
              text: { format: { type: "json_schema", name: "sutura_recommendations", strict: true, schema: {
                type: "object", additionalProperties: false, required: ["recommendations"], properties: {
                  recommendations: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", additionalProperties: false, required: ["priority", "category", "message"], properties: {
                    priority: { enum: ["high", "medium", "low"] }, category: { enum: ["production", "pricing", "audience", "content", "risk"] }, message: { type: "string" }, rationale: { type: "string" },
                  } } },
                },
              } } },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) throw new Error(`Imọlẹ ${response.status}`);
          const payload = await response.json();
          const text = payload.output_text ?? payload.output?.flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? []).find((item: { type: string }) => item.type === "output_text")?.text;
          const parsed = parseRecommendations(JSON.parse(text));
          if (parsed) { recommendations = parsed; provider = "imole"; break; }
          else throw new Error("Imọlẹ parsing échoué");
        } catch (error) {
          lastError = error;
          console.error(`Imọlẹ tentative ${attempt + 1} échouée`, error);
          if (attempt < 1) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (provider === "local" && lastError) console.error("Imọlẹ fallback définitif", lastError);
    }
    const dataPolicy = "Seuls le texte du test et des statistiques agrégées sont transmis au moteur IA; aucune identité ni réponse libre de répondant n'est envoyée.";
    await ctx.runMutation(internal.recommendationStore.save, { testId: args.testId, creatorId, responseCount: data.responseCount, provider, dataPolicy, recommendations });
    return { provider, dataPolicy, recommendations, generatedAt: new Date().toISOString() };
  },
});
