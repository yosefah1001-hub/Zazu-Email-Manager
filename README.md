# Zazu

A Gmail triage agent that runs every morning. It reads your new mail, files
each thread under one of your own categories, drafts replies to the ones that
actually need you, and emails you a single brief.

It never sends, never deletes, and never marks anything read.

## What you get

Every morning, one email:

- **Needs you** — threads where someone is waiting on you, each with a summary
  and a draft already written and sitting in your Drafts folder. Each is marked
  either "ready to send" or "needs your input", with the blank called out.
- **Every other thread**, grouped by your categories, one line each on what
  happened. You can confirm nothing was missed without opening anything.
- **Waiting on them** — threads where you sent the last message and nobody has
  replied, sorted by how long it has been silent. This is the section that
  catches the invoice you chased in July and forgot about.

Your inbox also gets labelled, so `Zazu/State/Needs-Me` in the sidebar is your
morning queue.

## What it costs

An Anthropic API key with billing on it. Roughly two API calls per new thread.
For an inbox of 60 threads a week, expect a few dollars a month.

Nothing else. It runs on Google Apps Script, which is free and already part of
your Google account.

## Setup

About 30 minutes, most of it writing your config.

### 1. Get an Anthropic API key

Go to [console.anthropic.com](https://console.anthropic.com), sign in, then
**API Keys** → **Create Key**. Copy it somewhere, you cannot view it again
after closing the dialog. Add a payment method under Billing or the calls
will fail.

### 2. Create the Apps Script project

Make sure your browser is signed into the Google account whose inbox you want
to triage.

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Click the project name top left, rename it to **Zazu**
4. Click the **gear icon** (Project Settings) in the left sidebar
5. Set **Time zone** to yours

### 3. Store your API key

Still on Project Settings, scroll to **Script Properties**.

1. Click **Add script property**
2. Property: `ANTHROPIC_KEY`
3. Value: your key
4. **Save script properties**

The key lives here, not in the code, so the code stays safe to share.

### 4. Add the code

Click the **`<>` icon** (Editor) in the left sidebar.

**`Code.gs`** — select everything in the file, delete it, and paste in the
contents of `Code.gs` from this repo.

**`Config.gs`** — click the **+** next to "Files", choose **Script**, name it
`Config`. Delete the stub, and paste in the contents of `Config.example.gs`
from this repo.

Save.

### 5. Write your config

Open `Config.gs` and work through it top to bottom. Every section has
instructions above it.

The two that matter most:

**`PROGRAM_ORDER`** — your categories. One per client, project, or area of
work. Under ten. Keep a catch-all like `Admin-Noise` last, since automated
mail gets filed there.

**`CONTEXT`** — who you are and what you run. Write it like you are briefing
a new assistant on their first day. Name your clients, name the people on
each, and spell out anything a stranger would get wrong. This is what makes
the difference between good filing and bad filing.

**`VOICE`** matters for the drafts. Paste two or three real emails you have
actually sent. Typical ones, not polished ones.

### 6. Create the labels

In the editor toolbar there is a dropdown showing a function name. Select
**`setup`** and click **Run**.

The first run asks for permissions:

- Click **Review permissions**, pick your account
- You will see **"Google hasn't verified this app."** This is normal for any
  personal script that touches Gmail. Click **Advanced**, then
  **Go to Zazu (unsafe)**
- The permission request mentions deleting mail. That is the standard Gmail
  scope, it is the only one Apps Script offers. Zazu never deletes anything.
- Click **Allow**

The log should list your labels as created. Check your Gmail sidebar.

### 7. Test without writing anything

Select **`classify`** from the dropdown and click **Run**.

This reads your inbox, classifies everything, and prints the result to the
log. It writes nothing to Gmail, so run it as often as you like.

Read the output. Lines marked `** YOU` are what would reach you each morning.
If they are wrong, the fix is almost always a line added to `CONTEXT` or
`NEEDS_ME_RULES` in `Config.gs`, not a code change.

**Do not move on until you agree with most of the calls.** Give it a few days
if you need to.

### 8. Go live

Select **`run`** and click **Run**. This one labels your mail, writes drafts,
and emails you the brief.

Check the drafts. If the voice is off, edit `VOICE` in `Config.gs` and run
`reset` then `run` again.

### 9. Schedule it

Click the **clock icon** (Triggers) in the left sidebar.

**Add Trigger**:
- Function: `run`
- Event source: Time-driven
- Type: Day timer
- Time: 7am to 8am

**Add Trigger** again:
- Function: `reopen`
- Event source: Time-driven
- Type: Day timer
- Time: 6am to 7am

`reopen` un-marks threads that got a new reply overnight so they are re-read.
It has to run before `run`.

Done. You will have a brief tomorrow morning.

## The functions

| Function | What it does |
|---|---|
| `setup` | Creates your labels. Run once, and again whenever you change `PROGRAM_ORDER`. |
| `classify` | Classifies and logs. Writes nothing. Use this to test config changes. |
| `run` | The real one. Labels, drafts, sends the brief. |
| `reopen` | Un-marks threads that got a new reply so they get re-read. |
| `reset` | Clears all processing marks so everything gets redone. Testing only. Expect duplicate drafts. |

## How it decides

Two passes.

**A cheap deterministic pass** with no API call handles the obvious cases.
Automated senders and calendar notices become noise. Threads where your own
message is the last one become "waiting on them".

**Then Claude reads the rest**, six threads at a time, and returns a category,
a one-line summary, and a yes or no on whether you owe something. A second
call drafts replies for the yeses.

Processed threads get a `Zazu/Seen` label and are skipped on future runs, so
each thread costs you one classification. A thread reopens if it gets a new
reply.

## Tuning

When it gets something wrong three times the same way, that is a pattern worth
fixing. When it gets something wrong once, ignore it.

Misfiled threads → add a line to `CONTEXT`.
Wrong things reaching you → adjust `NEEDS_ME_RULES`.
Drafts in the wrong voice → add to `VOICE`, ideally a rule phrased as a ban.

All three are in `Config.gs`. You should almost never need to touch `Code.gs`.

## Limits

Apps Script caps execution at six minutes. At 60 threads you are comfortably
inside it, but a heavy week after travel could time out. Threads it did not
reach stay unprocessed and get picked up on the next run, so it recovers by
itself.

The search window is seven days. If you are away longer than that and Zazu is
not running, older threads fall outside it and are never processed. Widen
`WINDOW` in `Code.gs` before a long trip.

Failures are quiet. Check **Executions** in the Apps Script sidebar every few
days for the first couple of weeks.

## Privacy

Your mail is sent to the Anthropic API for classification and drafting. Subject,
sender, recipients, and the most recent message body, truncated to 1500
characters. Quoted history and signatures are stripped before sending.

Check this is acceptable under your organization's policy before you run it on
a work inbox.

Your API key is stored in Apps Script's Script Properties, which is per-project
and per-account. It never appears in the code.
