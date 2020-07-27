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

puts "\nupload configs..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += lshell "rsync --delete -e 'ssh -p 54324' -a ./config ubot@#{conf['ip']}:ubot-u8/"
  o += lshell "scp -P 54324 ./config/nodes/#{conf['file_name']} ubot@#{conf['ip']}:ubot-u8/config/config.yaml"
}

puts "\ndone"
