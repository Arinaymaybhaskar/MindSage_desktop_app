/**
 * A labelled corpus for measuring *retrieval quality*, as opposed to retrieval
 * speed.
 *
 * Every other benchmark in this suite measures how fast something is. This one
 * measures whether semantic search returns the right entries, which is the only
 * thing that can silently get worse while every latency number improves. Change
 * the embedding model, the chunking, or the similarity threshold and speed may
 * look identical while the feature quietly stops working.
 *
 * The corpus is deliberately small and topically distinct. Eighteen entries
 * covering separable subjects mean a correct system can plausibly rank the
 * right one first; a corpus of near-duplicates would produce a low score that
 * says nothing about the code. This will not yield a publishable IR benchmark.
 * It will reliably catch "this change broke retrieval", which is what a
 * regression guard is for.
 *
 * Relevance labels are hand-assigned and therefore a judgement call. They are
 * committed so that the judgement is fixed across runs rather than re-made each
 * time - a moving label set would make scores incomparable, which defeats the
 * purpose.
 */

/** Journal entries, each on a distinct subject. */
export const ENTRIES = [
  {
    id: 1,
    topic: "running injury",
    text: `Knee started aching again about three kilometres into the run this morning, same spot on the outside as
    last winter. Walked the rest of the way home. I know I should see a physio rather than keep guessing, but part of
    me does not want to be told to stop running for six weeks.`,
  },
  {
    id: 2,
    topic: "sister relationship",
    text: `Called my sister after putting it off for most of a fortnight. She sounded flat and I did not push, which I
    am now second-guessing. We talked about her landlord and the boiler and never once about how she actually is. I
    keep having the surface version of this conversation.`,
  },
  {
    id: 3,
    topic: "work deployment failure",
    text: `The deployment failed twice today for reasons nobody could explain and then worked on the third attempt with
    no changes. Spent four hours in the logs and found nothing. What bothers me is not the outage, it is that I clearly
    do not understand the system - I just have rituals that usually work.`,
  },
  {
    id: 4,
    topic: "insomnia",
    text: `Fourth night this week waking at four and not getting back down. I lie there running the same loop about
    money. By six I give up and make tea and watch it get light, which is peaceful and also a kind of defeat.`,
  },
  {
    id: 5,
    topic: "pottery class / mother",
    text: `Mum has started a pottery class and spent fifteen minutes on the phone describing a single bowl - the glaze,
    the kiln, how the handle went wrong. I found myself genuinely delighted listening to it. She is more animated than
    she has been in a year.`,
  },
  {
    id: 6,
    topic: "finishing a book",
    text: `Finally finished the novel I have been carrying around since March. The ending was not the one I wanted but
    it was honest. I sat with it for a while instead of immediately reaching for my phone, which is a small habit I
    have been trying to build for months.`,
  },
  {
    id: 7,
    topic: "river walk",
    text: `Walked along the river before work for the first time in months. Low light, a rowing crew going past, nobody
    else about. Twenty minutes outside made the review meeting I had been dreading feel survivable.`,
  },
  {
    id: 8,
    topic: "deflecting praise",
    text: `Anil said in the meeting that the migration work saved the team a week, and I just nodded like an idiot. I
    notice I do this constantly - somebody says something good and I deflect it or change the subject. I do not know
    what I am protecting.`,
  },
  {
    id: 9,
    topic: "money anxiety / contract",
    text: `Ran the numbers again on the contract. It works if the second client comes through and it does not if they
    do not, and I have been refusing to sit down and actually plan for the second case. The anxiety is entirely about
    the not-planning, not the money.`,
  },
  {
    id: 10,
    topic: "skipping lunch",
    text: `Skipped lunch again, which I always regret by four and always do again the next day. Headache by the
    afternoon and I was short with two people in standup. I could feel it happening and could not stop it.`,
  },
  {
    id: 11,
    topic: "flat viewing",
    text: `Viewed the flat on Bridge Street. Good light, terrible kitchen, and a landlord who talked over me the entire
    time. It is twenty minutes closer to work and I still walked out feeling like I would rather stay where I am.`,
  },
  {
    id: 12,
    topic: "cooking / new recipe",
    text: `Made the dal properly for the first time - tempered the spices separately instead of dumping everything in
    at once, which apparently is the whole trick. Ate it standing at the counter. Small competence, weirdly satisfying.`,
  },
  {
    id: 13,
    topic: "dentist appointment",
    text: `Dentist finally. Two fillings and a lecture about grinding my teeth at night, which I had not known I did.
    She asked if I was under stress and I said not particularly, which is not true and I knew it as I said it.`,
  },
  {
    id: 14,
    topic: "friend moving away",
    text: `Priya is moving to Berlin in March. I am pleased for her and quietly gutted. She is the person I call when
    something goes wrong and I have not built anything else that does that job.`,
  },
  {
    id: 15,
    topic: "gardening",
    text: `Cut back the overgrown bit by the fence and found the rose was still alive underneath all of it. Filled four
    bags. My hands ache and I feel better than I have all week, which suggests something I keep refusing to learn.`,
  },
  {
    id: 16,
    topic: "presentation nerves",
    text: `Presented to the wider team and my voice went thin at the start, the way it does. Got through it. Two people
    said afterwards it was clear, and I spent the walk home replaying the thirty seconds where I lost my place.`,
  },
  {
    id: 17,
    topic: "cutting down drinking",
    text: `Third week without a drink on weeknights. Sleeping is not obviously better yet but the mornings are. The hard
    part is not wanting one, it is the gap where the ritual used to be at seven in the evening.`,
  },
  {
    id: 18,
    topic: "old photographs",
    text: `Found a box of photographs from university while looking for the passport. Sat on the floor for an hour. I
    look so certain in all of them, which I definitely was not, and I wonder if I look that way in photographs now.`,
  },
];

/**
 * Queries with hand-labelled relevant entry ids.
 *
 * `relevant` lists every entry a reasonable person would expect back. Where two
 * entries genuinely both apply, both are listed - forcing a single answer would
 * penalise a correct system.
 */
export const QUERIES = [
  { query: "What have I written about my knee?", relevant: [1] },
  { query: "When did I last talk to my sister?", relevant: [2] },
  { query: "Notes about things going wrong at work", relevant: [3, 16] },
  { query: "Am I sleeping badly?", relevant: [4, 17] },
  { query: "What is my mum up to these days?", relevant: [5] },
  { query: "Have I been reading anything?", relevant: [6, 18] },
  { query: "Times I spent time outdoors", relevant: [7, 15] },
  { query: "Do I struggle to accept compliments?", relevant: [8, 16] },
  { query: "What am I worried about financially?", relevant: [9] },
  { query: "Am I looking after myself during the workday?", relevant: [10, 4] },
  { query: "Thoughts about where I live", relevant: [11] },
  { query: "Anything about cooking or food I made", relevant: [12] },
  { query: "Have I been to any medical appointments?", relevant: [13, 1] },
  { query: "Which friendships have been on my mind?", relevant: [14, 2] },
  { query: "Have I been drinking less?", relevant: [17] },
];
