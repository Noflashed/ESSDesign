# Pre-start voice: Deepgram

Railway variable: `Deepgram__ApiKey` (server secret). Optional `Deepgram__ModelId` defaults to `aura-2-hyperion-en`, the Australian male Hyperion voice. No ElevenLabs calls are made by this endpoint after this change; missing credentials or synthesis failures use the app's existing device voice fallback.

Aura-2 REST MP3 synthesis uses normal speed (1.0). A Nova-3 prerecorded transcription of the **generated question audio** supplies word start times for captions; microphone recordings continue to use the app's existing recognition. This timing pass has an additional transcription cost. Timings are accepted only when all words match the original question ignoring punctuation/case, with ordered nonnegative timestamps. If unavailable, audio still plays and the app's approximate caption fallback applies.

Audio and timings are cached together for 24 hours, up to 100 entries, within each server process. Identical concurrent requests are coalesced by striped locks. Voice, text and credentials determine cache identity. No cache files or keys are written to disk. Cache is cleared on server restart/deployment; it is not a permanent prerecorded question library.

References:
- https://developers.deepgram.com/reference/text-to-speech/speak-request
- https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
- https://developers.deepgram.com/docs/tts-models
