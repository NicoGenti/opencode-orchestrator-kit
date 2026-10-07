/**
 * scripts/record-id.ts — kit-side record-id helper (v0.6.7).
 *
 * Generates the task/research id in the v0.6.6 canonical format
 * `res-YYYYMMDD-HHMMSS-<32hex>`: a UTC task-start timestamp plus a 128-bit
 * suffix drawn from the platform CSPRNG (crypto.getRandomValues, 16 random
 * bytes). Agents run this helper instead of inventing the suffix manually.
 * Print-only: exactly one line on stdout, no other side effects.
 */

const bytes = crypto.getRandomValues(new Uint8Array(16));
const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, "0")).join("");
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const now = new Date();
const timestamp =
  `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}` +
  `-${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(now.getUTCSeconds(), 2)}`;
console.log(`res-${timestamp}-${hex}`);
