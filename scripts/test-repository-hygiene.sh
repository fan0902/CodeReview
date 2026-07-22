#!/usr/bin/env bash
set -euo pipefail

developer_home_prefix='/''Users/'
temporary_input_prefix='/''var/folders/'
legacy_brand='tab''bit'
personal_workspace_name='fan''lei06'
status=0

check_absent() {
  local label="$1"
  local pattern="$2"
  shift 2
  if git grep -I -n "$@" -F "$pattern" -- .; then
    echo "Repository hygiene failed: $label" >&2
    status=1
  fi
}

check_absent "developer home path" "$developer_home_prefix"
check_absent "machine temporary input path" "$temporary_input_prefix"
check_absent "personal workspace name" "$personal_workspace_name"
check_absent "legacy product name" "$legacy_brand" -i

if ! git grep -I -n -F 'NSWorkspace.shared.open' -- launcher/Sources/CRLauncher/ServiceLauncher.swift >/dev/null; then
  echo "Repository hygiene failed: default-browser API not found" >&2
  status=1
fi

exit "$status"
