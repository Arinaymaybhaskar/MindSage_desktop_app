// The People section: settings, the background extraction queue, and the
// IPC handlers behind the People list, person page, "Someone new?" inbox and
// the names marked inside an entry. The plan is docs/PEOPLE.md.
//
// The AI only suggests. Code checks every claim (electron/people/*), and
// anything new waits for the user's yes in the inbox. Extraction never makes
// saving slower: it runs after the entry is saved, one job at a time, after
// the entry's own title and mood.

import Store from "electron-store";
import { BrowserWindow, powerMonitor } from "electron";
import { eventBus } from "../eventBus.js";
import { generate, modelName } from "../ai/client.js";
import { currentUserId } from "../session.js";
import { log } from "../log.js";
import * as peopleDb from "../db/people.js";
import {
  containsName,
  contentHash,
  normaliseName,
  sentenceRuns,
  shouldExtract,
  splitSentences,
} from "../people/text.js";
import {
  buildAliasIndex,
  displayNameFor,
  RELATIONSHIPS,
  resolveName,
  sameAsCandidates,
} from "../people/identity.js";
import {
  buildExtractionPrompt,
  buildFeelingPrompt,
  EXTRACTION_SCHEMA,
  EXTRACTOR_VERSION,
  FEELING_SCHEMA,
  FEELINGS,
  feelingExcerpt,
  groundExtraction,
  needsFeelingPass,
  parseFeeling,
} from "../people/extract.js";
import {
  buildSummaryPrompt,
  feelingTrend,
  groundSummary,
  liveSummaryLines,
  mentionsHash,
  SUMMARY_SCHEMA,
} from "../people/insights.js";

/** A suggestion reaches the inbox after this many entries mention it. */
export const INBOX_MIN_ENTRIES = 2;
const MAX_ATTEMPTS = 3;
const MIN_CONFIDENCE = 0.3;
/** How long a new entry's People job waits for its title and mood. */
const METADATA_WAIT_MS = 3 * 60 * 1000;
const OLLAMA_TIMEOUT_MS = 120 * 1000;

// ---------- Settings ----------

/**
 * Per-user switches. People is off until the user turns it on, and the
 * backfill can be paused. Kept in electron-store rather than the database so
 * turning People off and deleting its data leaves nothing derived behind.
 */
const settings = new Store({
  name: "people-settings",
  defaults: { users: {} },
});

function userSettings(userId) {
  return { enabled: false, paused: false, ...settings.get(`users.${userId}`) };
}

function setUserSettings(userId, patch) {
  settings.set(`users.${userId}`, { ...userSettings(userId), ...patch });
}

function requireUser() {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  return userId;
}

function requireEnabled() {
  const userId = requireUser();
  if (!userSettings(userId).enabled) throw new Error("People is turned off");
  return userId;
}

function ownPerson(userId, personId) {
  const person = peopleDb.getPerson(userId, Number(personId));
  if (!person) throw new Error("Person not found");
  return person;
}

/** Tells every window that People data changed, so open pages refresh. */
function broadcastChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("people:changed");
  }
}

// ---------- AI ----------

/**
 * One structured-output call. The JSON schema becomes a grammar, so the
 * answer always parses into the right shape; the grounding checks then
 * decide whether what it says is true.
 */
