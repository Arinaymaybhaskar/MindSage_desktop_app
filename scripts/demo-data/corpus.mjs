/**
 * Demo content corpus for MindSage marketing captures.
 *
 * The persona is Maya Kapoor, a product designer at a small startup who is
 * training for a half marathon, learning Portuguese, working through anxiety
 * about speaking in front of people, and slowly repairing things with her dad.
 * Keeping one coherent life across every entry matters: the journal list, the
 * semantic search results, and the chat transcript are all photographed
 * together, and mismatched personas read as fake immediately.
 *
 * Entries come in two tiers:
 *
 *   HERO_ENTRIES  - fully hand-written. These land on the most recent days, so
 *                   they are the ones actually legible in the journal list, the
 *                   dashboard's "Recent Entries" cards, and the detail shot.
 *   Filler banks  - combinatorial but coherent prose for older days. They exist
 *                   to give the stat cards, streak, mood chart and calendar real
 *                   mass. They are rarely readable in a screenshot, but they
 *                   still have to survive someone scrolling.
 *
 * Mood scores are 1-5 (never 0 - `emptyJournal` defaults to 0 and a 0 breaks
 * both the MoodOrb gradient and the calendar colouring).
 *
 * Tag names are leaf values from src/utils/moodHierarchy.ts. Never put a comma
 * in a tag: the read path does GROUP_CONCAT(name) and splits on "," , so a
 * comma silently shatters one tag into two.
 */

/** Tag pools keyed by mood band, drawn from moodHierarchy leaves. */
export const TAGS_BY_MOOD = {
  1: ["Overwhelmed", "Worried", "Powerless", "Empty", "Isolated"],
  2: [
    "Worried",
    "Disappointed",
    "Annoyed",
    "Sleepy",
    "Inadequate",
    "Withdrawn",
  ],
  3: ["Sleepy", "Curious", "Perplexed", "Indifferent", "Pressured", "Hesitant"],
  4: ["Hopeful", "Curious", "Thankful", "Confident", "Creative", "Eager"],
  5: [
    "Joyful",
    "Inspired",
    "Thankful",
    "Energetic",
    "Valued",
    "Free",
    "Successful",
  ],
};

/**
 * Hand-written entries, newest first. `dayOffset` is days back from today, so 0
 * is today. Anything with `feature: true` is a screenshot target and gets its
 * media attached by the seeder.
 */
