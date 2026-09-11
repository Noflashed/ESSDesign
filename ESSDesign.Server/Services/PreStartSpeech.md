# Pre-start voice: Deepgram

Railway variable: `Deepgram__ApiKey` (server secret). Optional `Deepgram__ModelId` defaults to `aura-2-hyperion-en`, the Australian male Hyperion voice. The request may select `provider: "deepgram"` (default) or `provider: "elevenlabs"` for voice comparison. ElevenLabs uses `ElevenLabs__ApiKey`, `ElevenLabs__VoiceId`, and optional `ElevenLabs__ModelId` (Flash v2.5 by default). The selected provider stays fixed per conversation. Missing credentials or synthesis failures use device voice; the other paid provider is never called as a fallback.

Aura-2 REST MP3 synthesis uses normal speed (1.0). A Nova-3 prerecorded transcription of the **generated question audio** supplies word start times for captions; microphone recordings continue to use the app's existing recognition. This timing pass has an additional transcription cost. Timings are accepted only when all words match the original question ignoring punctuation/case, with ordered nonnegative timestamps. If unavailable, audio still plays and the app's approximate caption fallback applies.

Audio and timings are cached together for 24 hours, up to 100 entries, within each server process. Identical concurrent requests are coalesced by striped locks. Provider, voice, text and credentials determine cache identity. ElevenLabs uses its native timestamp response. No cache files or keys are written to disk. Cache is cleared on server restart/deployment; it is not a permanent prerecorded question library.

References:
- https://developers.deepgram.com/reference/text-to-speech/speak-request
- https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
- https://developers.deepgram.com/docs/tts-models
