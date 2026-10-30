#!/bin/sh
# Make the launcher come up when the TV is switched on.
#
# Why this and not the "default app" setting: `sam` honours defaultApps.home, so the HOME KEY
# already opens OpenHome. But `bootd` - the thing that brings a screen up at power-on - has
# "com.webos.app.home" compiled into it and never looks at that setting. Verified with
# `strings /usr/sbin/bootd`. So the setting alone can never fix power-on.
#
# The fix is to make com.webos.app.home BE a stub: a transparent, invisible web app that launches
# OpenHome and closes itself. Anything that asks for the stock home - bootd included - gets it.
#
# Undo: umount /usr/palm/applications/com.webos.app.home, restore the three settings saved in
# /var/lib/webosbrew/openlauncher-boot.orig, stop the watcher named by
# /tmp/openhome-inputwatch.pid, and delete this file. install-home.sh --undo does all of it.

APP_ID=io.github.devic021.openhome
STUB=/media/developer/apps/usr/palm/applications/$APP_ID/access/replace/appstub
HOME_APP=/usr/palm/applications/com.webos.app.home
ORIG=/var/lib/webosbrew/openlauncher-boot.orig
WATCHPID=/tmp/openhome-inputwatch.pid

# How often the watcher below checks that the power-on screen still points at the launcher.
# Set to 0 to switch the watcher off and have the TV resume the last input used, which is the
# stock behaviour.
WATCH_EVERY=30

[ -f "$STUB/index.html" ] || exit 0

# A stub may already be mounted from an earlier install - possibly one belonging to a different
# app id, which would keep launching the old app forever. So the test is not "is something
# mounted" but "is the RIGHT thing mounted": the stub's own index.html names the app it launches.
mounted=0
if grep -q " $HOME_APP " /proc/mounts 2>/dev/null; then
	if grep -q "$APP_ID" "$HOME_APP/index.html" 2>/dev/null; then
		mounted=1
	else
		logger -t openlauncher-home "a stale stub was mounted; replacing it"
		umount "$HOME_APP" 2>/dev/null || umount -l "$HOME_APP" 2>/dev/null
	fi
fi

if [ "$mounted" -eq 0 ]; then
	mount --rbind "$STUB" "$HOME_APP" || exit 1
	logger -t openlauncher-home "stub mounted over com.webos.app.home"
	# sam caches every system app's appinfo.json, so it has to look again - but only if it is
	# already running. At boot this runs before sam starts, and restarting it then would fail.
	if pgrep -x sam > /dev/null 2>&1; then
		restart sam
		logger -t openlauncher-home "sam restarted to pick up the stub"
	fi
fi

# ---- the cold-boot half -----------------------------------------------------
# The mount above only helps once this script has run, and at a real power-on that is roughly a
# minute in. Until then webOS shows the "last input" and, with Home Auto Launch on, plays its boot
# animation and opens LG's own home BEFORE the swap can happen. So:
#   lastInputApp/physicalLastInputApp -> the launcher, so the pre-script screen is already ours
#   homeAutoLaunch -> off, so LG's home never gets opened ahead of us
# The cost is that webOS's boot animation no longer plays.
if [ ! -f "$ORIG" ]; then
	luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/getSystemSettings \
		'{"category":"general","keys":["lastInputApp","physicalLastInputApp","homeAutoLaunch"]}' \
		< /dev/null > "$ORIG" 2>/dev/null
	logger -t openlauncher-home "original boot settings saved"
fi

point_at_launcher() {
	luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/setSystemSettings \
		"{\"category\":\"general\",\"settings\":{\"lastInputApp\":\"$APP_ID\",\"physicalLastInputApp\":\"$APP_ID\"}}" \
		< /dev/null > /dev/null 2>&1
}

luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/setSystemSettings \
	"{\"category\":\"general\",\"settings\":{\"lastInputApp\":\"$APP_ID\",\"physicalLastInputApp\":\"$APP_ID\",\"homeAutoLaunch\":\"off\"}}" \
	< /dev/null > /dev/null 2>&1 && logger -t openlauncher-home "boot screen pointed at the launcher"

# ---- keeping it pointed there ------------------------------------------------
# lastInputApp is not a setting the user chooses, it is a record webOS rewrites every time the
# input changes. Writing it once at boot therefore only survives until the first time anything
# else is watched: switch to a console, turn the set off, and the next power-on restores that
# input instead of the launcher, because by then the record names the console. The script's own
# correction lands a minute later, when the input is already up.
#
# So the record is put back whenever it has drifted. This changes no input and opens nothing - it
# is one settings write - and it only happens after an input change, not on a timer, because the
# check is a read and the write is skipped when the value is already right.
start_watcher() {
	[ "$WATCH_EVERY" -gt 0 ] 2>/dev/null || return 0
	if [ -f "$WATCHPID" ] && kill -0 "$(cat "$WATCHPID" 2>/dev/null)" 2>/dev/null; then
		return 0                                   # one is already running
	fi
	(
		while sleep "$WATCH_EVERY"; do
			# the launcher may have been uninstalled under us; pointing the power-on screen at
			# an app that is no longer there would leave the set with no home at all
			[ -f "$STUB/index.html" ] || exit 0
			grep -q " $HOME_APP " /proc/mounts 2>/dev/null || exit 0
			now=$(luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/getSystemSettings \
				'{"category":"general","keys":["lastInputApp"]}' < /dev/null 2>/dev/null)
			case "$now" in
				*"$APP_ID"*) ;;
				*"lastInputApp"*)
					point_at_launcher &&
						logger -t openlauncher-home "power-on screen pointed back at the launcher"
					;;
				*) ;;                              # no answer: the service is busy, try again later
			esac
		done
	) &
	echo $! > "$WATCHPID"
	logger -t openlauncher-home "input watcher started (every ${WATCH_EVERY}s)"
}

start_watcher
exit 0
