import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptValue, encryptValue } from "./encryption";

export const encryptAndCreate = internalAction({
  args: { name: v.string(), rawKey: v.string(), provider: v.union(v.literal("imole"), v.literal("openai"), v.literal("generic")), createdBy: v.string(), maskedKey: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const encryptedKey = await encryptValue(args.rawKey);
    return ctx.runMutation(internal.aiSecrets.insertKey, { ...args, encryptedKey });
  },
});

export const encryptAndUpdate = internalAction({
  args: { id: v.id("aiApiKeys"), rawKey: v.string(), maskedKey: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const encryptedKey = await encryptValue(args.rawKey);
    return ctx.runMutation(internal.aiSecrets.updateEncryptedKey, { id: args.id, encryptedKey, maskedKey: args.maskedKey });
  },
});

export const insertKey = internalMutation({
  args: { name: v.string(), rawKey: v.string(), provider: v.union(v.literal("imole"), v.literal("openai"), v.literal("generic")), createdBy: v.string(), maskedKey: v.string(), encryptedKey: v.string() },
  handler: async (ctx, args) => {
    const key = { name: args.name, provider: args.provider, maskedKey: args.maskedKey, encryptedKey: args.encryptedKey, createdBy: args.createdBy };
    const now = Date.now();
    return ctx.db.insert("aiApiKeys", { ...key, isActive: true, createdAt: now, updatedAt: now });
  },
});

export const updateEncryptedKey = internalMutation({
  args: { id: v.id("aiApiKeys"), encryptedKey: v.string(), maskedKey: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { encryptedKey: args.encryptedKey, maskedKey: args.maskedKey, updatedAt: Date.now() });
    return args.id;
  },
});

export const getDecrypted = internalAction({
  args: { id: v.id("aiApiKeys") },
  handler: async (ctx, args): Promise<{ provider: "imole" | "openai" | "generic"; rawKey: string } | null> => {
    const key: { provider: "imole" | "openai" | "generic"; encryptedKey: string } | null = await ctx.runQuery(internal.aiSecrets.getEncrypted, { id: args.id });
    if (!key) return null;
    return { provider: key.provider, rawKey: await decryptValue(key.encryptedKey) };
  },
});

export const getEncrypted = internalQuery({
  args: { id: v.id("aiApiKeys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id);
    if (!key || !key.isActive) return null;
    return { provider: key.provider, encryptedKey: key.encryptedKey };
  },
});
