#!/bin/sh

exec 3>&1 # make stdout available as fd 3 for the result
exec 1>&2 # redirect all output to stderr for logging

apk add --update libsecret python git nodejs npm > /dev/null
git --version
node --version
npm --version

# clone the repo from base ($1) to head ($2)
echo "git clone $1 $2"
git clone $1 $2

cd $2

git fetch -fpP

# check if local branch exists
exists=`git show-ref refs/heads/$3`
echo "branch $3 ref: $exists"
if [ -n "$exists" ]; then
    echo "branch exists"
    eval "git checkout $3 && git pull"
else
    echo "branch not found"
    eval "git checkout -b $3"
fi


# do npm install and build project before running scripts
npm install
npm run build

# call the template updater and propagate all args to it
node build/scripts/template-updater.js $@

# run all linting
npm run lint-fix

# set git up for a commit
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -u
git commit -m "auto update by Azure marketplace offer changes" --no-gpg-sign

