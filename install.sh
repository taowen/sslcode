#!/usr/bin/env bash

wget -O vscode-web.tar.gz https://update.code.visualstudio.com/latest/server-linux-x64-web/stable
tar xzvf vscode-web.tar.gz
./patch
wget -qO- "https://getbin.io/suyashkumar/ssl-proxy" | tar xvz
sudo setcap CAP_NET_BIND_SERVICE=+eip ssl-proxy-linux-amd64
