# snitch

[한국어](README.md) | English

A Claude Code mod that snitches on everything Claude does. It keeps telling you, right beside the conversation, which files Claude changed and why, what each subagent is doing, whether the work got committed, and whether another session is touching the same files.

![snitch in action](docs/images/screen.png)

![snitch while subagents are running](docs/images/screen-agents.png)

- **Requirements**: Claude Code v2.1.287 or later (CLI, Code tab in the desktop app)
- **Supported OS**: macOS, Linux, Windows

> The screenshots and the panel itself are in Korean. UI labels are translated in this README.

## Install

In Claude Code, add the marketplace and install the plugin.

```
/plugin marketplace add yuntaengtaeng/snitch
/plugin install snitch@snitch
```

From a terminal, you can install it in one line.

```
claude plugin install snitch --marketplace yuntaengtaeng/snitch
```

Restart Claude Code after installing.

## Features

### Status line

![Status line](docs/images/status-line.png)

Shown as a single line below the prompt.

```
Opus 5.5 high  |  남은 한도 5h 38%, 7d 69%
```

| Item | Description |
|---|---|
| Model, effort | Model and effort of the main conversation's latest request |
| Remaining limit (`남은 한도`) | Percentage left of your plan's usage limits (5 hours, 7 days), the same values as the bars in the dashboard title |

- Model and effort appear after the first request, and changes show up from the next request.
- Limits are shown only on subscription plans.
- Edited files are shown in the dashboard panel.

### Dashboard panel

![Dashboard panel](docs/images/pane.png)

Shows agent activity and the files Claude edited in the current session in one panel. Each file comes with git line counts and a one-line reason for the change, and moves to the commit section once Claude commits it.

```
snitch              5h ▰▰▱▱▱▱ 38%  7d ▰▰▰▰▱▱ 69%
──────────────────────────────────────────────────

에이전트 3
● main                                     1분 12초
  Agent 장바구니 훅 작성
● 장바구니 훅 작성                              40초
  Write useCart.ts
✓ 헤더 컴포넌트 찾기                             12초

변경 파일 2                                +42 −1
M Home.tsx  ⚠ 다른 세션도 수정 중              +4 −1
  장바구니 버튼 헤더 이동
  apps/merchant/src/feature/main/screens
A useCart.ts                                +38 −0
  화면 간 장바구니 상태 공유용 훅
  apps/merchant/src/hooks, 장바구니 훅 작성

커밋 2
● 38c3ddf feat: 로그인 수정                  +40 −3
● cee919f fix: 리다이렉트                     +3 −1
```

Sections: `에이전트` agents, `변경 파일` changed files, `커밋` commits.

| Mark | Meaning |
|---|---|
| Title bars | Remaining plan limits (5 hours, 7 days), green plenty, yellow below half, red below 20% |
| Agent icon | `●` working, `✓` done, `✕` error, `○` idle |
| Agent name | Task name for subagents, `main` for the main conversation |
| Time on the right | Elapsed time while working, total time once finished |
| Line under an agent | Latest tool call while working (paths shortened to file names) |
| `M` / `A` | Modified file / new file (with `PANE_FILE_LINKS` on, click the name to open it) |
| `+N −N` | Lines added / removed according to git |
| First line under a file | One-line reason for the change (see below) |
| Last line under a file | Folder, plus the task name if a subagent made the change |
| `⚠ 다른 세션도 수정 중` | Another Claude Code session in the same folder modified this file in the last 30 minutes |

| Command | Action |
|---|---|
| `/snitch` | Show / close the dashboard panel |
| `/snitch text` | Print as text instead of a panel |
| `/snitch why` | Re-summarize change reasons for uncommitted files |

`/changes` is an alias that does the same.

**Agents**

![Agent activity](docs/images/agents.png)

- The agent section appears only when there are subagents.
- `main` is the main conversation. It shows as working while Claude responds and idle once the response ends.
- A subagent shows as working when it starts and done when it finishes (error if it failed or was stopped). Finished subagents are removed when you enter the next request.
- While any agent is working, elapsed times refresh every 5 seconds and statuses are synced with Claude Code's agent list.
- Data comes only from events in the current session (subagent start, tool calls, turn end). Agents in other sessions are not shown.

**Change reasons**

![Change reasons](docs/images/reasons.png)

Change reasons are written **by the Claude that made the edit**. snitch registers a `change_note` tool, and before finishing a response that edited files, Claude uses it to note, for each file, *why* rather than *what*, as a short phrase of about 30 characters (e.g. `화면 간 장바구니 상태 공유용 훅`, "hook for sharing cart state across screens"). Files edited by a subagent are noted by that subagent.

- The `change_note` call appears as one line in the conversation, and its content shows up in the panel as is.
- Only for files Claude forgot to note, Haiku summarizes them all at once when the response ends, using your request, Claude's last reply, and the diff. While summarizing, the panel shows `변경 이유 정리 중…` (summarizing reasons).
- If the same file is edited again in a later turn, its reason is replaced.
- If a reason is empty or you don't like it, run `/snitch why` to get a fresh Haiku summary.
- Turn off author notes with `ENABLE.changeNotes` and Haiku summaries with `ENABLE.changeReasons`.

