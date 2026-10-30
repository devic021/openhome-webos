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

foreground_is_launcher() {
	luna-send -n 1 -w 4000 -f luna://com.webos.applicationManager/getForegroundAppInfo \
		'{}' < /dev/null 2>/dev/null | grep -q "$APP_ID"
}

# The set is drawing when WebAppMgr has a renderer process as well as its main one. The black
# screen is exactly the case where it does not: one process, and nothing behind the window.
#
# Counted by process NAME. `pgrep -f` cannot be used here: BusyBox pgrep matches its own command
# line, so `pgrep -f "WebAppMgr --type=renderer"` answers yes even when there is no renderer at
# all, which is how the first attempt at this check silently never fired. Verified on the set:
# `pgrep -f "zzzz --type=zzzz"` returns a pid of its own.
is_drawing() {
	[ "$(pgrep -c WebAppMgr)" -gt 1 ]
}

if [ "$mounted" -eq 0 ]; then
	mount --rbind "$STUB" "$HOME_APP" || exit 1
	logger -t openlauncher-home "stub mounted over com.webos.app.home"
fi

# ---- the black screen at cold boot -------------------------------------------
# webOS brings the launcher up as a window with no renderer behind it: the app is reported as the
# foreground app, getForegroundAppInfo names it, and the screen stays black. On this set it
# happens at every cold boot, and it does not resolve itself - a set left alone sat black for
# three minutes with one WebAppMgr process and no renderer.
#
# This script used to restart sam here, which hid the problem by accident: that took every app
# down and the set started the launcher again, and the second instance drew. It cost about ten
# seconds of every cold start and took every other app with it.
#
# Relaunching this one app does the same job. Measured by hand on the black set: one launch call
# took WebAppMgr from one process to two and the picture came back.
#
# In the background, because run-parts runs these scripts one after another and a sleep here
# would hold up everything that sorts after it.
(
	# The first check is immediate. Every second spent deciding is a second of black screen, and
	# a launcher that is going to draw has its renderer before this script is even run: measured
	# at 43.2s black against a script that starts at about 38s.
	tries=0
	while [ $tries -lt 6 ]; do
		# never act when something else is on screen: an input is not ours to interrupt
		foreground_is_launcher || exit 0
		if is_drawing; then exit 0; fi
		luna-send -n 1 -w 6000 -f luna://com.webos.applicationManager/launch \
			"{\"id\":\"$APP_ID\"}" < /dev/null > /dev/null 2>&1
		logger -t openlauncher-home "launcher had no renderer; relaunched"
		tries=$((tries + 1))
		# a relaunch takes about four seconds to show a renderer, so wait before judging it
		i=0
		while [ $i -lt 6 ]; do
			sleep 1
			is_drawing && exit 0
			i=$((i + 1))
		done
	done
	# Six tries and still nothing drawn. sam is the bigger hammer, and at this point the ten
	# seconds it costs are worth more than a black screen.
	if foreground_is_launcher && ! is_drawing && pgrep -x sam > /dev/null 2>&1; then
		logger -t openlauncher-home "still black after six relaunches; restarting sam"
		restart sam
	fi
) &

# ---- the cold-boot half -----------------------------------------------------
# The mount above only helps once this script has run, and at a real power-on that is roughly a
# minute in. Until then webOS shows the "last input" and, with Home Auto Launch on, plays its boot
# animation and opens LG's own home BEFORE the swap can happen. So:
#   lastInputApp/physicalLastInputApp -> the launcher, so the pre-script screen is already ours
#   homeAutoLaunch -> off, so LG's home never gets opened ahead of us
# The cost is that webOS's boot animation no longer plays.
if [ ! -f "$ORIG" ]; then
	luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/getSystemSettings \
		'{"category":"general","keys":["lastInputApp","lastInputAppType","physicalLastInputApp","physicalLastInputType","homeAutoLaunch"]}' \
		< /dev/null > "$ORIG" 2>/dev/null
	logger -t openlauncher-home "original boot settings saved"
fi

# The record is FOUR keys, not two. Measured on a 65UR78003LK running webOS 10.3.2: selecting
# HDMI 3 rewrote lastInputApp, physicalLastInputApp, lastInputAppType and physicalLastInputType
# together, and going back to the launcher rewrote none of them. Writing only the two app keys
# left the set holding half a record - the apps naming this launcher while the types still named
# an HDMI port - and the two halves cannot both be right. All four are written together.
point_at_launcher() {
	luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/setSystemSettings \
		"{\"category\":\"general\",\"settings\":{\"lastInputApp\":\"$APP_ID\",\"physicalLastInputApp\":\"$APP_ID\",\"lastInputAppType\":\"$APP_ID\",\"physicalLastInputType\":\"$APP_ID\"}}" \
		< /dev/null > /dev/null 2>&1
}

point_at_launcher && logger -t openlauncher-home "boot screen pointed at the launcher"
luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/setSystemSettings \
	'{"category":"general","settings":{"homeAutoLaunch":"off"}}' \
	< /dev/null > /dev/null 2>&1

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
				'{"category":"general","keys":["lastInputApp","lastInputAppType","physicalLastInputApp","physicalLastInputType"]}' \
				< /dev/null 2>/dev/null)
			# Four values have to be right, so the test counts them rather than looking for the
			# app id once: a half-written record names the launcher in some fields and an input
			# in the others, and that has to count as drifted.
			ours=$(echo "$now" | grep -c "$APP_ID")
			case "$now" in
				*"lastInputAppType"*)
					if [ "$ours" -lt 4 ]; then
						point_at_launcher &&
							logger -t openlauncher-home "power-on screen pointed back at the launcher"
					fi
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