async function aiJson(prompt, schema, numPredict) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    return await generate(prompt, {
      schema,
      temperature: 0,
      maxTokens: numPredict,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Queue ----------

let running = false;
let wakeTimer = null;
const backfilledThisSession = new Set();
let resetDone = false;

function kick(delay = 0) {
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => {
    runQueue().catch((err) => log.error("[people] queue error:", err));
  }, delay);
}

function onBattery() {
  try {
    return powerMonitor.isOnBatteryPower();
  } catch {
    return false;
  }
}

function jobAgeMs(job) {
  const t = Date.parse(`${String(job.updated_at).replace(" ", "T")}Z`);
  return Number.isFinite(t) ? Date.now() - t : Infinity;
}

/**
 * Queues every entry without an up-to-date result, once per session per
 * user. Picks up imports, restored backups (an older one without the People
 * tables included) and extractor upgrades.
 */
function ensureBackfill(userId) {
  if (backfilledThisSession.has(userId)) return;
  backfilledThisSession.add(userId);
  peopleDb.enqueueBackfill(userId, EXTRACTOR_VERSION, contentHash);
}

async function runQueue() {
  if (running) return;
  running = true;
  try {
    if (!resetDone) {
      // Jobs left "running" by a quit or crash go back in the queue. All
      // writes for one entry are one transaction, so nothing is half done.
      peopleDb.resetRunningJobs();
      resetDone = true;
    }
    for (;;) {
      const userId = currentUserId();
      if (!userId) return;
      const prefs = userSettings(userId);
      if (!prefs.enabled) return;

      ensureBackfill(userId);

      // New and edited entries always run; the backfill of older entries
      // waits while paused or on battery power.
      const includeBackfill = !prefs.paused && !onBattery();
      const job = peopleDb.nextJob(userId, { includeBackfill });
      if (!job) return;

      const entry = peopleDb.getEntryForJob(userId, job.entry_id);
      if (!entry || entry.is_deleted) {
        peopleDb.setJobStatus(job.entry_id, "skipped");
        continue;
      }
      // Title and mood run first, People after.
      if (
        entry.ai_metadata_status === "pending" &&
        job.priority > 0 &&
        jobAgeMs(job) < METADATA_WAIT_MS
      ) {
        kick(10_000);
        return;
      }

      peopleDb.setJobStatus(job.entry_id, "running");
      try {
        await processEntry(userId, entry);
      } catch (err) {
        const attempts = job.attempts + 1;
        const message = err?.message || String(err);
        log.error(`[people] entry ${entry.id} failed:`, message);
        if (attempts >= MAX_ATTEMPTS) {
          peopleDb.setJobStatus(job.entry_id, "failed", {
            attempts,
            lastError: message,
          });
        } else {
          peopleDb.setJobStatus(job.entry_id, "queued", {
            attempts,
            lastError: message,
          });
          // Growing waits: 10s, 40s.
          kick(10_000 * 4 ** (attempts - 1));
          broadcastChanged();
          return;
        }
      }
      broadcastChanged();
    }
  } finally {
    running = false;
  }
}

/**
 * Keeps a user-verified mention if its name still appears after an edit,
 * re-anchored to the sentence that now holds it. Returns whether it stayed.
 */
function reanchorVerified(mention, sentences) {
  const hits = sentences.filter((s) =>
    containsName(s.text, mention.name_as_written),
  );
  if (!hits.length) {
    peopleDb.deleteMention(mention.id);
    return false;
  }
  peopleDb.updateMention(mention.id, {
    sentence_start: hits[0].start,
    sentence_end: hits[0].end,
  });
  return true;
}

async function processEntry(userId, entry) {
  const text = entry.content ?? "";
  const hash = contentHash(text);
  const sentences = splitSentences(text);
  const known = peopleDb.knownPeople(userId);
  const ignored = peopleDb.ignoredAliases(userId);

  let found = [];
  if (shouldExtract(text, peopleDb.trackedAliases(userId))) {
    const raw = await aiJson(
      buildExtractionPrompt({ sentences, knownPeople: known, ignored }),
      EXTRACTION_SCHEMA,
      400,
    );
    found = groundExtraction(raw, {
      text,
      sentences,
      knownPeople: known,
      ignored,
    }).filter((f) => f.confidence >= MIN_CONFIDENCE);

    // "Fought with Mom, Dad cheered me up": judge each person on their own
    // lines when one entry pulls in different directions.
    if (needsFeelingPass(found)) {
      for (const f of found) {
        try {
          const second = parseFeeling(
            await aiJson(
              buildFeelingPrompt(
                f.nameAsWritten,
                feelingExcerpt(sentences, f.sentences),
              ),
              FEELING_SCHEMA,
              80,
            ),
          );
          if (second) Object.assign(f, second);
        } catch (err) {
          log.warn("[people] feeling pass failed:", err?.message);
        }
      }
    }
  }

  // The user may have edited the entry while the model was thinking. The
  // edit queued a fresh job; this result is for old text, so drop it.
  const fresh = peopleDb.getEntryForJob(userId, entry.id);
  if (!fresh || fresh.is_deleted || contentHash(fresh.content) !== hash) return;

  peopleDb.runInTransaction(() => {
    const keptVerified = peopleDb
      .verifiedMentions(entry.id)
      .filter((m) => reanchorVerified(m, sentences));
    const verifiedPeople = new Set(keptVerified.map((m) => m.person_id));
    peopleDb.deleteUnverifiedMentions(entry.id);

    let index = buildAliasIndex(peopleDb.aliasIndexRows(userId));
    for (const f of found) {
      let personId = f.knownId;
      if (!personId) {
        const r = resolveName(f.nameAsWritten, index);
        if (r.kind === "ignored") continue;
        if (r.kind === "confirmed" || r.kind === "suggested")
          personId = r.personId;
        else if (r.kind === "ambiguous" && r.suggestedId)
          personId = r.suggestedId;
        else {
          personId = peopleDb.createPerson(userId, {
            displayName: displayNameFor(f.nameAsWritten),
            status: "suggested",
            relationshipSuggested: f.relationship,
          });
          peopleDb.addAlias(personId, f.nameAsWritten, "ai");
          index = buildAliasIndex(peopleDb.aliasIndexRows(userId));
        }
      }
      if (verifiedPeople.has(personId)) continue;

      const person = peopleDb.getPerson(userId, personId);
      if (!person) continue;
      if (f.relationship && !person.relationship_suggested) {
        peopleDb.updatePerson(userId, personId, {
          relationship_suggested: f.relationship,
        });
      }
      for (const run of sentenceRuns(sentences, f.sentences)) {
        peopleDb.insertMention({
          entry_id: entry.id,
          person_id: personId,
          name_as_written: f.nameAsWritten,
          sentence_start: run.start,
          sentence_end: run.end,
          valence: f.valence,
          feeling_tags: JSON.stringify(f.feelings),
          confidence: f.confidence,
          extractor_version: EXTRACTOR_VERSION,
        });
      }
    }
    peopleDb.pruneEmptySuggestions(userId);
    peopleDb.setJobStatus(entry.id, found.length ? "done" : "skipped");
  });
}

function queueEntry(userId, entry) {
  if (!userId || !entry?.id || !userSettings(userId).enabled) return;
  const queued = peopleDb.enqueueJob(
    userId,
    entry.id,
    contentHash(entry.content ?? ""),
    EXTRACTOR_VERSION,
    1,
  );
  // A short delay lets the title and mood calls reach Ollama first.
  if (queued) kick(5_000);
}

eventBus.on("journal:created", ({ userId, entry }) => {
  try {
    queueEntry(userId ?? entry?.user_id, entry);
  } catch (err) {
    log.error("[people] could not queue a new entry:", err);
  }
});

eventBus.on("journal:edited", ({ userId, entry }) => {
  try {
    queueEntry(userId ?? entry?.user_id, entry);
  } catch (err) {
    log.error("[people] could not queue an edited entry:", err);
  }
});

/**
 * Takes a name off a person after a fix, unless it is the name they are
 * shown by: that one stays, so their own name keeps finding them.
 */
function dropAliasIfSafe(userId, personId, alias) {
  const person = peopleDb.getPerson(userId, personId);
  if (!person) return;
  if (normaliseName(alias) === normaliseName(person.display_name)) return;
  peopleDb.removeAlias(userId, personId, alias);
}

// ---------- Shaping rows for the renderer ----------

function quoteOf(content, start, end) {
  const text = String(content ?? "");
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return text.slice(s, e).trim();
}

function parseTags(json) {
  try {
    const tags = JSON.parse(json ?? "[]");
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
}

function trendFor(userId, personId) {
  return feelingTrend(peopleDb.mentionsForPerson(userId, personId));
}

function personCard(userId, p) {
  return {
    id: p.id,
    displayName: p.display_name,
    relationship: p.relationship,
    relationshipSuggested: p.relationship_suggested,
    status: p.status,
    aliases: p.aliases,
    mentionCount: p.mention_count ?? 0,
    lastMentionedAt: p.last_mentioned_at ?? null,
    trend: trendFor(userId, p.id),
  };
}

// ---------- IPC handlers ----------

export function handleGetStatus() {
  const userId = requireUser();
  const prefs = userSettings(userId);
  if (!prefs.enabled) {
    return { ...prefs, onBattery: onBattery(), counts: null, inboxCount: 0 };
  }
  ensureBackfill(userId);
  kick();
  const inbox = peopleDb.inboxSuggestions(userId, INBOX_MIN_ENTRIES).length;
  return {
    ...prefs,
    onBattery: onBattery(),
    counts: peopleDb.jobCounts(userId),
    inboxCount: inbox + sameAsQuestions(userId).length,
  };
}

export function handleSetEnabled(_e, enabled, options = {}) {
  const userId = requireUser();
  setUserSettings(userId, { enabled: !!enabled });
  if (!enabled && options.deleteData) peopleDb.deleteAllPeopleData(userId);
  if (enabled) {
    backfilledThisSession.delete(userId);
    kick();
  }
  broadcastChanged();
  return handleGetStatus();
}

export function handleSetPaused(_e, paused) {
  const userId = requireEnabled();
  setUserSettings(userId, { paused: !!paused });
  if (!paused) kick();
  return handleGetStatus();
}

export function handleRetryFailed() {
  const userId = requireEnabled();
  const n = peopleDb.requeueFailed(userId);
  kick();
  return { requeued: n };
}

export function handleListPeople() {
  const userId = requireEnabled();
  return peopleDb
    .listPeople(userId, "confirmed")
    .map((p) => personCard(userId, p));
}

export function handleGetPerson(_e, personId) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  if (person.status === "ignored") throw new Error("Person not found");
  const rows = peopleDb.mentionsForPerson(userId, person.id);
  const byEntry = new Map();
  for (const r of rows) {
    if (!byEntry.has(r.entry_id)) {
      byEntry.set(r.entry_id, {
        entryId: r.entry_id,
        title: r.title,
        createdAt: r.created_at,
        mentions: [],
      });
    }
    byEntry.get(r.entry_id).mentions.push({
      id: r.id,
      quote: quoteOf(r.content, r.sentence_start, r.sentence_end),
      nameAsWritten: r.name_as_written,
      valence: r.valence,
      feelings: parseTags(r.feeling_tags),
      userVerified: !!r.user_verified,
    });
  }
  const cached = peopleDb.getSummary(person.id);
  const hash = mentionsHash(rows);
  let summary = null;
  // Below two live entries no summary is shown or regenerated, so the cached
  // one (drawn from an entry now in the Trash) goes.
  if (cached && byEntry.size < 2) peopleDb.deleteSummary(person.id);
  else if (cached) {
    try {
      summary = {
        lines: liveSummaryLines(
          JSON.parse(cached.summary_json),
          new Set(byEntry.keys()),
        ),
        stale: cached.mentions_hash !== hash,
        createdAt: cached.created_at,
      };
    } catch {
      summary = null;
    }
  }
  const monthly = new Map();
  for (const e of byEntry.values()) {
    const month = String(e.createdAt).slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + 1);
  }
  return {
    ...personCard(userId, {
      ...person,
      mention_count: byEntry.size,
      last_mentioned_at: rows[0]?.created_at ?? null,
    }),
    entries: [...byEntry.values()],
    mentionsByMonth: [...monthly.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    summary,
  };
}

/**
 * Makes the "What you've written" summary, only when asked and only if the
 * mentions changed since the last one.
 */
export async function handleSummarize(_e, personId) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  const rows = peopleDb.mentionsForPerson(userId, person.id);
  if (new Set(rows.map((r) => r.entry_id)).size < 2) {
    peopleDb.deleteSummary(person.id);
    return { lines: [], stale: false };
  }
  const hash = mentionsHash(rows);
  const cached = peopleDb.getSummary(person.id);
  if (cached && cached.mentions_hash === hash) {
    return { lines: JSON.parse(cached.summary_json), stale: false };
  }

  // Most recent first, one excerpt per entry, capped so the prompt stays
  // small on an 8 GB laptop.
  const seen = new Set();
  const excerpts = [];
  for (const r of rows) {
    if (seen.has(r.entry_id)) continue;
    seen.add(r.entry_id);
    excerpts.push({
      n: excerpts.length + 1,
      entryId: r.entry_id,
      date: r.created_at,
      text: quoteOf(r.content, r.sentence_start, r.sentence_end).slice(0, 400),
    });
    if (excerpts.length >= 30) break;
  }
  excerpts.reverse().forEach((e, i) => (e.n = i + 1));

  const raw = await aiJson(
    buildSummaryPrompt(person.display_name, excerpts),
    SUMMARY_SCHEMA,
    350,
  );
  const lines = groundSummary(raw, excerpts);
  peopleDb.saveSummary(person.id, JSON.stringify(lines), hash, modelName());
  return { lines, stale: false };
}

