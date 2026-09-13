// ============================================================
// ZAZU - Gmail triage agent
// Engine. All personal details live in Config.gs.
// Never sends. Never deletes. Never changes read state.
// ============================================================

const MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 6;
const WINDOW = 'newer_than:7d';

function allLabels() {
  var out = [];
  PROGRAM_ORDER.forEach(function (p) { out.push('Zazu/' + p); });
  out.push('Zazu/State/Needs-Me');
  out.push('Zazu/State/Waiting-On-Them');
  out.push('Zazu/State/FYI');
  out.push('Zazu/Seen');
  return out;
}

// ============================================================
// PROMPTS - assembled from Config.gs
// ============================================================

function classifyPrompt() {
  return 'You are Zazu, an inbox agent. You sort mail so your user spends ' +
    'five minutes on it instead of an hour. You file. You do not rank ' +
    'urgency and you do not decide anything. The user decides.\n' +
    CONTEXT +
    '\nPROGRAM LABELS - choose exactly one\n' + PROGRAM_ORDER.join(', ') +
    '\n\nDOES IT NEED THE USER\n' + NEEDS_ME_RULES +
    '\nOUTPUT\n' +
    'Return a JSON array, one object per thread, in the same order given.\n' +
    'Each object: {"i": <index>, "program": "<label>", "needs_me": ' +
    'true|false, "summary": "<what this thread is about and what happened, ' +
    'max 14 words>"}\n' +
    'Output only the JSON array. No prose, no markdown fences.';
}

function draftPrompt() {
  return 'You are drafting a reply the user will review and send from their ' +
    'own account. Write as the user, in the first person.\n' +
    CONTEXT +
    '\nHOW THE USER WRITES\n' + VOICE +
    '\nMISSING INFORMATION\n' +
    'You often will not know something only the user knows: whether they ' +
    'uploaded a file, whether an approval came through, whether they can ' +
    'attend. Never invent it. Write the sentence with a bracketed gap in ' +
    'capitals, like "The invoice was uploaded on [DATE]." or "[CONFIRM ' +
    'WHETHER SALEM IS APPROVED TO ATTEND]".\n' +
    'One gap per unknown. Keep the rest complete so they only fill the blank.\n' +
    'Never commit them to a date, number, price, or scope change not already ' +
    'stated in the thread.\n' +
    '\nFORMAT\n' +
    'Start with a greeting line: "Hi <first name>," or "Dear <first name>," ' +
    'for external clients.\n' +
    'End with this sign-off exactly:\n' + SIGNOFF + '\n' +
    'Do not add a signature block, job title, phone number, or ' +
    'confidentiality notice. Gmail appends those automatically.\n' +
    'Do not write a subject line.\n' +
    '\nOUTPUT\n' +
    'Return a JSON array, one object per thread, in the same order given.\n' +
    'Each object: {"i": <index>, "body": "<the full reply>", "ask": "<what ' +
    'the user must do before sending, max 12 words, or empty string if the ' +
    'draft is ready to send as-is>"}\n' +
    'Output only the JSON array. No prose, no markdown fences.';
}

// ============================================================
// SETUP - run once, and again after changing PROGRAM_ORDER
// ============================================================

function setup() {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  Logger.log(key ? 'API key found: ' + key.slice(0, 14) + '...' : 'NO API KEY FOUND');
  allLabels().forEach(function (name) {
    if (GmailApp.getUserLabelByName(name)) {
      Logger.log('exists: ' + name);
    } else {
      GmailApp.createLabel(name);
      Logger.log('created: ' + name);
    }
  });
}

// ============================================================
// HELPERS
// ============================================================

function inTo(msg) {
  return msg.getTo().toLowerCase().indexOf(ME) > -1;
}

function inCc(msg) {
  return (msg.getCc() || '').toLowerCase().indexOf(ME) > -1;
}

function fromMe(msg) {
  return msg.getFrom().toLowerCase().indexOf(ME) > -1;
}

function isAutomatedSender(msg) {
  const from = msg.getFrom().toLowerCase();
  for (var i = 0; i < AUTOMATED.length; i++) {
    if (from.indexOf(AUTOMATED[i]) > -1) return true;
  }
  return false;
}

