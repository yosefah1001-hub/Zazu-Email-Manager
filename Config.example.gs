// ============================================================
// CONFIG - your details.
//
// SETUP: in your own Apps Script project, create a script file
// named "Config" and paste this whole file into it. Then replace
// everything below with your own details.
//
// Never commit your filled-in version to git.
// ============================================================

// Your work email, lowercase.
const ME = 'you@yourcompany.com';

// Your first name, lowercase. Used to detect when someone
// mentions you by name in a thread you are only CC'd on.
const MY_NAME = 'yourfirstname';

// Your timezone, for the date in the brief.
// Examples: 'Asia/Dubai', 'Europe/Madrid', 'America/New_York'
const TIMEZONE = 'Asia/Dubai';

// Subject prefix on the daily brief. Also stops the agent from
// classifying its own briefs.
const DIGEST_TAG = 'Zazu Brief';

// ============================================================
// YOUR CATEGORIES
//
// One per client, project, or area of work. This is the main
// thing you customize. Keep it under about 10, and make them
// things you would actually file mail under.
//
// The order here is the order sections appear in your brief.
// The LAST entry is used as the catch-all for automated mail,
// so keep something like Admin-Noise at the end.
//
// After editing this list, run setup() to create the labels.
// ============================================================

const PROGRAM_ORDER = [
  'Client-A',
  'Client-B',
  'Project-X',
  'Internal',
  'Inbound',
  'Admin-Noise'
];

// ============================================================
// AUTOMATED SENDERS
//
// Mail from these never counts as needing you. Partial matches,
// so 'noreply' catches noreply@anything.com.
//
// Add the automated senders that clutter your own inbox.
// ============================================================

const AUTOMATED = [
  'drive-shares-dm-noreply@google.com',
  'gemini-notes@google.com',
  'calendar-notification@google.com',
  'noreply',
  'no-reply',
  'donotreply',
  'mailer-daemon'
];

// ============================================================
// WHO YOU ARE
//
// The agent reads this before classifying and before drafting.
// Write it as if briefing a new assistant on their first day.
//
// Include: your role, your clients and projects, who the key
// people are on each, and any rule that is not obvious. For
// example, if mail about one project usually arrives from a
// partner organization's domain, say so, or it will get filed
// under the partner instead of the project.
//
// This is the highest-leverage thing in this file. Spend
// twenty minutes on it.
// ============================================================

const CONTEXT = `
[Your name] is [your role] at [your company], which does [what
the company does]. They work in [language] across [locations].

WHAT THEY RUN

[Project or client name]. [One line on what it is and who the
client is.] Client side: [names and email domains]. Your side:
[colleagues and what they handle].

[Second project.] [Same structure.]

[Third project.] [Same structure.]

[Any cross-cutting rules. For example: "Mail about Project X
often comes from @partner.com addresses. It is still Project-X,
not Partner."]

INTERNAL

[Your manager or closest counterpart, and what it means when
they are on a thread.] [Finance, HR, or ops contacts.]
`;

// ============================================================
// WHAT COUNTS AS NEEDING YOU
//
// The rule that decides what reaches you each morning. Start
// with this and adjust after a few days of watching it.
//
// Be concrete. "Important emails" is useless. "A client asking
// a question only I can answer" is usable.
// ============================================================

const NEEDS_ME_RULES = `
Answer yes only if the thread contains a request, question,
decision, or deliverable that the user themselves owes. Being
mentioned is not being asked. Being kept informed is not being
asked.

Yes:
- A direct question or request to them, whether in To or Cc
- A decision addressed to them and their counterpart jointly
- Something they must review, approve, send, or attend to
- A client waiting on an answer only they can give
- Anything about an invoice, payment, or contract they own

No:
- Weekly updates and status reports where they are Cc'd
- Meeting recaps circulated for the record
- Threads between their team members that they are copied on
- Mass invitations and reminders sent to many recipients
- Mail where their name appears but no action attaches to them
`;

// ============================================================
// HOW YOU WRITE
//
// Paste two or three real emails you have sent. Not your best
// ones, your typical ones. The agent copies the register, so
// short blunt examples produce short blunt drafts.
//
// Then list the things you never want to see in a draft.
// ============================================================

const VOICE = `
[One or two lines describing your register. For example:
"Short. Two or three sentences. Leads with the answer, gives
the reason in one clause, stops."]

Real examples:

"[Paste a real short email you sent.]"

"[Paste another.]"

"[And a third, ideally to a client rather than a colleague.]"

RULES

[US or British] English.
No em dashes.
No corporate filler. Nothing circles back, touches base, or
leverages. No "I hope this email finds you well."
No inflated significance.
No signposting. Do not announce what the email is about to do.
Simple verbs. Use "is", not "serves as".
Do not thank people for their patience or their time unless
you actually owe them thanks for something specific.

[Add your own. Anything you find yourself deleting from drafts
belongs here.]
`;

// Sign-off on every draft. Your Gmail signature is appended
// automatically after this, so do not repeat it here.
const SIGNOFF = 'Best,\n[Your name]';