function sameAsQuestions(userId) {
  const people = peopleDb.peopleForMatching(userId);
  const byId = new Map(people.map((p) => [p.id, p]));
  return sameAsCandidates(people)
    .map(({ suggestedId, confirmedId }) => ({
      suggested: byId.get(suggestedId),
      confirmed: byId.get(confirmedId),
    }))
    .filter((q) => q.suggested && q.confirmed);
}

export function handleGetInbox() {
  const userId = requireEnabled();
  const questions = sameAsQuestions(userId);
  const asked = new Set(questions.map((q) => q.suggested.id));
  const sampleQuote = (personId) => {
    const r = peopleDb.mentionsForPerson(userId, personId)[0];
    return r ? quoteOf(r.content, r.sentence_start, r.sentence_end) : "";
  };
  return {
    suggestions: peopleDb
      .inboxSuggestions(userId, INBOX_MIN_ENTRIES)
      .filter((p) => !asked.has(p.id))
      .map((p) => ({
        ...personCard(userId, p),
        sampleQuote: sampleQuote(p.id),
      })),
    sameAs: questions.map((q) => ({
      suggested: {
        ...personCard(userId, q.suggested),
        sampleQuote: sampleQuote(q.suggested.id),
      },
      confirmed: personCard(userId, q.confirmed),
    })),
  };
}

