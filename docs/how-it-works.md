# snitch 동작 방식

README에 담지 않은 세부 동작과 전체 설정입니다.

## 패널 위치

![화면 모드별 패널 위치](images/layouts.png)

| 화면 모드 | 위치 |
|---|---|
| 전체화면 레이아웃, 110칸 이상 | 대화 우측 사이드바 |
| 전체화면 레이아웃, 110칸 미만 | 패널 대신 텍스트로 출력 |
| 일반 화면 (`CLAUDE_CODE_NO_FLICKER=0`, tmux 기본값) | 입력창 위 |

- 전체화면 레이아웃에서는 세션마다 패널이 한 번 자동으로 열립니다. 세션을 막 열었을 때는 입력을 시작하면 나타납니다.
- Claude Code는 사용자가 열지 않은 패널을 144칸 이상일 때만 배치합니다. 그보다 좁으면 숨겨진 채 열리며 `/snitch`로 표시합니다.
- 빈 보드에 첫 항목이 생길 때도 패널을 엽니다.
- 색상은 Claude Code 테마를 따르며, `PANE_BACKGROUND`로 패널 배경을 고정할 수 있습니다.

## 변경 파일

- Edit, Write, MultiEdit, NotebookEdit 툴이 성공한 파일과, Claude Code가 Bash 실행 결과로 알려 주는 변경 파일을 기록합니다.
- 줄 수는 `git diff --numstat HEAD`로, 새 파일은 `git ls-files --others`와 파일 줄 수로 셉니다. HEAD와 같은 파일은 목록에서 뺍니다.
- git 명령이 실패하면(다른 git 작업이 잠금을 잡고 있을 때 등) 이전 목록을 그대로 둡니다.
- 사용자가 직접 커밋하거나 되돌려 HEAD와 같아진 파일은 다음 갱신 때 빠지고 그 이유 이력도 지웁니다. 갱신은 새 요청, 파일 편집, Bash 실행, 패널이 열려 있으면 20초마다 일어납니다.
- Claude가 Bash로 `git commit`을 실행하면 HEAD 커밋을 커밋 구역에 올립니다.

## 다른 세션 경고

- 파일을 고칠 때마다 플러그인 저장소에 저장소 경로, 파일, 세션, 시각을 남깁니다.
- 같은 저장소의 다른 세션이 최근 30분(`CONFLICT_TTL_MIN`) 안에 같은 파일을 고쳤으면 `⚠ 다른 세션도 수정 중`을 표시합니다.
- 기록은 60분 뒤, 또는 그 세션이 파일을 커밋하면 지웁니다.

## 변경 이유

- snitch가 `change_note` 도구를 등록하고 사용 안내를 시스템 프롬프트에 붙입니다. Claude는 파일을 고친 응답을 마치기 전에 파일마다 "왜"를 30자 안팎의 명사구로 남깁니다. 서브에이전트가 고친 파일은 그 서브에이전트가 남깁니다.
- 메모가 빠진 파일만, 메인 대화의 응답이 끝날 때 `REASON_MODEL`(기본 Haiku)이 사용자 요청, Claude의 마지막 답변, diff를 보고 한 번에 요약합니다.
- 요약은 직전 응답이 끝난 시점 이후의 변경만 봅니다. 응답이 끝날 때 파일 내용을 `git hash-object -w`로 저장해 두고 다음 요약 때 그 객체와 비교합니다.
- 이유는 요청마다 쌓이며(파일마다 최근 10개), 같은 요청 안에서는 마지막 이유로 바뀝니다. 작성자 메모는 같은 요청의 Haiku 요약으로 덮이지 않습니다.
- `/snitch why`는 커밋하지 않은 파일의 최근 이유를 HEAD 대비 변경으로 다시 요약합니다.

## 파일 상세

- HEAD 대비 diff를 hunk 단위로 보여 주며, 합계가 `DETAIL_DIFF_CHARS`를 넘으면 뒤쪽 hunk는 생략합니다. hunk는 자르지 않습니다.
- 줄 범위는 새 버전 기준이며, 삭제만 있는 hunk는 `N줄 근처`로 표시합니다.
- `[ 수정 요청 ]`은 패널에 포커스가 있을 때 hunk 순서대로 숫자 키 1~9로도 누를 수 있습니다.
- `‹ 목록`, `b` 키, Esc로 목록으로 돌아갑니다. 목록에서 Esc는 패널을 닫습니다.
- 모바일 앱은 입력칸을 그리지 못해 `[ 수정 요청 ]`과 `직접 답하기`가 보이지 않습니다.

