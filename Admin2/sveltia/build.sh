#!/usr/bin/env bash

set -euo pipefail

readonly VERSION='0.170.8'
readonly PNPM_VERSION='10.15.0'
readonly SOURCE_SHA256='479a6c1897c6388f04b9894e82df19b6c214b38092a08cf4fe8c3e063e61ca69'
readonly NPM_SHA256='3a10325ce98964ae11b90ec556b65dc2466dccf3acebaae34f713e0891034c07'
readonly ORIGINAL_BUNDLE_SHA256='89e68943587a689f4369b773fba3a5b81f4088ddf97aaf05aee6e45911f2f037'

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ADMIN_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly WORK_DIR="$(mktemp -d)"
readonly SOURCE_ARCHIVE="${WORK_DIR}/sveltia-source.tar.gz"
readonly NPM_ARCHIVE="${WORK_DIR}/sveltia-npm.tgz"
readonly SOURCE_DIR="${WORK_DIR}/sveltia-cms-${VERSION}"
readonly NPM_DIR="${WORK_DIR}/npm"
readonly SVELTIA_UI_DIR="${SOURCE_DIR}/node_modules/@sveltia/ui"

cleanup() {
  rm -rf -- "${WORK_DIR}"
}

trap cleanup EXIT

curl --fail --location --silent --show-error \
  "https://github.com/sveltia/sveltia-cms/archive/refs/tags/v${VERSION}.tar.gz" \
  --output "${SOURCE_ARCHIVE}"
curl --fail --location --silent --show-error \
  "https://registry.npmjs.org/@sveltia/cms/-/cms-${VERSION}.tgz" \
  --output "${NPM_ARCHIVE}"

printf '%s  %s\n' "${SOURCE_SHA256}" "${SOURCE_ARCHIVE}" | sha256sum --check --status
printf '%s  %s\n' "${NPM_SHA256}" "${NPM_ARCHIVE}" | sha256sum --check --status

tar -xzf "${SOURCE_ARCHIVE}" -C "${WORK_DIR}"
mkdir -p "${NPM_DIR}"
tar -xzf "${NPM_ARCHIVE}" -C "${NPM_DIR}"

git -C "${SOURCE_DIR}" apply --check "${SCRIPT_DIR}/editor-component-control.patch"
git -C "${SOURCE_DIR}" apply "${SCRIPT_DIR}/editor-component-control.patch"

corepack prepare "pnpm@${PNPM_VERSION}" --activate

(
  cd "${SOURCE_DIR}"
  corepack pnpm install --frozen-lockfile
  git -C "${SVELTIA_UI_DIR}" apply --check "${SCRIPT_DIR}/sveltia-ui-cursor-boundaries.patch"
  git -C "${SVELTIA_UI_DIR}" apply "${SCRIPT_DIR}/sveltia-ui-cursor-boundaries.patch"
  cp "${SCRIPT_DIR}/cursor-boundaries.test.js" cursor-boundaries.test.js
  corepack pnpm exec vitest run src/lib/main.test.js cursor-boundaries.test.js
  corepack pnpm exec prettier --check \
    cursor-boundaries.test.js \
    src/lib/components/contents/details/fields/rich-text/editor-component.svelte \
    src/lib/components/contents/details/fields/rich-text/react-editor-component-control.svelte \
    src/lib/services/contents/fields/rich-text/components/custom-node.js \
    src/lib/main.js \
    src/lib/main.test.js \
    src/lib/types/public.js
  corepack pnpm exec eslint \
    src/lib/components/contents/details/fields/rich-text/editor-component.svelte \
    src/lib/components/contents/details/fields/rich-text/react-editor-component-control.svelte \
    src/lib/services/contents/fields/rich-text/components/custom-node.js \
    src/lib/main.js \
    src/lib/main.test.js \
    src/lib/types/public.js
  corepack pnpm run check:svelte
  corepack pnpm run build
)

cp "${NPM_DIR}/package/dist/sveltia-cms.js" \
  "${ADMIN_DIR}/sveltia-cms-original-${VERSION}.js"
cp "${SOURCE_DIR}/package/dist/sveltia-cms.js" \
  "${ADMIN_DIR}/sveltia-cms-table-${VERSION}.js"
cp "${NPM_DIR}/package/LICENSE.txt" "${SCRIPT_DIR}/LICENSE-${VERSION}.txt"

printf '%s  %s\n' \
  "${ORIGINAL_BUNDLE_SHA256}" \
  "${ADMIN_DIR}/sveltia-cms-original-${VERSION}.js" | sha256sum --check --status

printf 'Built %s\n' "${ADMIN_DIR}/sveltia-cms-table-${VERSION}.js"