export function handleConfirmPerson(_e, personId, fields = {}) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  const patch = { status: "confirmed" };
  if (typeof fields.displayName === "string" && fields.displayName.trim())
    patch.display_name = fields.displayName.trim();
  if (fields.relationship !== undefined) {
    patch.relationship = RELATIONSHIPS.includes(fields.relationship)
      ? fields.relationship
      : null;
  }
  peopleDb.updatePerson(userId, person.id, patch);
  if (patch.display_name)
    peopleDb.addAlias(person.id, patch.display_name, "user");
  broadcastChanged();
  return { success: true };
}

/**
 * "Ignore" and "Stop tracking": the person's mentions and summary go, and
 * their names stay only as an ignore list so the AI stops suggesting them.
 */
export function handleIgnorePerson(_e, personId) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  peopleDb.runInTransaction(() => {
    // Mentions of trashed entries too, or a restore would bring them back.
    peopleDb.deleteAllMentionsOfPerson(userId, person.id);
    peopleDb.deleteSummary(person.id);
    peopleDb.updatePerson(userId, person.id, { status: "ignored" });
  });
  broadcastChanged();
  return { success: true };
}

export function handleDeletePerson(_e, personId, options = {}) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  if (options.ignoreName) return handleIgnorePerson(_e, person.id);
  peopleDb.deletePerson(userId, person.id);
  broadcastChanged();
  return { success: true };
}

