#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${ROOT_DIR}/Goylord-Client/third_party/onevpl"
DEST_HEADER="${DEST_DIR}/include/vpl/mfxvideo.h"
REPO_URL="${ONEVPL_REPO:-https://github.com/oneapi-src/oneVPL.git}"
REF="${ONEVPL_REF:-v2.15.0}"
[[ -s "${DEST_HEADER}" && "${1:-}" != "--force" ]] && exit 0
command -v git >/dev/null 2>&1 || { echo "git is required to vendor oneVPL headers" >&2; exit 1; }
TMP_DIR="${DEST_DIR}/.onevpl.tmp"
rm -rf "${TMP_DIR}"; trap 'rm -rf "${TMP_DIR}"' EXIT; mkdir -p "${DEST_DIR}"
git clone --depth 1 --filter=blob:none --sparse --branch "${REF}" "${REPO_URL}" "${TMP_DIR}"
git -C "${TMP_DIR}" sparse-checkout set --no-cone api/vpl/ LICENSE
rm -rf "${DEST_DIR}/include"; mkdir -p "${DEST_DIR}/include"
cp -R "${TMP_DIR}/api/vpl" "${DEST_DIR}/include/vpl"; cp "${TMP_DIR}/LICENSE" "${DEST_DIR}/LICENSE"
rm -rf "${TMP_DIR}"; trap - EXIT
echo "Cached Intel oneVPL ${REF} headers"