## 기억할 거리

**결정과 할 일**

- snitch가 `board` 도구를 등록합니다. Claude는 사용자 답이 필요한 질문을 결정으로, 3단계 이상 작업을 할 일로 남깁니다.
- 할 일은 진행 중이 한 번에 하나이며, 확인까지 끝난 뒤에만 완료로 표시하도록 안내합니다.
- 결정에 답하면 `[결정 d1] 질문: 답`이 내 요청으로 전송되고, Claude가 그 id로 결정을 닫습니다. 닫히기 전에는 `답변 보냄`으로 표시합니다.
- 지금 보드를 id와 함께 매 요청마다 시스템 프롬프트 끝에 붙입니다.
- Claude가 질문으로 응답을 끝냈는데 열린 결정이 없으면 Stop 훅이 한 번 돌려보내 결정으로 남기게 합니다. 응답의 마지막 세 줄 중 하나가 물음표로 끝나면 질문으로 봅니다(코드 블록 제외).
- 보드는 메인 대화만 고칠 수 있습니다.

**링크**

무언가를 만든 툴 호출의 결과에서만 주소를 모읍니다. 결과에 주소가 4개 이상이면 만든 결과물이 아니라고 보고 무시하며, 최근 12개까지 남깁니다.

| 대상 | 조건 |
|---|---|
| GitHub | `gh pr create`, `gh issue create`, `gh release create`, `gh repo create`, `gh gist create`, `gh pr comment`, `gh issue comment`, `git push` |
| 배포 | `vercel deploy`, `vercel --prod`, `netlify deploy`, `firebase deploy`, `wrangler deploy`, `wrangler pages deploy` |
| 아티팩트 | `Artifact` 도구의 게시 |
| Claude Docs | 새 문서를 만드는 호출 |
| 그 밖의 MCP | 도구 이름에 create, draft, send, publish, share, upload가 들어간 것 |

## 전체 설정

`hooks/config.ts`

| 설정 | 기본값 | 설명 |
|---|---|---|
| `ENABLE.statusLine` | `true` | 상태줄 표시 |
| `ENABLE.modelEffort` | `true` | 상태줄에 모델과 effort 표시 |
| `ENABLE.workFiles` | `true` | 대시보드 패널 |
| `ENABLE.changeNotes` | `true` | Claude가 `change_note` 도구로 직접 남기는 변경 이유 |
| `ENABLE.changeReasons` | `true` | 메모가 없는 파일의 변경 이유를 Haiku로 요약 |
| `ENABLE.board` | `true` | 결정, 할 일, 링크를 모으는 기억할 거리 보드 |
| `PANE_AUTO_OPEN` | `true` | 전체화면에서 패널 자동 열기 |
| `PANE_DOCK_COLUMNS` | `56` | 우측 패널 요청 너비 |
| `PANE_FILE_LINKS` | `false` | 파일 상세의 파일 이름을 file:// 링크로 표시 (링크를 지원하지 않는 터미널에서는 주소가 그대로 보임) |
| `PANE_MAX_ROWS` | `30` | 패널을 열 때 요청하는 최대 높이(줄) |
| `PANE_MIN_COLUMNS` | `110` | 전체화면에서 패널을 표시할 최소 너비 |
| `PANE_BACKGROUND` | `null` | 패널 배경색 (`null`이면 테마를 따름) |
| `LIMIT_BAR_SEGMENTS` | `6` | 제목 줄 한도 막대 칸 수 |
| `RESET_MIN_COLUMNS` | `50` | 제목 줄에 한도 초기화 시각을 붙이는 최소 패널 너비 |
| `AGENT_TICK_SEC` | `5` | 에이전트 상태 확인 주기(초) |
| `CONFLICT_TTL_MIN` | `30` | 다른 세션의 수정을 유효하다고 볼 시간(분) |
| `CONFLICT_POLL_SEC` | `20` | 다른 세션 수정 기록 확인 주기(초) |
| `REASON_MODEL` | `'haiku'` | 변경 이유를 요약할 모델 |
| `REASON_DIFF_CHARS` | `12000` | 요약 요청에 넣을 diff 최대 글자 수 |
| `REASON_MAX_CHARS` | `30` | 변경 이유 한 줄의 최대 글자 수 |
| `REASON_TIMEOUT_SEC` | `30` | 요약 요청 제한 시간(초) |
| `DETAIL_DIFF_CHARS` | `20000` | 파일 상세 화면에 그릴 diff 최대 글자 수 |
