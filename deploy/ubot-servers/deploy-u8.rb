require_relative 'stuff.rb'

#$unums = [1,2]

puts "\nprepare remote directories..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, 'hostname'
  o += rshell conf, 'date'
  o += rshell conf, 'mkdir -p ubot-u8/config'
  o += rshell conf, 'mkdir -p ubot-u8/tmp'
  next o
}

puts "\nupload u8..."
each_ubot $unums, proc { |conf|
  next lshell "scp -P 54324 ../../cmake-build-monolith-release/u8 ubot@#{conf['ip']}:ubot-u8/"
}

puts "\ndone"
