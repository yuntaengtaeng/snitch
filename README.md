# snitch

한국어 | [English](README.en.md)

Claude가 한 일을 옆에서 계속 일러바치는 Claude Code mod입니다.

![snitch 적용 화면](docs/images/screen.png)

- **무엇을 왜 고쳤나**: 바뀐 파일마다 고친 이유 한 줄, 요청별 이력, 파일 diff와 그 자리에서 수정 요청
- **무엇이 남았나**: 내가 정해야 할 결정, 할 일, Claude가 만든 링크를 패널 맨 위에 고정
- **지금 어떤 상태인가**: 서브에이전트 현황, 남은 사용 한도와 초기화 시각, 다른 세션과 같은 파일 수정 경고

요구 사항: Claude Code v2.1.287 이상 (CLI, 데스크톱 앱 Code 탭), macOS, Linux, Windows

## 설치

Claude Code에서 마켓플레이스를 추가한 뒤 설치합니다.

```
/plugin marketplace add yuntaengtaeng/snitch
/plugin install snitch@snitch
```

터미널에서는 한 줄로 설치할 수 있습니다.

```
claude plugin install snitch --marketplace yuntaengtaeng/snitch
```

설치 후 Claude Code를 다시 시작하면 적용됩니다.

## 빠른 시작

git 저장소에서 Claude Code를 열고 평소처럼 작업을 요청합니다. 전체화면 레이아웃이면 우측에 패널이 자동으로 열리고, 아니면 `/snitch`로 엽니다.

![대시보드 패널 구성](docs/images/pane.png)