**Panel position**

![Panel position by screen mode](docs/images/layouts.png)

| Screen mode | Position |
|---|---|
| Fullscreen layout, 110 columns or wider | Right sidebar next to the conversation |
| Fullscreen layout, narrower than 110 columns | Printed as text |
| Normal screen (`CLAUDE_CODE_NO_FLICKER=0`, default in tmux) | Above the input box |

**Behavior**

- In the fullscreen layout the panel opens automatically. In a freshly opened session it appears once you start typing. If the terminal is narrower than 144 columns it opens hidden, and `/snitch` shows it.
- The list resets on a new session, `/clear`, and `/resume`.
- If only some files are committed, the rest stay under "since commit".
- The other-session marker refreshes every 20 seconds while the panel is open, and disappears once that session commits the file.
- Colors follow the Claude Code theme. The panel background is the terminal or app theme's background, and can be pinned with `PANE_BACKGROUND`.
- To see all changes in the repo, use Claude Code's built-in `/diff` command.

## Development

Run from the cloned repository.

```
claude plugin validate .
claude plugin test .
```

**Manual testing**

Run `scripts/try.sh` in Git Bash to create a clean test repository at `~/snitch-test` and launch snitch inside it. Scenarios to check are in [docs/testing.md](docs/testing.md) (Korean).

**Try your changes right away (one session, no install)**

```
claude --plugin-dir .
```

The `'claude-code'` types are generated in `.claude-plugin/types/` when Claude Code loads the mod. Run the command above once after cloning and the type errors in your editor go away.

## Permissions

Mods run without a sandbox, with the same permissions as Claude Code. This plugin uses the following.

| Permission | Purpose |
|---|---|
| Run `git` (read-only) | `diff`, `show`, `log`, `rev-parse`, `ls-files` |
| Read files | Line counts for new files, new file contents for change reason summaries |
| Register a tool | Adds the `change_note` tool and its usage guide to the system prompt |
| Call a model | Summarizes change reasons for files without a note (`REASON_MODEL`) |
| Plugin storage | Per-file edit timestamps (deleted automatically after 60 minutes) |

When Haiku summarizes change reasons, your request, Claude's reply, and the diffs of changed files are sent to the model through Claude Code. No other network access is made.

These summary calls count toward your Claude Code usage (plan limits). Files Claude already noted with `change_note` are not summarized, so a call happens only when a note is missing, and none happen with `ENABLE.changeReasons` turned off.

## Configuration

`hooks/config.ts`

| Setting | Default | Description |
|---|---|---|
| `ENABLE.statusLine` | `true` | Show the status line |
| `ENABLE.modelEffort` | `true` | Show model and effort in the status line |
| `ENABLE.workFiles` | `true` | Dashboard panel |
| `ENABLE.changeNotes` | `true` | Change reasons Claude writes itself with the `change_note` tool |
| `ENABLE.changeReasons` | `true` | Summarize reasons for files without a note using Haiku |
| `PANE_AUTO_OPEN` | `true` | Open the panel automatically in fullscreen |
| `PANE_DOCK_COLUMNS` | `56` | Requested width of the right panel |
| `PANE_FILE_LINKS` | `false` | Show file names as file:// links (terminals without link support show the raw URL) |
| `PANE_MAX_ROWS` | `30` | Maximum height (rows) requested when opening the panel |
| `LIMIT_BAR_SEGMENTS` | `6` | Number of segments in the title limit bars |
| `AGENT_TICK_SEC` | `5` | Agent status check interval (seconds) |
| `PANE_MIN_COLUMNS` | `110` | Minimum width to show the panel in fullscreen |
| `PANE_BACKGROUND` | `null` | Panel background color (`null` follows the theme) |
| `CONFLICT_TTL_MIN` | `30` | How long another session's edit counts (minutes) |
| `CONFLICT_POLL_SEC` | `20` | Interval for checking other sessions' edits (seconds) |
| `REASON_MODEL` | `'haiku'` | Model used to summarize change reasons |
| `REASON_DIFF_CHARS` | `12000` | Maximum diff characters included in a summary request |
| `REASON_MAX_CHARS` | `30` | Maximum characters in a one-line reason |
| `REASON_TIMEOUT_SEC` | `30` | Summary request timeout (seconds) |

## Limitations

- Tracked files are those edited with the Edit, Write, MultiEdit, and NotebookEdit tools, plus files Claude Code reports as changed by a Bash run. Files you edit yourself are not included.
- Only `git commit` runs that Claude executes through Bash are detected as commits.
- The dashboard panel does not work in folders that are not git repositories.
- The other-session marker works only between sessions on the same machine and in the same folder. Folders split with git worktree and sessions on other machines are not detected.
- The mod API is at an early stage, and behavior may change with Claude Code updates.

## License

[MIT](LICENSE)
