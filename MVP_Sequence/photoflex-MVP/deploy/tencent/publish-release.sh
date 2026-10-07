#!/usr/bin/env bash
set -euo pipefail

: "${PHOTO_FLEX_SSH_KEY:?Production deploy key is required}"
: "${GITHUB_SHA:?Commit is required}"
: "${GITHUB_RUN_ID:?Workflow run is required}"
: "${GITHUB_RUN_ATTEMPT:?Workflow attempt is required}"
: "${RUNNER_TEMP:?Runner temporary directory is required}"

latest_main="$(git ls-remote origin refs/heads/main | cut -f 1)"
if [[ "$latest_main" != "$GITHUB_SHA" ]]; then
  echo "A newer main commit exists; skipping this older production release."
  exit 0
fi

deploy_run="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
key_file="${RUNNER_TEMP}/photoflex-deploy-key"
hosts_file="${RUNNER_TEMP}/photoflex-known-hosts"
trap 'rm -f -- "$key_file" "$hosts_file"' EXIT
umask 077
printf '%s\n' "$PHOTO_FLEX_SSH_KEY" > "$key_file"
unset PHOTO_FLEX_SSH_KEY
printf '%s\n' '42.192.45.207 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBDGTsNIAoPhizYYpklK+0LoN2Ed92PW/lZn0LaLwy9h' > "$hosts_file"

archive_sha="$(sha256sum photoflex-production.tar.gz | cut -d ' ' -f 1)"
ssh -T -i "$key_file" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$hosts_file" -o HostKeyAlgorithms=ssh-ed25519 \
  -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 \
  ubuntu@42.192.45.207 "deploy ${GITHUB_SHA} ${deploy_run} ${archive_sha}" \
  < photoflex-production.tar.gz

curl --fail --silent --show-error --retry 3 --retry-delay 2 \
  --max-time 20 https://photoflex.site/release.json > live-release.json
node --input-type=module -e '
  import fs from "node:fs";
  const record = JSON.parse(fs.readFileSync("live-release.json", "utf8"));
  const run = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  if (record.commit !== process.env.GITHUB_SHA || record.run !== run) {
    throw new Error("Public website did not serve this deployment");
  }
  console.log(`Verified public website at commit ${record.commit}`);
'