function isCalendarNotice(subject, msgCount) {
  if (msgCount > 1) return false;
  const s = subject.toLowerCase();
  return s.indexOf('accepted:') === 0 ||
         s.indexOf('declined:') === 0 ||
         s.indexOf('tentative:') === 0 ||
         s.indexOf('invitation:') === 0 ||
         s.indexOf('updated invitation') === 0 ||
         s.indexOf('canceled event') === 0 ||
         s.indexOf('cancelled event') === 0 ||
         s.indexOf('notes:') === 0;
}

function freshText(msg) {
  var body = msg.getPlainBody();
  const cutters = [
    /^On .{5,80}wrote:/m,
    /^-{2,}\s*Forwarded message/m,
    /^_{5,}/m,
    /^From:\s/m,
    /^\s*>/m,
    /^Sent from /m,
    /This email is confidential/m
  ];
  cutters.forEach(function (re) {
    const m = body.match(re);
    if (m && m.index > -1) body = body.slice(0, m.index);
  });
  return body.trim();
}

function namedInFreshText(msg) {
  return freshText(msg).toLowerCase().indexOf(MY_NAME) > -1;
}

function recipientCount(msg) {
  const all = (msg.getTo() || '') + ',' + (msg.getCc() || '');
  return all.split(',').filter(function (s) { return s.trim().length > 0; }).length;
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function senderName(from) {
  return String(from || '').replace(/<.*/, '').replace(/"/g, '').trim() || from;
}

function threadUrl(thread) {
  return 'https://mail.google.com/mail/u/0/#all/' + thread.getId();
}

function daysSince(date) {
  return Math.floor((new Date().getTime() - date.getTime()) / 86400000);
}

// ============================================================
// TRIAGE - deterministic pass, no API call
// ============================================================

function triage(thread) {
  const msgs = thread.getMessages();
  const last = msgs[msgs.length - 1];
  const subject = thread.getFirstMessageSubject() || '(no subject)';

  if (subject.indexOf(DIGEST_TAG) === 0) {
    return { skip: 'AUTO', thread: thread, subject: subject, from: last.getFrom() };
  }
  if (isAutomatedSender(last) || isCalendarNotice(subject, msgs.length)) {
    return { skip: 'AUTO', thread: thread, subject: subject, from: last.getFrom() };
  }
  if (fromMe(last)) {
    return {
      skip: 'WAITING', thread: thread, subject: subject,
      from: last.getFrom(), idle: daysSince(thread.getLastMessageDate())
    };
  }

  var position = 'cc only';
  if (msgs.some(inTo)) position = 'in To line';
  else if (msgs.some(inCc) && namedInFreshText(last)) position = 'cc, named in body';

  return {
    skip: null,
    thread: thread,
    lastMsg: last,
    subject: subject,
    from: last.getFrom(),
    to: last.getTo(),
    cc: last.getCc() || '',
    position: position,
    recipients: recipientCount(last),
    msgCount: msgs.length,
    body: freshText(last).slice(0, 1500)
  };
}

// ============================================================
// CLAUDE
// ============================================================

function callClaude(systemPrompt, userContent, maxTokens) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    Logger.log('API ERROR ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 400));
    return [];
  }

  var text = JSON.parse(res.getContentText()).content[0].text.trim();
  text = text.replace(/^```(json)?/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    Logger.log('PARSE FAIL: ' + text.slice(0, 400));
    return [];
  }
}

function threadXml(it, idx) {
  return '<thread i="' + idx + '">\n' +
    '<subject>' + it.subject + '</subject>\n' +
    '<from>' + it.from + '</from>\n' +
    '<to>' + it.to + '</to>\n' +
    '<cc>' + it.cc + '</cc>\n' +
    '<user_position>' + it.position + '</user_position>\n' +
    '<total_recipients>' + it.recipients + '</total_recipients>\n' +
    '<messages_in_thread>' + it.msgCount + '</messages_in_thread>\n' +
    '<latest_message>' + it.body + '</latest_message>\n' +
    '</thread>\n\n';
}

function askClaude(items) {
  var payload = '';
  items.forEach(function (it, idx) { payload += threadXml(it, idx); });
  return callClaude(classifyPrompt(), payload, 2500);
}

function askForDrafts(items) {
  var payload = '';
  items.forEach(function (it, idx) { payload += threadXml(it, idx); });
  return callClaude(draftPrompt(), payload, 4000);
}

// ============================================================
// CLASSIFY - log only, writes nothing.
// Use this to test changes to Config.gs safely.
// ============================================================

function classify() {
  const threads = GmailApp.search('in:inbox ' + WINDOW + ' -label:Zazu/Seen');
  Logger.log('unseen threads: ' + threads.length);
  if (threads.length === 0) { Logger.log('nothing new'); return; }

  const toAsk = [];
  var auto = 0, waiting = 0;

  threads.forEach(function (t) {
    const r = triage(t);
    if (r.skip === 'AUTO') { auto++; return; }
    if (r.skip === 'WAITING') { waiting++; return; }
    toAsk.push(r);
  });

  Logger.log('skipped: ' + auto + ' auto, ' + waiting + ' waiting');
  Logger.log('to claude: ' + toAsk.length);
  Logger.log('');

  var needsMe = 0;
  for (var s = 0; s < toAsk.length; s += BATCH_SIZE) {
    const batch = toAsk.slice(s, s + BATCH_SIZE);
    askClaude(batch).forEach(function (r) {
      const it = batch[r.i];
      if (!it) return;
      if (r.needs_me) needsMe++;
      Logger.log((r.needs_me ? '** YOU ' : '   ---  ') + ' | ' +
        pad(r.program, 18) + ' | ' + it.subject.slice(0, 40) + ' | ' + r.summary);
    });
  }

  Logger.log('');
  Logger.log('needs you: ' + needsMe + ' of ' + toAsk.length);
  Logger.log('LOG ONLY - nothing written to Gmail');
}

// ============================================================
// RUN - labels, drafts, sends the brief. This is the real one.
// ============================================================

function run() {
  const SEEN = GmailApp.getUserLabelByName('Zazu/Seen');
  const NEEDS = GmailApp.getUserLabelByName('Zazu/State/Needs-Me');
  const WAIT = GmailApp.getUserLabelByName('Zazu/State/Waiting-On-Them');
  const FYI = GmailApp.getUserLabelByName('Zazu/State/FYI');
  const NOISE = GmailApp.getUserLabelByName('Zazu/' + PROGRAM_ORDER[PROGRAM_ORDER.length - 1]);
  const store = PropertiesService.getScriptProperties();

  if (!SEEN || !NEEDS || !WAIT || !FYI || !NOISE) {
    Logger.log('LABELS MISSING - run setup first');
    return;
  }

  const threads = GmailApp.search('in:inbox ' + WINDOW + ' -label:Zazu/Seen');
  Logger.log('unseen threads: ' + threads.length);
  if (threads.length === 0) { Logger.log('nothing new'); return; }

  const toAsk = [];
  const waitingList = [];
  const noiseList = [];

  threads.forEach(function (t) {
    const r = triage(t);
    if (r.skip === 'AUTO') {
      NOISE.addToThread(t); FYI.addToThread(t);
      finish(t, SEEN, store); noiseList.push(r); return;
    }
    if (r.skip === 'WAITING') {
      WAIT.addToThread(t);
      finish(t, SEEN, store); waitingList.push(r); return;
    }
    toAsk.push(r);
  });

  Logger.log('auto: ' + noiseList.length + ', waiting: ' + waitingList.length);
  Logger.log('to claude: ' + toAsk.length);
  Logger.log('');

  const needDrafts = [];
  const byProgram = {};

  // Pass 1 - classify and label
  for (var s = 0; s < toAsk.length; s += BATCH_SIZE) {
    const batch = toAsk.slice(s, s + BATCH_SIZE);
    const results = askClaude(batch);

    if (results.length === 0) {
      Logger.log('classify batch failed, left unseen for next run');
      continue;
    }

    results.forEach(function (r) {
      const it = batch[r.i];
      if (!it) return;

      const label = GmailApp.getUserLabelByName('Zazu/' + r.program);
      if (label) { label.addToThread(it.thread); }
      else { Logger.log('UNKNOWN PROGRAM: ' + r.program); NOISE.addToThread(it.thread); }

      it.program = r.program;
      it.summary = r.summary;
      it.needsMe = !!r.needs_me;

      if (it.needsMe) { NEEDS.addToThread(it.thread); needDrafts.push(it); }
      else { FYI.addToThread(it.thread); }

      if (!byProgram[r.program]) byProgram[r.program] = [];
      byProgram[r.program].push(it);

      finish(it.thread, SEEN, store);

      Logger.log((it.needsMe ? '** YOU ' : '   ---  ') + ' | ' +
        pad(r.program, 18) + ' | ' + it.subject.slice(0, 40) + ' | ' + r.summary);
    });
  }

  // Pass 2 - draft replies
  Logger.log('');
  Logger.log('drafting ' + needDrafts.length + ' replies');

  for (var d = 0; d < needDrafts.length; d += BATCH_SIZE) {
    const batch = needDrafts.slice(d, d + BATCH_SIZE);
    const drafts = askForDrafts(batch);
    if (drafts.length === 0) { Logger.log('draft batch failed'); continue; }

    drafts.forEach(function (r) {
      const it = batch[r.i];
      if (!it || !r.body) return;
      try {
        it.lastMsg.createDraftReplyAll(r.body);
        it.drafted = true;
        it.ask = (r.ask || '').trim();
      } catch (e) {
        it.drafted = false;
        Logger.log('DRAFT FAILED: ' + it.subject.slice(0, 40) + ' - ' + e);
      }
    });
  }

  // Pass 3 - the brief
  sendBrief(needDrafts, byProgram, waitingList, noiseList, threads.length);

  Logger.log('');
  Logger.log('brief sent. needs you: ' + needDrafts.length);
}

// Marks the thread processed. Does not touch read state.
function finish(thread, SEEN, store) {
  SEEN.addToThread(thread);
  store.setProperty('seen_' + thread.getId(), String(thread.getLastMessageDate().getTime()));
}

// ============================================================
// THE BRIEF
// ============================================================

function row(it, showBadge) {
  var h = '<div style="margin:0 0 14px;padding-left:12px;border-left:3px solid ';
  if (showBadge) {
    if (!it.drafted) h += '#E24B4A';
    else if (it.ask) h += '#BA7517';
    else h += '#639922';
  } else {
    h += '#D3D1C7';
  }
  h += '">';

  h += '<div><a href="' + threadUrl(it.thread) + '" style="color:#1a73e8;' +
       'text-decoration:none;font-weight:600;font-size:14px">' +
       esc(it.subject) + '</a></div>';
  h += '<div style="color:#5f6368;font-size:12px;margin-top:2px">' +
       esc(senderName(it.from)) + '</div>';
  h += '<div style="font-size:13px;margin-top:3px;color:#3c4043">' +
       esc(it.summary || '') + '</div>';

  if (showBadge) {
    var badge, color;
    if (!it.drafted) { badge = 'no draft written'; color = '#b3261e'; }
    else if (it.ask) { badge = 'needs your input'; color = '#b06000'; }
    else { badge = 'draft ready to send'; color = '#1e7d32'; }
    h += '<div style="font-size:12px;color:' + color + ';margin-top:5px;font-weight:600">' +
         badge + (it.ask ? ': <span style="font-weight:400">' + esc(it.ask) + '</span>' : '') +
         '</div>';
  }

  h += '</div>';
  return h;
}

function heading(text, count) {
  return '<div style="font-weight:600;font-size:13px;letter-spacing:.05em;' +
    'border-bottom:2px solid #202124;padding-bottom:6px;margin:30px 0 14px">' +
    text + (count !== undefined ? ' <span style="color:#5f6368;font-weight:400">' +
    count + '</span>' : '') + '</div>';
}

function sendBrief(needs, byProgram, waiting, noise, total) {
  const today = Utilities.formatDate(new Date(), TIMEZONE, 'EEE d MMM');

  var ready = 0, toFill = 0, failed = 0;
  needs.forEach(function (it) {
    if (!it.drafted) failed++;
    else if (it.ask) toFill++;
    else ready++;
  });

  var h = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;' +
          'font-size:14px;line-height:1.5;color:#202124;max-width:660px">';

  h += '<div style="font-size:12px;color:#5f6368;letter-spacing:.06em;' +
       'text-transform:uppercase;margin-bottom:4px">Zazu &middot; ' + today + '</div>';
  h += '<div style="font-size:22px;font-weight:600;margin-bottom:2px">' +
       needs.length + ' need you</div>';
  h += '<div style="color:#5f6368;font-size:13px">' + total +
       ' threads reviewed &middot; ' + ready + ' drafts ready &middot; ' +
       toFill + ' need input' + (failed ? ' &middot; ' + failed + ' failed' : '') +
       ' &middot; ' + waiting.length + ' waiting on them</div>';

  if (needs.length > 0) {
    h += heading('NEEDS YOU', needs.length);
    needs.forEach(function (it) { h += row(it, true); });
  }

  PROGRAM_ORDER.forEach(function (prog) {
    const list = (byProgram[prog] || []).filter(function (it) { return !it.needsMe; });
    if (list.length === 0) return;
    h += heading(prog.toUpperCase(), list.length);
    list.forEach(function (it) { h += row(it, false); });
  });

  if (waiting.length > 0) {
    h += heading('WAITING ON THEM', waiting.length);
    waiting.sort(function (a, b) { return b.idle - a.idle; });
    waiting.forEach(function (it) {
      h += '<div style="margin-bottom:8px;font-size:13px">' +
           '<a href="' + threadUrl(it.thread) + '" style="color:#1a73e8;' +
           'text-decoration:none">' + esc(it.subject) + '</a>' +
           '<span style="color:#5f6368"> &middot; ' + it.idle +
           ' days with no reply</span></div>';
    });
  }

  if (noise.length > 0) {
    h += heading('NOISE', noise.length);
    noise.forEach(function (it) {
      h += '<div style="margin-bottom:6px;font-size:13px;color:#5f6368">' +
           esc(it.subject.slice(0, 70)) + ' &middot; ' +
           esc(senderName(it.from)) + '</div>';
    });
  }

  h += '<div style="margin-top:30px;padding-top:12px;border-top:1px solid #dadce0;' +
       'font-size:12px;color:#5f6368">Drafts sit in your Drafts folder on each ' +
       'thread. Nothing has been sent, deleted, or marked read.</div>';
  h += '</div>';

  GmailApp.sendEmail(ME, DIGEST_TAG + ' \u00b7 ' + today + ' \u00b7 ' +
    needs.length + ' need you', 'Open in HTML to read the brief.',
    { htmlBody: h, name: 'Zazu' });
}

// ============================================================
// REOPEN - un-marks threads that received a new reply, so they
// get re-read. Schedule this an hour before run().
// ============================================================

function reopen() {
  const SEEN = GmailApp.getUserLabelByName('Zazu/Seen');
  const store = PropertiesService.getScriptProperties();
  const threads = GmailApp.search('in:inbox newer_than:14d label:Zazu/Seen');

  var count = 0;
  threads.forEach(function (t) {
    const seenAt = store.getProperty('seen_' + t.getId());
    if (!seenAt) return;
    if (t.getLastMessageDate().getTime() > Number(seenAt)) {
      SEEN.removeFromThread(t); count++;
    }
  });
  Logger.log('reopened: ' + count);
}

// ============================================================
// RESET - clears Seen labels and timestamps so everything gets
// reprocessed. Keeps your API key. Does not delete drafts.
// Testing tool. Expect duplicate drafts if you run it after run().
// ============================================================

function reset() {
  const SEEN = GmailApp.getUserLabelByName('Zazu/Seen');
  GmailApp.search('label:Zazu/Seen').forEach(function (t) {
    SEEN.removeFromThread(t);
  });

  const store = PropertiesService.getScriptProperties();
  const all = store.getProperties();
  var n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('seen_') === 0) { store.deleteProperty(k); n++; }
  });

  Logger.log('cleared Seen from all threads and removed ' + n + ' timestamps');
}
