#!/bin/sh
# Settings this TV has to be told again, re-applied at every boot.
#
# Why this file exists: the home-app setting was lost across a power cycle (see replace.sh), so
# nothing is assumed to stick on its own. The wanted values are written by OpenHome's own TV
# settings pane, one JSON object per line:
#     {"c":"general","k":"adCookie","v":"off"}
# Delete this file to let LG's defaults come back at the next boot; delete a line to forget one
# setting.
#
# luna-send MUST have < /dev/null: with a pipe or heredoc on stdin it still performs the call but
# prints nothing at all, so the result check below would never match. At boot stdin is never a
# terminal.

STATE=/var/lib/webosbrew/openlauncher-tvsettings.json
[ -f "$STATE" ] || exit 0

apply_one() {
	# $1 = category, $2 = key, $3 = value. Retries, because the luna bus is not up at once.
	i=0
	while [ $i -lt 40 ]; do
		OUT=$(luna-send -n 1 -f luna://com.webos.settingsservice/setSystemSettings \
			"{\"category\":\"$1\",\"settings\":{\"$2\":\"$3\"}}" < /dev/null 2>&1)
		case "$OUT" in
			*'"returnValue": true'*|*'"returnValue":true'*)
				logger -t openlauncher-tweaks "ok: $1/$2=$3 (after $i)"
				return 0
				;;
		esac
		i=$((i+1))
		sleep 2
	done
	logger -t openlauncher-tweaks "FAILED: $1/$2=$3 -> $OUT"
	return 1
}

while read -r LINE; do
	[ -z "$LINE" ] && continue
	C=$(echo "$LINE" | sed -n 's/.*"c":"\([^"]*\)".*/\1/p')
	K=$(echo "$LINE" | sed -n 's/.*"k":"\([^"]*\)".*/\1/p')
	V=$(echo "$LINE" | sed -n 's/.*"v":"\([^"]*\)".*/\1/p')
	if [ -n "$C" ] && [ -n "$K" ] && [ -n "$V" ]; then
		apply_one "$C" "$K" "$V"
	fi
done < "$STATE"
exit 0
