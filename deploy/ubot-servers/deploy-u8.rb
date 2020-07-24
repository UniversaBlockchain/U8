require_relative 'stuff.rb'

# debug
$unums = [1,2]

$unums.each { |x|
  conf = get_config x
  do_async proc {
    o = '' + conf['file_name'] + ' (' + conf['ip'] + ")\n"
    #o += '  ' + `ssh -p 54324 ubot@#{conf['ip']} "date"`
    o += rshell conf, 'hostname'
    o += rshell conf, 'date'
    o += rshell conf, 'mkdir -p ubot-u8'
    o += lshell "scp -P 54324 ../../cmake-build-monolith-release/u8 ubot@#{conf['ip']}:ubot-u8/"
    next o
  }
}

await_all

puts "\ndone"
