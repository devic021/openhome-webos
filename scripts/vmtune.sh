#!/bin/sh
# Take the hurry out of swapping, re-applied at every boot.
#
# LG leaves vm.swappiness at 100, so the kernel pushes anonymous pages into swap even when there
# is memory to spare.
#
# Swap on these sets is not an ordinary partition. /dev/f2io-0 is compressed swap held in RAM -
# comp_alg "zacc", hardware accelerated, with xxhash64 deduplication - and an eMMC partition sits
# behind it only as overflow. Measured on an LM21 chassis, bdev_stat showed next to no spill to
# flash. Swapping here therefore costs CPU time for compression, not slow flash writes.
#
# About 861 MB passed through swap in the first twenty minutes after a cold boot, most of it while
# apps were being preloaded - see no-preload.sh. 60 is the kernel's own default.
#
# Honest about the gain: free memory moved from 375 MB to 384 MB, which is inside the noise. This
# reduces compression work at boot. It does not hand RAM back.
#
# Undo: delete this file and run `echo 100 > /proc/sys/vm/swappiness`.

echo 60 > /proc/sys/vm/swappiness
