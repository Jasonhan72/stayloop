// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §3 P2 (upload side) — Notes on signed upload URLs
// -----------------------------------------------------------------------------
// STATUS: STUB / DESIGN NOTE ONLY
//
//   I searched the main branch for `createSignedUploadUrl` and for any
//   server route that signs upload URLs. There is NONE — uploads go
//   directly from the browser to Supabase Storage via the JWT-scoped
//   client at these call sites:
//
//     - app/screen/page.tsx           (landlord-driven screening uploads)
//     - app/apply/[slug]/page.tsx     (tenant application form uploads)
//     - app/chat/page.tsx             (in-chat file drops)
//     - app/listings/new/page.tsx     (MLS PDF for listing import)
//
//   So there is no server-side route to patch in this batch. The validation
//   the audit asks for (content-type whitelist, size cap, UUID-named path)
//   has to live in the client-side upload helpers AND in the Supabase
//   bucket policy. The notes below capture what SHOULD be done — file
//   created so the next dev pass has somewhere to start.
//
// REQUIRED HARDENING (where each control lives):
//
//   1) CONTENT-TYPE WHITELIST
//        Where:  client (upload helper) AND Supabase bucket policy.
//        Allow:  application/pdf, image/jpeg, image/png, image/webp,
//                image/heic, image/heif.
//        Client: reject before .upload() so the user gets a nice error
//                instead of an opaque 400.
//        DB:     CREATE POLICY ... USING ((storage.foldername(name))[1] =
//                auth.uid()::text AND lower(metadata->>'mimetype') = ANY (
//                  ARRAY['application/pdf','image/jpeg','image/png',
//                        'image/webp','image/heic','image/heif']
//                ));
//
//   2) PER-FILE SIZE CAP — 8 MB
//        Where:  client check (file.size > 8 * 1024 * 1024 → reject) AND
//                Supabase bucket policy (file_size_limit on tenant-files
//                bucket; can be set via `update storage.buckets set
//                file_size_limit = 8388608 where id = 'tenant-files'`).
//        Why both: the client check gives a fast UX; the bucket policy
//        is the actual security gate.
//
//   3) PATH MUST BE A RANDOM UUID (not user-controlled)
//        Where:  client upload helper.
//        Current screen/page.tsx pattern:
//            `${landlordId}/${stamp}_${safeName}`
//        Recommended pattern (rewriting all four upload sites):
//            `${landlordId}/${crypto.randomUUID()}.${ext}`
//        Reasoning: user-controlled filenames have been a source of
//        Storage RLS escape attempts on other projects (path traversal,
//        unicode lookalikes). A UUID + sanitized extension removes that
//        attack class entirely. Display the ORIGINAL filename in the UI
//        via files[].name (already on the row) — the storage key doesn't
//        need to be human-readable.
//
// IF / WHEN WE BUILD A SERVER ROUTE
//
//   The right home is `app/api/upload-url/route.ts` (edge runtime).
//   Contract:
//
//     POST /api/upload-url
//     body: { mime: string, size: number, kind: 'application'|'screening'|'listing' }
//     auth: Bearer <supabase jwt>
//     resp: 200 { path: string, signedUrl: string, token: string }
//           400 { error: 'invalid_mime'|'too_large'|'invalid_kind' }
//           401 { error: 'unauthorized' }
//
//   Pseudo-implementation (NOT exported here so this file stays a stub):
//
//     export async function POST(req: NextRequest) {
//       const { mime, size, kind } = await req.json()
//       if (!ALLOWED_MIMES.has(mime)) return json({ error: 'invalid_mime' }, 400)
//       if (typeof size !== 'number' || size <= 0 || size > 8 * 1024 * 1024) {
//         return json({ error: 'too_large' }, 400)
//       }
//       if (!['application','screening','listing'].includes(kind)) {
//         return json({ error: 'invalid_kind' }, 400)
//       }
//       const user = await requireUser(req)
//       const ext = MIME_EXT[mime] ?? 'bin'
//       const path = `${kind}/${user.id}/${crypto.randomUUID()}.${ext}`
//       const { data, error } = await admin.storage
//         .from('tenant-files')
//         .createSignedUploadUrl(path)
//       if (error) return json({ error: error.message }, 500)
//       return json({ path, signedUrl: data.signedUrl, token: data.token })
//     }
//
//   Then change the four client call sites to:
//     1. fetch /api/upload-url with { mime, size, kind }
//     2. PUT/POST the file to data.signedUrl
//     3. Persist data.path on the application/screening/listing row
//
// -----------------------------------------------------------------------------

export {} // keeps tsc happy — this stub deliberately exports no runtime code.
