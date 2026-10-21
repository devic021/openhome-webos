#!/bin/sh
# Put OpenHome back as the Home app at every boot.
#
# webOS 25+ keeps the home app in a Luna setting rather than in a patched file, and this TV lost
# that setting across a power cycle - the Home button went back to LG's own home. The upstream
# "Default App" method does not install anything at boot precisely because the setting is supposed
# to stick; on this set it does not, so this script re-applies it.
#
# The Luna bus is not up the moment this runs, so it retries for up to two minutes and stops as
# soon as the call is accepted.
APPID="io.github.devic021.openhome"
i=0
while [ $i -lt 60 ]; do
	# < /dev/null is NOT optional: luna-send prints nothing at all when its stdin is a pipe or a
	# heredoc instead of a terminal, and at boot time stdin is never a terminal. Without this the
	# call still happens but the output is empty, so the check below never matches and the script
	# retries sixty times and gives up.
	OUT=$(luna-send -n 1 -f luna://com.webos.service.applicationmanager/setDefaultApp \
		"{\"category\":\"home\",\"appId\":\"$APPID\"}" < /dev/null 2>&1)
	case "$OUT" in
		*'"returnValue": true'*|*'"returnValue":true'*)
			logger -t openlauncher-home "home app set to $APPID after $i tries"
			exit 0
			;;
	esac
	i=$((i+1))
	sleep 2
done
logger -t openlauncher-home "FAILED to set home app after $i tries: $OUT"
exit 1
