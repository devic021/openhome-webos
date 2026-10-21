#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 the OpenHome contributors
# Push the launcher's source to the TV and reload the page.
#
# Everything is a plain file on the TV, so a deploy is a copy plus a reload - no packaging step.
# The app directory is the one the Homebrew Channel installed into.
#
#   TV=<tv-ip> ./deploy.sh              everything that changed since the last deploy
#   TV=<tv-ip> ./deploy.sh all          every file
#   TV=<tv-ip> ./deploy.sh js/clock.js  just these

set -e
TV=${TV:-}
KEY=${KEY:-$HOME/.ssh/lgtv}
if [ -z "$TV" ]; then
	echo "Set TV to your set's address first:  TV=192.168.1.50 ./deploy.sh" >&2
	exit 2
fi
SSHOPTS="-i $KEY -o ConnectTimeout=8 -o StrictHostKeyChecking=no"
APP=/media/developer/apps/usr/palm/applications/com.homebrew.openlauncher
SRC=$(dirname "$0")/src
STAMP=$(dirname "$0")/.lastdeploy

cd "$SRC"

if ! nc -z -G 3 "$TV" 22 2>/dev/null; then
	echo "TV at $TV is not answering on port 22 - is it on?" >&2
	exit 1
fi

case "$1" in
	all)  FILES=$(find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) | sed 's|^\./||') ;;
	"")   if [ -f "$STAMP" ]; then
		      FILES=$(find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) -newer "$STAMP" | sed 's|^\./||')
	      else
		      FILES=$(find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) | sed 's|^\./||')
	      fi ;;
	*)    FILES="$*" ;;
esac

if [ -z "$FILES" ]; then
	echo "nothing changed since the last deploy"
	exit 0
fi

# A file that does not parse would leave the launcher with a blank home screen, and the only way
# back is over SSH. So it is checked here, before it is sent.
for f in $FILES; do
	case "$f" in *.js) node --check "$f" >/dev/null || { echo "$f does not parse - nothing sent" >&2; exit 1; };; esac
done

for f in $FILES; do
	dir=$(dirname "$f")
	[ "$dir" = "." ] || ssh $SSHOPTS "root@$TV" "mkdir -p $APP/$dir"
	scp $SSHOPTS -O -q "$f" "root@$TV:$APP/$f"
	echo "  $f"
done

# reload the running page, so the change is on screen without touching the remote
ssh $SSHOPTS "root@$TV" "luna-send -n 1 -f luna://com.webos.service.applicationManager/launch \
	'{\"id\":\"com.homebrew.openlauncher\",\"params\":{\"reload\":true}}' < /dev/null >/dev/null 2>&1" || true

touch "$STAMP"
echo "sent $(echo $FILES | wc -w | tr -d ' ') file(s) to $TV"
