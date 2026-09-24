#!/usr/bin/env bash
set -o pipefail
output="${RUNNER_TEMP:-/tmp}/step-output.log"
status=0
"$@" 2>&1 | tee "$output" || status=$?
if [ "$status" -ne 0 ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### \`$*\` failed with exit code $status"; echo '```'; tail -n 120 "$output"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi
exit "$status"
