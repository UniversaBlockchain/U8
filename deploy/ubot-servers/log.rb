require_relative 'stuff.rb'

if ARGV.length != 1 then
  puts "usage:\n  ruby log.rb <ubot_number>"
  exit
end

$unums = [ARGV[0]]

puts "\nlog..."
each_ubot $unums, proc { |conf|
  puts conf['file_name'] + ' (' + conf['ip'] + ")\n"
  cmd = 'journalctl --user-unit ubot-server.service -f -n 200'
  system "ssh -p 54324 ubot@#{conf['ip']} '#{cmd}'"
  next ''
}

puts "\ndone"
