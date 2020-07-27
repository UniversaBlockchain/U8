require_relative 'stuff.rb'

#$unums = [1,2]

puts "\ncheck status..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, 'systemctl --user is-enabled ubot-server.service'
  o += rshell conf, 'systemctl --user is-active ubot-server.service'
  next o
}

puts "\ndone"
