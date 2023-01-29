---
title: TiDB Lightning导入超大型txt文件实践 - TiDB 社区技术月刊
sidebar_label:  TiDB Lightning导入超大型txt文件实践
hide_title: true
description: 本文重点介绍 Lightning如何导入 txt 数据，毕竟数据量很大的时候还得靠 Lightning。
keywords: [TiDB, Lightning, 导入文件, 超大型txt文件]
---

# TiDB Lightning导入超大型txt文件实践

> 作者：[hey-hoho](https://tidb.net/u/hey-hoho/answer)

## 背景

TiDB 提供了很多种数据迁移的方式，但这些工具/方案普遍对MySQL比较友好，一旦涉及到异构数据迁移，就不得不另寻出路，借助各种开源或商业的数据同步工具。其实数据在不同系统的流转当中，有一种格式是比较通用的，那就是txt/csv这类文件，把数据用约定好的分隔符换行符等标记存放在一起，比如最常见的逗号分隔：

```
aa,11,a1
bb,22,b2
```

这个文件可以保存为`data.txt`或者`data.csv`，一般主流的数据库都支持把这类文件直接导入到对应的表中。

csv本身就是逗号分隔符文件，但是由于逗号太常见了很容易和真实数据混淆，往往会用比较复杂的字符作为分隔符，这时候txt文件就更灵活一些。

在 TiDB 中我们想导入csv文件可以选择的方式有`Load Data`和`Lightning`，但是从官方文档得知，这两种方式都没有明确表示支持txt文件导入。但是经过实测，实际上都能够支持txt格式文件，`Load Data`参考csv导入即可，本文重点介绍`Lightning`如何导入txt数据，毕竟数据量很大的时候还得靠`Lightning`。

> 有人可能会质疑，不就是改个文件扩展名就能解决的问题何必搞得这么麻烦，要知道有些时候用户并不接受把txt强制改成csv，担心有损坏数据风险。。
>
> 咱也不敢说咱也不敢问，只能默默研究lightning。

## Lightning 导入简单的txt文件

虽然官网文档明确表示 TiDB Lightning 支持以下文件类型：

- [Dumpling](https://docs.pingcap.com/zh/tidb/stable/dumpling-overview) 生成的文件
- CSV 文件
- [Amazon Aurora 生成的 Apache Parquet 文件](https://docs.pingcap.com/zh/tidb/stable/migrate-aurora-to-tidb)

但并没有说不支持txt，这就会让人抱有一丝幻想，尝试用默认的方式导入txt：

```
cd /data/loadtxt
vi test.t.txt
a#11
b#22
c#33
vi lightning-task.yaml

[lightning]
level = "info"
file = "tidb-lightning.log"
index-concurrency = 2
table-concurrency = 6

[tikv-importer]
backend = "local"
sorted-kv-dir = "/home/tidb/sorted"

[mydumper]
data-source-dir = "/data/loadtxt"
no-schema = true
filter = ['*.*']

[mydumper.csv]
separator = "#"
delimiter = ''
terminator = ""
header = false
not-null = false
null = '\N'
backslash-escape = true
trim-last-separator = false

[tidb]
host = "10.3.xx.xx"
port = 4000
user = "root"
password = "xxxxxx"
status-port = 10080
pd-addr = "10.3.xx.xx:2379"

[checkpoint]
enable = false

[post-restore]
checksum = true
analyze = false
```

如果这样运行 Lightning 你会发现并不会有任何报错信息，甚至日志最后还会提示：

```
[2022/09/15 16:53:10.846 +08:00] [INFO] [restore.go:442] ["the whole procedure completed"] [takeTime=108.167654ms] []
[2022/09/15 16:53:10.847 +08:00] [INFO] [main.go:106] ["tidb lightning exit"] [finished=true]
```

但是表里面始终没有数据进来，仔细分析日志就会发现，txt会被 Lightning 默认的 filter 给过滤掉：

```
[2022/09/15 16:53:10.721 +08:00] [INFO] [lightning.go:423] ["load data source start"]
[2022/09/15 16:53:10.721 +08:00] [INFO] [loader.go:310] ["[loader] file is filtered by file router"] [path=test.t.txt]
[2022/09/15 16:53:10.721 +08:00] [INFO] [lightning.go:426] ["load data source completed"] [takeTime=231.822µs] []
```

事实上，Lightning 提供了文件路由的特性，这也是 Lightning 能够导入 Aurora parquet 文件的原因，Aurora 的数据文件并不是我们熟知的`库名.表名.csv|sql`这种格式，正是通过自定义解析文件名才实现了 Aurora 数据导入。参考文档上的一段配置信息：

```
# [[mydumper.files]]
# 解析 AWS Aurora parquet 文件所需的表达式
# pattern = '(?i)^(?:[^/]*/)*([a-z0-9_]+)\.([a-z0-9_]+)/(?:[^/]*/)*(?:[a-z0-9\-_.]+\.(parquet))$'
# schema = '$1'
# table = '$2'
# type = '$3'
```

文件路由通过`mydumper.files`配置实现，它用正则定义了库名表名的解析规则。我们参考这个规则，在前面的`lightning-task.yaml`中增加这样一段配置：

```
[[mydumper.files]]
pattern = 'test.t.txt'
schema = 'test'
table =  't'
type = 'csv'
```

从type字段测试得出，Lightning 确实是不支持txt文件，但是这里通过正则解析巧妙的绕过了这个问题，把txt当做csv去处理。当强制给type设置为txt的时候，你会收到如下报错：

```
tidb lightning encountered error: [Lightning:Storage:ErrStorageUnknown]list file failed: apply file routing on file 'test.t.txt' failed: unknown source type 'txt'
```

至此，我们实现了一个简单的txt文件导入。

## Lightning 对复杂分隔符的处理

之所以选择用txt文件保存数据，就是因为它支持更多复杂的分隔符。一般来说，为了避免和真实数据冲突，我们会选用组合字符或者不可见字符来作为分隔符，比如`^&^`、`ESC`这种。

不可见字符是没办法直接写在配置文件中的，好在 Lightning 支持使用 Unicode 编码格式。 假设现在使用键盘上的`ESC`作为分隔符，那就可以在配置文件中这样定义：

```
[mydumper.csv]
separator = "\u001b"
```

在`toml`文件中，Unicode 字符需要使用 **\u** 来转义，**001b** 就是`ESC`键对应的 Unicode 编码，并且这里字段值必须要用双引号包裹起来，单引号不行，需要注意。

Unicode 属于通用的字符编码规范，所有平台、系统、编程语言都对它有很好支持，建议在使用不常见字符时优先考虑使用 Unicode。

同样的，如果分隔符是多个字符，比如：

```
a#$11
b#$22
c#$33
```

也能使用 Unicode 编码替换：

```
[mydumper.csv]
separator = "\u0023\u0024"
# 或者
separator = "#$"
```

## Lightning 对自定义文件名解析的处理

回到刚才新加的一段支持txt导入的配置：

```
[[mydumper.files]]
pattern = 'test.t.txt'
schema = 'test'
table =  't'
type = 'csv'
```

可以发现这个配置是写死了库名、表名、以及文件名的，单个文件导入这样做没问题，如果有一大批txt需要导入，每个文件写一套配置肯定是不行，这时候需要用到它的正则解析特性。这个解析的核心就是，告诉 Lightning 如何提取需要导入的文件以及它对应的库名表名。

假设我现在有一批从其他库导出的txt文件，名称如下：

```
oms_order_info_f.txt  
usr_user_info_f.txt  
wms_warehouse_f.txt
```

一般来说文件名都不会随便乱起一个，会带上自身的业务属性。比如上面这个例子第一个单词表示业务单元，中间的单词是业务表，最后的f表示这是个导出的文件。基于规则固定的情况下，我们就可以使用正则提取需要的信息，得到如下配置参数：

```
[[mydumper.files]]
pattern = '([a-z]+)_([a-z0-9_]+)_f.txt'
schema = '$1'
table =  '$2'
type = 'csv'
```

这样一来，只有符合pattern定义的文件才被Lightning处理，比如刚才的`test.t.txt`就会被忽略掉。其次schema和table变得更加灵活，除了直接从正则参数提取，还能加入我们想要的prefix，比如把文件都导入到以`bak_`开头的表中：

```
table =  'bak_$2'
```

有了这个特性，就算你的数据文件不是`库名.表名.{index}.csv|txt`这种格式，也能通过配置参数解决了。

## Lightning 对特殊格式的处理

上游的数据总是千奇百怪，往往无法预料会蹦出个什么格式，在数据导入的过程中有两点我觉得需要重点关注一下。

### **1、如何处理空值（null）**

Lightning 定义了如下的空值解析规则（搬运自官网）：

```
[mydumper.csv]
# CSV 文件是否包含 NULL。
# 如果 not-null = true，CSV 所有列都不能解析为 NULL。
not-null = false
# 如果 not-null = false（即 CSV 可以包含 NULL），
# 为以下值的字段将会被解析为 NULL。
null = '\N'
```

以上配置的含义是如果碰到`aa,\N,11`这样的数据，那么中间字段在数据库里面会是 NULL。通常情况下我们会碰到这样的数据`aa,,11`，那么就需要设置`null = ''`。

如果不希望数据库里面存在 NULL 值，那么把`not-null`设置为`true`即可。

### **2、如何处理转义字符**

Lightning 定义了如下的转义规则（搬运自官网）：

```
[mydumper.csv]
# 是否对字段内“\“进行转义
backslash-escape = true
```

假设恰好碰到这样的数据`aa,\,11`，上面的配置会把第二个分隔符当做真实数据保留，实际只会导入2个字段，插入的值分别是`aa`、`，11`，使用的时候千万要注意。

如果要把`\`当做真实数据写入第二个字段，那么把上述配置设置为`false`即可。

## 大文件导入优化

Lightning 的最佳工作模式是处理大量的小文件，官网给出的建议值是单个数据文件不超过256M，经过实测发现，默认情况下 Lightning 对大文件的处理确实不够理想，风险包括：

- 无法充分利用机器资源
- 导入速度极慢
- 程序易中断报错
- 进程假死无响应

不仅仅是 Lightning ，我觉得整个 TiDB 的使用精髓就是拆分拆分拆分，大而重的事情虽然 TiDB 能做，但不是它擅长的。类似于大事务 SQL 一样，这里我们需要把大文件做拆分。我使用过的有两种方式。

### 1、Lightning 严格模式

**如果要导入的文件能够保证真实数据不包含换行符（\r\n）**，那么可以开启 Lightning 的严格模式来自动拆分大文件，达到加速目的。

相关参数为（务必仔细阅读参数说明）：

```
[mydumper]
# “严格”格式的导入数据可加快处理速度。
# strict-format = true 要求：
# 在 CSV 文件的所有记录中，每条数据记录的值不可包含字符换行符（U+000A 和 U+000D，即 \r 和 \n）
# 甚至被引号包裹的字符换行符都不可包含，即换行符只可用来分隔行。
# 导入数据源为严格格式时，TiDB Lightning 会快速定位大文件的分割位置进行并行处理。
# 但是如果输入数据为非严格格式，可能会将一条完整的数据分割成两部分，导致结果出错。
# 为保证数据安全而非追求处理速度，默认值为 false。
strict-format = false

# 如果 strict-format = true，TiDB Lightning 会将 CSV 大文件分割为多个文件块进行并行处理。max-region-size 是分割后每个文件块的最大大小。
# max-region-size = "256MiB" # 默认值
```

### 2、手动切分文件

严格模式虽然好用，但是拆分逻辑在 Lightning 内部完成，我们无法知道具体拆分细节，如果出现数据问题就很难排查，手动拆分文件相对来说比较可控，也可以作为备选方案。

手动拆分的核心是使用 Linux 的`split`命令，这里推荐一个基于`split`封装的脚本，功能强大，为 Lightning 而生。

> https://github.com/jansu-dev/TiChange_for_lightning
>
> 感谢作者的分享 @jansu-dev

TiChange 用起来最舒服的就是它能把拆分后的文件命名为 Lightning 需要的格式，这样就不用额外写正则去定义文件路由，使用方法可以参考 Github 文档，非常简单。

```
[root@localhost tichange]# ./tichange.sh -i '/data/loadtxt/golang_gen.txt' -o '/home/tichange' -m 'test.t3'
Option i == /data/loadtxt/golang_gen.txt
Option o == /home/tichange
Option m == test.t3
---------------------------------------------------------------------------
------------  TiChange starting  ------------------------------------------
---------------------------------------------------------------------------
------------  using below information for tidb-lightning.toml  ------------
---------------------------------------------------------------------------
Please write the string path to tidb-lightning.toml config file!!!
and ,delete the dealed files by hand after imported data into database!!!

[mydumper]
data-source-dir = "/home/tichange/e46718e_operating_dir"
[mydumper]
no-schema = true
---------------------------------------------------------------------------

[root@localhost tichange]# ll /home/tichange/e46718e_operating_dir
total 20889132
-rw-r--r--. 1 root root 39888931 Sep 21 16:28 test.t3.00000000.csv
-rw-r--r--. 1 root root 41000041 Sep 21 16:28 test.t3.00000001.csv
-rw-r--r--. 1 root root 41000041 Sep 21 16:28 test.t3.00000002.csv
-rw-r--r--. 1 root root 41000041 Sep 21 16:28 test.t3.00000003.csv
-rw-r--r--. 1 root root 41000041 Sep 21 16:28 test.t3.00000004.csv
-rw-r--r--. 1 root root 41000041 Sep 21 16:28 test.t3.00000005.csv
......
-rw-r--r--. 1 root root 42978543 Sep 21 16:28 test.t3.00000499.csv
```

> 宝贵提示：如果不需要替换文件里的分隔符和界定符为csv标准格式，可以把源码中这部分的处理逻辑（多个sed操作）去掉，能够极大提高拆分速度。

我用一个20G的文件得到一组测试数据，供大家参考：

```
[root@localhost loadtxt]# ll -h
total 20G
-rw-r--r--. 1 root root 20G Sep 21 10:05 golang_gen.txt
```

| 指标         | 参考值                          |
| ------------ | ------------------------------- |
| 测试机器     | 虚拟机4c8g ssd盘，local模式导入 |
| 原始文件大小 | 20G，2个字段，5亿行数据         |
| 直接导入     | 31m14s                          |
| 严格模式     | 13m16s                          |
| 手动拆分     | 100万行做拆分，总耗时13m54s     |

## 生产环境实践

近期上线的一个项目约有100个铺底数据文件，累计大小12T+，单个文件最大2.1T，采用手动拆分+分批导入的方案，6台物理机同时干活，充分利用现有的机器资源。

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/企业微信截图_20220921165314-1663927346971.png) 

最后累计在1天内完成数据导入，这里涉及到生产敏感数据不过多描述。

## 总结

毫无疑问，在往 TiDB 导入大数据量的时候首选一定是 Lightning ，它不仅支持官网明码标注的文件类型，还支持txt这样的彩蛋，好好研究一下 Lightning 是很有必要的。

另外，Lightning 也随着 TiDB 的版本升级在不断强大，建议优先使用高版本的 Lightning ，可以避免一部分已知的bug，还能体验更好的性能。

虽然全篇都在以txt文件作为演示，但csv文件也同样适用前面描述的几种处理方式。

最后，希望本文能帮助到正在受大文件导入折磨的小伙伴们~