export const HERO_ENTRIES = [
  {
    dayOffset: 0,
    hour: 21,
    mood: 5,
    title: "The talk went fine",
    tags: ["Successful", "Thankful", "Free"],
    summary:
      "Maya gave the quarterly design review she had been dreading for three weeks. It went well, and the relief afterwards was bigger than the fear had been.",
    content: `Three weeks of low-grade dread and the whole thing was over in eighteen minutes.

I had the slides memorised to the point where I'd stopped seeing them. What I hadn't rehearsed was Priya asking, right at the start, whether we'd considered just not shipping the onboarding redesign at all. In the version of this I'd played out in my head about forty times, that question ended with me going blank. Instead I said "yes, here's what happens if we don't" and skipped to slide nine, which I'd built for exactly that and then forgotten I'd built.

The rest was easy. Not comfortable — my hands did the shaking thing for the first few minutes — but easy in the sense that I knew the material better than anyone in the room and at some point my body worked that out too.

Anand caught me in the kitchen after and said it was the most confident he'd seen me present. I said thanks and then stood there for a second trying to decide whether to explain that I'd been awake since four. Decided not to. Let it just be the thing he saw.

The strange part is how fast the fear drained out. By the time I got to my desk it was gone completely, like it had never been load-bearing. Three weeks of carrying something that weighed nothing.`,
  },
  {
    dayOffset: 1,
    hour: 7,
    mood: 3,
    title: "Awake since four",
    tags: ["Worried", "Sleepy", "Pressured"],
    summary:
      "A pre-presentation anxiety spiral at 4am. Maya notices the fear is about being perceived rather than about the work itself.",
    content: `Woke at four with the presentation running in my head and could not get it to stop. Not thinking about it, exactly — more like it was playing on a screen I couldn't turn off.

Got up at five and made coffee I didn't want. Read through the deck again. It's fine. I know it's fine. That isn't what the four-a.m. thing is about.

Wrote down what I'm actually afraid of, which took a while because the first three answers were lies. Not: the work is bad. Not: they'll disagree with the direction. It's that twenty people will look at me for eighteen minutes straight and I'll be visible in a way I can't manage. The work is just the reason they're all facing the same direction.

That's useful to know and completely useless at four in the morning.

Going to run before standup. It helps more than it should for something so stupid and simple.`,
  },
  {
    dayOffset: 2,
    hour: 20,
    mood: 4,
    title: "Ten miles, and I didn't die",
    tags: ["Confident", "Energetic", "Thankful"],
    feature: true,
    // Spoken first, then written up - this is the entry that demonstrates
    // voice capture, so the transcript belongs here explicitly rather than
    // being attached to whichever featured entry the seeder reaches first.
    transcript:
      "Okay so I've just got back and I want to get this down before I lose it. Ten miles. That is the longest I have ever run in my life, by two whole miles. I went out along the canal because it's flat and because I didn't want to be making decisions past mile six, and that turned out to be exactly right. Somewhere around eight my brain just went quiet. Not the nice meditative quiet everyone talks about — more like it had shut down anything non-essential. Legs are wrecked. Completely worth it.",
    summary:
      "Maya's longest run so far in half-marathon training. She reflects on how differently she treats her body's limits versus her mind's.",
    content: `Ten miles. The longest I have ever run in my life, by two whole miles.

I went out along the canal because it's flat and because I didn't want to make any decisions past mile six. That turned out to be right. Somewhere around eight my brain went completely quiet — not the good meditative quiet people describe, more like it had shut down non-essential systems. All that was left was the path and the sound of my own breathing and an increasingly urgent opinion about my left shoe.

Walked twice. Both times for less than a minute, both times on hills, and I've decided I don't care. Twelve weeks ago four miles felt like a serious undertaking and I would have told you, sincerely, that I was not a person whose body did this.

What's getting to me tonight is the gap between how I treat this and how I treat everything else. With running I've accepted that the limit moves if you push on it patiently and don't panic when a given day is bad. With work I treat every bad day as new evidence about my ceiling.

Same person. Same mechanism, presumably. I don't know why one of them gets grace and the other doesn't.

Legs are absolutely wrecked. Worth it.`,
  },
  {
    dayOffset: 3,
    hour: 19,
    mood: 2,
    title: "The bug was mine",
    tags: ["Inadequate", "Annoyed", "Withdrawn"],
    summary:
      "Three days of debugging ended in a one-line fix and Maya's own mistake. She sits with the disproportionate shame of it.",
    content: `Three days. The fix was one line, and the line was mine.

I wrote the original in April and I remember being pleased with it — it was neat, it did the clever thing instead of the obvious thing. The clever thing had an edge case I never considered, and today Rahul found it in about forty minutes by doing the boring, methodical thing I'd been too proud to do on Monday.

He was completely gracious about it. That somehow made it worse.

I know the correct framing here. Everyone ships bugs. A three-day debug that ends in understanding is not a wasted three days. The system is better now than it was on Monday. I can recite all of this.

It isn't touching the actual feeling, which is closer to being found out. Like the bug was a small hole in the wall and behind it is the fact that I'm not as good at this as people have decided I am.

Going to close the laptop and not look at Slack tonight. Nothing good happens after this point.`,
  },
  {
    dayOffset: 4,
    hour: 18,
    mood: 4,
    title: "Portuguese with Beatriz",
    tags: ["Curious", "Eager", "Valued"],
    summary:
      "A language exchange call where Maya held a real conversation for the first time. Small breakthrough after weeks of plateau.",
    content: `Forty minutes with Beatriz and maybe six of them in English.

We talked about her sister's wedding, which meant I had to describe an entire chaotic family event in a language where I know roughly nine hundred words. What came out was not elegant. At one point I said something that I'm fairly sure translated as "the food was very much" and she laughed for a while before helping me fix it.

But it was a conversation. An actual one, with follow-up questions and a joke that landed and a moment where I understood something she said before I'd finished translating it in my head. That's the thing I've been waiting eleven weeks for and it arrived without any announcement.

She said my listening has improved much faster than my speaking, which is apparently normal and which I'm choosing to hear as a compliment.

Next week she wants to talk about work. I've told her my vocabulary for that is entirely made of nouns.`,
  },
  {
    dayOffset: 5,
    hour: 22,
    mood: 3,
    title: "Called Dad",
    tags: ["Perplexed", "Hesitant", "Hopeful"],
    summary:
      "A twenty-minute call with her father that stayed on safe topics but ended warmly. Maya weighs patience against wanting more.",
    content: `Twenty-two minutes. We talked about the monsoon, his knee, a neighbour I have never met and now know a startling amount about, and the price of onions.

We did not talk about anything.

I've stopped experiencing that as a failure, which is either growth or resignation and I genuinely can't tell which. For most of my twenties I got off these calls furious that we couldn't have a real conversation. Now I think the call *is* the real conversation, and the onions are the medium, and if I keep waiting for a different format I'll wait through the rest of his life.

At the end he said "you sound tired, are you eating" which from him is roughly a sonnet.

I said yes. I am, mostly.`,
  },
  {
    dayOffset: 6,
    hour: 12,
    mood: 5,
    title: "Saturday with nothing in it",
    tags: ["Free", "Joyful", "Thankful"],
    feature: true,
    summary:
      "An unplanned Saturday at the market and by the water. Maya notices how rare an unstructured day has become.",
    content: `No plans. First Saturday in about two months with genuinely nothing in it.

Went to the market with no list, which felt mildly transgressive. Bought figs because they looked good, a bunch of coriander I have no use for, and a very small ceramic bowl from the man who is always there and always slightly annoyed. Sat by the water for an hour and read maybe fifteen pages and mostly just watched a heron fail repeatedly at something.

I keep noticing how much of my time has a purpose attached to it. Even the running has a purpose now. Even the reading, sort of, because I have a number I'm trying to hit this year, which is an insane thing to do to reading.

Today had no number in it. I'd forgotten what that was like — not restful exactly, because I felt guilty for about the first ninety minutes, but after that something unclenched.

Made a very slow dinner. Ate it on the floor by the window because the light was good. This is a completely unremarkable day and I want to remember it.`,
  },
  {
    dayOffset: 8,
    hour: 19,
    mood: 2,
    title: "Sprint planning ran long again",
    tags: ["Overwhelmed", "Annoyed", "Pressured"],
    summary:
      "A two-hour planning meeting that resolved nothing. Maya is frustrated by process overhead eating the week.",
    content: `Two hours and ten minutes to decide roughly nothing.

The actual disagreement — whether the onboarding work blocks the billing migration — could have been settled in six minutes by two people with the dependency graph open. Instead nine of us discussed it in a circle, twice, with a break in the middle where we discussed whether we were discussing the right thing.

I said something halfway through that I'm still annoyed about. Someone asked whether design was blocked and I said "not yet" when the honest answer was "yes, since Thursday, and I've been quietly absorbing it." I don't know why I do that. Some reflex that says making the problem visible is the same as making it mine.

Left the meeting with less clarity than I went in with and a to-do list that had grown.

Ate dinner standing up. Not a great sign.`,
  },
  {
    dayOffset: 9,
    hour: 20,
    mood: 4,
    title: "Pottery class, week four",
    tags: ["Creative", "Curious", "Hopeful"],
    summary:
      "Maya centres clay on the wheel for the first time. She enjoys being visibly bad at something with no professional stakes.",
    content: `Centred the clay. First time. Took about nine minutes and by the end my forearms were shaking, but it went from a wobbling lump to a still, dense little dome and stayed there.

Ravi, who teaches like someone who has watched a thousand people fail at this and is not remotely worried about it, said "there, that's it, don't celebrate yet" — and of course I celebrated and immediately knocked it off centre.

I like this class more than almost anything else in my week and I've been trying to work out why. I think it's that I'm openly, visibly bad at it and nothing depends on my getting better. Nobody is going to review my bowls. There is no version of pottery where I lie awake at four in the morning.

Made something that could generously be called a dish. It's lopsided and too thick at the base and I'm keeping it.`,
  },
  {
    dayOffset: 10,
    hour: 8,
    mood: 3,
    title: "Slept badly, ran anyway",
    tags: ["Sleepy", "Pressured", "Curious"],
    summary:
      "A short recovery run on very little sleep. Maya notes that showing up on bad days is becoming automatic.",
    content: `Four hours, maybe five, broken. Alarm went at six and I lay there constructing a genuinely persuasive argument for skipping.

Went anyway. Only four miles, slow, but I went.

The interesting thing is that the argument didn't work, and it used to. Six months ago "you slept badly" was a complete and sufficient case. Now it's just weather. Something has shifted from decision to default, and I didn't notice it shifting.

Coffee. Standup in an hour. Not going to be a brilliant day and that's fine — it just has to be a day.`,
  },
  {
    dayOffset: 12,
    hour: 21,
    mood: 4,
    title: "Dinner with Nadia",
    tags: ["Valued", "Thankful", "Joyful"],
    summary:
      "A long dinner with an old friend. Maya reflects on friendships that survive without maintenance.",
    content: `Four hours at that Vietnamese place. The staff started stacking chairs around us and we stayed anyway.

I hadn't seen Nadia since March and there was zero re-entry cost. No throat-clearing, no catch-up summary — she sat down and said "okay so the dad thing, where are we" and we were straight back in.

I have maybe four friendships like this and I don't understand the mechanism. I'm not good at maintenance. I go quiet for months. And yet these particular ones just wait, apparently indefinitely, and pick up mid-sentence.

She's leaving for Lisbon in October, which I'm trying to be uncomplicatedly happy about. Mostly succeeding.

Told her about the presentation. She said "you always think you're going to be found out and you never are, at some point that has to become evidence." Which is annoying and correct.`,
  },
  {
    dayOffset: 14,
    hour: 18,
    mood: 1,
    title: "A bad one",
    tags: ["Empty", "Powerless", "Isolated"],
    summary:
      "A low day with no identifiable cause. Maya records it plainly rather than trying to solve it.",
    content: `Nothing happened today. That's what's confusing about it.

No bad news, no conflict, nothing went wrong. I woke up under something and it stayed all day, and by mid-afternoon I was doing the thing where I go back through the last week looking for the cause, as if there has to be a receipt.

Cancelled the run. Cancelled dinner with Tom, which I feel worse about than the run. Sat on the sofa for a long time not really watching something.

I'm writing this down mainly because past me left a note in here about February saying the days like this always look, from inside them, like they're the new baseline, and they never are. That's not making me feel better right now. But I believe it more than I believe the day.

Going to sleep early. That's the whole plan.`,
  },
  {
    dayOffset: 15,
    hour: 20,
    mood: 3,
    title: "Back to something like normal",
    tags: ["Hesitant", "Curious", "Sleepy"],
    summary:
      "The day after a low. Maya is cautious but functional, and notes how quickly the mood lifted.",
    content: `Slept ten hours. Woke up and the thing had mostly lifted, which is almost insulting given how total it felt yesterday.

Did the run I skipped. Texted Tom to apologise and he said "you already said that, it's fine, come Thursday instead." Cleared about half the backlog that had been quietly accumulating.

Still a bit careful with myself. Like walking on a leg you've recently sprained — mostly fine, but you're paying attention.

Worth noting that yesterday I would have told you with total confidence that this was going to be a long one. It lasted about thirty hours.`,
  },
  {
    dayOffset: 17,
    hour: 13,
    mood: 4,
    title: "Design review, but the good kind",
    tags: ["Inspired", "Confident", "Creative"],
    summary:
      "A collaborative critique session that improved the work. Maya contrasts it with reviews that feel like defence.",
    content: `Ninety minutes of critique and I came out of it wanting to work, which basically never happens.

The difference, I think, was that Priya opened by asking what we were unsure about instead of asking us to present. So we led with the weak parts. The empty state nobody liked, the third step that everyone kept getting lost in during testing. And because those were on the table from minute one, the whole conversation was about fixing them rather than about whether we'd noticed them.

Someone suggested collapsing steps two and three entirely. My immediate reaction was defensive and about four seconds later I realised they were right and it's obviously better.

Sketched the new flow over lunch. It's simpler than anything we've had. Two weeks of work is going in the bin and I don't mind at all.`,
  },
  {
    dayOffset: 19,
    hour: 7,
    mood: 4,
    title: "Six miles before work",
    tags: ["Energetic", "Confident", "Free"],
    summary:
      "An early morning run in good conditions. Short, straightforwardly good entry.",
    content: `Out at six-fifteen. Cold enough for sleeves, which after this summer felt like a gift.

Six miles at a pace I would have called ambitious in June and which now just feels like running. The river path had nobody on it except one other runner going the other way, and we did the nod.

Home, shower, at my desk by eight with the whole day still in front of me. There is no version of the evening that feels like this. I keep re-learning that and then forgetting it.`,
  },
  {
    dayOffset: 21,
    hour: 22,
    mood: 2,
    title: "Comparison spiral",
    tags: ["Inadequate", "Disappointed", "Withdrawn"],
    summary:
      "An hour lost to scrolling through peers' career milestones. Maya identifies the trigger and the cost.",
    content: `Lost an hour to LinkedIn, which is an hour I will not be getting back and which has left me measurably worse.

Someone I studied with is now leading a team of fourteen. Someone else has started a company. A third person posted a photograph of a keynote stage with their name on the screen behind them.

I know exactly what this is. I know the ratio of highlight reel to reality. I know that six months ago I'd have looked at where I am now and been pleased. None of that knowledge intervened even slightly.

The comparison is never with a whole person, that's the trick of it. It's my Tuesday against their announcement.

Deleting the app off my phone again. Third time this year. Apparently I need to keep learning this.`,
  },
  {
    dayOffset: 23,
    hour: 19,
    mood: 5,
    title: "Shipped it",
    tags: ["Successful", "Joyful", "Valued"],
    summary:
      "The onboarding redesign goes live after four months. Early numbers are good and the team celebrates.",
    content: `It's live. Four months of work and it went out at half past two on a Wednesday with no ceremony whatsoever.

Watched the dashboard for about an hour like it was a sporting event. Completion rate on the first session is up eleven points. Eleven. We'd argued for four when we wrote the goal because we wanted to be able to hit it.

The team went out. I had two drinks and got sentimental and told Rahul that the debugging thing three weeks ago was the most useful week I've had all year, which was true and which he found extremely funny.

Priya sent a note to the whole company that named everyone individually. Small thing. Not a small thing.

I want to remember that this felt good and that in about four days it will feel completely normal and I'll be looking at the next thing. That's fine. But right now: eleven points.`,
  },
  {
    dayOffset: 25,
    hour: 20,
    mood: 3,
    title: "Money afternoon",
    tags: ["Pressured", "Perplexed", "Hopeful"],
    summary:
      "Maya finally sits down with her finances. Uncomfortable but less bad than feared; the emergency fund is on track.",
    content: `Spent two hours on the spreadsheet I've been avoiding since June.

It was not as bad as the avoidance implied. It never is. The emergency fund is at about four months, which is short of where I want it but not the disaster my imagination had settled on. The subscriptions audit turned up two things I have been paying for since 2024 and have used a combined zero times.

The uncomfortable part was seeing how much of the last quarter went on food I didn't plan. Not restaurants with friends, which I refuse to feel bad about. The other kind — the six p.m. "I can't face cooking" kind, which is really a tiredness problem wearing a money costume.

Set up the automatic transfer so the decision stops being a decision. Should have done that a year ago.`,
  },
  {
    dayOffset: 27,
    hour: 21,
    mood: 4,
    title: "Reading again",
    tags: ["Curious", "Free", "Thankful"],
    summary:
      "Maya finishes a novel in two sittings and realises phone habits, not time, had been the obstacle.",
    content: `Finished the novel in two sittings, which I haven't done in probably two years.

I'd convinced myself I didn't have time to read. What I actually didn't have was a phone that stayed in another room. Two hours materialised out of nowhere the moment it wasn't within reach — that's not a productivity insight, it's just embarrassing.

The book was good in a way that I resented slightly, because it kept doing the thing where you recognise yourself in a character you don't want to be. The sister who has an answer for everything and can't sit still in a room with anyone.

Started another one straight away. Feels greedy.`,
  },
  {
    dayOffset: 29,
    hour: 18,
    mood: 2,
    title: "Migraine day",
    tags: ["Powerless", "Sleepy", "Annoyed"],
    summary:
      "A migraine wipes out most of a workday. Maya is frustrated at losing time and at needing to explain it.",
    content: `Aura started around ten, during standup, which meant I got to watch half of my colleagues' faces disappear into a shimmering hole while nodding along.

Lay down in the dark from eleven until about four. Lost the day.

The part I hate most isn't the pain, it's the negotiation afterwards. Working out what to say. Whether "migraine" sounds serious enough or whether it lands like "headache" and I should say something more legible. I've had these since I was nineteen and I still do this calculation every single time.

Anand replied "rest, none of it's urgent" within about ninety seconds and I still spent an hour composing the message.

Eating toast. Screen brightness at the absolute minimum. Tomorrow will be normal.`,
  },
  {
    dayOffset: 31,
    hour: 12,
    mood: 4,
    title: "Walked the long way",
    tags: ["Curious", "Free", "Hopeful"],
    summary:
      "A deliberate detour through an unfamiliar part of the city. A small, restorative entry.",
    content: `Took the long route back from the dentist and ended up in a part of the city I've somehow never walked through in six years of living here.

There's a whole street of shops selling one thing each. Buttons. Zips. A place that appeared to sell exclusively hinges, staffed by a man who looked deeply content.

I don't have a point. I just walked for fifty minutes with no destination and arrived home in a noticeably better mood than I left in, and it seems worth writing down that the intervention was that cheap.`,
  },
  {
    dayOffset: 33,
    hour: 20,
    mood: 3,
    title: "Therapy, session nine",
    tags: ["Perplexed", "Hesitant", "Curious"],
    summary:
      "A session that surfaced the pattern of pre-emptive over-preparation as a way of managing being perceived.",
    content: `We spent most of it on the presentation thing, which I brought in expecting to talk about for five minutes.

She asked what I was actually preparing for, given I already know the material. I said "so it goes well." She waited. I said "so nobody sees me not knowing something." She waited again, which is her whole technique and which works every time.

The thing underneath is that preparation isn't about the work at all. It's a way of making sure I'm never caught mid-thought in front of people. Everything gets rehearsed so that nothing is live.

Which explains the four a.m. thing, and probably also why I'm so much better at written feedback than talking in meetings.

She asked what a small experiment would look like. I said saying "I don't know, let me think about it" out loud in a meeting instead of deflecting. That's this week's homework and I'm already dreading it, which she pointed out is informative.`,
  },
  {
    dayOffset: 36,
    hour: 19,
    mood: 4,
    title: "Cooked for six",
    tags: ["Joyful", "Creative", "Valued"],
    summary:
      "Maya hosts dinner for the first time in her flat. Chaotic but warm.",
    content: `Six people in a flat that comfortably seats four. Somebody sat on the radiator cover the entire evening and claimed to prefer it.

I made the dal my mother makes, badly, and a salad, and Tom brought a tart that made my contribution look modest. Nobody minded. The rice was a bit wrong.

I'd been putting hosting off for about a year on the grounds that the flat is small and I'm not good at it. Both things turned out to be true and completely irrelevant.

Last people left at one. The kitchen is a disaster and I'm going to bed anyway.`,
  },
  {
    dayOffset: 38,
    hour: 8,
    mood: 3,
    title: "Rain run",
    tags: ["Sleepy", "Hesitant", "Confident"],
    summary:
      "Ran in heavy rain after nearly skipping. Short entry about the gap between dread and experience.",
    content: `Absolutely hammering down. Stood at the door for a full minute deciding.

Went. Was soaked within ninety seconds and after that it stopped being a factor — there's no incremental wetness past a certain point, so the whole thing became weirdly freeing.

Five miles. Saw two other people out, both of whom looked as ridiculous as I did.

The dread was worse than the rain by an enormous margin. I feel like I write some version of that sentence in here every couple of weeks and it never seems to transfer to the next occasion.`,
  },
  {
    dayOffset: 41,
    hour: 21,
    mood: 2,
    title: "Said yes again",
    tags: ["Overwhelmed", "Annoyed", "Inadequate"],
    summary:
      "Maya takes on a third project despite being at capacity, and examines why saying no feels impossible.",
    content: `Took on the research project. I did not want the research project. I have two things in flight and a launch in three weeks.

The ask came in Slack and I typed "yes, happy to" in about four seconds, before any part of me had consulted any other part.

What I notice is that the yes isn't generosity. It's insurance. Some belief that being useful is the thing keeping me here, and every no draws down a balance I can't see the level of.

I'm going to have to go back and renegotiate it tomorrow, which will be much more uncomfortable than declining would have been today. I know this because I've done it three times this year.

Writing it down so that next time there's a record.`,
  },
  {
    dayOffset: 44,
    hour: 20,
    mood: 5,
    title: "Beatriz sent photos",
    tags: ["Joyful", "Thankful", "Inspired"],
    summary:
      "Photos from her language partner's family wedding arrive with a message written for Maya's level.",
    content: `Beatriz sent about forty photographs from the wedding, plus a paragraph in Portuguese written deliberately at my level, which I understood almost all of on the first read.

Almost all of it. On the first read.

Eleven weeks ago I couldn't order coffee. I sat there re-reading it three or four times just for the feeling.

The photos are wonderful. Her grandmother in the middle of every group shot, arms out, clearly directing. Somebody's child asleep under a table at what must be one in the morning. A very serious dog in what appears to be a bow tie.

Wrote back. Took me thirty-five minutes and it's four sentences long and I'm sure it's full of errors. Sent it anyway.`,
  },
  {
    dayOffset: 47,
    hour: 19,
    mood: 3,
    title: "Half the office is out",
    tags: ["Indifferent", "Sleepy", "Curious"],
    summary:
      "A quiet, low-stakes work day in August. Maya gets deep work done and notices how much meetings cost.",
    content: `August properly hit. Half the team on holiday, three meetings cancelled, Slack almost silent.

Got more done today than in the previous three combined, which is a fact I should probably do something with rather than just observing every August.

Rewrote the whole spec for the settings work. It had been sitting at eighty percent since June because eighty percent is exactly the point where a document stops being urgent.

Nothing else to report. A completely flat, quiet, productive day. I could use a run of these.`,
  },
  {
    dayOffset: 50,
    hour: 22,
    mood: 4,
    title: "Old photographs",
    tags: ["Thankful", "Curious", "Hopeful"],
    feature: true,
    summary:
      "Maya's mother sends scans of family photographs, prompting reflection on her father as a young man.",
    content: `Ma scanned a whole box of photographs and sent them over, badly, at about four in the morning her time, with no message.

There's one of Dad at maybe twenty-six, on a motorbike, laughing at whoever's holding the camera. I have never seen him make that face. Not once, in thirty-one years.

It's disorienting in a way I wasn't ready for at eleven p.m. on a Tuesday. There's a whole person in that photograph who existed for decades before I turned up and who I've only ever met in the reduced, careful version that came after.

I think this is why the phone calls have started to bother me less. It's not that the onions are the conversation. It's that I've been holding out for a version of him that the photograph suggests stopped existing a long time before I could have met him.

Saved about ten of them. Going to get the motorbike one printed.`,
  },
  {
    dayOffset: 54,
    hour: 18,
    mood: 2,
    title: "Nothing landed today",
    tags: ["Disappointed", "Withdrawn", "Inadequate"],
    summary:
      "A scattered, unproductive day. Maya resists the urge to draw conclusions from it.",
    content: `Opened the same file about eleven times and closed it eleven times.

Not blocked, exactly. Just couldn't get any traction. Every time I got near the actual problem some other thing surfaced that felt more tractable, and I'd do that instead, and then look up and forty minutes had gone.

Ended the day with a longer list than I started with and nothing meaningful moved.

The temptation is to conclude something from this. That I'm losing it, that the last month was a fluke. I'm not going to. It was one Thursday in August and I slept badly.

Early night. Try again.`,
  },
  {
    dayOffset: 58,
    hour: 11,
    mood: 5,
    title: "Swimming in the lake",
    tags: ["Free", "Energetic", "Joyful"],
    feature: true,
    summary:
      "A cold morning swim with friends. One of the clearest good days of the summer.",
    content: `Drove out at half six with Nadia and Tom and were in the water by eight.

Cold enough that the first thirty seconds are just a negotiation with your own body about whether this is survivable. Then it flips, completely, and you're fine, and everything is extremely bright and the water is the colour of tea and there's mist coming off it.

Swam out to the far side. Floated on my back for a while looking at absolutely nothing.

Tom brought a flask and we sat on the bank afterwards with our hands around the cups not talking much. Drove back with wet hair and the windows down and were home by eleven with the whole day still ahead.

I don't have anything clever to say about it. It was just about as good as a morning gets.`,
  },
  {
    dayOffset: 62,
    hour: 20,
    mood: 3,
    title: "Started the training plan",
    tags: ["Hesitant", "Eager", "Pressured"],
    summary:
      "Day one of a structured half-marathon plan. Maya is skeptical of her own follow-through.",
    content: `Printed the twelve-week plan and put it on the fridge, which is either commitment or theatre.

Week one is almost insultingly gentle. Three runs, longest is four miles. I looked at week nine — eleven miles — and felt something close to vertigo.

The honest problem isn't the running. It's that I have started roughly four things like this and finished none of them, and there's a voice that's already treating this as the same. It has a decent evidentiary basis.

What's different, maybe, is that this one has a date attached and I've paid for it. Sunk cost as a motivational strategy is not elegant but I'll take it.

Four miles done. Eleven weeks to go.`,
  },
  {
    dayOffset: 66,
    hour: 21,
    mood: 2,
    title: "The flat is too quiet",
    tags: ["Isolated", "Empty", "Worried"],
    summary:
      "A lonely evening after a stretch of solitude. Maya names it without dramatising it.",
    content: `Third evening in a row with nobody. I like living alone, genuinely, and there is a threshold past which I stop liking it and I crossed it somewhere around Tuesday.

Nothing's wrong. I have people. Nadia's away, Tom's got the kids this week, everyone's mid-August and scattered.

But the flat has that quality tonight where the sounds it makes are too noticeable and everything I do echoes slightly. Put music on and it felt like admitting something.

Texted three people to make plans for next week. That's the practical response and I've done it and I still have this evening to get through.

I think the useful thing is just to say: this is loneliness, it's a normal amount of it, it's specific to this week and not a verdict on anything.`,
  },
  {
    dayOffset: 69,
    hour: 19,
    mood: 3,
    title: "Starting this again",
    tags: ["Hesitant", "Curious", "Hopeful"],
    summary:
      "Maya's first entry after a long gap. She sets a low bar deliberately.",
    content: `Third attempt at keeping a journal. The last one lasted eleven days and the one before that lasted four.

I know why they failed. Both times I decided entries had to be substantial — some insight, some conclusion, a shape. So on any day where I didn't have one I skipped, and after three skips the whole thing was over.

So: no bar this time. If a day is "ran, tired, nothing to report", that's the entry. Nobody's reading it.

The thing I actually want is a record. I have almost no reliable memory of last year. I could tell you two or three events and otherwise it's just texture. That bothers me more than I expected it to.

Ran four miles today. Tired. Nothing else to report.`,
  },
];