export function handleUpdatePerson(_e, personId, fields = {}) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  const patch = {};
  if (typeof fields.displayName === "string" && fields.displayName.trim()) {
    patch.display_name = fields.displayName.trim();
  }
  if (fields.relationship !== undefined) {
    patch.relationship = RELATIONSHIPS.includes(fields.relationship)
      ? fields.relationship
      : null;
  }
  peopleDb.updatePerson(userId, person.id, patch);
  if (patch.display_name)
    peopleDb.addAlias(person.id, patch.display_name, "user");
  broadcastChanged();
  return { success: true };
}

export function handleAddAlias(_e, personId, alias) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  if (typeof alias !== "string" || !normaliseName(alias))
    throw new Error("Enter a name");
  peopleDb.addAlias(person.id, alias, "user");
  // A new nickname can find this person in entries already processed.
  backfilledThisSession.delete(userId);
  broadcastChanged();
  return { success: true };
}

export function handleRemoveAlias(_e, personId, alias) {
  const userId = requireEnabled();
  const person = ownPerson(userId, personId);
  if (person.aliases.length <= 1) throw new Error("A person needs one name");
  peopleDb.removeAlias(userId, person.id, alias);
  broadcastChanged();
  return { success: true };
}

/** Undo for merges, for this session only. */
const mergeUndo = new Map();

export function handleMergePeople(_e, keepId, mergeId) {
  const userId = requireEnabled();
  const keep = ownPerson(userId, keepId);
  const merge = ownPerson(userId, mergeId);
  if (keep.id === merge.id) throw new Error("Pick two different people");

  const keepAliases = new Set(keep.aliases.map(normaliseName));
  const movedMentions = peopleDb.allMentionIdsForPerson(userId, merge.id);
  peopleDb.runInTransaction(() => {
    for (const id of movedMentions)
      peopleDb.updateMention(id, { person_id: keep.id });
    for (const alias of merge.aliases)
      peopleDb.addAlias(keep.id, alias, "user");
    if (!keep.relationship && merge.relationship) {
      peopleDb.updatePerson(userId, keep.id, {
        relationship: merge.relationship,
      });
    }
    peopleDb.deletePerson(userId, merge.id);
  });

  const token = `${Date.now()}-${merge.id}`;
  mergeUndo.set(token, {
    userId,
    keepId: keep.id,
    merged: merge,
    movedMentions,
    addedAliases: merge.aliases.filter(
      (a) => !keepAliases.has(normaliseName(a)),
    ),
    keepRelationship: keep.relationship,
  });
  broadcastChanged();
  return { success: true, undoToken: token };
}

