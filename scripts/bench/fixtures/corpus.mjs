/**
 * Fixed inputs for the AI benchmarks.
 *
 * Committed and never regenerated. Local model latency depends heavily on input
 * length and, for generation, on how much the model decides to say - so a
 * randomly generated corpus would make two runs incomparable for reasons that
 * have nothing to do with the code. These are the same texts every time.
 *
 * Lengths are chosen to bracket what real entries look like: a one-line note,
 * a typical evening entry, and a long reflective piece.
 */

/** ~20 words. Below MIN_SUMMARY_WORDS (25), so the summary path skips it. */
export const JOURNAL_SHORT = `Slept badly again. Third night this week. Coffee is not fixing it and I snapped at Priya over nothing this morning.`;

/** ~150 words. The typical case. */
export const JOURNAL_MEDIUM = `Went for a walk along the river before work, which I have not done in months. The light was
low and everything was quiet except for a rowing crew going past. I had been dreading the review meeting all week, and
somehow twenty minutes outside made it feel survivable. The meeting itself was fine. Better than fine, actually - Anil
said the migration work had saved the team a week and I did not know how to respond to that, so I just nodded like an
idiot. I am noticing I do that a lot. Someone says something good and I deflect it. In the evening I called my sister
and we talked for an hour about nothing in particular. She sounded tired. I keep meaning to ask if she is okay and then
not asking. Tomorrow I want to start earlier and protect the morning instead of letting it get eaten.`;

/** ~480 words. Long-form, to expose prompt-eval scaling. */
export const JOURNAL_LONG = `A strange, unsettled day that I want to write down properly before it blurs into the rest of
the week. I woke up at four and could not get back to sleep, so I lay there running through the same loop about money
and whether taking the contract was the right call. By six I gave up and made tea and sat in the kitchen watching it
get light. There is something about that hour that makes everything feel both worse and more manageable at the same
time. The house is silent and there is nobody to perform for.

Work was a mess. The deployment failed twice for reasons nobody could explain, and I spent four hours reading logs and
found nothing, and then it worked on the third attempt with no changes. I hate that. I hate not knowing why something
broke, because it means I do not actually understand the system, I just have a set of rituals that usually work. Rahul
said not to worry about it and I could not let it go. I stayed late trying to reproduce it and did not manage to.

I skipped lunch, which I always regret and always do again. By four I had a headache and was short with people in the
standup. I noticed it happening and could not stop it, which is its own particular frustration - watching yourself be
unpleasant from a small distance.

The good part of the day: I finally finished the book I have been reading since March. The ending was not what I wanted
but it was honest, and I sat with it for a while afterwards instead of immediately picking up my phone, which felt like
a small win. I have been trying to build that habit for months. Just sitting with a thing.

Called Mum in the evening. She has started a pottery class and spent fifteen minutes describing a bowl. I found myself
genuinely happy listening to it. She asked about the contract and I said it was going well, which is mostly true, and
she did not push, which I appreciated.

I keep circling back to the same realisation and then losing it: most of what exhausts me is not the work itself but
the anticipation of the work, and the story I tell myself about what it means if I do it badly. The deployment failing
twice was not the problem. The problem was the forty minutes I spent afterwards deciding what it said about me.

Tomorrow: start earlier, eat lunch, and try to notice the anticipation before it becomes the whole day.`;

export const JOURNAL_ENTRIES = [
  { name: "short", text: JOURNAL_SHORT },
  { name: "medium", text: JOURNAL_MEDIUM },
  { name: "long", text: JOURNAL_LONG },
];

/**
 * Chat queries covering the shapes the RAG path handles: a direct lookup, a
 * time-scoped question, an emotional-pattern question, and an open one.
 */
export const CHAT_QUERIES = [
  "What did I write about the river walk?",
  "How was my mood last month compared to the month before?",
  "Do I tend to be harder on myself after something at work goes wrong?",
  "What keeps coming up in my entries that I might be avoiding?",
  "Summarise what I have been worrying about recently.",
];

/** Partial sentences for the editor's ghost-text completion path. */
export const GHOST_TEXT_PROMPTS = [
  "Today was one of those days where",
  "I keep thinking about what she said about",
  "The thing I am most anxious about right now is",
];

/** Inputs for embedding-latency-vs-length. */
export const EMBED_INPUTS = [
  { name: "title", text: "A quiet morning by the river" },
  { name: "short", text: JOURNAL_SHORT },
  { name: "medium", text: JOURNAL_MEDIUM },
  { name: "long", text: JOURNAL_LONG },
];
