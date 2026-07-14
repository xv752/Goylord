#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${ROOT_DIR}/Goylord-Client/third_party/amf"
DEST_HEADER="${DEST_DIR}/include/core/Factory.h"
REPO_URL="${AMF_REPO:-https://github.com/GPUOpen-LibrariesAndSDKs/AMF.git}"
REF="${AMF_REF:-v1.5.2}"

if [[ -s "${DEST_HEADER}" && "${1:-}" != "--force" ]]; then
  echo "AMF headers already cached: ${DEST_DIR}/include"
  exit 0
fi

command -v git >/dev/null 2>&1 || { echo "git is required to vendor AMF headers" >&2; exit 1; }
TMP_DIR="${DEST_DIR}/.amf-sdk.tmp"
rm -rf "${TMP_DIR}"
trap 'rm -rf "${TMP_DIR}"' EXIT
mkdir -p "${DEST_DIR}"
git clone --depth 1 --filter=blob:none --sparse --branch "${REF}" "${REPO_URL}" "${TMP_DIR}"
git -C "${TMP_DIR}" sparse-checkout set --no-cone amf/public/include/ LICENSE.txt
rm -rf "${DEST_DIR}/include"
cp -R "${TMP_DIR}/amf/public/include" "${DEST_DIR}/include"
cp "${TMP_DIR}/LICENSE.txt" "${DEST_DIR}/LICENSE.txt"
rm -rf "${TMP_DIR}"
trap - EXIT
echo "Cached AMD AMF ${REF} headers in ${DEST_DIR}/include"