/**
 * Filler material for older days. Combined into short, coherent entries so the
 * word counts, streak and mood chart have real mass without 100 duplicate
 * paragraphs sitting in the journal list.
 */
export const FILLER = {
  openers: {
    high: [
      "Good day, start to finish.",
      "One of those days where everything took slightly less effort than expected.",
      "Woke up before the alarm and didn't resent it.",
      "Nothing dramatic, just an easy one.",
      "Ended the day with more energy than I started it with.",
    ],
    mid: [
      "An ordinary Tuesday-shaped day, whatever the actual day was.",
      "Fine. Not much to report.",
      "Slow start, decent middle, tired end.",
      "One of those days that's over before you've decided what it was.",
      "Steady. Nothing much moved either way.",
    ],
    low: [
      "Heavy day.",
      "Didn't have much in the tank today.",
      "A grinding sort of day.",
      "Everything took more out of me than it should have.",
      "Off from the moment I woke up.",
    ],
  },
  work: [
    "Spent most of the morning in the settings spec, which is finally starting to hold together. The structure was the problem all along — once I split the permissions section out, the rest of it fell into place in about forty minutes. I've been treating it as a writing problem when it was an ordering problem.",
    "Two hours of meetings that could comfortably have been a document, and then a genuinely decent afternoon. I've started blocking the two-to-five window and defending it, which felt rude for about a week and now just feels like the only reason anything gets finished.",
    "Paired with Rahul on the migration for most of the afternoon. Faster with two people, obviously, but the real gain is that neither of us gets to quietly skip the part we don't understand. He caught something in the rollback path I'd have shipped without noticing.",
    "Cleared the review backlog, which had got genuinely embarrassing — eleven open, the oldest from a fortnight ago. Most of them took under five minutes. I don't know why I let that pile up when the cost of clearing it is so obviously low.",
    "Did the boring careful version of the work instead of the clever version. Wrote out the cases on paper first, checked each one, no shortcuts. Slower today and I'm fairly sure it saves me a week in October.",
    "Got stuck on the empty state again. Third attempt and it's still not right — it either patronises people or tells them nothing. Left it and moved to the error copy, which came out fine, so at least the day wasn't a loss.",
    "Wrote up the research notes properly rather than leaving them in my head where they've been decaying since June. Six interviews, and reading them together there's a pattern none of the individual sessions made obvious.",
    "Standup, then four uninterrupted hours, which is the whole trick and which happens maybe twice a week. Got the whole flow rebuilt in that block. Everything else today was noise around it.",
    "Spent the morning on estimates, which I am reliably terrible at. Doubled every number on principle and it still feels optimistic. At some point I should go back and check how wrong the last quarter's were.",
  ],
  body: [
    "Five miles along the canal, comfortable throughout, which is a sentence I could not have written in June. Kept the pace easy on purpose. The plan says most of the mileage should feel like this and I only recently started believing it.",
    "Rest day. Stretched, badly, for about ten minutes and felt virtuous out of all proportion. Legs needed it after the weekend — there's a specific soreness in the hips now that I'm learning to read as a signal rather than a complaint.",
    "Intervals, which I dread beforehand and feel disproportionately good about afterwards. Eight by four hundred with short recoveries. The fourth one is always the worst and after that something switches off and it just becomes work.",
    "Short run before work, legs still heavy from the weekend. Three miles, slow, mostly just to keep the habit intact rather than to gain anything. Some days the run is only about not skipping the run.",
    "Skipped the run and walked for an hour instead, out past the reservoir and back. Counting it. A month ago I'd have logged that as a failure and then felt bad enough to skip the next one too.",
    "Long run, slower than planned, and I've genuinely stopped caring about that. Eight miles with a long walk break at the halfway point. The plan says time on feet is the point at this stage.",
    "Slept nearly nine hours and it showed in absolutely everything — the run, the work, my patience in the afternoon meeting. I keep re-discovering that sleep is upstream of every other thing I'm trying to fix.",
  ],
  life: [
    "Portuguese for half an hour before bed. Vocabulary is sticking noticeably better than grammar, which everyone says is normal and which still frustrates me. I can recognise far more than I can produce.",
    "Called Ma. She's fine, the neighbours are not, and I now know a great deal about a dispute over a boundary wall. Twenty-five minutes and she did most of it. That's usually how they go and I've stopped minding.",
    "Read for an hour with the phone in the other room. The phone in the other room is the entire mechanism; there is nothing else to it. I keep presenting this to myself as a discovery.",
    "Cooked something properly for the first time in days rather than assembling whatever was nearest. It takes forty minutes and I feel better for the rest of the evening, and I still treat it as optional when I'm tired.",
    "Pottery. Made something that will almost certainly not survive the kiln and enjoyed every minute regardless. Ravi says the wobble is a centring problem and not a hands problem, which I'm choosing to find encouraging.",
    "Tidied the flat thoroughly, which I only ever do when I'm avoiding something else. The flat is immaculate. The thing I was avoiding remains exactly where it was this morning.",
    "Long bath, early night, no screens after nine. Deliberate, not virtuous — I could feel the week accumulating and wanted to get ahead of it rather than arriving at Friday already depleted.",
    "Coffee with Tom, and mostly we talked about his week, which was a relief. He's dealing with considerably more than I am and doing it with much less commentary. Good to be reminded my problems are small ones.",
  ],
  reflections: {
    high: [
      "What I notice about days like this is that nothing special produced them. I slept, I moved, I saw someone I like. The inputs are embarrassingly simple and I still act surprised when they work.",
      "Writing this down partly as evidence. On the bad days I'm completely convinced this is not how things generally are, and it would help to have a record saying otherwise.",
      "There's a version of me that would treat a day like this as a baseline to defend and get anxious about losing. Trying not to do that. It was a good day and it doesn't have to be the start of anything.",
    ],
    mid: [
      "Nothing to solve here, which is worth saying. Most days are like this and I think I've spent years treating the ordinary ones as filler between the significant ones.",
      "The habit is the point on days like today. There's no insight in this entry and there doesn't need to be — the last two attempts at journalling died precisely because I decided every entry had to earn its place.",
      "Steady is fine. I keep having to relearn that a day with no story in it is not the same as a day that went badly.",
    ],
    low: [
      "Trying not to build a theory out of one bad day. The pattern I fall into is treating the low ones as new information about my baseline, and looking back through this, that has been wrong every single time.",
      "It'll probably lift by Thursday. It usually does. That's not much comfort tonight but it is at least the historical record, and the historical record is more reliable than my read on it right now.",
      "Putting it here mostly so it's somewhere other than in my head, where it just circles. That seems to be about eighty percent of what this journal is for.",
    ],
  },
  closers: {
    high: [
      "Want more days like this.",
      "Noting it so I remember it happened.",
      "Good. Straightforwardly good.",
      "Going to bed pleased.",
    ],
    mid: [
      "That's the whole day.",
      "Nothing to solve here.",
      "Fine. On to tomorrow.",
      "Writing it down mostly to keep the habit.",
    ],
    low: [
      "Early night and try again.",
      "Not going to draw conclusions from one bad day.",
      "It'll pass. It usually does by Thursday.",
      "Just needed to put it somewhere.",
    ],
  },
};

