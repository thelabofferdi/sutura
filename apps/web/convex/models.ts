import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertOwnedCollection, requireUserId } from "./lib";
import { validateStoredFile } from "./media";

export const generateUploadUrl = mutation({ args: {}, handler: async (ctx) => { await requireUserId(ctx); return ctx.storage.generateUploadUrl(); } });

function validateModelFields(args: { name?: string; photoIds?: string[]; colors?: string[]; desiredPrice?: number }) {
  if (args.name !== undefined && !args.name.trim()) throw new Error("Le nom du modèle est requis.");
  if (args.photoIds !== undefined && !args.photoIds.length) throw new Error("Ajoutez au moins une photo.");
  if (args.colors !== undefined) {
    const cleaned = args.colors.map((c) => c.trim()).filter(Boolean);
    if (cleaned.length !== args.colors.length) throw new Error("Couleurs invalides.");
  }
  if (args.desiredPrice !== undefined && (typeof args.desiredPrice !== "number" || !Number.isFinite(args.desiredPrice) || args.desiredPrice < 0 || args.desiredPrice > 10_000_000)) throw new Error("Prix souhaité invalide.");
}

export const create = mutation({
  args: { collectionId: v.id("collections"), name: v.string(), description: v.optional(v.string()), photoIds: v.array(v.id("_storage")), sketchId: v.optional(v.id("_storage")), videoId: v.optional(v.id("_storage")), colors: v.array(v.string()), desiredPrice: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedCollection(ctx, args.collectionId, userId);
    if (!args.name.trim()) throw new Error("Le nom du modèle est requis.");
    if (!args.photoIds.length) throw new Error("Ajoutez au moins une photo.");
    validateModelFields(args);
    const uniqueFiles = new Set([...args.photoIds, ...(args.sketchId ? [args.sketchId] : []), ...(args.videoId ? [args.videoId] : [])]);
    for (const file of uniqueFiles) {
      const kind = args.videoId === file ? "video" : args.sketchId === file ? "sketch" : "photo";
      await validateStoredFile(ctx, file, kind);
    }
    const rows = await ctx.db.query("models").withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId)).collect();
    const now = Date.now();
    return ctx.db.insert("models", { ...args, name: args.name.trim(), description: args.description?.trim() || undefined, colors: args.colors.map((c) => c.trim()).filter(Boolean), creatorId: userId, sortOrder: rows.length, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { id: v.id("models"), name: v.optional(v.string()), description: v.optional(v.string()), photoIds: v.optional(v.array(v.id("_storage"))), sketchId: v.optional(v.union(v.id("_storage"), v.null())), videoId: v.optional(v.union(v.id("_storage"), v.null())), colors: v.optional(v.array(v.string())), desiredPrice: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const model = await ctx.db.get(id);
    if (!model || model.creatorId !== userId) throw new Error("Modèle introuvable.");
    validateModelFields({ name: patch.name, photoIds: patch.photoIds as unknown as string[] | undefined, colors: patch.colors, desiredPrice: patch.desiredPrice as unknown as number | undefined });
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.name !== undefined) updates.name = patch.name.trim();
    if (patch.description !== undefined) updates.description = patch.description.trim() || undefined;
    if (patch.colors !== undefined) updates.colors = patch.colors.map((c) => c.trim()).filter(Boolean);
    if (patch.desiredPrice !== undefined) updates.desiredPrice = patch.desiredPrice === null ? undefined : patch.desiredPrice;
    // Médias : valider les nouveaux fichiers avant patch
    if (patch.photoIds !== undefined) {
      if (!patch.photoIds.length) throw new Error("Ajoutez au moins une photo.");
      for (const file of patch.photoIds) await validateStoredFile(ctx, file, "photo");
      updates.photoIds = patch.photoIds;
    }
    if (patch.sketchId !== undefined) {
      if (patch.sketchId !== null) await validateStoredFile(ctx, patch.sketchId, "sketch");
      updates.sketchId = patch.sketchId ?? undefined;
    }
    if (patch.videoId !== undefined) {
      if (patch.videoId !== null) await validateStoredFile(ctx, patch.videoId, "video");
      updates.videoId = patch.videoId ?? undefined;
    }
    await ctx.db.patch(id, updates);
    // Nettoyage des anciens fichiers non réutilisés (évite suppression partagée)
    const oldFiles = [...model.photoIds, ...(model.sketchId ? [model.sketchId] : []), ...(model.videoId ? [model.videoId] : [])];
    const newFiles = new Set([...((patch.photoIds ?? model.photoIds) as string[]), ...((patch.sketchId !== undefined ? (patch.sketchId ? [patch.sketchId] : []) : model.sketchId ? [model.sketchId] : []) as string[]), ...((patch.videoId !== undefined ? (patch.videoId ? [patch.videoId] : []) : model.videoId ? [model.videoId] : []) as string[])]);
    for (const file of oldFiles) {
      if (!newFiles.has(file as string)) {
        const stillUsed = await ctx.db.query("models").withIndex("by_collection", (q) => q.eq("collectionId", model.collectionId)).collect();
        const isShared = stillUsed.some((m) => m._id !== id && ([...m.photoIds, m.sketchId, m.videoId].filter(Boolean) as unknown as string[]).includes(file as string));
        if (!isShared) await ctx.storage.delete(file);
      }
    }
    return id;
  },
});

export const reorder = mutation({
  args: { collectionId: v.id("collections"), modelIds: v.array(v.id("models")) },
  handler: async (ctx, { collectionId, modelIds }) => {
    const userId = await requireUserId(ctx);
    await assertOwnedCollection(ctx, collectionId, userId);
    const rows = await ctx.db.query("models").withIndex("by_collection", (q) => q.eq("collectionId", collectionId)).collect();
    if (modelIds.length !== rows.length || new Set(modelIds).size !== rows.length || rows.some((row) => !modelIds.includes(row._id))) throw new Error("L'ordre des modèles est invalide.");
    await Promise.all(modelIds.map((modelId, index) => ctx.db.patch(modelId, { sortOrder: index, updatedAt: Date.now() })));
    return modelIds;
  },
});

export const remove = mutation({
  args: { id: v.id("models") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const model = await ctx.db.get(id);
    if (!model || model.creatorId !== userId) throw new Error("Modèle introuvable.");
    // Vérifie références questions avant suppression
    const linkedQuestions = await ctx.db.query("questions").collect();
    if (linkedQuestions.some((q) => q.modelId === id)) throw new Error("Impossible de supprimer : ce modèle est lié à une question.");
    const files = [...model.photoIds, ...(model.sketchId ? [model.sketchId] : []), ...(model.videoId ? [model.videoId] : [])];
    // Ne supprime que les fichiers non partagés
    for (const file of files) {
      const siblings = await ctx.db.query("models").withIndex("by_collection", (q) => q.eq("collectionId", model.collectionId)).collect();
      const shared = siblings.some((m) => m._id !== id && ([...m.photoIds, m.sketchId, m.videoId].filter(Boolean) as unknown as string[]).includes(file as string));
      if (!shared) await ctx.storage.delete(file);
    }
    await ctx.db.delete(id);
  },
});
