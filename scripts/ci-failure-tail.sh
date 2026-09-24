#!/usr/bin/env bash
set -o pipefail
output="${RUNNER_TEMP:-/tmp}/step-output.log"
status=0
"$@" 2>&1 | tee "$output" || status=$?
if [ "$status" -ne 0 ]; then
  tail_text="$(tail -n 120 "$output" | sed -e 's/\x1b\[[0-9;]*m//g')"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    { echo "### \`$*\` failed with exit code $status"; echo '```'; echo "$tail_text"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
  fi
  percent='%' encoded_percent='%25' encoded_cr='%0D' encoded_lf='%0A' cr=$'\r' lf=$'\n'
  escaped="${tail_text//$percent/$encoded_percent}"
  escaped="${escaped//$cr/$encoded_cr}"
  escaped="${escaped//$lf/$encoded_lf}"
  echo "::error title=Output tail::$escaped"
fi
exit "$status"
