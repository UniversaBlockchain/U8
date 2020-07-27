require_relative 'stuff.rb'

#$unums = [1,2]

puts "\nrestart..."
each_ubot $unums, proc { |conf|
  next rshell conf, 'systemctl --user restart ubot-server.service'
}

puts "\ndone"
