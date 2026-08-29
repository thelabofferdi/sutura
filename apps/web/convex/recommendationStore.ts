import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const recommendation = v.object({
  priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  category: v.union(v.literal("production"), v.literal("pricing"), v.literal("audience"), v.literal("content"), v.literal("risk")),
  message: v.string(),
  rationale: v.optional(v.string()),
});

export const context = internalQuery({
  args: { testId: v.id("fashionTests"), creatorId: v.string() },
  handler: async (ctx, args) => {
    const test = await ctx.db.get(args.testId);
    if (!test || test.creatorId !== args.creatorId) throw new Error("Test introuvable.");
    const responses = await ctx.db.query("publicResponses").withIndex("by_test", q => q.eq("testId", args.testId)).collect();
    const questions = await ctx.db.query("questions").withIndex("by_test", q => q.eq("testId", args.testId)).collect();
    const cached = await ctx.db.query("recommendationCache").withIndex("by_test", q => q.eq("testId", args.testId)).unique();
    const numericTypes = new Set(["scale", "rating", "price"]);
    const textTypes = new Set(["short_text", "paragraph"]);
    const MIN_CELL = 3;
    const answerSummary = questions.map(question => {
      const values = responses
        .map(response => (response.answers as Record<string, unknown>)[String(question._id)])
        .filter(value => value !== undefined && value !== null && String(value).trim() !== "");
      const isText = textTypes.has(question.type);
      const isNumeric = numericTypes.has(question.type);
      // Distribution: seulement pour choix / catégoriel, jamais pour texte libre
      let distribution: Record<string, number> = {};
      if (!isText) {
        for (const value of values.flatMap(item => Array.isArray(item) ? item : [item])) {
          if (typeof value === "string" && value.length > 240) continue;
          const label = typeof value === "boolean" ? (value ? "Oui" : "Non") : String(value);
          distribution[label] = (distribution[label] ?? 0) + 1;
        }
        // Suppression k-anonymity: masquer catégories trop petites
        const suppressed: Record<string, number> = {};
        for (const [k, v] of Object.entries(distribution)) if (v >= MIN_CELL) suppressed[k] = v;
        // Si trop peu de réponses totales pour cette question, vider distribution
        distribution = values.length >= MIN_CELL ? suppressed : {};
      }
      // Moyenne: seulement pour types numériques validés, et si >= MIN_CELL réponses numériques
      let average: number | null = null;
      if (isNumeric) {
        const numeric = values.filter(v => typeof v === "number" && Number.isFinite(v)) as number[];
        if (numeric.length >= MIN_CELL) average = Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length * 10) / 10;
      }
      return {
        id: String(question._id),
        text: question.text,
        type: question.type,
        answeredCount: values.length,
        distribution,
        average,
        suppressed: values.length > 0 && values.length < MIN_CELL,
      };
    });
    const MIN_TOTAL_FOR_EXTERNAL = 5;
    const canCallExternal = responses.length >= MIN_TOTAL_FOR_EXTERNAL;
    return {
      test: { title: test.title, description: test.description },
      responseCount: responses.length,
      answerSummary,
      cached,
      canCallExternal,
      aggregationVersion: "v2-type-aware-k3",
    };
  },
});

export const save = internalMutation({
  args: {
    testId: v.id("fashionTests"), creatorId: v.string(), responseCount: v.number(),
    provider: v.union(v.literal("local"), v.literal("imole")), dataPolicy: v.string(),
    recommendations: v.array(recommendation),
    inputHash: v.optional(v.string()),
    configHash: v.optional(v.string()),
    aggregationVersion: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const old = await ctx.db.query("recommendationCache").withIndex("by_test", q => q.eq("testId", args.testId)).unique();
    const data = { ...args, generatedAt: Date.now() };
    if (old) { await ctx.db.replace(old._id, data); return old._id; }
    return ctx.db.insert("recommendationCache", data);
  },
});

export const acquireLock = internalMutation({
  args: { testId: v.id("fashionTests"), creatorId: v.string(), step: v.string(), ttlMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    // cleanup expired
    const expired = await ctx.db.query("aiGenerationLocks").withIndex("by_expires", q => q.lt("expiresAt", now)).collect();
    for (const l of expired) await ctx.db.delete(l._id);
    const existing = await ctx.db.query("aiGenerationLocks").withIndex("by_test_step", q => q.eq("testId", args.testId).eq("step", args.step)).unique();
    if (existing && existing.expiresAt > now) throw new Error("Génération déjà en cours. Réessayez dans quelques secondes.");
    const id = await ctx.db.insert("aiGenerationLocks", { testId: args.testId, creatorId: args.creatorId, step: args.step, startedAt: now, expiresAt: now + args.ttlMs });
    return id;
  },
});

export const releaseLock = internalMutation({
  args: { testId: v.id("fashionTests"), step: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("aiGenerationLocks").withIndex("by_test_step", q => q.eq("testId", args.testId).eq("step", args.step)).unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const checkRateLimit = internalMutation({
  args: { key: v.string(), max: v.number(), windowMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("aiRateLimits").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (!existing) {
      await ctx.db.insert("aiRateLimits", { key: args.key, windowStartedAt: now, count: 1, updatedAt: now });
      return;
    }
    if (now - existing.windowStartedAt > args.windowMs) {
      await ctx.db.patch(existing._id, { windowStartedAt: now, count: 1, updatedAt: now });
      return;
    }
    if (existing.count >= args.max) throw new Error("Trop de générations IA. Réessayez plus tard.");
    await ctx.db.patch(existing._id, { count: existing.count + 1, updatedAt: now });
  },
});
