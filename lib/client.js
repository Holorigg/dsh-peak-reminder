/* eslint-disable */
// lib/client.js — client half (DSH Web UI):
//   1) one persistent sidebar line (peak/off-peak + countdown to the next switch);
//   2) while peak, a banner at the top of the UI every N minutes; silent off-peak;
//   3) Settings → Peak reminder: switches, interval, tasks.
// Conventions follow the ecosystem: no Harness client packages, only require('react');
// CSS is bundled, class names are prefixed with .dspr-, colors only reference --dsw-* tokens
// (with a fallback color when a token is missing).
// Peak/off-peak decisions are never computed here — always ask the host
// /plugins/dsh-peak-reminder/state (single source of truth).
//
// Text: English is the only shipped UI language. Strings live in EN below and are served
// through the host locale service under the `dsh-peak-reminder` namespace, so a future
// language pack can add a dictionary without touching this code. When the locale service is
// absent (older host, headless run) t() falls back to the English table directly.
window.__ModuleLoader__.load({
  id: 'dsh-peak-reminder',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');

    var name = 'dsh-peak-reminder';
    var STATE_URL = '/plugins/dsh-peak-reminder/state';
    var CONFIG_URL = '/plugins/dsh-peak-reminder/config';
    var TASKS_URL = '/plugins/dsh-peak-reminder/tasks';
    var PAUSE_URL = '/plugins/dsh-peak-reminder/pause';
    var RESUME_URL = '/plugins/dsh-peak-reminder/resume';
    var POLL_MS = 30000;      // state polling
    var TICK_MS = 1000;       // countdown / reminder check
    var TOAST_MS = 12000;     // how long a banner stays on screen
    var SNOOZE_MS = 30 * 60000;

    // ================= English text =================
    // Flat keys; {name} placeholders are filled by t(key, params).
    var NS = 'dsh-peak-reminder';
    var EN = {
      'nav.label': 'Peak reminder',

      'dur.hm': '{h} h {m} min',
      'dur.m': '{m} min',
      'dur.s': '{s} s',

      'sb.connecting': 'Peak reminder…',
      'sb.disconnected': 'Peak reminder (disconnected)',
      'sb.title.connecting': 'Reading peak/off-peak state…',
      'sb.title.disconnected': 'Host state endpoint unavailable: {error}',
      'sb.disabled': 'Reminders off',
      'sb.title.disabled': 'Peak reminder is disabled in Settings (Settings → Peak reminder)',
      'sb.peak.label': 'Peak 2× · valley in {left}',
      'sb.peak.title': 'Peak hours now ({window}, 2× the off-peak price)\nValley in {left}\nReminding every {interval} min; {dayKind}',
      'sb.valley.label': 'Off-peak 0.5× · peak in {left}',
      'sb.valley.title': 'Off-peak now (half the peak price, no reminders)\n{dayKind}\nPeak in {left}',
      'sb.ledger': 'Peak spend this week ¥{peak} · would have saved ¥{saved}',
      'sb.pausedOne': '⏸ {n} task paused',
      'sb.pausedMany': '⏸ {n} tasks paused',
      'sb.estimate': '{sub} (estimated from ~/.dsh/.dshw-usage.json, not a bill)',

      'sb.tap.unloaded.title': 'Peak reminder: host state not loaded yet',
      'sb.tap.unloaded.sub': 'Reading…',
      'sb.tap.peak.title': 'Peak · {window}',
      'sb.tap.valley.title': 'Off-peak · half price',
      'sb.tap.peak.sub': 'Billed at peak rates, 2× off-peak; valley in {left}; reminding every {interval} min.',
      'sb.tap.valley.sub': 'Billed at off-peak rates, half of peak; peak reminders are off; peak in {left}.',
      'sb.windowFallback': 'peak window',

      'sw.peak.title': 'Peak hours now — 2× the off-peak price',
      'sw.peak.sub.window': 'Peak window {window}. ',
      'sw.peak.sub.every': 'Reminding every {interval} min from now on.',
      'sw.valley.title': 'Off-peak now — half the peak price',
      'sw.valley.sub': 'Peak reminders stopped. {next}',
      'sw.valley.next': 'Peak again in {left}.',
      'sw.first.title': 'Peak hours · 2× price',
      'sw.first.sub': 'Valley in {left}; every {interval} min (silent off-peak).',
      'sw.repeat.title': 'Still peak · 2× price',
      'sw.repeat.sub': 'Valley in {left}{dayKind}.',

      'toast.ok': 'Got it',
      'toast.snooze': 'Snooze 30 min',

      'set.enable.label': 'Enable peak-hour reminders',
      'set.enable.hint': 'While on, a “peak hours now” banner appears every {interval} min during peak hours (Beijing time, Mon–Fri 09:00–12:00 and 14:00–18:00); off-peak hours (weekends, public holidays) stay silent.',
      'set.interval.label': 'Reminder interval (minutes)',
      'set.interval.hint': '1–120 minutes, default 5. One reminder right when peak starts, then one per interval.',
      'set.switch.label': 'Also notify on peak ↔ off-peak switches',
      'set.switch.hint': 'Entering peak says “2× the off-peak price”; entering off-peak says “half the peak price”.',
      'set.sidebar.label': 'Show the status row in the sidebar',
      'set.sidebar.hint': 'One line pinned at the bottom of the sidebar: peak 2× / off-peak 0.5× plus a countdown to the next switch.',
      'set.ledger.label': 'Show this week’s peak spend',
      'set.ledger.hint': 'Second sidebar line: what peak hours cost this week and what staying off-peak would have saved (estimated from ~/.dsh/.dshw-usage.json, not a bill).',
      'set.auto.label': 'Auto-resume paused tasks off-peak',
      'set.auto.hint': 'When on, entering off-peak (half price) sends a “continue” message to every paused session automatically.',
      'set.status.peak': 'Now: peak ({window}, 2× the price)',
      'set.status.valley': 'Now: off-peak (half price)',
      'set.status.suffix': ' · switch in {left} · {dayKind}',
      'set.status.reading': 'Reading state…',
      'set.status.error': 'Host state endpoint unreachable: {error}',
      'set.rules': 'Rules match dsh-whale-widget: peak = Beijing time, Mon–Fri 09:00–12:00 and 14:00–18:00; weekends and public holidays are off-peak all day. Off-peak is exactly half of peak (DeepSeek: “Off-peak rates are half of the peak rates.”). Config lives in ~/.dsh/peak-reminder.json. Peak windows and holidays are configurable: config.peakHours = [[9,12],[14,18],[20,22]]; extra holidays go to ~/.dsh/peak-reminder-holidays.json (["2027-01-01", …] or {"2027-01-01": 1}) and are merged with the built-in table.',
      'set.save': 'Save',
      'set.saved': 'Saved ✓',
      'set.saveFailed': 'Save failed: {error}',

      'task.title': 'Peak tasks: pause / resume',
      'task.resumeAll': 'Resume all',
      'task.hint': 'Pause a running task during peak hours and resume it off-peak from where it stopped (only the current turn is cancelled; the queue and context stay).',
      'task.error': 'Could not read the task list: {error}',
      'task.empty': 'No running or paused tasks right now.',
      'task.untitled': '(untitled session)',
      'task.pausedAt': 'Paused · {time}',
      'task.running': 'Running · {id}',
      'task.resume': 'Resume',
      'task.pause': 'Pause',
      'task.note.resumed': 'Resumed',
      'task.note.paused': 'Paused; resume it off-peak',
      'task.note.allResumed': 'All resumed',
      'task.note.failed': 'Failed: {error}',

      'day.holiday': 'public holiday',
      'day.weekend': 'weekend',
      'day.weekday': 'weekday',
    };

    var localeApi = null;
    var boundT = null;
    var localeDisposers = [];

    function format(template, params) {
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, function (match, key) {
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
      });
    }

    function t(key, params) {
      if (boundT) return boundT(key, params);
      var template = Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key;
      return format(template, params);
    }

    function attachLocale(api) {
      if (!api || typeof api.register !== 'function' || typeof api.bind !== 'function') return;
      if (boundT) return;
      try {
        localeDisposers.push(api.register(NS, 'en', EN));
      } catch (e) {
        // Already registered (HMR remount): keep going and reuse the existing dictionary.
        void e;
      }
      try {
        boundT = api.bind(NS);
        localeApi = api;
        emit();
      } catch (e) {
        void e;
      }
    }

    function installLocale(ctx) {
      try {
        var ready = typeof ctx.get === 'function' ? ctx.get('locale') : null;
        if (ready) {
          attachLocale(ready);
          return;
        }
      } catch (e) { void e; }
      // The locale service may mount after this plugin: wait for it once.
      try {
        if (typeof ctx.inject === 'function') {
          ctx.inject(['locale'], function (child) {
            var api = null;
            try { api = (typeof child.get === 'function' ? child.get('locale') : null) || child.locale; } catch (e) { void e; }
            attachLocale(api);
          });
        }
      } catch (e) { void e; }
    }

    var CSS = [
      // Sidebar row (official panelRow shape: full width, hover background, 36x36 when collapsed)
      '.dspr-row{box-sizing:border-box;width:100%;border-radius:var(--dsw-radius-md,8px);min-height:36px;color:var(--dsw-alias-label-primary,#e7e7e7);font:inherit;text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:8px;margin:0 2px;padding:7px 8px;line-height:22px;display:flex;flex:1 1 auto}',
      '.dspr-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.dspr-row.dspr-collapsed{width:36px;height:36px;min-height:36px;justify-content:center;margin:0;padding:0;flex:none;align-self:center}',
      '.dspr-glyph{flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}',
      '.dspr-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dspr-title{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;font-size:13px}',
      '.dspr-sub{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary,#8b8b8b)}',
      '.dspr-dot{width:8px;height:8px;border-radius:50%;display:block;background:var(--dsw-alias-label-tertiary,#8b8b8b)}',
      '.dspr-dot.dspr-peak{background:#ff8a3d;box-shadow:0 0 0 3px rgba(255,138,61,.18)}',
      '.dspr-dot.dspr-valley{background:#3ecf8e;box-shadow:0 0 0 3px rgba(62,207,142,.16)}',
      '.dspr-dot.dspr-off{background:var(--dsw-alias-label-dimmed,#666)}',
      // Top banner: an own card (opaque background + blur) that does not inherit DSH token alpha,
      // so the wallpaper and the text underneath never show through.
      '.dspr-toast-wrap{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none}',
      '.dspr-toast{pointer-events:auto;box-sizing:border-box;width:min(400px,92vw);display:flex;gap:11px;align-items:flex-start;padding:13px 13px 12px;border-radius:14px;background:rgba(22,24,28,.95);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);color:#f2f4f7;border:1px solid rgba(255,255,255,.09);box-shadow:0 18px 44px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05);font-size:13px;line-height:1.55;animation:dspr-in 180ms cubic-bezier(.22,.9,.3,1)}',
      '.dspr-toast.dspr-toast-peak{border-color:rgba(255,138,61,.42);box-shadow:0 18px 44px rgba(0,0,0,.5),0 0 0 3px rgba(255,138,61,.10)}',
      '.dspr-toast.dspr-toast-valley{border-color:rgba(62,207,142,.36);box-shadow:0 18px 44px rgba(0,0,0,.5),0 0 0 3px rgba(62,207,142,.08)}',
      '@keyframes dspr-in{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}',
      '.dspr-badge{flex:none;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:rgba(255,255,255,.07);color:#cfd4dc}',
      '.dspr-toast-peak .dspr-badge{background:rgba(255,138,61,.16);color:#ffb27a}',
      '.dspr-toast-valley .dspr-badge{background:rgba(62,207,142,.14);color:#6fe3ad}',
      '.dspr-toast-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;padding-top:1px}',
      '.dspr-toast-title{font-size:13.5px;font-weight:650;line-height:1.45;letter-spacing:.01em}',
      '.dspr-toast-sub{font-size:12.5px;line-height:1.55;color:rgba(236,240,245,.62)}',
      '.dspr-toast-actions{display:flex;flex-direction:column;gap:6px;align-items:stretch;flex:none;padding-top:1px}',
      '.dspr-btn{box-sizing:border-box;border:none;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;line-height:18px;padding:4px 10px;color:rgba(236,240,245,.9);background:rgba(255,255,255,.08);white-space:nowrap}',
      '.dspr-btn:hover{background:rgba(255,255,255,.14)}',
      '.dspr-btn-primary{background:rgba(255,255,255,.92);color:#16181b;font-weight:600}',
      '.dspr-btn-primary:hover{background:#fff}',
      '.dspr-btn-ghost{background:transparent;color:rgba(236,240,245,.5)}',
      '.dspr-btn-ghost:hover{background:rgba(255,255,255,.08);color:rgba(236,240,245,.82)}',
      // Settings page
      '.dspr-section{display:flex;flex-direction:column;width:100%;gap:0}',
      '.dspr-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}',
      '.dspr-field+.dspr-field{border-top:.5px solid var(--dsw-alias-border-l2,#2c2f33)}',
      '.dspr-head{display:flex;gap:8px;align-items:center}',
      '.dspr-label{flex:1;font-size:13px;line-height:1.5;font-weight:500;color:var(--dsw-alias-label-primary,#e7e7e7)}',
      '.dspr-hint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8b8b8b)}',
      '.dspr-switch{width:36px;height:20px;padding:2px;border-radius:999px;border:none;background:var(--dsw-alias-border-l3,#3a3d42);cursor:pointer;display:inline-flex;align-items:center;flex-shrink:0}',
      '.dspr-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dspr-thumb{width:16px;height:16px;border-radius:50%;background:#fff;transition:transform 120ms ease;display:block}',
      '.dspr-switch[aria-checked="true"] .dspr-thumb{transform:translateX(16px)}',
      '.dspr-input{height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4,#4a4d52);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-3,#1f2124);font-size:13px;color:var(--dsw-alias-label-primary,#e7e7e7);outline:none;box-sizing:border-box}',
      '.dspr-status{font-size:12.5px;color:var(--dsw-alias-label-secondary,#b9bcc1)}',
      '.dspr-footer{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding-top:16px}',
      '.dspr-save{background:var(--dsw-alias-label-primary,#e7e7e7);color:var(--dsw-alias-bg-layer-3,#1f2124);padding:5px 14px;font-size:13px;line-height:1.5;border:none;border-radius:var(--dsw-radius-md,8px);cursor:pointer}',
      '.dspr-save:hover{opacity:.9}',
      '.dspr-ok{color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:12px}',
      '.dspr-bad{color:var(--dsw-alias-label-error,#ff6b6b);font-size:12px}',
      // Peak tasks (0.3.0)
      '.dspr-tasks{display:flex;flex-direction:column;gap:6px;margin-top:2px}',
      '.dspr-task{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,#1f2124);border:.5px solid var(--dsw-alias-border-l2,#2c2f33)}',
      '.dspr-task-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dspr-task-t{font-size:12.5px;line-height:1.4;color:var(--dsw-alias-label-primary,#e7e7e7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dspr-task-id{font-size:11px;line-height:1.35;color:var(--dsw-alias-label-tertiary,#8b8b8b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dspr-task-btn{flex:none;border:none;border-radius:7px;cursor:pointer;font:inherit;font-size:12px;line-height:18px;padding:3px 9px;background:rgba(255,255,255,.1);color:var(--dsw-alias-label-primary,#e7e7e7)}',
      '.dspr-task-btn:hover{background:rgba(255,255,255,.18)}',
      '.dspr-task-btn[disabled]{opacity:.45;cursor:default}',
    ].join('\n');

    if (typeof document !== 'undefined' &&
        document.querySelector('style[data-plugin-css="dsh-peak-reminder/client.css"]') === null) {
      var styleTag = document.createElement('style');
      styleTag.dataset.plugin = 'dsh-peak-reminder';
      styleTag.dataset.pluginCss = 'dsh-peak-reminder/client.css';
      styleTag.textContent = CSS;
      document.head.appendChild(styleTag);
    }

    // ================= state store =================
    // serverOffsetMs: local clock minus host clock (the host clock is what decides peak hours)
    var store = {
      data: null,        // state snapshot returned by the host
      error: null,       // last fetch failure (drives the "disconnected" hint)
      serverOffsetMs: 0,
      subs: [],
    };
    function subscribe(fn) {
      store.subs.push(fn);
      return function () {
        var i = store.subs.indexOf(fn);
        if (i >= 0) store.subs.splice(i, 1);
      };
    }
    function emit() {
      store.subs.forEach(function (fn) { try { fn(); } catch (e) { void e; } });
    }
    function serverNowSec() {
      return Math.floor((Date.now() + store.serverOffsetMs) / 1000);
    }
    function config() {
      var d = store.data;
      return (d && d.config) || { enabled: true, intervalMinutes: 5, notifyOnSwitch: true, showSidebar: true };
    }

    var inflight = false;
    function fetchState() {
      if (inflight) return;
      inflight = true;
      fetch(STATE_URL, { credentials: 'omit', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return null; }).then(function (j) { throw new Error((j && j.reason) || ('HTTP ' + r.status)); }); })
        .then(function (j) {
          inflight = false;
          if (!j || !j.ok) throw new Error((j && j.reason) || 'bad payload');
          store.error = null;
          store.data = j;
          // Timezone/clock alignment: trust the host clock (a round trip is well under 200ms)
          store.serverOffsetMs = j.now * 1000 - Date.now();
          emit();
        })
        .catch(function (e) {
          inflight = false;
          store.error = String((e && e.message) || e);
          emit();
        });
    }

    // ================= top banner (plain DOM, outside the React tree) =================
    var toastHost = null;
    function ensureToastHost() {
      if (typeof document === 'undefined') return null;
      if (toastHost && document.body.contains(toastHost)) return toastHost;
      toastHost = document.createElement('div');
      toastHost.className = 'dspr-toast-wrap';
      toastHost.setAttribute('data-plugin', 'dsh-peak-reminder');
      document.body.appendChild(toastHost);
      return toastHost;
    }

    function fmtDuration(sec) {
      var s = Math.max(0, Math.round(sec));
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      if (h > 0) return t('dur.hm', { h: h, m: m });
      if (m > 0) return t('dur.m', { m: m });
      return t('dur.s', { s: s });
    }

    // Day classification: prefer the host's stable code, fall back to whatever label an older
    // host sent (including the Chinese labels hosts before this fork used to emit).
    var LEGACY_DAY_KIND = { '工作日': 'day.weekday', '周末': 'day.weekend', '法定节假日': 'day.holiday' };
    function dayKindText(d) {
      if (!d) return '';
      if (d.dayKindCode) return t('day.' + d.dayKindCode);
      var legacy = d.dayKind;
      if (legacy && LEGACY_DAY_KIND[legacy]) return t(LEGACY_DAY_KIND[legacy]);
      return legacy || '';
    }

    function showToast(opts) {
      var host = ensureToastHost();
      if (!host) return;
      var kind = opts.kind === 'valley' ? 'dspr-toast-valley' : (opts.kind === 'peak' ? 'dspr-toast-peak' : '');
      var el = document.createElement('div');
      el.className = 'dspr-toast' + (kind ? ' ' + kind : '');

      // Left badge: peak ▲, valley ▼, anything else ●
      var badge = document.createElement('div');
      badge.className = 'dspr-badge';
      badge.textContent = opts.kind === 'peak' ? '▲' : (opts.kind === 'valley' ? '▼' : '●');
      badge.setAttribute('aria-hidden', 'true');
      el.appendChild(badge);

      var body = document.createElement('div');
      body.className = 'dspr-toast-body';
      var title = document.createElement('div');
      title.className = 'dspr-toast-title';
      title.textContent = opts.title || '';
      body.appendChild(title);
      if (opts.sub) {
        var sub = document.createElement('div');
        sub.className = 'dspr-toast-sub';
        sub.textContent = opts.sub;
        body.appendChild(sub);
      }
      el.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'dspr-toast-actions';
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'dspr-btn dspr-btn-primary';
      closeBtn.textContent = t('toast.ok');
      closeBtn.onclick = function () { close(); };
      var snooze = document.createElement('button');
      snooze.type = 'button';
      snooze.className = 'dspr-btn dspr-btn-ghost';
      snooze.textContent = t('toast.snooze');
      snooze.onclick = function () { snoozeUntil = Date.now() + SNOOZE_MS; close(); };
      actions.appendChild(closeBtn);
      actions.appendChild(snooze);
      el.appendChild(actions);

      host.appendChild(el);
      // At most three at a time; the oldest leaves first
      while (host.children.length > 3) host.removeChild(host.firstChild);

      var timer = setTimeout(function () { close(); }, TOAST_MS);
      var closed = false;
      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        if (el.parentNode) el.parentNode.removeChild(el);
      }
      el.__dsprClose = close;
    }

    // ================= reminder cadence =================
    var snoozeUntil = 0;
    var lastRemindAt = 0;     // ms
    var everPeak = null;      // last known side (drives the switch notification)
    var remindedInPeak = false;
    var localeRev = -1;

    function syncLocale() {
      if (!localeApi || typeof localeApi.getSnapshot !== 'function') return;
      try {
        var snap = localeApi.getSnapshot();
        if (snap && snap.revision !== localeRev) {
          localeRev = snap.revision;
          emit();
        }
      } catch (e) { void e; }
    }

    function tick() {
      syncLocale();
      var d = store.data;
      if (!d) return;
      var cfg = config();
      var nowSec = serverNowSec();

      // Past the switch point → refresh right away (a sub-second lag at worst)
      if (d.nextChangeAt && nowSec >= d.nextChangeAt) fetchState();

      var peak = !!d.isPeak;
      var nowMs = Date.now();
      var dayKind = dayKindText(d);

      // Peak↔off-peak switch note (once, and a snooze must not erase the memory of the switch)
      if (everPeak !== null && peak !== everPeak && cfg.enabled && cfg.notifyOnSwitch && nowMs >= snoozeUntil) {
        if (peak) {
          showToast({
            kind: 'peak',
            title: t('sw.peak.title'),
            sub: (d.peakWindow ? t('sw.peak.sub.window', { window: d.peakWindow }) : '') +
              t('sw.peak.sub.every', { interval: cfg.intervalMinutes }),
          });
          lastRemindAt = nowMs;
        } else {
          showToast({
            kind: 'valley',
            title: t('sw.valley.title'),
            sub: t('sw.valley.sub', {
              next: d.nextChangeAt ? t('sw.valley.next', { left: fmtDuration(d.nextChangeAt - nowSec) }) : '',
            }),
          });
        }
      }
      everPeak = peak;

      if (!cfg.enabled || !peak || nowMs < snoozeUntil) {
        if (!peak) remindedInPeak = false;
        return;
      }

      var intervalMs = Math.max(1, Number(cfg.intervalMinutes) || 5) * 60000;
      // The first reminder of a peak block goes out immediately (no need to wait a full interval)
      if (!remindedInPeak) {
        remindedInPeak = true;
        lastRemindAt = nowMs;
        showToast({
          kind: 'peak',
          title: t('sw.first.title'),
          sub: (d.peakWindow ? t('sw.peak.sub.window', { window: d.peakWindow }) : '') +
            t('sw.first.sub', {
              left: d.nextChangeAt ? fmtDuration(d.nextChangeAt - nowSec) : '—',
              interval: cfg.intervalMinutes,
            }),
        });
        return;
      }

      if (nowMs - lastRemindAt >= intervalMs) {
        lastRemindAt = nowMs;
        showToast({
          kind: 'peak',
          title: t('sw.repeat.title'),
          sub: t('sw.repeat.sub', {
            left: d.nextChangeAt ? fmtDuration(d.nextChangeAt - nowSec) : '—',
            dayKind: dayKind ? ' (' + dayKind + ')' : '',
          }),
        });
      }
    }

    // ================= React views =================
    function usePeakState() {
      var st = React.useState(0);
      var bump = st[1];
      React.useEffect(function () {
        var un = subscribe(function () { bump(function (n) { return n + 1; }); });
        return function () { un(); };
      }, []);
      return store;
    }

    function SidebarRow(props) {
      props = props || {};
      var wide = !!props.wide;
      var snap = usePeakState();
      var cfg = config();
      if (!cfg.showSidebar) return null;

      var d = snap.data;
      var nowSec = serverNowSec();
      var peak = !!(d && d.isPeak);
      var left = d && d.nextChangeAt ? d.nextChangeAt - nowSec : 0;
      var label;
      var title;
      var sub = null;
      var subParts = [];
      var dayKind = dayKindText(d);
      if (d && cfg.showLedger && d.week && d.week.ok) {
        subParts.push(t('sb.ledger', {
          peak: d.week.peakSpent.toFixed(2),
          saved: d.week.savedIfValley.toFixed(2),
        }));
      }
      // 0.3.0: if anything is paused, say so first — it is the only cue to resume it later
      if (d && d.paused && d.paused.length > 0) {
        subParts.push(d.paused.length === 1
          ? t('sb.pausedOne', { n: d.paused.length })
          : t('sb.pausedMany', { n: d.paused.length }));
      }
      if (subParts.length > 0) sub = subParts.join(' · ');
      if (!d) {
        label = snap.error ? t('sb.disconnected') : t('sb.connecting');
        title = snap.error ? t('sb.title.disconnected', { error: snap.error }) : t('sb.title.connecting');
      } else if (!cfg.enabled) {
        label = t('sb.disabled');
        title = t('sb.title.disabled');
      } else if (peak) {
        label = t('sb.peak.label', { left: fmtDuration(left) });
        title = t('sb.peak.title', {
          window: d.peakWindow || t('sb.windowFallback'),
          left: fmtDuration(left),
          interval: cfg.intervalMinutes,
          dayKind: dayKind,
        });
      } else {
        label = t('sb.valley.label', { left: fmtDuration(left) });
        title = t('sb.valley.title', { dayKind: dayKind, left: fmtDuration(left) });
      }
      if (sub) title += '\n' + t('sb.estimate', { sub: sub });
      var dotCls = 'dspr-dot' + (d ? (cfg.enabled ? (peak ? ' dspr-peak' : ' dspr-valley') : ' dspr-off') : '');

      return React.createElement('button', {
        type: 'button',
        className: 'dspr-row' + (wide ? '' : ' dspr-collapsed'),
        title: title,
        'aria-label': title,
        onClick: function () {
          // A click refreshes the state and shows the current details; it does not consume
          // the "every N minutes" cadence.
          fetchState();
          var detail;
          if (d) {
            detail = (d.isPeak
              ? t('sb.tap.peak.sub', { left: fmtDuration(left), interval: cfg.intervalMinutes })
              : t('sb.tap.valley.sub', { left: fmtDuration(left) })) +
              (dayKind ? ' (' + dayKind + ')' : '');
          } else {
            detail = snap.error || t('sb.tap.unloaded.sub');
          }
          showToast({
            kind: d && d.isPeak ? 'peak' : 'valley',
            title: d
              ? (d.isPeak
                  ? t('sb.tap.peak.title', { window: d.peakWindow || t('sb.windowFallback') })
                  : t('sb.tap.valley.title'))
              : t('sb.tap.unloaded.title'),
            sub: detail,
          });
        },
      },
        React.createElement('span', { className: 'dspr-glyph', 'aria-hidden': 'true' },
          React.createElement('span', { className: dotCls })),
        wide ? React.createElement('span', { className: 'dspr-body' },
          React.createElement('span', { className: 'dspr-title' }, label),
          sub ? React.createElement('span', { className: 'dspr-sub' }, sub) : null) : null
      );
    }

    function Switch(props) {
      return React.createElement('button', {
        type: 'button',
        role: 'switch',
        className: 'dspr-switch',
        'aria-checked': props.checked ? 'true' : 'false',
        onClick: function () { props.onChange(!props.checked); },
      }, React.createElement('span', { className: 'dspr-thumb' }));
    }

    function SettingsSection() {
      var snap = usePeakState();
      var cfgState = React.useState(null);
      var draft = cfgState[0];
      var setDraft = cfgState[1];
      var saveState = React.useState(0); // 0 unsaved, 1 saved, -1 failed
      var saved = saveState[0];
      var setSaved = saveState[1];
      var failReason = React.useRef('');

      React.useEffect(function () {
        if (draft === null && snap.data && snap.data.config) setDraft(snap.data.config);
      }, [snap.data]);
      var view = draft || config();
      function upd(key, value) {
        setSaved(0);
        setDraft(function (old) { return Object.assign({}, (old || config()), { [key]: value }); });
      }
      var d = snap.data;
      var nowSec = serverNowSec();
      var left = d && d.nextChangeAt ? d.nextChangeAt - nowSec : 0;
      var dayKind = dayKindText(d);

      var statusText;
      if (d) {
        statusText = (d.isPeak
          ? t('set.status.peak', { window: d.peakWindow || '' })
          : t('set.status.valley')) +
          (d.nextChangeAt ? t('set.status.suffix', { left: fmtDuration(left), dayKind: dayKind }) : '');
      } else {
        statusText = snap.error ? t('set.status.error', { error: snap.error }) : t('set.status.reading');
      }

      return React.createElement('div', { className: 'dspr-section' },
        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, t('set.enable.label')),
            React.createElement(Switch, { checked: view.enabled !== false, onChange: function (v) { upd('enabled', v); } })),
          React.createElement('div', { className: 'dspr-hint' },
            t('set.enable.hint', { interval: view.intervalMinutes || 5 }))),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, t('set.interval.label')),
            React.createElement('input', {
              type: 'number', min: 1, max: 120, className: 'dspr-input', style: { width: 120 },
              value: view.intervalMinutes || 5,
              onChange: function (e) { upd('intervalMinutes', Number(e.target.value) || 1); },
            })),
          React.createElement('div', { className: 'dspr-hint' }, t('set.interval.hint'))),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, t('set.switch.label')),
            React.createElement(Switch, { checked: view.notifyOnSwitch !== false, onChange: function (v) { upd('notifyOnSwitch', v); } })),
          React.createElement('div', { className: 'dspr-hint' }, t('set.switch.hint'))),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, t('set.sidebar.label')),
            React.createElement(Switch, { checked: view.showSidebar !== false, onChange: function (v) { upd('showSidebar', v); } })),
          React.createElement('div', { className: 'dspr-hint' }, t('set.sidebar.hint'))),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, t('set.ledger.label')),
            React.createElement(Switch, { checked: view.showLedger !== false, onChange: function (v) { upd('showLedger', v); } })),
          React.createElement('div', { className: 'dspr-hint' }, t('set.ledger.hint'))),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-head' },
            React.createElement('span', { className: 'dspr-label' }, t('set.auto.label')),
            React.createElement(Switch, { checked: view.autoResume !== false, onChange: function (v) { upd('autoResume', v); } })),
          React.createElement('div', { className: 'dspr-hint' }, t('set.auto.hint'))),

        React.createElement(TaskSection, null),

        React.createElement('div', { className: 'dspr-field' },
          React.createElement('div', { className: 'dspr-status' }, statusText),
          React.createElement('div', { className: 'dspr-hint' }, t('set.rules'))),

        React.createElement('div', { className: 'dspr-footer' },
          saved === 1 ? React.createElement('span', { className: 'dspr-ok' }, t('set.saved')) : null,
          saved === -1 ? React.createElement('span', { className: 'dspr-bad' }, t('set.saveFailed', { error: failReason.current })) : null,
          React.createElement('button', {
            type: 'button', className: 'dspr-save',
            onClick: function () {
              fetch(CONFIG_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  enabled: view.enabled !== false,
                  intervalMinutes: view.intervalMinutes || 5,
                  notifyOnSwitch: view.notifyOnSwitch !== false,
                  showSidebar: view.showSidebar !== false,
                  showLedger: view.showLedger !== false,
                  autoResume: view.autoResume !== false,
                }),
              })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                  if (j && j.ok) {
                    setSaved(1);
                    fetchState(); // push the new config into the sidebar row and the cadence at once
                  } else {
                    failReason.current = (j && (j.reason || j.detail)) || 'unknown';
                    setSaved(-1);
                  }
                })
                .catch(function (e) { failReason.current = String((e && e.message) || e); setSaved(-1); });
            },
          }, t('set.save'))));
    }

    // ================= peak tasks (0.3.0) =================
    // "Pause" = the host cancels the current turn (queue and context survive); "Resume" = the host
    // enqueues one user message. Both go through host services; the client keeps only the list.
    function TaskSection() {
      var listState = React.useState({ running: [], paused: [], error: null, pausedOk: false });
      var list = listState[0];
      var setList = listState[1];
      var busyState = React.useState('');
      var busy = busyState[0];
      var setBusy = busyState[1];
      var noteState = React.useState({ text: '', bad: false });
      var note = noteState[0];
      var setNote = noteState[1];

      function load() {
        fetch(TASKS_URL, { credentials: 'omit', cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.ok) throw new Error((j && j.reason) || 'bad payload');
            setList({ running: j.tasks || [], paused: j.paused || [], error: null, pausedOk: true });
          })
          .catch(function (e) { setList({ running: [], paused: [], error: String((e && e.message) || e), pausedOk: false }); });
      }
      React.useEffect(function () {
        load();
        var timer = setInterval(load, 5000);
        return function () { clearInterval(timer); };
      }, []);

      function post(url, payload, key, done) {
        setBusy(key);
        setNote({ text: '', bad: false });
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            setBusy('');
            if (j && j.ok) { setNote({ text: done || 'Done', bad: false }); load(); }
            else setNote({ text: t('task.note.failed', { error: (j && (j.reason || j.detail)) || 'unknown' }), bad: true });
          })
          .catch(function (e) { setBusy(''); setNote({ text: t('task.note.failed', { error: String((e && e.message) || e) }), bad: true }); });
      }

      var running = list.running || [];
      var paused = list.paused || [];

      function row(item, kind) {
        var key = kind + ':' + item.sessionId;
        return React.createElement('div', { className: 'dspr-task', key: key },
          React.createElement('div', { className: 'dspr-task-main' },
            React.createElement('span', { className: 'dspr-task-t', title: item.title || item.sessionId }, item.title || t('task.untitled')),
            React.createElement('span', { className: 'dspr-task-id' },
              kind === 'paused'
                ? t('task.pausedAt', { time: item.pausedAt ? new Date(item.pausedAt).toLocaleTimeString() : '' })
                : t('task.running', { id: item.sessionId.slice(0, 18) }))),
          React.createElement('button', {
            type: 'button',
            className: 'dspr-task-btn',
            disabled: busy === key,
            onClick: function () {
              if (kind === 'paused') post(RESUME_URL, { sessionId: item.sessionId }, key, t('task.note.resumed'));
              else post(PAUSE_URL, { sessionId: item.sessionId }, key, t('task.note.paused'));
            },
          }, busy === key ? '…' : (kind === 'paused' ? t('task.resume') : t('task.pause'))));
      }

      return React.createElement('div', { className: 'dspr-field' },
        React.createElement('div', { className: 'dspr-head' },
          React.createElement('span', { className: 'dspr-label' }, t('task.title')),
          paused.length > 0
            ? React.createElement('button', {
                type: 'button',
                className: 'dspr-task-btn',
                disabled: busy === 'all',
                onClick: function () { post(RESUME_URL, { all: true }, 'all', t('task.note.allResumed')); },
              }, busy === 'all' ? '…' : t('task.resumeAll'))
            : null),
        React.createElement('div', { className: 'dspr-hint' }, t('task.hint')),
        list.error
          ? React.createElement('div', { className: 'dspr-bad' }, t('task.error', { error: list.error }))
          : React.createElement('div', { className: 'dspr-tasks' },
              running.length === 0 && paused.length === 0
                ? React.createElement('div', { className: 'dspr-hint' }, t('task.empty'))
                : null,
              running.map(function (it) { return row(it, 'running'); }),
              paused.map(function (it) { return row(it, 'paused'); })),
        note.text ? React.createElement('div', { className: note.bad ? 'dspr-bad' : 'dspr-ok' }, note.text) : null);
    }

    // ================= mounting =================
    var timers = [];
    function applyClient(ctx) {
      installLocale(ctx);
      var slots = ctx.get('slots');
      if (slots && typeof slots.inject === 'function') {
        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-peak-reminder', order: 90, label: t('nav.label') },
            function (props) { return React.createElement(SidebarRow, props); }
          );
        });
        slots.inject('settings.section', function () {
          return slots.register(
            { name: 'settings.section', id: 'dsh-peak-reminder', order: 880, label: t('nav.label') },
            function () { return React.createElement(SettingsSection, null); }
          );
        });
      }

      fetchState();
      timers.push(setInterval(fetchState, POLL_MS));
      timers.push(setInterval(tick, TICK_MS));
    }

    exports.name = name;
    exports.inject = ['slots'];
    exports.apply = function (ctx, config) {
      exports.__peakCfg = config || {};
      try { applyClient(ctx); } catch (e) { /* a failed mount must not take the host UI down */ void e; }
    };
    exports.__unload = function () {
      timers.forEach(function (timer) { clearInterval(timer); });
      timers = [];
      localeDisposers.forEach(function (dispose) { try { dispose(); } catch (e) { void e; } });
      localeDisposers = [];
      boundT = null;
      localeApi = null;
      if (toastHost && toastHost.parentNode) toastHost.parentNode.removeChild(toastHost);
      toastHost = null;
    };

    return module.exports;
  },
});
