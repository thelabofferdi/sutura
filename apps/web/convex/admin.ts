import { internalQuery } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { isAdminEmail, requireAdmin } from "./lib";
import { resolveBaseUrl, validatePipelineProvider } from "./aiProvider";
import { encryptValue } from "./encryption";

function maskKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) return "****";
  return `…${trimmed.slice(-4)}`;
}

async function audit(ctx: { db: { insert: (table: string, doc: Record<string, unknown>) => Promise<string> } }, actorId: string, actorEmail: string | undefined, action: string, targetId?: string, meta?: Record<string, unknown>) {
  await ctx.db.insert("adminAuditLogs", {
    actorId,
    actorEmail,
    action,
    targetId,
    step: (meta?.step as string | undefined),
    provider: (meta?.provider as string | undefined),
    status: "success",
    createdAt: Date.now(),
  });
}

export const isAdmin = query({
  args: {},
  handler: async (ctx) => isAdminEmail(ctx),
});

export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const keys = await ctx.db.query("aiApiKeys").collect();
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      maskedKey: k.maskedKey,
      provider: k.provider,
      isActive: k.isActive,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      createdBy: k.createdBy,
    }));
  },
});

export const createKey = mutation({
  args: { name: v.string(), rawKey: v.string(), provider: v.union(v.literal("imole"), v.literal("openai"), v.literal("generic")) },
  handler: async (ctx, { name, rawKey, provider }) => {
    const adminId = await requireAdmin(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const trimmedName = name.trim();
    const trimmedKey = rawKey.trim();
    if (!trimmedName || trimmedName.length > 80) throw new Error("Nom de clé invalide.");
    if (!trimmedKey || trimmedKey.length < 8 || trimmedKey.length > 500) throw new Error("Clé invalide.");
    const masked = maskKey(trimmedKey);
    const encryptedKey = await encryptValue(trimmedKey);
    const now = Date.now();
    const id = await ctx.db.insert("aiApiKeys", { name: trimmedName, maskedKey: masked, encryptedKey, provider, isActive: true, createdBy: adminId, createdAt: now, updatedAt: now });
    await audit(ctx as unknown as { db: { insert: (t: string, d: Record<string, unknown>) => Promise<string> } }, adminId, identity?.email ?? undefined, "createKey", id, { provider });
    return id;
  },
});

export const updateKey = mutation({
  args: { id: v.id("aiApiKeys"), rawKey: v.optional(v.string()), isActive: v.optional(v.boolean()), name: v.optional(v.string()) },
  handler: async (ctx, { id, rawKey, isActive, name }) => {
    const adminId = await requireAdmin(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const key = await ctx.db.get(id);
    if (!key) throw new Error("Clé introuvable.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) {
      const n = name.trim();
      if (!n || n.length > 80) throw new Error("Nom invalide.");
      if (!n) throw new Error("Nom invalide.");
      patch.name = n;
    }
    if (rawKey !== undefined) {
      const k = rawKey.trim();
      if (!k || k.length < 8 || k.length > 500) throw new Error("Clé invalide.");
      patch.maskedKey = maskKey(k);
      patch.encryptedKey = await encryptValue(k);
    }
    if (isActive !== undefined) patch.isActive = isActive;
    await ctx.db.patch(id, patch);
    await audit(ctx as unknown as { db: { insert: (t: string, d: Record<string, unknown>) => Promise<string> } }, adminId, identity?.email ?? undefined, "updateKey", id);
    return id;
  },
});

export const deleteKey = mutation({
  args: { id: v.id("aiApiKeys") },
  handler: async (ctx, { id }) => {
    const adminId = await requireAdmin(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const key = await ctx.db.get(id);
    if (!key) throw new Error("Clé introuvable.");
    const used = await ctx.db.query("aiPipelineConfigs").collect();
    if (used.some((c) => c.apiKeyId === id)) throw new Error("Clé encore utilisée par un pipeline. Désassocie-la d'abord.");
    await ctx.db.delete(id);
    await audit(ctx as unknown as { db: { insert: (t: string, d: Record<string, unknown>) => Promise<string> } }, adminId, identity?.email ?? undefined, "deleteKey", id);
  },
});

export const listPipeline = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("aiPipelineConfigs").collect();
  },
});

