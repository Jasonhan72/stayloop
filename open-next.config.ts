// OpenNext trial (2026-10-18). No ISR / unstable_cache in this app, so no
// incremental cache binding (R2 / KV) is configured.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
