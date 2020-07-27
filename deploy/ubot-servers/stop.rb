require_relative 'stuff.rb'

#$unums = [1,2]

puts "\nstop..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, 'systemctl --user stop ubot-server.service'
  o += rshell conf, 'systemctl --user disable ubot-server.service'
  next o
}

puts "\ndone"
