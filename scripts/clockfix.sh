#!/bin/sh
# Put the clock right at boot, and unstick the name resolver if it has jammed.
#
# This television has no battery-backed clock. There is no /dev/rtc at all, so every time the
# mains goes the clock comes back years in the past, and everything then fails in a circle:
#
#   wrong clock  ->  TLS certificates are not valid yet, so nothing over HTTPS works
#                ->  a WireGuard handshake carries a timestamp older than the peer has seen and
#                    is rejected as a replay, so any tunnel stays down
#                ->  webOS cannot reach its own time server to correct the clock, because that
#                    needs a name resolved through the network that is broken
#
# Seen on 14 November 2026 after several power cuts: the set sat at 1 January 2023, ConnMan's DNS
# proxy answered 10.0.0.1 for every name including ones that cannot exist, and nothing with a
# hostname worked - no weather, no streaming, no time sync, nothing to break the circle from
# inside.
#
# So the clock is set here from something that needs neither DNS nor TLS: the Date header of a
# plain HTTP reply, asked of the default gateway first and public addresses after, all by
# address. A second or two of error does not matter; being in the right year does. webOS's own
# time service takes over as soon as it can and this stops doing anything.
#
# Install: copy to /var/lib/webosbrew/init.d/. The name starts with 05 so run-parts runs it
# before anything that needs a clock or a name, the tunnel scripts included.

LOG=/tmp/clockfix.log
MINYEAR=2025                      # anything below this is the factory clock, not a real date
NETWAIT=60                        # seconds to wait for the network before giving up
BOGUS=nosuchhost.invalid          # .invalid is reserved: a healthy resolver must answer NXDOMAIN

say() {
	echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
	logger -t openhome-clockfix "$*" 2>/dev/null
}

gateway() {
	ip route show default 2>/dev/null | awk '{print $3; exit}'
}

# The Date header of a plain HTTP reply, in seconds since the epoch. Nothing here resolves a name
# and nothing verifies a certificate, which is the whole point.
timefrom() {
	header=$(curl -sI -m 6 "http://$1/" 2>/dev/null |
		awk 'tolower($1)=="date:"{sub(/^[Dd]ate: /,""); sub(/\r$/,""); print; exit}')
	[ -n "$header" ] || return 1
	date -u -D "%a, %d %b %Y %H:%M:%S GMT" -d "$header" "+%s" 2>/dev/null
}

# ---- wait for the network, or there is nothing to ask
i=0
while [ $i -lt $NETWAIT ]; do
	GW=$(gateway)
	if [ -n "$GW" ] && ping -c 1 -W 1 "$GW" >/dev/null 2>&1; then break; fi
	i=$((i + 1))
	sleep 1
done
GW=$(gateway)
if [ -z "$GW" ]; then
	say "no default route after ${NETWAIT}s, nothing to do"
	exit 0
fi

# ---- the clock
YEAR=$(date +%Y)
if [ "$YEAR" -lt "$MINYEAR" ] 2>/dev/null; then
	say "clock reads $(date), which is before $MINYEAR: asking the network"
	for host in "$GW" 1.1.1.1 1.0.0.1; do
		EPOCH=$(timefrom "$host")
		case "$EPOCH" in
			''|*[!0-9]*) continue ;;
		esac
		# a reply from a box whose own clock is wrong is no better than ours
		[ "$EPOCH" -gt 1735689600 ] || continue        # 1 January 2025
		if date -u -s "$(date -u -d "@$EPOCH" '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1; then
			say "clock set from $host to $(date)"
			break
		fi
	done
	YEAR=$(date +%Y)
	if [ "$YEAR" -lt "$MINYEAR" ] 2>/dev/null; then
		say "could not set the clock from any source; it still reads $(date)"
	fi
else
	say "clock reads $(date), left alone"
fi

# ---- the resolver
#
# ConnMan answers DNS on 127.0.0.1 for the whole set. After the clock jumped four years its proxy
# answered one address for every name, including names that cannot exist, which breaks everything
# with a hostname while looking like a working network. A name under .invalid must come back
# NXDOMAIN; an address means the proxy has jammed and only a restart clears it.
stuck() {
	nslookup "$BOGUS" 127.0.0.1 2>/dev/null | awk '/^Address: /{found=1} END{exit !found}'
}

if stuck; then
	say "the resolver answers an address for $BOGUS, which cannot exist: restarting connman"
	systemctl restart connman >/dev/null 2>&1
	i=0
	while [ $i -lt 20 ]; do
		sleep 1
		stuck || break
		i=$((i + 1))
	done
	if stuck; then
		say "the resolver is still answering for $BOGUS after a restart"
	else
		say "the resolver is answering properly again"
	fi
else
	say "the resolver looks healthy"
fi

exit 0
