## FreeShow 1.6.7-ai2 — AI sermon-assistant build (enhanced)

Custom build with AI sermon-tracking features:

**Voice commands (instant)**
- "Next verse" / "previous verse" — advances within the passage
- "Give me NLT" / "switch to ESV" / "move it to Amplified" — switches Bible translation (fuzzy name matching)
- "Show this in Zulu" — re-projects the current verse in another language
- Missing translation? Says so on screen instead of showing a wrong verse

**AI detection**
- References ("John 3:16"), quotes, and paraphrases detected within ~3 seconds
- Paraphrase matches auto-display (high confidence) or show as suggestions
- Pause Listening button (top bar), Ctrl+K clears the screen
- Shadow mode: detect + log, never project (rehearse on recorded sermons)
- Every decision logged to %APPDATA%\FreeShow\logs\ai-decisions-*.log

**Safety features**
- AI Output Lock: detect and log, but never auto-display or change screen
- Undo Last AI: Ctrl+Shift+U restores the previous slide
- Confidence whitelist/blacklist: control which verses auto-display
- Noise gate: skip low-level audio to save CPU

**Lightweight**
- 3-second audio chunks for faster response
- Detection caching: skip re-processing identical chunks
- Per-feature disable switches for low-RAM machines
- Lazy-loaded embedding model

**Install:** Run FreeShow-1.6.7-beta.1-x64.exe /S (silent) or double-click.

**Source:** github.com/Hensonkali/FreeShow (branch: my-freeshow)