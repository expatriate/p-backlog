#!/usr/bin/env bash
set -euo pipefail
sha="$1"
workflow=ci.yml
attempts=40
interval_seconds=30
for attempt in $(seq 1 "$attempts"); do
  runs="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow/runs?head_sha=$sha&per_page=100" --jq '[.workflow_runs[] | {status, conclusion}]')"
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
echo "::error::$workflow has no successful run on $sha: push the commit to main and wait for CI before tagging"
exit 1
