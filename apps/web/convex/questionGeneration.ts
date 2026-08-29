"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveBaseUrl } from "./aiProvider";
import { validateQuestionDefinition } from "./validation";

export const preview = action({
  args: { testId: v.id("fashionTests") },
  handler: async (ctx, { testId }): Promise<{ questions: Array<{ text: string; type: string; required: boolean; options: string[]; min?: number; max?: number; helpText?: string; modelId?: string }>; provider: "local" | "imole" }> => {
    const user = (await ctx.auth.getUserIdentity())?.subject;
    if (!user) throw new Error("Vous devez être connecté.");
    const test = await ctx.runQuery(internal.fashionTests.getTestInternal, { testId });
    if (!test || test.creatorId !== user) throw new Error("Test introuvable.");
    if (test.status !== "draft") throw new Error("Seul un brouillon peut générer des questions.");
    const models = await ctx.runQuery(internal.fashionTests.listModelsInternal, { collectionId: test.collectionId });
    if (!models.length) throw new Error("Ajoutez un modèle d'abord.");
    const pipeline = await ctx.runQuery(internal.admin.getPipelineWithKeyInternal, { step: "generateQuestions" }) as { enabled: boolean; provider: string; model: string; baseUrl?: string; apiKeyId?: string; promptVersion: string; fallbackToLocal: boolean } | null;
    const useImole = pipeline?.enabled && (pipeline.provider === "imole" || pipeline.provider === "auto");
    if (useImole && pipeline?.apiKeyId) {
      try {
        const secret = await ctx.runAction(internal.aiSecrets.getDecrypted, { id: pipeline.apiKeyId as unknown as import("./_generated/dataModel").Id<"aiApiKeys"> });
        const apiKey = secret?.rawKey;
        const baseUrl = resolveBaseUrl("imole", pipeline.baseUrl ?? "https://api.imole.app/v1");
        const model = pipeline.model ?? "gpt-5.6-luna";
        if (apiKey && baseUrl) {
          const collection = await ctx.runQuery(internal.collections.getInternal, { id: test.collectionId });
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const res = await fetch(`${baseUrl}/responses`, {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                input: [
                  { role: "system", content: `Tu es copilote questionnaire mode. Génère 3 questions pertinentes en JSON {questions:[{text,type,required,options,min,max,helpText}]}. Types autorisés: single_choice, multiple_choice, rating, price, short_text. Prompt v${pipeline.promptVersion}.` },
                  { role: "user", content: JSON.stringify({ collection: { title: collection?.title, description: collection?.description, audience: collection?.targetAudience }, models: models.map((m: { name: string; colors: string[]; desiredPrice?: number }) => ({ name: m.name, colors: m.colors, price: m.desiredPrice })) }) },
                ],
              }),
              signal: controller.signal,
              redirect: "error",
            } as RequestInit);
            if (res.ok) {
              const payload = await res.json();
              const text: string | undefined = payload.output_text ?? payload.output?.[0]?.content?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                const qs = (parsed.questions ?? []).slice(0, 3);
                const validated: Array<{ text: string; type: string; required: boolean; options: string[]; min?: number; max?: number; helpText?: string; modelId?: string }> = [];
                for (const q of qs) {
                  try {
                    const vq = validateQuestionDefinition(q);
                    validated.push({ text: vq.text, type: q.type, required: !!q.required, options: vq.options, min: vq.min, max: vq.max, helpText: q.helpText, modelId: q.modelId });
                  } catch {}
                }
                if (validated.length >= 2) return { questions: validated, provider: "imole" as const };
              }
            }
          } finally {
            clearTimeout(timeout);
          }
        }
      } catch (e) {
        console.error("preview questions Imole failed", e);
        if (pipeline && !pipeline.fallbackToLocal) throw e;
      }
    }
    // local fallback template
    const base: Array<{ text: string; type: string; required: boolean; options: string[]; min?: number; max?: number; helpText?: string; modelId?: string }> = [
      { text: `Parmi ces ${models.length} modèles, lequel attire le plus ton regard ?`, type: "single_choice", required: true, options: models.map((m: { name: string }) => m.name), helpText: "Une seule réponse." },
      { text: "Comment notes-tu l'attrait global de cette collection ?", type: "rating", required: true, options: [], min: 1, max: 5, helpText: "1 = peu, 5 = beaucoup" },
      { text: "À quel prix cette pièce te semble juste ?", type: "price", required: false, options: [], min: 5000, max: 150000, helpText: "En FCFA", modelId: String(models[0]._id) },
    ];
    return { questions: base, provider: "local" as const };
  },
});