/** One-line summaries for filler entries, keyed by mood band. */
export const FILLER_SUMMARIES = {
  high: [
    "A straightforwardly good day across work, training and rest.",
    "An easy, high-energy day that Maya wants on record.",
    "Things went well without much effort; a day worth remembering.",
  ],
  mid: [
    "An ordinary day of steady work and routine training.",
    "A neutral day with nothing significant either way.",
    "Routine day; Maya keeps the habit going rather than reporting anything.",
  ],
  low: [
    "A heavy, low-energy day that Maya records without trying to solve.",
    "A difficult day; Maya notes it and resists drawing conclusions.",
    "Low mood and low capacity, logged plainly.",
  ],
};

/** Goal set. Categories map to the system-seeded rows for user 0. */
export const GOALS = [
  {
    title: "Run the half marathon",
    description:
      "Twelve-week plan, race is in November. The point is finishing, not the time.",
    category: "Health",
    parent: "Get properly fit",
    current: 10,
    target: 13.1,
    unit: "miles",
    pinned: true,
    targetDate: "+90",
    logs: [
      {
        value: 4,
        description: "Week one done. Gentle on purpose.",
        dayOffset: 62,
      },
      {
        value: 6,
        description: "Six miles before work, felt strong.",
        dayOffset: 45,
      },
      {
        value: 8,
        description: "Eight along the river. Walked once on the hill.",
        dayOffset: 24,
      },
      {
        value: 9,
        description: "Nine miles, hot day, harder than it should have been.",
        dayOffset: 13,
      },
      {
        value: 10,
        description: "Ten miles. Longest ever. Legs destroyed.",
        dayOffset: 2,
      },
    ],
  },
  {
    title: "Sleep seven hours",
    description:
      "Averaged across the week, not per night. Phone out of the bedroom.",
    category: "Health",
    parent: "Get properly fit",
    current: 42,
    target: 70,
    unit: "nights",
    pinned: true,
    targetDate: "+40",
  },
  {
    title: "Ship the onboarding redesign",
    description:
      "Four months of work. Target was a four point lift in first-session completion.",
    category: "Work",
    current: 1,
    target: 1,
    unit: "launch",
    completed: true,
    completedDayOffset: 23,
  },
  {
    title: "Speak at the team review",
    description:
      "The quarterly design review. The actual goal is doing it without three weeks of dread.",
    category: "Work",
    current: 1,
    target: 1,
    unit: "talk",
    completed: true,
    completedDayOffset: 0,
  },
  {
    title: "Write the settings spec",
    description:
      "Sitting at eighty percent since June, which is where documents go to die.",
    category: "Work",
    current: 8,
    target: 12,
    unit: "sections",
    targetDate: "+21",
  },
  {
    title: "Portuguese conversation",
    description: "Weekly exchange with Beatriz. Forty minutes, no English.",
    category: "Personal Growth",
    parent: "Learn Portuguese",
    current: 11,
    target: 20,
    unit: "sessions",
    pinned: true,
    targetDate: "+70",
  },
  {
    title: "Nine hundred words of vocabulary",
    description: "Reviewed daily. Recognition, not recall — that comes later.",
    category: "Personal Growth",
    parent: "Learn Portuguese",
    current: 640,
    target: 900,
    unit: "words",
    targetDate: "+60",
  },
  {
    title: "Weekly therapy",
    description: "Every Thursday. Missed two in twelve weeks, both for travel.",
    category: "Personal Growth",
    current: 9,
    target: 12,
    unit: "sessions",
    targetDate: "+21",
  },
  {
    title: "Six months of expenses saved",
    description: "Automatic transfer on payday so it stops being a decision.",
    category: "Finance",
    current: 4,
    target: 6,
    unit: "months",
    targetDate: "+150",
  },
  {
    title: "Cancel unused subscriptions",
    description:
      "Found two I had been paying since 2024 and used exactly zero times.",
    category: "Finance",
    current: 1,
    target: 1,
    unit: "audit",
    completed: true,
    completedDayOffset: 25,
  },
  {
    title: "Read twenty books",
    description:
      "The rule that actually made this work: phone stays in the other room.",
    category: "Leisure",
    current: 13,
    target: 20,
    unit: "books",
    targetDate: "+130",
  },
  {
    title: "Finish the pottery course",
    description:
      "Ten weeks. Centred the clay in week four, which felt like the hard part.",
    category: "Leisure",
    current: 4,
    target: 10,
    unit: "classes",
    targetDate: "+42",
  },
  {
    title: "Host dinner at the flat",
    description:
      "Put off for a year because the flat is small. It was small and it was fine.",
    category: "Leisure",
    current: 1,
    target: 1,
    unit: "dinner",
    completed: true,
    completedDayOffset: 36,
  },
];

