#!/bin/sh
# Make OpenHome the home screen, in one command.
#
#   ./scripts/install-home.sh <tv-ip> [path-to-ssh-key]
#
# Copies the two startup scripts the Homebrew Channel runs at boot, then runs the one that does
# the work, so the change takes effect without waiting for a reboot.
#
# Undo with:  ./scripts/install-home.sh <tv-ip> --undo

set -e

TV=""
KEY="$HOME/.ssh/lgtv"
UNDO=""
APP=/media/developer/apps/usr/palm/applications/io.github.devic021.openhome
INITD=/var/lib/webosbrew/init.d

# --undo may come in any position, so the arguments are walked rather than indexed
for arg in "$@"; do
	case "$arg" in
		--undo) UNDO=1 ;;
		-*)     echo "unknown option: $arg" >&2; exit 2 ;;
		*)      if [ -z "$TV" ]; then TV="$arg"; else KEY="$arg"; fi ;;
	esac
done

if [ -z "$TV" ]; then
	echo "usage: $0 <tv-ip> [ssh-key]        make OpenHome the home screen" >&2
	echo "       $0 <tv-ip> --undo           put the stock home screen back" >&2
	exit 2
fi

SSH="ssh -i $KEY -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new root@$TV"

# A plain ssh probe, because nc's timeout flag differs between macOS (-G) and Linux (-w)
if ! $SSH true 2>/dev/null; then
	echo "Cannot reach root@$TV over SSH with key $KEY." >&2
	echo "Is the TV on, is the Homebrew Channel's SSH server running, and is the key right?" >&2
	exit 1
fi

if [ -n "$UNDO" ]; then
	echo "Putting the stock home screen back..."
	# The order matters: unmount first, or sam keeps serving the stub it already loaded.
	$SSH "
		umount /usr/palm/applications/com.webos.app.home 2>/dev/null || true
		rm -f $INITD/homestub.sh $INITD/replace.sh
		luna-send -n 1 -f luna://com.webos.service.applicationmanager/setDefaultApp \
			'{\"category\":\"home\",\"appId\":\"com.webos.app.home\"}' < /dev/null >/dev/null 2>&1 || true
		if [ -f /var/lib/webosbrew/openlauncher-boot.orig ]; then
			echo '  the three boot settings were saved in /var/lib/webosbrew/openlauncher-boot.orig'
			echo '  restore them by hand if you changed them since'
		fi
		pgrep -x sam >/dev/null 2>&1 && restart sam || true
	"
	echo "Done. Press Home on the remote to check."
	exit 0
fi

# The app has to be installed before the stub can point at it: homestub.sh bind-mounts a folder
# from inside the app directory, so a missing app would mount nothing and leave Home broken.
if ! $SSH "[ -f $APP/index.html ]" 2>/dev/null; then
	echo "OpenHome is not installed on $TV yet." >&2
	echo "Install it first - see the Install section of the readme - then run this again." >&2
	exit 1
fi

echo "Copying the startup scripts..."
DIR=$(dirname "$0")
scp -i "$KEY" -O -q "$DIR/homestub.sh" "$DIR/replace.sh" "root@$TV:$INITD/"

echo "Applying..."
$SSH "chmod +x $INITD/homestub.sh $INITD/replace.sh && sh $INITD/homestub.sh"

cat <<EOF

Done.

  Home button   works now
  Power on      works from the next cold boot, once the startup scripts have run

webOS's boot animation no longer plays - that is the cost of the swap, and the readme explains why.
The three settings that were changed are saved in /var/lib/webosbrew/openlauncher-boot.orig.
EOF