패널은 위에서부터 기억할 거리, 에이전트, 변경 파일, 커밋 순서이며, 내용이 없는 구역은 숨깁니다. 화면 모드와 터미널 너비에 따른 패널 위치는 [동작 방식](docs/how-it-works.md#패널-위치)을 참고하세요.

## 기능

### 기억할 거리

![기억할 거리 보드](docs/images/board.png)

대화가 길어져도 잊히지 않도록 결정, 할 일, 링크를 패널 맨 위에 모아 둡니다.

- **결정**: Claude가 내 답이 필요한 질문을 남깁니다. 선택지 버튼을 누르거나 `직접 답하기`로 답하면 그 답이 내 요청으로 전송되고, Claude가 받아서 결정을 닫습니다.
- **할 일**: 여러 단계 작업은 Claude가 할 일로 등록하고, 진행 중인 항목과 완료 수를 보여 줍니다.
- **링크**: PR, 배포 주소, 아티팩트처럼 Claude가 이번 세션에 만든 결과물의 링크만 모읍니다. 이름이나 `⧉`를 누르면 전체 주소를 클립보드에 복사하고 토스트로 알립니다.

보드 내용은 매 요청마다 Claude에게도 전달되어, Claude도 열린 결정과 할 일을 잊지 않습니다.

### 변경 파일과 이유

![변경 이유](docs/images/reasons.png)

이 세션에서 Claude가 바꾼 파일을 git 기준 줄 수와 함께 보여 주고, 파일마다 왜 바꿨는지 한 줄을 붙입니다.

- 이유는 코드를 고친 Claude가 `change_note` 도구로 직접 남깁니다. 빠뜨린 파일만 응답이 끝날 때 Haiku가 요약합니다.
- 같은 파일을 여러 요청에 걸쳐 고치면 이유가 요청 순서대로 쌓이고, 패널에는 최근 이유와 `이력 N`이 보입니다.
- Claude가 커밋하면 파일이 커밋 구역으로 옮겨 갑니다.
- 같은 폴더의 다른 Claude Code 세션이 최근 30분 안에 같은 파일을 고쳤으면 `⚠ 다른 세션도 수정 중`을 표시합니다.

### 파일 상세와 수정 요청

![파일 상세](docs/images/detail.png)

변경 파일 행을 누르면 그 파일의 이유 이력과 diff를 변경 덩어리(hunk)별로 보여 줍니다. `[ 수정 요청 ]`을 누르고 `이 부분은 기존 방식으로 수정해줘`처럼 쓰면 `[src/auth/login.ts 10-13줄] 이 부분은 기존 방식으로 수정해줘`가 내 요청으로 전송됩니다. Esc로 목록으로 돌아갑니다.

### 에이전트

![에이전트 현황](docs/images/agents.png)

서브에이전트가 있으면 작업 이름, 상태(`●` 작업 중, `✓` 완료, `✕` 오류), 경과 시간, 마지막 툴 호출을 보여 줍니다. 끝난 서브에이전트는 다음 요청 때 목록에서 빠집니다.

### 상태줄

![상태줄 구성](docs/images/status-line.png)

```
Opus 5.5 high  |  남은 한도 5h 38% 15:40 초기화, 7d 69% 10/15 초기화
```

메인 대화의 모델과 effort, 요금제 남은 한도와 초기화 시각을 프롬프트 아래 한 줄로 보여 줍니다. 한도는 구독 요금제에서만 표시됩니다.

## 명령

| 명령 | 동작 |
|---|---|
| `/snitch` | 대시보드 패널 열기, 닫기 |
| `/snitch text` | 패널 대신 텍스트로 출력 |
| `/snitch why` | 커밋하지 않은 파일의 변경 이유 다시 요약 |
| `/snitch why <파일>` | 그 파일의 요청별 변경 이유 이력 출력 |

`/changes`는 `/snitch`의 별칭입니다.

## 설정

`hooks/config.ts`에서 바꿉니다. 자주 쓰는 설정만 적었고, 나머지는 파일 안 주석에 있습니다.

| 설정 | 기본값 | 설명 |
|---|---|---|
| `ENABLE.statusLine` | `true` | 상태줄 |
| `ENABLE.workFiles` | `true` | 대시보드 패널 |
| `ENABLE.board` | `true` | 기억할 거리 보드 |
| `ENABLE.changeNotes` | `true` | Claude가 직접 남기는 변경 이유 |
| `ENABLE.changeReasons` | `true` | 메모가 빠진 파일의 Haiku 요약 |
| `PANE_AUTO_OPEN` | `true` | 전체화면에서 패널 자동 열기 |
| `PANE_DOCK_COLUMNS` | `56` | 우측 패널 너비 |
| `PANE_FILE_LINKS` | `false` | 파일 상세의 파일 이름을 file:// 링크로 표시 |
| `REASON_MODEL` | `'haiku'` | 변경 이유를 요약할 모델 |

## 권한과 데이터

mod는 샌드박스 없이 Claude Code와 같은 권한으로 실행됩니다.

| 권한 | 용도 |
|---|---|
| `git` 실행 | 변경량과 diff 읽기 (`diff`, `show`, `log`, `rev-parse`, `ls-files`), Haiku 요약의 비교 기준 저장 (`hash-object -w`, 참조되지 않는 객체라 git gc 때 정리) |
| 파일 읽기 | 새 파일의 줄 수와 내용 |
| 도구 등록 | `change_note`, `board` 도구와 사용 안내, 지금 보드 내용을 시스템 프롬프트에 추가 |
| 프롬프트 전송 | 결정 답과 수정 요청, 내가 버튼이나 입력칸을 눌렀을 때만 내 요청으로 전송 |
| 응답 되돌리기 | Claude가 질문으로 끝냈는데 결정을 남기지 않았으면 한 번 돌려보냄 |
| 모델 호출 | 메모가 빠진 파일의 변경 이유 요약 (`REASON_MODEL`, 요금제 한도에 포함) |
| 플러그인 저장소 | 다른 세션 경고용 파일별 수정 시각 (60분 뒤 삭제) |

Haiku 요약 때 사용자 요청, Claude의 답변, 바뀐 파일의 diff가 Claude Code를 통해 모델로 전송됩니다. 그 밖의 네트워크 접근은 하지 않습니다.

## 제한 사항

- Claude가 Edit, Write, MultiEdit, NotebookEdit, Bash로 바꾼 파일만 추적합니다. 사용자가 직접 편집한 파일은 포함되지 않습니다.
- 커밋 구역에는 Claude가 실행한 `git commit`만 올라갑니다. 사용자가 직접 커밋한 파일은 HEAD와 같아지면 변경 파일에서 빠집니다.
- 결정과 할 일은 Claude가 도구로 남기므로, 모델이 빠뜨리면 보드에 올라오지 않습니다.
- 변경 이유 이력과 보드는 세션 안에서만 유지되며, `/clear`, `/resume` 때 비웁니다.
- git 저장소가 아닌 폴더에서는 대시보드 패널이 동작하지 않습니다.
- 다른 세션 경고는 같은 PC, 같은 폴더의 세션끼리만 동작합니다.
- 입력창에 포커스가 있을 때는 패널 버튼을 처음 누를 때 두 번 눌러야 할 수 있습니다.
- mod API는 초기 단계로, Claude Code 업데이트에 따라 동작이 달라질 수 있습니다.

## 개발

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

`'claude-code'` 타입은 Claude Code가 mod를 로드할 때 `.claude-plugin/types/`에 만듭니다. 클론한 뒤 `claude --plugin-dir .`로 한 번 실행하면 에디터의 타입 오류가 사라집니다. Git Bash에서 `scripts/try.sh`를 실행하면 깨끗한 시험 저장소에서 snitch를 띄우며, 확인할 시나리오는 [docs/testing.md](docs/testing.md)에 있습니다. 내부 동작은 [docs/how-it-works.md](docs/how-it-works.md)에 정리했습니다.

## 참고한 프로젝트

- [pinboard](https://github.com/sirkitree/pinboard) (MIT): 기억할 거리 보드의 도구 규칙, 질문을 결정으로 남기게 하는 Stop 훅, 링크 수집 규칙

## 라이선스

[MIT](LICENSE)
