/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as admin from "../admin.js";
import type * as aiProvider from "../aiProvider.js";
import type * as aiRecommendations from "../aiRecommendations.js";
import type * as aiSecrets from "../aiSecrets.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as collections from "../collections.js";
import type * as crons from "../crons.js";
import type * as encryption from "../encryption.js";
import type * as fashionTests from "../fashionTests.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as media from "../media.js";
import type * as models from "../models.js";
import type * as profiles from "../profiles.js";
import type * as publicTests from "../publicTests.js";
import type * as questionGeneration from "../questionGeneration.js";
import type * as recommendationStore from "../recommendationStore.js";
import type * as validation from "../validation.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiProvider: typeof aiProvider;
  aiRecommendations: typeof aiRecommendations;
  aiSecrets: typeof aiSecrets;
  analytics: typeof analytics;
  auth: typeof auth;
  collections: typeof collections;
  crons: typeof crons;
  encryption: typeof encryption;
  fashionTests: typeof fashionTests;
  http: typeof http;
  lib: typeof lib;
  media: typeof media;
  models: typeof models;
  profiles: typeof profiles;
  publicTests: typeof publicTests;
  questionGeneration: typeof questionGeneration;
  recommendationStore: typeof recommendationStore;
  validation: typeof validation;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
