#!/bin/sh
# Mount the USB disk that holds the wallpaper pool, over the folder the launcher reads.
#
# Mounted by UUID, not by device node: webOS re-enumerates USB disks across a reboot, so a stick
# that was /dev/sda3 one day is /dev/sdb3 the next. A path that names the device breaks with
# "Input/output error" the moment that happens, which looks exactly like a corrupt disk and is not.
#
# If the disk is not there the folder stays empty and the launcher falls back to the online list
# on its own, so a missing stick is not an error.
#
# Set UUID to your own disk. On the TV:  blkid
# On a Linux box:  lsblk -o NAME,UUID,SIZE,FSTYPE
UUID=00000000-0000-0000-0000-000000000000
TARGET=/media/developer/wallpapers
LOG=/tmp/wallpaper-mount.log

# USB enumeration is not finished when the startup scripts run, so this waits up to a minute.
i=0
while [ $i -lt 30 ]; do
	DEV=$(blkid 2>/dev/null | grep "$UUID" | cut -d: -f1 | head -1)
	if [ -n "$DEV" ]; then
		mkdir -p "$TARGET" 2>/dev/null
		if mount | grep -q " $TARGET "; then
			echo "$(date) already mounted" >> "$LOG"
		else
			mount "$DEV" "$TARGET" \
				&& echo "$(date) mounted $DEV" >> "$LOG" \
				|| echo "$(date) FAILED to mount $DEV" >> "$LOG"
		fi
		exit 0
	fi
	i=$((i+1))
	sleep 2
done
echo "$(date) no disk with UUID $UUID after 60s" >> "$LOG"
exit 0