export const upsertPipeline = mutation({
  args: {
    step: v.union(v.literal("generateQuestions"), v.literal("recommendations"), v.literal("copilot"), v.literal("detectInconsistencies"), v.literal("summarizeResponses"), v.literal("assistantLaunch")),
    enabled: v.boolean(),
    provider: v.union(v.literal("local"), v.literal("imole"), v.literal("auto")),
    model: v.string(),
    baseUrl: v.optional(v.string()),
    apiKeyId: v.optional(v.union(v.id("aiApiKeys"), v.null())),
    promptVersion: v.string(),
    fallbackToLocal: v.boolean(),
  },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    if (!args.model.trim() || args.model.length > 120) throw new Error("Modèle invalide.");
    if (!args.promptVersion.trim() || args.promptVersion.length > 40) throw new Error("Version de prompt invalide.");
    if (args.baseUrl && args.baseUrl.length > 200) throw new Error("Base URL trop longue.");
    // Validation baseUrl via registre
    const resolved = args.provider === "local" ? "" : resolveBaseUrl(args.provider, args.baseUrl);
    if (args.provider === "local" && args.baseUrl) throw new Error("Provider local ne doit pas avoir de base URL.");
    if (args.provider === "local" && args.apiKeyId) throw new Error("Provider local ne doit pas avoir de clé.");
    let keyProvider: string | undefined;
    if (args.apiKeyId) {
      const key = await ctx.db.get(args.apiKeyId);
      if (!key) throw new Error("Clé introuvable.");
      if (!key.isActive) throw new Error("Clé inactive.");
      keyProvider = key.provider;
    } else if (args.provider === "imole") {
      // imole sans clé explicite: toléré si env, mais on exige au moins une clé en DB pour traçabilité en prod
    }
    validatePipelineProvider(args.provider, keyProvider);
    // Stocker baseUrl résolue
    const finalBaseUrl = resolved || undefined;
    const existing = await ctx.db.query("aiPipelineConfigs").withIndex("by_step", (q) => q.eq("step", args.step)).unique();
    const payload = {
      ...args,
      model: args.model.trim(),
      promptVersion: args.promptVersion.trim(),
      baseUrl: finalBaseUrl,
      apiKeyId: args.apiKeyId ?? undefined,
      updatedBy: adminId,
      updatedAt: Date.now(),
    };
    let id: string;
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      id = existing._id;
    } else {
      const now = Date.now();
      id = await ctx.db.insert("aiPipelineConfigs", { ...payload, createdAt: now });
    }
    const identity = await ctx.auth.getUserIdentity();
    await audit(ctx as unknown as { db: { insert: (t: string, d: Record<string, unknown>) => Promise<string> } }, adminId, identity?.email ?? undefined, "upsertPipeline", id, { step: args.step, provider: args.provider });
    return id;
  },
});

export const getPipelineForStep = query({
  args: { step: v.union(v.literal("generateQuestions"), v.literal("recommendations"), v.literal("copilot"), v.literal("detectInconsistencies"), v.literal("summarizeResponses"), v.literal("assistantLaunch")) },
  handler: async (ctx, { step }) => {
    await requireAdmin(ctx);
    return ctx.db.query("aiPipelineConfigs").withIndex("by_step", (q) => q.eq("step", step)).unique();
  },
});

export const getPipelineWithKeyInternal = internalQuery({
  args: { step: v.union(v.literal("generateQuestions"), v.literal("recommendations"), v.literal("copilot"), v.literal("detectInconsistencies"), v.literal("summarizeResponses"), v.literal("assistantLaunch")) },
  handler: async (ctx, { step }) => {
    const cfg = await ctx.db.query("aiPipelineConfigs").withIndex("by_step", (q) => q.eq("step", step)).unique();
    if (!cfg) return null;
    return { ...cfg };
  },
});
