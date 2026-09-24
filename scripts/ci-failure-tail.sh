#!/usr/bin/env bash
set -o pipefail
output="${RUNNER_TEMP:-/tmp}/step-output.log"
chunks="${RUNNER_TEMP:-/tmp}/step-output-chunk-"
status=0
"$@" 2>&1 | tee "$output" || status=$?
if [ "$status" -ne 0 ]; then
  sed -e 's/\x1b\[[0-9;]*m//g' "$output" | grep -v -E '^[[:space:]]*✓' | tail -n 140 > "$output.tail"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    { echo "### \`$*\` failed with exit code $status"; echo '```'; cat "$output.tail"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
  fi
  rm -f "$chunks"*
  split -l 20 "$output.tail" "$chunks"
  percent='%' encoded_percent='%25' encoded_cr='%0D' encoded_lf='%0A' cr=$'\r' lf=$'\n'
  for chunk in "$chunks"*; do
    text="$(cut -c 1-160 "$chunk")"
    text="${text//$percent/$encoded_percent}"
    text="${text//$cr/$encoded_cr}"
    text="${text//$lf/$encoded_lf}"
    echo "::error title=Output tail ${chunk##*-}::$text"
  done
fi
exit "$status"
