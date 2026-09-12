# Pre-Start shared speech and usage

The app keeps ElevenLabs TTS, Apple speech recognition and OpenAI interpretation. The alternative Deepgram voice remains supported. Existing voice/model/settings and audio identities are preserved, so the existing private `prestart-voice-library` bucket remains useful. There is no regeneration of the whole catalog at startup.

## Reuse and growth

Standard questions and `PreStartDialogue.json` supply reusable acknowledgements, clarification questions and form explanations. The conversation model selects an existing phrase first. A novel response receives a separate structured model review that can choose an equivalent existing phrase, approve generic content, keep benign personal text temporary, or reject unsuitable text. Only independently approved generic phrases are registered in `prestart_voice_phrases`. Known texts bypass another review. Eligibility is checked by the backend, not trusted from a client flag.

Names, identifiers and site-specific facts do not belong in shared phrase metadata. Numeric/URL/email content and claims that the assistant has saved or changed records are additionally barred from dynamic approval. Existing named foreman/count correction patterns are no longer eligible for new shared storage. Generic update acknowledgements are supplied by the app only after it applies a validated batch.

The app plays acknowledgements and questions as separate complete clips; changing a preceding acknowledgement does not regenerate the question. Later clips and future questions are prefetched with `cacheOnly: true`, which does not reserve usage or call a synthesis provider. Paid generation is requested when a clip is actually needed. On-device caching remains bounded to 32 clips; server memory to 100 clips/24 hours. Audio with timing is stored once in Supabase JSON objects. Provider, voice, model, output and settings remain part of its identity.

## Generation allowance

`PreStartVoice__DailyCharacterLimit` defaults to **10,000 input characters per provider per UTC day** across all users/server instances. Set `0` for cached-audio-only operation. This is a conservative application spending allowance, not a provider credit or dollar estimate. Existing provider subscription/rate rules still apply. API key changes do not reset accounting or durable clip identities.

On a cache miss, the database atomically reserves characters before the provider call and prevents another call for the same audio identity that UTC day. Failed, timed-out and uncertain calls retain their reservation; they may have been billed. Once an identity has been attempted, another instance or restart cannot pay for it again that day. If the allowance is exhausted, registry/storage lookup is unavailable or another attempt owns the clip, cached playback remains available and the app can use device speech for the miss. No second paid provider is used as fallback.

Paid reusable audio is queued for storage independently of client cancellation, with up to three write attempts. Caption timing may be absent without preventing storage. The queue is bounded and in-memory; an abrupt server shutdown can lose a pending upload. The database reservation still prevents repeated synthesis that day. Later retries on another day can generate again if the file was never stored. This deliberate conservative behaviour prioritises credit protection.

`GET /api/pre-start/voice-usage` is administrator-only and returns the configured allowance and daily reserved characters, generation attempts, cache hits and budget blocks. Cache hits include backend prefetch/cache lookups; this is not an audible-playback or form-completion count. Logs record provider/cache outcomes and elapsed model milliseconds, not transcripts or API keys.

## Deployment

Apply `supabase/migrations/20260912002222_prestart_conversation_voice_library.sql` before deploying. The migration has already been applied to ESS App. All new tables have RLS; table and RPC privileges are service-role-only. Existing Supabase server credentials and the private audio bucket are reused. No app keys or new provider credentials are needed.

ElevenLabs configuration remains `ElevenLabs__ApiKey`, `ElevenLabs__VoiceId`, optional `ElevenLabs__ModelId` (default `eleven_flash_v2_5`). Deepgram uses `Deepgram__ApiKey` and optional `Deepgram__ModelId`. Keep voice settings stable to preserve cache reuse. Bumping `PreStartVoice__LibraryVersion` intentionally invalidates audio identities and can increase generation usage.

The existing history importer downloads allowlisted ElevenLabs history without synthesising new audio. Its optional Deepgram caption alignment still has transcription usage. New clips use the existing buffered timestamped audio response; independent clip playback avoids generating an entire combined response, but it is not sample-by-sample streaming.

## Verification

Focused backend tests cover schema enforcement, evidence/field validation, partial answers, risk-row edits, cache-only prefetch, budget failures, shared reuse, personal-text exclusion and semantic phrase reuse. Database checks exercised reservations and permissions inside a rolled-back transaction. No paid TTS calls were made during implementation testing.
