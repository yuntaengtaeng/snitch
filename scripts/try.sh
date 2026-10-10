#!/usr/bin/env bash
# 깨끗한 시험 저장소를 만들고 그 안에서 이 저장소의 snitch 를 --plugin-dir 로 실행
# 사용: scripts/try.sh [시험 저장소 경로, 기본 ~/snitch-test], 실행할 claude 는 CLAUDE_BIN 으로 바꿀 수 있음
set -euo pipefail

plugin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="${1:-$HOME/snitch-test}"
marker=".git/snitch-test"

if [ -e "$test_dir" ]; then
  if [ ! -e "$test_dir/$marker" ]; then
    echo "snitch 시험 저장소가 아니라서 건드리지 않음: $test_dir" >&2
    echo "다른 경로를 인자로 주거나 폴더를 직접 정리 필요" >&2
    exit 1
  fi
  rm -rf "$test_dir"
fi

mkdir -p "$test_dir"
cd "$test_dir"
git init -q
git config core.autocrlf false
printf '# snitch-test\n' > README.md
git add README.md
git commit -qm init
touch "$marker"

echo "시험 저장소: $(pwd)"
echo "시나리오: $plugin_dir/docs/testing.md"
echo
exec "${CLAUDE_BIN:-claude}" --plugin-dir "$plugin_dir"
