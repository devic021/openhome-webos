#!/bin/sh
sed 's|com.webos.app.home|io.github.devic021.openhome|g' /usr/lib/qml/KeyFilters/systemUi.js > /tmp/hackfilters.js 
mount --rbind /tmp/hackfilters.js /usr/lib/qml/KeyFilters/systemUi.js
restart sam
