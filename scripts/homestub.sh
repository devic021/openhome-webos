#!/bin/sh
# Make the launcher come up when the TV is switched on.
#
# Why this and not the "default app" setting: `sam` honours defaultApps.home, so the HOME KEY
# already opens OpenLauncher. But `bootd` - the thing that brings a screen up at power-on - has
# "com.webos.app.home" compiled into it and never looks at that setting. Verified with
# `strings /usr/sbin/bootd`. So the setting alone can never fix power-on.
#
# The fix is to make com.webos.app.home BE a stub: a transparent, invisible web app that launches
# OpenLauncher and closes itself. Anything that asks for the stock home - bootd included - gets it.
#
# Undo: umount /usr/palm/applications/com.webos.app.home, restore the three settings saved in
# /var/lib/webosbrew/openlauncher-boot.orig, and delete this file.

STUB=/media/developer/apps/usr/palm/applications/com.homebrew.openlauncher/access/replace/appstub
HOME_APP=/usr/palm/applications/com.webos.app.home
ORIG=/var/lib/webosbrew/openlauncher-boot.orig

[ -f "$STUB/index.html" ] || exit 0

if ! grep -q " $HOME_APP " /proc/mounts 2>/dev/null; then
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

luna-send -n 1 -w 5000 -f luna://com.webos.settingsservice/setSystemSettings \
	'{"category":"general","settings":{"lastInputApp":"com.homebrew.openlauncher","physicalLastInputApp":"com.homebrew.openlauncher","homeAutoLaunch":"off"}}' \
	< /dev/null > /dev/null 2>&1 && logger -t openlauncher-home "boot screen pointed at the launcher"
exit 0
