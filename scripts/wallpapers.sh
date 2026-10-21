#!/bin/sh
# Mount the USB disk that holds the wallpaper pool, over the folder the launcher reads.
#
# By default it looks for a partition **labelled OPENHOME**, so nothing in this file has to be
# edited. Label one when you format it:
#
#     ext4   sudo mkfs.ext4 -L OPENHOME /dev/sdX1
#     exfat  sudo mkfs.exfat -n OPENHOME /dev/sdX1
#
# To pin it to one particular disk instead, set UUID below and it wins over the label. Find it
# with `blkid` on the TV, or `lsblk -o NAME,LABEL,UUID,SIZE,FSTYPE` on a Linux box.
#
# Never by device node: webOS re-enumerates USB disks across a reboot, so a stick that was
# /dev/sda3 one day is /dev/sdb3 the next. A path naming the device then fails with
# "Input/output error", which looks exactly like a corrupt disk and is not.
#
# If no disk is found the folder stays empty and the launcher falls back to its online list on its
# own, so a missing stick is not an error.

LABEL=OPENHOME
UUID=
TARGET=/media/developer/wallpapers
LOG=/tmp/wallpaper-mount.log

find_device() {
	if [ -n "$UUID" ]; then
		blkid 2>/dev/null | grep "\"$UUID\"\|UUID=$UUID" | cut -d: -f1 | head -1
	else
		blkid 2>/dev/null | grep "LABEL=\"$LABEL\"" | cut -d: -f1 | head -1
	fi
}

# USB enumeration is not finished when the startup scripts run, so this waits up to a minute.
i=0
while [ $i -lt 30 ]; do
	DEV=$(find_device)
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
	i=$((i + 1))
	sleep 2
done

if [ -n "$UUID" ]; then
	echo "$(date) no disk with UUID $UUID after 60s" >> "$LOG"
else
	echo "$(date) no disk labelled $LABEL after 60s" >> "$LOG"
fi
exit 0