export function handleUndoMerge(_e, token) {
  const userId = requireEnabled();
  const snap = mergeUndo.get(token);
  if (!snap || snap.userId !== userId) throw new Error("Nothing to undo");
  mergeUndo.delete(token);
  peopleDb.runInTransaction(() => {
    const restoredId = peopleDb.createPerson(userId, {
      displayName: snap.merged.display_name,
      status: snap.merged.status,
      relationshipSuggested: snap.merged.relationship_suggested,
    });
    peopleDb.updatePerson(userId, restoredId, {
      relationship: snap.merged.relationship,
    });
    for (const alias of snap.merged.aliases)
      peopleDb.addAlias(restoredId, alias, "user");
    for (const alias of snap.addedAliases)
      peopleDb.removeAlias(userId, snap.keepId, alias);
    for (const id of snap.movedMentions)
      peopleDb.updateMention(id, { person_id: restoredId });
    peopleDb.updatePerson(userId, snap.keepId, {
      relationship: snap.keepRelationship,
    });
  });
  broadcastChanged();
  return { success: true };
}

export function handleGetEntryMentions(_e, entryId) {
  const userId = requireUser();
  if (!userSettings(userId).enabled) return { enabled: false, mentions: [] };
  return {
    enabled: true,
    mentions: peopleDb.mentionsForEntry(userId, Number(entryId)).map((m) => ({
      id: m.id,
      personId: m.person_id,
      displayName: m.display_name,
      status: m.status,
      relationship: m.relationship,
      nameAsWritten: m.name_as_written,
      start: m.sentence_start,
      end: m.sentence_end,
      valence: m.valence,
      feelings: parseTags(m.feeling_tags),
      userVerified: !!m.user_verified,
    })),
    people: peopleDb
      .listPeople(userId, "confirmed")
      .map((p) => ({ id: p.id, displayName: p.display_name })),
    feelings: FEELINGS,
  };
}

/**
 * Fixes from inside an entry. Every fix is stored and fed back into the next
 * prompt (aliases, the ignore list, verified feelings), which is how People
 * gets more accurate without any model training.
 */
export function handleFixMention(_e, mentionId, fix = {}) {
  const userId = requireEnabled();
  const mention = peopleDb.getMention(userId, Number(mentionId));
  if (!mention) throw new Error("Mention not found");

  peopleDb.runInTransaction(() => {
    switch (fix.action) {
      case "confirm":
        peopleDb.updateMention(mention.id, { user_verified: 1 });
        break;
      case "feeling": {
        const valence = Math.max(
          -2,
          Math.min(2, Math.round(Number(fix.valence))),
        );
        if (!Number.isFinite(valence)) throw new Error("Pick a feeling");
        peopleDb.updateMention(mention.id, { valence, user_verified: 1 });
        break;
      }
      case "reassign": {
        let targetId = fix.personId ? ownPerson(userId, fix.personId).id : null;
        if (!targetId) {
          const name = String(fix.newName ?? "").trim();
          if (!name) throw new Error("Enter a name");
          targetId = peopleDb.createPerson(userId, {
            displayName: name,
            status: "confirmed",
          });
          peopleDb.addAlias(targetId, name, "user");
        }
        // "Wrong person" splits this mention out and teaches the alias.
        peopleDb.updateMention(mention.id, {
          person_id: targetId,
          user_verified: 1,
        });
        peopleDb.addAlias(targetId, mention.name_as_written, "user");
        dropAliasIfSafe(userId, mention.person_id, mention.name_as_written);
        break;
      }
      case "not-person": {
        // The name joins the ignore list and its mentions go everywhere.
        const key = normaliseName(mention.name_as_written);
        peopleDb.deleteMentionsByName(userId, mention.person_id, key);
        const blockId = peopleDb.createPerson(userId, {
          displayName: displayNameFor(mention.name_as_written),
          status: "ignored",
        });
        peopleDb.addAlias(blockId, mention.name_as_written, "user");
        dropAliasIfSafe(userId, mention.person_id, mention.name_as_written);
        break;
      }
      default:
        throw new Error("Unknown fix");
    }
    peopleDb.pruneEmptySuggestions(userId);
  });
  broadcastChanged();
  return { success: true };
}