/**
 * Chat history. The first conversation is the one photographed; the rest exist
 * to fill the sidebar so it doesn't look like a fresh install.
 *
 * Write these as PLAIN PROSE. ChatBubble renders {message.text} straight into a
 * <p> (ChatBubble.tsx:186) - there is no markdown renderer in the project and
 * no whitespace-pre-wrap - so asterisks, hashes and numbered lists appear
 * literally, and newlines collapse into one run-on block. Long answers are
 * split across consecutive bubbles instead of using paragraph breaks.
 */
export const CHATS = [
  {
    title: "What was I anxious about this summer?",
    dayOffset: 1,
    messages: [
      {
        sender: "user",
        content:
          "Looking back over the last few months, what was I actually anxious about?",
      },
      {
        sender: "ai",
        content: `Reading back through your entries, the anxiety clusters around **being perceived**, not around the work itself. Three shapes recur:

1. **Presenting and speaking.** The quarterly review appears in nine entries across three weeks.
2. **Being found out.** After the three-day debugging entry you called the bug "a small hole in the wall", with the real fear behind it.
3. **Saying no.** You framed one yes as insurance rather than generosity.

What you wrote at 4am gets closest: the fear wasn't the material, it was that *twenty people would look at you for eighteen minutes* and you'd be visible in a way you couldn't manage.`,
      },
      {
        sender: "user",
        content: "Is that getting better or am I just having a good week?",
      },
      {
        sender: "ai",
        content: `Both, but the trend predates this week.

Your average mood over the last three weeks is about a point higher than the first three, and the low days are shorter. Seven weeks ago you described a bad day as feeling like a new baseline; the recent one you noted *lasted about thirty hours*.

> The clearer signal is what you do with the bad days now. The earlier entries hunt for a cause. The recent ones say it was one Thursday in August and you slept badly, then stop.

One thing hasn't shifted: the pattern where you say yes before you've decided. That's unchanged since May.`,
      },
    ],
    followUps: [
      "What did I say about my dad this summer?",
      "When was I happiest?",
      "Show me every entry about running",
    ],
  },
  { title: "Summarise my week", dayOffset: 3 },
  { title: "Patterns in my sleep and mood", dayOffset: 9 },
  { title: "Help me plan the race week", dayOffset: 16 },
  { title: "What do I keep avoiding?", dayOffset: 28 },
];

