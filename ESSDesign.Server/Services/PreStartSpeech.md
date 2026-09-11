# Pre-start voice: Deepgram

Railway variable: `Deepgram__ApiKey` (server secret). Optional `Deepgram__ModelId` defaults to `aura-2-hyperion-en`, the Australian male Hyperion voice. The request may select `provider: "deepgram"` (default) or `provider: "elevenlabs"` for voice comparison. ElevenLabs uses `ElevenLabs__ApiKey`, `ElevenLabs__VoiceId`, and optional `ElevenLabs__ModelId` (Flash v2.5 by default). The selected provider stays fixed per conversation. Missing credentials or synthesis failures use device voice; the other paid provider is never called as a fallback.

Aura-2 REST MP3 synthesis uses normal speed (1.0). A Nova-3 prerecorded transcription of the **generated question audio** supplies word start times for captions; microphone recordings continue to use the app's existing recognition. This timing pass has an additional transcription cost. Timings are accepted only when all words match the original question ignoring punctuation/case, with ordered nonnegative timestamps. If unavailable, audio still plays and the app's approximate caption fallback applies.

Audio and timings use a 100-entry, 24-hour memory cache. Standard questions and reminders also live permanently in the **private Supabase bucket `prestart-voice-library`**, as one JSON object containing audio and timing per voice/text/settings hash. Redeploys and API key rotations retain these objects. Provider, voice, model, format and synthesis settings determine identity. Bump `PreStartVoice__LibraryVersion` when deliberately invalidating an audio library. Existing Supabase server credentials are reused; no key is sent to the app.

Only the embedded `PreStartVoiceCatalog.json` allowlist is permanent. Personalised clarifications are temporary. Storage failures are logged and fall back to generation so a storage outage does not break the interview. Generated audio is saved even if caption timing is unavailable (the app already handles approximate captions). No new paid generation occurs just to populate the catalog: the app selects a wording variant, then that clip is generated on demand if missing.

The startup background history importer scans up to 2,000 ElevenLabs TTS history items for the configured voice. It only downloads exact allowlisted phrases with matching model, normal speed and voice settings. It never calls ElevenLabs synthesis. It uses the configured Deepgram key for a one-time timing pass on imported audio; this is transcription usage, not new ElevenLabs synthesis. An existing stored clip is skipped. The API key needs History read permission. Import status and counts appear in Railway logs; no user transcripts or key values are logged.

The bucket was provisioned private with a 5 MB object limit and `application/json` MIME type. No client Storage policies grant access to this bucket; authenticated backend voice requests remain the delivery route. Provision an equivalent bucket when deploying to another Supabase project.

Catalog source: the iOS app's standard questions, five wording variants per question, five final reminders and SWMS warning combinations. From the ESSApp repository run `node scripts/export-prestart-voice-catalog.cjs /path/to/ESSDesign.Server/Services/PreStartVoiceCatalog.json` whenever changing standard wording. This prevents arbitrary submitted speech from becoming permanent library content.

References:
- https://developers.deepgram.com/reference/text-to-speech/speak-request
- https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
- https://developers.deepgram.com/docs/tts-models
