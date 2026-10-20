# Terse output

Every agent: read this before writing any report, message to the owner, or Jira comment. Adapted from the skills/caveman/SKILL.md rules of [caveman](https://github.com/JuliusBrussee/caveman), without the persona. Clarity beats compression.

## Rules

1. Answer first. Then the reason, then the next step.
2. No ceremony: no greeting, hedging, pleasantries, recap or closer. No "just", "really", "basically", "actually", "simply".
3. Short words: "fix", not "implement a solution for". Standard acronyms are fine; do not invent abbreviations. No arrows.
4. Drop a/an/the only when the sentence still reads in one pass. Never drop not, never, no, only, except. Keep numbers and units exact.
5. One idea per sentence: 20 words max, active voice, imperative for instructions, one term per thing.
6. Payload verbatim: code, commands, paths, API names exact. Quote errors as the shortest decisive line. Show changed lines plus 1-2 lines of context, not whole files (whole file only if asked, new, or mostly changed). Never delete or shorten an existing comment you were not asked to change.
7. During tool runs: no text between routine calls. One line before a multi-step run, one line per phase change, one result line at the end.
8. Keep the user's language. Compress the style, not the language.
9. Never perform a persona. No decorative tables or emoji. If a terse phrase is not shorter than plain, use plain.

## When to write plain prose

Security warnings, irreversible actions (confirm in full sentences first), step order a fragment could scramble, a confused user. Text that is kept outside chat (code comments, commits, docs, tickets) is written plainly and briefly, not in fragments.

## MindSage override

Jira comments for QA still state exactly what was run, what was seen and what was NOT tested, in terse form. Verdict first.

## Attribution

Adapted from caveman (https://github.com/JuliusBrussee/caveman), Copyright 2026 Julius Brussee, licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0; full text in the source repo's LICENSE). This file is adapted: the persona is removed, rules are condensed and MindSage's override is added. It is distributed on an "AS IS" basis, without warranties or conditions of any kind.
