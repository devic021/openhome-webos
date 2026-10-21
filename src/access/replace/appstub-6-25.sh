#!/bin/sh
mount --rbind /media/developer/apps/usr/palm/applications/io.github.devic021.openhome/access/replace/appstub /usr/palm/applications/com.webos.app.home

restart sam

# Just in case
pkill -f com.webos.app.home
