#!/bin/sh
sed 's|applicationManager.launchDefaultApp(JSON.stringify({"category": "home"|applicationManager.launch("io.github.devic021.openhome","{}");//applicationManager.launchDefaultApp(JSON.stringify({"category": "home"|g' /usr/lib/qml/KeyFilters/systemUi.js > /tmp/hackfilters.js 
mount --rbind /tmp/hackfilters.js /usr/lib/qml/KeyFilters/systemUi.js
restart sam
