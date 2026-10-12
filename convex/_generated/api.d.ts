/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as kits from "../kits.js";
import type * as klaviyoSync from "../klaviyoSync.js";
import type * as library from "../library.js";
import type * as newsletter from "../newsletter.js";
import type * as products from "../products.js";
import type * as stage from "../stage.js";
import type * as studio from "../studio.js";
import type * as testEmail from "../testEmail.js";
import type * as todos from "../todos.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  kits: typeof kits;
  klaviyoSync: typeof klaviyoSync;
  library: typeof library;
  newsletter: typeof newsletter;
  products: typeof products;
  stage: typeof stage;
  studio: typeof studio;
  testEmail: typeof testEmail;
  todos: typeof todos;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
