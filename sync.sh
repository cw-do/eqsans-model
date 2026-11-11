#!/usr/bin/env bash
# Copy the model from the Study Hub service and rewrite its paths so it runs as a standalone static site.
set -euo pipefail
SRC="${1:-$HOME/project_ai/services/study/frontend/science}"
cd "$(dirname "$0")"
cp "$SRC/eqsans/main.js" "$SRC/eqsans/site.js" "$SRC/eqsans/eqsans.css" .
mkdir -p vendor && rm -rf vendor/three && cp -r "$SRC/vendor/three" vendor/three
sed -e 's#/static/science/eqsans/##g' \
    -e 's#/static/science/vendor/#./vendor/#g' \
    -e 's#<a class="back" href="/">← Study Hub</a>#<a class="back" href="https://github.com/cw-do/eqsans-model">GitHub</a>#' \
    -e 's# · JDO Study Hub##' \
    "$SRC/eqsans/index.html" > index.html
