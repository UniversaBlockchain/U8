require_relative 'stuff.rb'

#$unums = [1,2]

ubot_server_service = %{
[Unit]
Description=ubot-server
After=network.target
# https://www.freedesktop.org/software/systemd/man/systemd.service.html

[Service]
StandardOutput=journal+console
StandardError=journal+console
Type=simple
WorkingDirectory=/home/ubot/ubot-u8
ExecStart=/home/ubot/ubot-u8/u8 /home/ubot/ubot-u8/u8scripts/ubotserver/ubotserver.js --config /home/ubot/ubot-u8
TimeoutStartSec=15s
ExecStop=/bin/kill -TERM $MAINPID
TimeoutStopSec=10s
# ExecReload=/bin/kill -USR1 $MAINPID
Restart=always

[Install]
WantedBy=default.target
}

puts "\ncreate remote ubot-server.service files..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, "mkdir -p .config/systemd/user"
  o += rshell conf, "echo '#{ubot_server_service}' > .config/systemd/user/ubot-server.service"
  o += rshell conf, "systemctl --user daemon-reload"
  next o
}

puts "\ndone"
