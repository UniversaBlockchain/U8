require_relative 'stuff.rb'

puts "\ncheck linger..."
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")"
  o += rshell conf, 'ls /var/lib/systemd/linger'
  next o
}

confirm "\nenable linger from root..."

puts 'plz wait...'
each_ubot $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")"
  o += lshell "ssh -p 54324 root@#{conf['ip']} 'loginctl enable-linger ubot'"
  next o
}

puts "\ndone"
