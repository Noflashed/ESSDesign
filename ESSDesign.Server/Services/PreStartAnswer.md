# Low-latency pre-start answers

`POST /api/pre-start/assistant-answer` accepts `{message}` (maximum 4,000 characters) and returns `{reply, links: []}`. It retains the assistant controller's user authentication, role policy and per-user request limit. It does not create company-assistant conversations or run company search/tools. Existing form prompts and client field validation remain in use.

Uses the existing `OpenAI__ApiKey`. Optional `OpenAI__PreStartModel` defaults to `gpt-4.1-mini`, with 1,000 output tokens maximum, no reasoning step or tools, and a 15-second provider timeout. Incomplete/filtered/empty output is rejected rather than applied. Logs contain model elapsed milliseconds only, never answers or credentials.

The app prepares next-question speech while the current question is speaking, continues to reuse provider-specific audio, handles plain numeric counts locally, and allows 1.5-second quiet periods for boolean responses. Activities and general notes retain five seconds; other text fields use three. Microphone activity still prevents endpointing while speech continues. There is no 60-second automatic answer submission.

Validation uses stubbed model responses; real end-to-end response time depends on microphone endpointing, network and provider latency. No measured production speedup is claimed.
