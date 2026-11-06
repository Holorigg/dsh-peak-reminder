# dsh-peak-reminder (English fork)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugin that tells you when DeepSeek is charging **peak rates** — a reminder every few minutes while peak hours are on, silence during the cheap hours. Peak costs **twice** what off-peak costs; this plugin says which side you are on and how long until it flips.

This is an English-language fork of [`54nanmiao/dsh-peak-reminder`](https://github.com/54nanmiao/dsh-peak-reminder) (MIT). The upstream UI is Chinese-only; this fork ships an English UI and nothing else changed in behaviour. Upstream is kept as a git remote so its releases can be merged in.

- **Sidebar row** (`sidebar.footer.action`): `Peak 2× · valley in 32 min` / `Off-peak 0.5× · peak in 1 min`; orange dot = peak, green = off-peak, grey = disabled. Hover for the full explanation, click for an instant status banner.
- **Top banner**: one card when peak starts ("peak hours now — 2× the off-peak price"), then one every N minutes (default 5); one card when it ends. **No repeats off-peak.** Each banner has "Got it" and "Snooze 30 min".
- **Settings section** (`settings.section`): master switch, reminder interval, peak↔off-peak switch notifications, sidebar row, auto-resume, and the list of running sessions (pause each, resume each or all — 0.3.0).
- **Pause at peak, resume off-peak**: a running task can be stopped at the current *turn* boundary without losing its queue or context; off-peak it continues from there.
- No network requests, no credentials, only two files written: `~/.dsh/peak-reminder.json` (config) and `~/.dsh/peak-reminder-paused.json` (pause ledger).

UI text is served through the host locale service under the `dsh-peak-reminder` namespace, so a language pack can add a dictionary later without touching the code; English is both the shipped language and the fallback.

## Install

```sh
# from this checkout (local path)
dsh plugin --profile web add /absolute/path/to/dsh-peak-reminder

# or straight from the fork
dsh plugin --profile web add github:Holorigg/dsh-peak-reminder
```

Or clone it and point the profile at the checkout:

```sh
git clone https://github.com/Holorigg/dsh-peak-reminder
dsh plugin --profile web add /absolute/path/to/dsh-peak-reminder
```

`--profile` is **required** and must be the profile you actually run. The desktop app's profile is usually `desktop`; the CLI/web profile is usually `web`. Installing into a profile you do not launch looks like a successful install and then nothing appears — check the directory name under `~/.dsh/profiles/` (or `%USERPROFILE%\.dsh\profiles\` on Windows) when unsure.

The plugin declares a `dsh.bundle` manifest (`cordis.patch.yml`) and ships no build step and no dependencies, so a source install needs no build approval.

Reload the Web UI after installing (a host-side change also needs a restart). The sidebar row appears at the bottom; the settings section is under Settings → the plugins area.

## Updating

`origin` is this fork, `upstream` is the original project:

```sh
git remote -v                      # origin = your fork, upstream = 54nanmiao
git fetch upstream && git merge upstream/main    # take an upstream release
```

Because the plugin is installed from this checkout, a `git pull` plus a UI reload is the whole update. Keep the fork's `version` at or above the npm one so the plugin market does not offer to "update" you back to the Chinese release.

## Troubleshooting

**`'pnpm' is not recognized as an internal or external command`** — `dsh plugin` does not ship its own pnpm: it hands `add …` to whatever `pnpm` is on `PATH`, so the install fails at the first step on machines that only have npm (the desktop app bundles pnpm under `~/.dsh/dsh-runtimes/*/dependencies/pnpm` but does not put it on `PATH`). Fix by installing pnpm, or by prepending the bundled one for the command:

```sh
# Windows: point a shim at the pnpm the desktop app already bundles
set PATH=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin;%PATH%
npm i -g pnpm        # or just install pnpm once, anywhere on PATH
```

**It installs an older version than `npm view dsh-peak-reminder version` reports** — recent pnpm versions gate packages by release age (`minimumReleaseAge`). A version published minutes ago is skipped silently and the previous one is installed instead. Ask for the version you want explicitly:

```sh
dsh plugin --profile <profile> add dsh-peak-reminder@0.1.3
```

## How much it saves

Off-peak rates are **exactly half** of peak rates (DeepSeek's own wording: *"Off-peak rates are half of the peak rates."*).
Per 1M tokens, USD:

| | Off-peak | Peak |
|---|---|---|
| Input, cache hit | $0.003 | $0.006 |
| Input, cache miss | $0.15 | $0.30 |
| Output | $0.60 | $1.20 |

So 1M output tokens costs $1.20 during peak and $0.60 off-peak — a $0.60 difference for the same work.

The sidebar shows which side you are on (`Peak 2×` / `Off-peak 0.5×`) and how long until it flips. Since 0.2.0 it also shows a second line — **this week's spend during peak, and what it would have been off-peak** — computed from DSH's own `~/.dsh/.dshw-usage.json` (`Peak spend this week ¥0.06 · would have saved ¥0.03`). That number is an estimate from per-request costs, not your bill.

## Peak rules

Judged **only** from the host clock in Beijing time, in `lib/peak.js`:

| | |
|---|---|
| Peak (高峰计价) | Monday–Friday, `09:00–12:00` and `14:00–18:00` Beijing time |
| Off-peak (空闲计价) | everything else: `00:00–09:00`, `12:00–14:00`, `18:00–24:00`, all weekends, all Chinese public holidays, and weekends that are 调休 workdays |

The built-in holiday table (`BUILTIN_HOLIDAYS` in `lib/peak.js`) lists all of **2026** plus the already-published **2027** dates: New Year 1/1–1/3, Spring Festival 2/5–2/13, Qingming 4/3–4/5, Dragon Boat 6/9, Mid-Autumn 9/15, National Day 10/1–10/7.

**Labor Day 2027 (4/30–5/4) is deliberately absent.** The 2027 schedule was only available through media repeats, where that block is marked 「预计」 with a single make-up workday — and guessing a holiday date wrong can *miss* a reminder, which is worse than an extra one. Add it yourself once the State Council notice is out:

```json
// ~/.dsh/peak-reminder-holidays.json — merged on top of the built-in table
["2027-04-30", "2027-05-01", "2027-05-02", "2027-05-03", "2027-05-04"]
```

Until a future holiday is added, it is treated as an ordinary weekday: **over-reminds but never misses**.

## Configuration

The settings page writes `~/.dsh/peak-reminder.json`; you can also edit the file by hand (no restart needed, the host reads it per request):

```json
{
  "enabled": true,
  "intervalMinutes": 5,
  "notifyOnSwitch": true,
  "showSidebar": true,
  "showLedger": true,
  "autoResume": true,
  "resumeText": "Continue the paused task from where it stopped. Do not restate what is already done.",
  "peakHours": [[9, 12], [14, 18]],
  "holidays": ["2027-04-30"]
}
```

| key | default | meaning |
|---|---|---|
| `enabled` | `true` | master switch; off means no reminders and the sidebar row reads "Reminders off" |
| `intervalMinutes` | `5` | minutes between reminders while peak (clamped to 1–120) |
| `notifyOnSwitch` | `true` | also remind once at each peak↔off-peak boundary |
| `showSidebar` | `true` | show the sidebar status row at all |
| `showLedger` | `true` | show the second line "Peak spend this week ¥x · would have saved ¥y" (0.2.0) |
| `peakHours` | `[[9,12],[14,18]]` | peak windows in Beijing time, `[startHour, endHour)`; invalid or overlapping input falls back to the default instead of throwing (0.2.0) |
| `autoResume` | `true` | resume paused sessions automatically once the clock leaves peak hours (0.3.0) |
| `resumeText` | see above | the prompt sent when resuming; a blank value falls back to the default (0.3.0) |
| `holidays` | `null` | extra off-peak dates, `["YYYY-MM-DD", …]` or `{"YYYY-MM-DD": 1}`; merged with `~/.dsh/peak-reminder-holidays.json` and the built-in table (0.2.0) |

## HTTP surface

The host half registers routes on the DSH web server (no auth, same as other plugin routes):

```
GET  /plugins/dsh-peak-reminder/state    -> { ok, now, isPeak, peakWindow, nextChangeAt, dayKind, dayKindCode, config, rules }
GET  /plugins/dsh-peak-reminder/config   -> { ok, config, file }
POST /plugins/dsh-peak-reminder/config   -> { ok, config, file }   body: any subset of the keys above
GET  /plugins/dsh-peak-reminder/tasks    -> { ok, tasks: [{ sessionId, title }], paused: [{ sessionId, title, at }] }
POST /plugins/dsh-peak-reminder/pause    -> { ok } | { ok:false, reason }   body: { sessionId }
POST /plugins/dsh-peak-reminder/resume   -> { ok, done, failed }             body: { sessionId } or { all: true }
```

`now` is the host's epoch seconds. The client renders from that and corrects for local clock skew, so the countdown follows the machine that actually knows the time. Peak/off-peak decisions are never re-derived in the browser — only the host decides, so the holiday table lives in exactly one place.

`dayKind` is an English label kept for older clients; `dayKindCode` (`weekday` | `weekend` | `holiday`) is the stable value the client localizes itself.

## How it works

- `lib/index.js` — host half: `apply(ctx, config)` injects `webServer`, registers the routes, and owns config loading (`defaults < cordis patch config < ~/.dsh/peak-reminder.json`).
- `lib/client.js` — browser half: injected through `slots.register` into `sidebar.footer.action` and `settings.section`; polls `/state` every 30 s, ticks once a second for the countdown, and renders the banner with plain DOM (no dependency on any DSH component package). All copy lives in the `EN` table at the top of the file and is translated through `t(key, params)`.
- `lib/pause.js` — running-session lookup via the host `agents` service, pause/resume against the `sessionController` service, plus the `~/.dsh/peak-reminder-paused.json` ledger (0.3.0).
- `lib/peak.js` — pure functions, no dependencies: `isPeakTime`, `nextPeakChangeAt`, `currentPeakWindow`, `dayKindCode`, `dayKindLabel`, `isWeekend`, `isHolidayValley`.

## Peak-time pause and resume (0.3.0)

Peak pricing is 2× and nothing stops you from being mid-task when 09:00 hits. The tasks panel in Settings lists every session the host reports as **running**, with one button: **Pause**.

- **Pause** cancels the session's *current turn only* (`agent.cancel({ kind: 'user' }, { keepInbox: true })`). Queued messages and the rest of the task stay in the inbox.
- The session id goes into `~/.dsh/peak-reminder-paused.json` **before** the cancel is attempted, and the record is rolled back if the cancel throws — a failed pause never silently loses a task.
- **Resume** enqueues one prompt (`session.prompt`, `mode: 'queue'`) with `resumeText`, so the agent picks the task up again as an ordinary queued turn.
- With `autoResume` on (default), a 60-second host heartbeat checks the clock: **outside peak hours**, every paused session is resumed automatically. During peak hours it does nothing.
- The sidebar row keeps a count while anything is paused: `⏸ 2 tasks paused`.

Two honest limits: this only stops a session at a **turn boundary** — a tool call already in flight finishes first; and `resumeText` is an ordinary prompt, so the model continues from context rather than from a saved checkpoint.

## Test

```sh
node test/run.mjs
```

13 groups: the 09:00/12:00/14:00/18:00 boundaries, weekends, a 调休 Sunday, National Day, the window label, `dayKindCode`/`dayKindLabel`, `nextPeakChangeAt` across a weekend and that the state flips on every boundary it reports; custom peak hours and the holiday override; the weekly ledger against a fabricated `~/.dsh/.dshw-usage.json`; the host `/state` payload through a fake `webServer`; and the pause/resume wiring through fake `agents` + `sessionController` (including a resume that throws and must stay in the list).

## License

MIT — same as upstream. Original plugin © 54nanmiao; this fork only translates the UI.
