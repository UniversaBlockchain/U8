require_relative 'stuff.rb'

puts "\nget private keys from key server and upload them to ubot-server..."
each_ubot_sync $unums, proc { |conf|
  o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
  o += lshell "mkdir -p /tmp/kubot"
  o += rshell conf, "mkdir -p ubot-u8/tmp"
  np = conf['num'].to_s.rjust(3, '0')
  o += lshell "scp kubot@sergeych.net:.ukeys/node_#{np}.private.unikey /tmp/kubot/"
  o += lshell "scp -P 54324 /tmp/kubot/node_#{np}.private.unikey ubot@#{conf['ip']}:ubot-u8/tmp/"
  o += rshell conf, "chmod 600 ubot-u8/tmp/node_#{np}.private.unikey"
  o += lshell "shred -zu /tmp/kubot/node_#{np}.private.unikey"
  next o
}

puts "\ndone"