/**
 * Short titles for filler entries. The opener sentences read badly as titles -
 * the journal list and the dashboard's Recent Entries cards both show the title
 * as a bold heading, and a full sentence there looks like a bug. Real journal
 * titles are short and a bit throwaway, so these are too.
 */
export const FILLER_TITLES = {
  high: [
    "A good one",
    "Easy day",
    "Everything worked",
    "Light week so far",
    "Bright and early",
    "Momentum",
    "Quietly pleased",
    "Clear head",
    "Nothing to fix",
    "Good Tuesday",
    "Ran well",
    "Slept, and it showed",
    "Warm evening",
    "Full but good",
    "This is the level",
  ],
  mid: [
    "Ordinary",
    "Nothing much",
    "Middling",
    "A Wednesday",
    "Steady",
    "Fine, mostly",
    "Ticking along",
    "No news",
    "Slow start",
    "Flat but fine",
    "Keeping the habit",
    "Long meeting day",
    "Half a day of focus",
    "Uneventful",
    "In between things",
  ],
  low: [
    "Heavy",
    "Low tank",
    "Grinding",
    "Off today",
    "Not much left",
    "A hard one",
    "Tired through",
    "Flat",
    "Rough edges",
    "Depleted",
    "Bad Thursday",
    "Wearing thin",
    "Under it",
    "Slow and sore",
    "Not my day",
  ],
};
