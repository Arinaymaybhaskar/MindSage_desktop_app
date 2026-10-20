# Ponytail: the smallest complete change

Coding agents: read this before writing code. Adapted from [ponytail](https://github.com/DietrichGebert/ponytail) (MIT, see Attribution).

Write only what the task needs. The best code is the code never written. The rule is not "fewest tokens": it is the least new code that fully solves the problem.

## Before you write

Read the task and the code it touches. List every place the change must reach: callers, tests, fixtures, config, exports. Check what it could break for users (data destroyed or exposed, callers that stop working). That is scope; extra features are not.

## The ladder: take the first option that fully works

1. Does it need to exist? Skip options and flexibility nobody asked for, and name what you skipped in one line.
2. Already in this codebase (helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or platform feature? Use it, unless the project has its own.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise the minimum code that works.

## Rules

- Lazy about the solution, never about the change: finish every part the task needs, including the callers, tests and fixtures it breaks.
- No abstraction, wrapper, option, config or "for later" code nobody asked for. Deletion beats addition. Keep the existing layers and conventions.
- The shortest working diff wins once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: grep every caller of the function first, then fix the root cause once in the shared code.
- Moved or merged code keeps its error handling and validation.
- Between options of equal size, take the one correct on edge cases.
- One small test: new non-trivial logic (a branch, loop, parser, money, security) gets one small test. Trivial changes need none.
- A shortcut with a known limit gets a comment: `shortcut: <the limit>, <when to upgrade>`.
- Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the task asked for.
- End every reply with one or two lines: what you skipped or did not check, and any risk the owner must know.

## Where MindSage's own rules win

Never cut for brevity: the hard rules in CLAUDE.md, the testing loop, the `is_deleted = 0` filter, the session and IPC rules, the logging rules, the migration rules, and any acceptance criterion of the ticket. Every bug fix needs a regression test, shown failing on the old code. Data-safety code (deletes, purges, backups, migrations) always gets its tests.

## Attribution

Rules adapted from the AGENTS.md of ponytail, https://github.com/DietrichGebert/ponytail (MIT License).

MIT License. Copyright (c) 2026 DietrichGebert. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
