#!/usr/bin/env bash
set -euo pipefail
sha="$1"
workflow=ci.yml
# Must outlast the slowest job's timeout-minutes in ci.yml and stay under the publish job's timeout-minutes in release.yml.
wait_minutes=38
interval_seconds=30
attempts=$((wait_minutes * 60 / interval_seconds))
runs="[]"
api_failed=false
for attempt in $(seq 1 "$attempts"); do
  if ! response="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow/runs?head_sha=$sha&event=push&per_page=100" --jq '[.workflow_runs[] | {status, conclusion}]')"; then
    api_failed=true
    echo "GitHub API request failed (attempt $attempt of $attempts), retrying"
    sleep "$interval_seconds"
    continue
  fi
  api_failed=false
  runs="$response"
  if jq -e 'any(.[]; .conclusion == "success")' <<< "$runs" > /dev/null; then
    echo "$workflow passed on $sha"
    exit 0
  fi
  if jq -e 'length > 0 and all(.[]; .status == "completed")' <<< "$runs" > /dev/null; then
    echo "::error::$workflow did not pass on $sha: $runs"
    exit 1
  fi
  echo "Waiting for $workflow on $sha (attempt $attempt of $attempts): $runs"
  sleep "$interval_seconds"
done
if [[ $api_failed == true ]]; then
  echo "::error::could not read $workflow runs on $sha from the GitHub API; last known runs: $runs"
elif jq -e 'length > 0' <<< "$runs" > /dev/null; then
  echo "::error::$workflow still running on $sha after $wait_minutes minutes: $runs"
else
  echo "::error::$workflow has no run on $sha: push the commit to main and wait for CI before tagging"
fi
exit 1
