require 'yaml'

$unums = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,35,36]

$icmd = 1
$cmds = {}
$outs = {}

def do_async pr
  i = $icmd
  $icmd += 1
  cmd = Thread.new do
    $outs[i] = pr.call
  end
  $cmds[i] = cmd
end

def await_all
  $cmds.each { |k,v| v.join }
  $outs.keys.sort.each { |k| puts $outs[k] }
  $cmds = {}
  $outs = {}
end

def get_config x
  un = x.to_s.rjust(3, '0')
  res = {}
  res['num'] = x
  res['file_name'] = 'node_' + un + '.yaml'
  conf_file_path = './config/nodes/' + res['file_name']
  res['conf'] = YAML.load_file(conf_file_path)
  res['ip'] = res['conf']['ip'][0]
  return res
end

def rshell conf,cmd
  res = '  -> ' + cmd + ': '
  o = `ssh -p 54324 ubot@#{conf['ip']} "#{cmd}"`
  o.empty? ? res += "<ok>\n" : res += o
  return res
end

def lshell cmd
  res = '  ' + cmd + ': '
  o = `#{cmd}`
  o.empty? ? res += "<ok>\n" : res += o
  return res
end

def each_ubot unums,pr
  $unums.each { |x|
    conf = get_config x
    do_async proc {
      pr.call conf
    }
  }
  await_all
end

def each_ubot_sync unums,pr
  $unums.each { |x|
    conf = get_config x
    puts pr.call conf
  }
end

def confirm txt
  puts txt
  puts 'contunue? (y/n): '
  prompt = STDIN.gets.chomp
  exit unless prompt == 'y'
end
