require_relative 'stuff.rb'

#$unums = [1,2]

puts "\nprepare remote directories..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += rshell conf, 'mkdir -p ubot-u8'
  next o
}

puts "\nupload js files..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += lshell "rsync --delete -e 'ssh -p 54324' -a ../../jssrc ubot@#{conf['ip']}:ubot-u8/"
  o += lshell "rsync --delete -e 'ssh -p 54324' -a ../../u8scripts ubot@#{conf['ip']}:ubot-u8/"
}

puts "\ndone"
