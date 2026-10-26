#!/bin/sh
# Stop webOS holding other apps in memory from switch-on, re-applied at every boot.
#
# Why: the preload manager kept Netflix, YouTube and Amazon resident from boot and left around
# 70 MB free. On a cold boot the launcher sometimes came up as a black screen - foreground,
# reported visible, nothing drawn. Freeing that memory is not a proven fix for the black screen,
# but it removes the most obvious suspect.
#
# What does NOT work: /var/preferences/webos-preload-manager-conf.json. The service was measured
# preloading apps that are absent from its own "allowedApps" list, so only stopping the service
# has any effect. `systemctl disable` does not survive either, because /etc is read-only - hence
# a stop at every boot rather than a one-off.
#
# AirPlay is unaffected. It comes up through its own airplay.service, not through this one.
#
# Undo: delete this file and run `systemctl start preload-manager.service`.

systemctl stop preload-manager.service 2>/dev/null

# Whatever was preloaded before this ran still has to be closed. closeByAppId is required here:
# plain close takes a PID and answers "no app matched by pid" for a preloaded app.
#
# This runs in the background on purpose. run-parts executes init.d scripts one after another, so
# a sleep in the main flow would hold up every script that sorts after this one.
#
# luna-send MUST have < /dev/null: with a pipe or heredoc on stdin it performs the call but prints
# nothing at all. At boot stdin is never a terminal.
(
	sleep 20
	for a in netflix youtube.leanback.v4 amazon com.webos.app.browser \
	         com.webos.app.voice com.webos.app.livetv com.webos.app.livemenu; do
		luna-send -n 1 -f luna://com.webos.applicationManager/closeByAppId \
			"{\"id\":\"$a\"}" < /dev/null >/dev/null 2>&1
	done
) &

exit 0
