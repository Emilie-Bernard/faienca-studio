import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
export const entryFields = {
 kind:v.union(v.literal('publication'),v.literal('projet'),v.literal('strategie')),
 title:v.string(),text:v.string(),status:v.string(),date:v.string(),channel:v.string(),format:v.string(),objective:v.string(),hook:v.string(),cta:v.string(),stories:v.string(),offer:v.string(),projectId:v.string(),stage:v.string(),priority:v.string(),category:v.string(),
 tasks:v.array(v.object({id:v.string(),title:v.string(),done:v.boolean()})), url:v.string(),caveat:v.string(),original:v.string(),
 reach:v.union(v.number(),v.null()),saves:v.union(v.number(),v.null()),shares:v.union(v.number(),v.null()),clicks:v.union(v.number(),v.null()),orders:v.union(v.number(),v.null()),
};
export default defineSchema({
 ...authTables,
 users: defineTable({name:v.optional(v.string()),email:v.optional(v.string()),image:v.optional(v.string()),emailVerificationTime:v.optional(v.number()),phone:v.optional(v.string()),phoneVerificationTime:v.optional(v.number()),isAnonymous:v.optional(v.boolean()),githubId:v.optional(v.string())}).index('email',['email']).index('phone',['phone']),
 entries:defineTable({...entryFields,revision:v.number(),seedKey:v.optional(v.string())}),
 seeds:defineTable({version:v.string()}).index('version',['version']),
});
