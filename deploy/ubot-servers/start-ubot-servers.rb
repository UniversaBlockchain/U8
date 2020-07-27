require_relative 'stuff.rb'

#$unums = [1,2]

puts "\nprepare remote directories..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, 'systemctl --user enable ubot-server.service'
  o += rshell conf, 'systemctl --user start ubot-server.service'
  next o
}

puts "\ndone"
