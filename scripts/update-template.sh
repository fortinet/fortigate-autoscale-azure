#!/bin/sh

exec 3>&1
exec 1>&2

set -eu

node --version
npm --version

cd $1

# checkout base branch ($2) into update_branch ($3) for new changes
git checkout $2 || git checkout $1 -b $3

# do npm install and build project before running scripts
npm install
npm run build

# call the template updater and propagate all args to it
node build/scripts/template-updater.js "$@"

# run all linting
npm run lint-fix

# set git up for a commit
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -u
git commit -m "auto update by Azure marketplace offer changes" --no-gpg-sign --allow-empty

