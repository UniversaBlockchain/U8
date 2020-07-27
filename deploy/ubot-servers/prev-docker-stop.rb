require_relative 'stuff.rb'

#$unums = [1,2]

puts "\nstop previous docker instances..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, './bin/daemon.sh stop'
  next o
}

puts "\ndone"
