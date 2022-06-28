# TiDB Lightning在数据迁移中的应用与错误处理实践

> 作者简介：DBA，会点MySQL，懂点TiDB，Python。
>
> 个人主页：https://tidb.net/u/seiang/answer ，希望随着自己在 TiDB 上的成长，后续的主页内容越来越丰富。



俗话说：工欲善其事，必先利其器；我想 TiDB 之所以能够在国产数据库中脱颖而出，除了它是具备水平扩容或者缩容、金融级高可用、实时 HTAP、云原生的分布式数据库等功能的开源分布式关系型数据库之外，其 TiDB 周边丰富的生态工具可以满足不同业务场景下的数据迁移和同步、流转需求等；这为企业在做选型的时候提供了强有力的支撑。



我司在 2020 年开始将 TiDB 数据库接入测试环境进行业务测试，在 2021 年 TiDB 数据库正式接入线上业务，截止目前线上生产业务共 7 套 TiDB 集群，涉及节点 100+；并且有些业务也在陆续从MySQL迁移到 TiDB，那么本文将针对 TiDB Lightning 工具在数据迁移中应用以及 6.0 新功能实践供大家参考。

（**笔者能力有限，文章中如果存在技术性或描述性等错误，请大家及时指正，非常感谢！**）

## 一、应用场景

在使用 TiDB Lightning 做数据迁移工具使用，主要应用在一些变更不是很频繁，如字典表或按照时间维度分表的场景，比如按照时间进行分表或按照时间进行归档的表（例如：tabname_20220513 日表、tabname_202220 周表、tabname_202205 月表、tabname_2022 年表），这类表的业务特点就是 T+1 之后就不会有新的数据写入，针对这类型表在迁移到 TiDB，TiDB Lightning是非常好的工具，在 dumpling 和 tidb lightning 的上层做一层包装，即可实现自动化的迁移，并且根据是否影响 TiDB 对外提供服务选择 TiDB Lightning 的后端导入方式；

1、上游为MySQL主从实例迁移TiDB集群

2、上游为MySQL分片集群迁移数据迁移到TiDB集群

3、迁移现有的大型数据库到全新的 TiDB 集群

说明：TiDB Lightning的导入速度可达到传统导入 SQL 导入方式的至少 3 倍，甚至更多；



## 二、TiDB Lightning应用

从上游MyCAT分片集群迁移到TiDB集群，具体的迁移架构如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652435797945.png)

**备注**：

1、这里针对上述场景之所以没有使用 DM，一是结合上游分片集群的业务特点，二是上游分片集群的节点数较多，并且单个节点的磁盘占用空间较大；如果使用 DM 进行迁移，DM-worker 的节点数至少要和上游 MySQL 分片节点一样，并且 DM-worker的节点的磁盘空间要至少要和上游分片节点一样，综合评估之后，选择使用 Dumpling 和 TiDB Lightning 的方式做按照时间维度分表的迁移；

2、之所以不使用load的方式，原因有如下几方面：

（1）LOAD 方式导入 csv 文件过慢

（2）如果单个 csv 文件过大的话，在导入的时候甚至有可能导致 TiDB Server 出现 OOM 的问题（**生产环境 V5.0.3 遇到过该问题**）

（3）LOAD 方式导入数据无法保证原子性导入的问题；具体表现为由于 TiKV  写入过慢报错 LockNotFound 事务锁被清除，在上游是大数据量分片的场景中，可能出现 LOAD 进去 部分数据后导入失败，无法支持断点续传，此时需要反向 delete 掉已导入的数据，delete的代价非常高。



下面简单介绍下TiDB Lightning如何把将数据导入到目标集群中。目前，TiDB Lightning 支持以下后端：

- [Local-backend](https://docs.pingcap.com/zh/tidb/stable/tidb-lightning-backends#tidb-lightning-local-backend)

​       tidb-lightning 先将数据编码成键值对并排序存储在本地临时目录，然后将这些键值对以 SST 文件的形式上传到各个 TiKV 节点，然后由 TiKV 将这些 SST 文件 Ingest 到集群中。和 Importer-backend 原理相同，不过不依赖额外的 tikv-importer 组件

- [Importer-backend](https://docs.pingcap.com/zh/tidb/stable/tidb-lightning-backends#tidb-lightning-importer-backend)

​       tidb-lightning 先将 SQL 或 CSV 数据编码成键值对，由 tikv-importer 对写入的键值对进行排序，然后把这些键值对 Ingest 到 TiKV 节点中。

- [TiDB-backend](https://docs.pingcap.com/zh/tidb/stable/tidb-lightning-backends#tidb-lightning-tidb-backend)

​       tidb-lightning 先将数据编码成 INSERT 语句，然后直接在 TiDB 节点上运行这些 SQL 语句进行数据导入。



目前我们用的较多的是Local-backend和TiDB-backend，下面简单说明这两种模式在使用中一些需要注意事项：



**1、严格模式设置**

TiDB Lightning 默认的 sql_mode 为 "STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION"

**如果在导入的时候没有设置严格模式的话，使用默认设置的话，当导入的数据行长度超过下游字段的长度的话，导入的数据就会被截断，但是在导入的时候不会出现报错**；

数据格式示例：

```markdown
{"aid":0,"bs":2646,"es":2524,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072560270639562758,"pids":[601977053,389118472,813827129,100006880],"plist":null,"rbt":1646679808,"ret":1646679957,"rid":5,"sid":1,"tid":1532112,"xmllen":12774,"ziplen":0}
```

导入之后：

```markdown
mysql> select * from XXX_20220512 limit 5\G
*************************** 1. row ***************************
pid: 100006880
tid: 1532112
mid: 482714568
rid: 5
mpid: 72702
ret: 1646679957
sid: 1
des: {"aid":0,"bs":2646,"es":2524,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场
```



**2、解决冲突记录**

TiDB-backend 支持导入到已填充的表（非空表）。但是，新数据可能会与旧数据的唯一键冲突。

使用 on-duplicate 配置采取不同的冲突解决策略：

| 设置    | 冲突时默认行为         | 对应的SQL语句          |
| ------- | ---------------------- | ---------------------- |
| replace | 新数据替代旧数据       | REPLACE INTO ...       |
| ignore  | 保留旧数据，忽略新数据 | INSERT IGNORE INTO ... |
| error   | 中止导入               | INSERT INTO ...        |

Local-backend 模式导入，使用duplicate-resolution 配置提供了三种策略处理可能存在的冲突数据。

- none: 默认值。不检测冲突记录。该模式是三种模式中性能最佳的，但是可能会导致目的 TiDB 中出现数据索引不一致的情况。
- record: 仅将冲突记录添加到目的 TiDB 中的 lightning_task_info.conflict_error_v1 表中。注意，该方法要求目的 TiKV 的版本为 v5.2.0 或更新版本。如果版本过低，则会启用 'none' 模式。
- remove: 记录所有的冲突记录，和 'record' 模式相似。但是会删除所有的冲突记录，以确保目的 TiDB 中的数据索引保持一致。

以上三种模式中，如果不确定数据源是否存在冲突数据，推荐使用 remove 方式。none 和 record 方式由于不会移除目标表的冲突数据，意味着 TiDB Lightning 生成的唯一索引与数据可能不一致。



## 三、TiDB Lightning在6.0版本的新特性

### 1、TiDB Lightning 错误处理（最大可容忍错误）

从 TiDB 5.4.0 开始，可以配置 TiDB Lightning 跳过诸如无效类型转换、唯一键冲突等错误，让导入任务持续进行，就如同出现错误的行数据不存在一样。可以依据生成的报告，手动修复这些错误。



该功能适用于以下场景：

- 要导入的数据有少许错误
- 手动定位错误比较困难
- 如果遇到错误就重启 TiDB Lightning，代价太大



TiDB 5.4.0 Lightning 类型错误处理功能是实验特性。**不建议**在生产环境中仅依赖该功能处理相关错误，从6.0 DMR开始可以考虑在生产中使用；



通过调整配置项 lightning.max-error=N来增加数据类型相关的容错数量。如果设置为 *N*，那么 TiDB Lightning 允许数据源中出现 *N* 个错误，而且会跳过这些错误，并且将错误等信息记录到type_error_v1和conflict_error_v1表中，如果超过这个错误数就会退出。默认值为 0，表示不允许出现错误。



**测试示例：**

CSV文件格式，数据总条数5000

***备注：如下文件存在第一、二行主键冲突以及第三行字段缺少值\***

```markdown
100006880|1532112|482714568|5|72702|1646679957|1|{"aid":0,"bs":2646,"es":2524,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072560270639562758,"pids":[601977053,389118472,813827129,100006880],"plist":null,"rbt":1646679808,"ret":1646679957,"rid":5,"sid":1,"tid":1532112,"xmllen":12774,"ziplen":0}\


100006880|1532112|482714568|5|72702|1646679957|1|{"aid":0,"bs":2414,"es":2172,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072557887134040072,"pids":[934151055,477178155,100006880,167058307],"plist":null,"rbt":1646679310,"ret":1646679405,"rid":10,"sid":1,"tid":1532112,"xmllen":7992,"ziplen":0}\


100006880|1532112|482714568|16|72702|1646679249||{"aid":0,"bs":2208,"es":0,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072557213159718914,"pids":[755587427,121111569,100006880,121412060],"plist":null,"rbt":1646679179,"ret":1646679249,"rid":16,"sid":1,"tid":1532112,"xmllen":6988,"ziplen":0}\
```



配置文件内容

```markdown
[lightning]
level = "info"
file = "/data/xxx/tidb-lightning_local-backend.log"
pprof-port = 8289
status-addr = '0.0.0.0:8289'
max-error = 5

[tikv-importer]
backend = "tidb"

[mydumper]
data-source-dir = "/data/hotfix/6.0.0/tidb_file"
no-schema = true

[mydumper.csv]

separator = '|'
delimiter = ''
header = false
not-null = false
null = '\N'
backslash-escape = false
trim-last-separator = false

[tidb]
# 目标集群的信息
host = "xx.xx.xxx"
port = 4000
user = "xxx"
password = "xxx"
status-port = 10080
pd-addr = "xx.xx.xx.xx:2379"
sql-mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE'

[checkpoint]
# 启用断点续传。
# 导入时，TiDB Lightning 会记录当前进度。
# 若 TiDB Lightning 或其他组件异常退出，在重启时可以避免重复再导入已完成的数据。
enable = true

# 存储断点的方式
#  - file：存放在本地文件系统（要求 v2.1.1 或以上）
#  - mysql：存放在兼容 MySQL 的数据库服务器
driver = "file"

# 存储断点的架构名称（数据库名称）
# 仅在 driver = "mysql" 时生效
# schema = "tidb_lightning_checkpoint"

# 断点的存放位置
#
# 若 driver = "file"，此参数为断点信息存放的文件路径。
# 如果不设置该参数则默认为 `/tmp/CHECKPOINT_SCHEMA.pb`
#
# 若 driver = "mysql"，此参数为数据库连接参数 (DSN)，格式为“用户:密码@tcp(地址:端口)/”。
# 默认会重用 [tidb] 设置目标数据库来存储断点。
# 为避免加重目标集群的压力，建议另外使用一个兼容 MySQL 的数据库服务器。
dsn = "/tmp/tidb_lightning_checkpoint.pb"

# 导入成功后是否保留断点。默认为删除。
# 保留断点可用于调试，但有可能泄漏数据源的元数据。
# keep-after-success = false
```



导入成功后，查看导入数据的条数：

```markdown
# 严格模式
mysql> select count(*) from xxx20220512;
+----------+
| count(*) |
+----------+
|     4998 |
+----------+
1 row in set (0.00 sec)

#非严格模式
mysql> select count(*) from rec20220512;                
+----------+
| count(*) |
+----------+
|     4999 |
+----------+
1 row in set (0.01 sec)

```

从上述结果可以发现在非严格模式下，会将不符合表结构的数据也导入成功；很显然无法满足生成环境的需求



在 TiDB Lightning 输出的日志文件中可以查看到如下的报错信息：

```markdown
[2022/05/12 17:23:33.203 +08:00] [ERROR] [tidb.go:547] ["execute statement failed"] [rows="[\"('100006880','1532112','482714568','16','72702','1646679249','','{\\\"aid\\\":0,\\\"bs\\\":2208,\\\"es\\\":0,\\\"gid\\\":1047,\\\"ip\\\":3249872394,\\\"iszip\\\":0,\\\"mac\\\":0,\\\"mid\\\":482714568,\\\"mn\\\":\\\"川麻初级场(600准入）\\\",\\\"mpid\\\":72702,\\\"oid\\\":7072557213159718914,\\\"pids\\\":[755587427,121111569,100006880,121412060],\\\"plist\\\":null,\\\"rbt\\\":1646679179,\\\"ret\\\":1646679249,\\\"rid\\\":16,\\\"sid\\\":1,\\\"tid\\\":1532112,\\\"xmllen\\\":6988,\\\"ziplen\\\":0}\\\\\\\\')\"]"] [stmt="INSERT INTO `xxx`.`xxx20220512` VALUES('100006880','1532112','482714568','16','72702','1646679249','','{\"aid\":0,\"bs\":2208,\"es\":0,\"gid\":1047,\"ip\":3249872394,\"iszip\":0,\"mac\":0,\"mid\":482714568,\"mn\":\"初级场\",\"mpid\":72702,\"oid\":7072557213159718914,\"pids\":[755587427,121111569,100006880,121412060],\"plist\":null,\"rbt\":1646679179,\"ret\":1646679249,\"rid\":16,\"sid\":1,\"tid\":1532112,\"xmllen\":6988,\"ziplen\":0}\\\\')"] [error="Error 1366: Incorrect int value: '' for column 'sid' at row 1"]
...
[2022/05/12 17:23:34.493 +08:00] [INFO] [restore.go:472] ["the whole procedure completed"] [takeTime=1.373171452s] []
[2022/05/12 17:23:34.493 +08:00] [WARN] [errormanager.go:459] ["Detect 2 data type errors in total, please refer to table `lightning_task_info`.`type_error_v1` for more details"]
[2022/05/12 17:23:34.494 +08:00] [INFO] [main.go:106] ["tidb lightning exit"] [finished=true]
```



所有错误都会写入下游 TiDB 集群 lightning_task_info 数据库中的表中。在导入完成后，如果收集到报错的数据，你可以根据数据库中记录的内容，手动进行处理。

```markdown
mysql> select * from lightning_task_info.type_error_v1\G
*************************** 1. row ***************************
    task_id: 1652347413107354876
create_time: 2022-05-12 17:23:33.197778
table_name: `xxx`.`xxx20220512`
       path: xxx.xxx20220512.1.csv
     offset: 368
      error: Error 1062: Duplicate entry '100006880-72702-482714568-5-1532112-1646679957' for key 'PRIMARY'
   row_data: ('100006880','1532112','482714568','5','72702','1646679957','1','{"aid":0,"bs":2414,"es":2172,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072557887134040072,"pids":[934151055,477178155,100006880,167058307],"plist":null,"rbt":1646679310,"ret":1646679405,"rid":10,"sid":1,"tid":1532112,"xmllen":7992,"ziplen":0}\\')
*************************** 2. row ***************************
    task_id: 1652347413107354876
create_time: 2022-05-12 17:23:33.209988
table_name: `his_log`.`rec20220512`
       path: his_log.rec20220512.1.csv
     offset: 737
      error: Error 1366: Incorrect int value: '' for column 'sid' at row 1
   row_data: ('100006880','1532112','482714568','16','72702','1646679249','','{"aid":0,"bs":2208,"es":0,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072557213159718914,"pids":[755587427,121111569,100006880,121412060],"plist":null,"rbt":1646679179,"ret":1646679249,"rid":16,"sid":1,"tid":1532112,"xmllen":6988,"ziplen":0}\\')
2 rows in set (0.01 sec)
```

那么从上述的表中可以看到导入失败的行记录等信息，可以根据实际需求进行手动处理；表中记录的错误是文件偏移量，不是行号或列号，因为行号或列号的获取效率很低。



上述相同的数据，如果是Local-backend 模式导入，conflict_error_v1 表捕获了主键冲突的两行，type_error_v1捕获了字段缺少数据的一行；

```markdown
#严格模式
mysql> select count(*) from xxx20220512;
+----------+
| count(*) |
+----------+
|     4997 |
+----------+
1 row in set (0.01 sec)


mysql> select * from lightning_task_info.type_error_v1\G
*************************** 1. row ***************************
    task_id: 1652350988401924473
create_time: 2022-05-12 18:23:08.532195
table_name: `xxx`.`xxx20220512`
       path: xxx.xxx20220512.1.csv
     offset: 1103
      error: failed to cast value as int(10) UNSIGNED for column `sid` (#7): [types:1292]Truncated incorrect DOUBLE value: ''
   row_data: ('100006880','1532112','482714568','16','72702','1646679249','','{"aid":0,"bs":2208,"es":0,"gid":1047,"ip":3249872394,"iszip":0,"mac":0,"mid":482714568,"mn":"初级场","mpid":72702,"oid":7072557213159718914,"pids":[755587427,121111569,100006880,121412060],"plist":null,"rbt":1646679179,"ret":1646679249,"rid":16,"sid":1,"tid":1532112,"xmllen":6988,"ziplen":0}\\')
1 row in set (0.01 sec)


mysql> select * from lightning_task_info.conflict_error_v1\G
*************************** 1. row ***************************
    task_id: 1652350988401924473
create_time: 2022-05-12 18:23:09.280519
table_name: `xxx`.`xxx20220512`
index_name: PRIMARY
   key_data: 1
   row_data: (100006880, 1532112, 482714568, 5, 72702, 1646679957, 1, "{\"aid\":0,\"bs\":2646,\"es\":2524,\"gid\":1047,\"ip\":3249872394,\"iszip\":0,\"mac\":0,\"mid\":482714568,\"mn\":\"初级场\",\"mpid\":72702,\"oid\":7072560270639562758,\"pids\":[601977053,389118472,813827129,100006880],\"plist\":null,\"rbt\":1646679808,\"ret\":1646679957,\"rid\":5,\"sid\":1,\"tid\":1532112,\"xmllen\":12774,\"ziplen\":0}\\")
    raw_key: 0x7480000000000000BB5F698000000000000001040000000005F5FBE0040000000000011BFE04000000001CC5A3C80400000000000000050400000000001760D0040000000062265795
  raw_value: 0x0000000000000001
raw_handle: 0x7480000000000000BB5F728000000000000001
    raw_row: 0x800008000000010203040506070B040008000C000D001100150016005401E0FBF505D0601700C8A3C51C05FE1B010095572662017B22616964223A302C226273223A323634362C226573223A323532342C22676964223A313034372C226970223A333234393837323339342C2269737A6970223A302C226D6163223A302C226D6964223A3438323731343536382C226D6E223A22E5B79DE9BABBE5889DE7BAA7E59CBA28363030E58786E585A5EFBC89222C226D706964223A37323730322C226F6964223A373037323536303237303633393536323735382C2270696473223A5B3630313937373035332C3338393131383437322C3831333832373132392C3130303030363838305D2C22706C697374223A6E756C6C2C22726274223A313634363637393830382C22726574223A313634363637393935372C22726964223A352C22736964223A312C22746964223A313533323131322C22786D6C6C656E223A31323737342C227A69706C656E223A307D5C
*************************** 2. row ***************************
    task_id: 1652350988401924473
create_time: 2022-05-12 18:23:09.280519
table_name: `xxx`.`xxx20220512`
index_name: PRIMARY
   key_data: 2
   row_data: (100006880, 1532112, 482714568, 5, 72702, 1646679957, 1, "{\"aid\":0,\"bs\":2414,\"es\":2172,\"gid\":1047,\"ip\":3249872394,\"iszip\":0,\"mac\":0,\"mid\":482714568,\"mn\":\"初级场\",\"mpid\":72702,\"oid\":7072557887134040072,\"pids\":[934151055,477178155,100006880,167058307],\"plist\":null,\"rbt\":1646679310,\"ret\":1646679405,\"rid\":10,\"sid\":1,\"tid\":1532112,\"xmllen\":7992,\"ziplen\":0}\\")
    raw_key: 0x7480000000000000BB5F698000000000000001040000000005F5FBE0040000000000011BFE04000000001CC5A3C80400000000000000050400000000001760D0040000000062265795
  raw_value: 0x0000000000000002
raw_handle: 0x7480000000000000BB5F728000000000000002
    raw_row: 0x800008000000010203040506070B040008000C000D001100150016005401E0FBF505D0601700C8A3C51C05FE1B010095572662017B22616964223A302C226273223A323431342C226573223A323137322C22676964223A313034372C226970223A333234393837323339342C2269737A6970223A302C226D6163223A302C226D6964223A3438323731343536382C226D6E223A22E5B79DE9BABBE5889DE7BAA7E59CBA28363030E58786E585A5EFBC89222C226D706964223A37323730322C226F6964223A373037323535373838373133343034303037322C2270696473223A5B3933343135313035352C3437373137383135352C3130303030363838302C3136373035383330375D2C22706C697374223A6E756C6C2C22726274223A313634363637393331302C22726574223A313634363637393430352C22726964223A31302C22736964223A312C22746964223A313533323131322C22786D6C6C656E223A373939322C227A69706C656E223A307D5C
2 rows in set (0.00 sec)
```

更多相关内容可参考官方文档：https://docs.pingcap.com/zh/tidb/v6.0/tidb-lightning-error-resolution



### 2、DM工具从v6.0.0 全量阶段默认使用 TiDB Lightning 的 TiDB-backend 方式导入

DM工具从 v6.0.0 起全量阶段默认使用 TiDB Lightning 的 TiDB-backend 方式导入，替换原来的 Loader 组件。该变动为内部组件替换，对日常使用没有明显影响。



默认值import-mode为sql 表示启用 tidb-backend 组件，可能在极少数场景下存在未能完全兼容的情况，可以通过配置为 "loader" 回退。

（1）当import-mode设置为sql时候，对于全量导入阶段针对冲突数据的解决方式：

| on-duplicate参数值 | 说明                               |
| ------------------ | ---------------------------------- |
| replace            | 默认值，表示用最新数据替代已有数据 |
| ignore             | 保留已有数据，忽略新数据           |

（2）当import-mode设置为loader时候，

| on-duplicate参数值 | 说明                             |
| ------------------ | -------------------------------- |
| error              | 插入重复数据时报错并停止同步任务 |

DM对于load 处理单元配置参数如下：

```markdown
loaders:                           
  global:                            
    pool-size: 16                   

    # 全量阶段数据导入的模式。可以设置为如下几种模式：
    # - "sql"(默认)。
    # - "loader"。使用 Loader 导入。此模式仅作为兼容模式保留，目前用于支持 TiDB Lightning 尚未包含的功能，预计会在后续的版本废弃。
    import-mode: "sql"
    # 全量导入阶段针对冲突数据的解决方式：
    # - "replace"（默认值）。仅支持 import-mode 为 "sql"，表示用最新数据替代已有数据。
    # - "ignore"。仅支持 import-mode 为 "sql"，保留已有数据，忽略新数据。
    # - "error"。仅支持 import-mode 为 "loader"。插入重复数据时报错并停止同步任务。
    on-duplicate: "replace"
```

### 3、支持 base64 格式的密码字符串

从v6.0.0，在使用 TiDB Lightning 的时候支持 base64 格式的密码字符串

在使用 tidb-lightning 命令行参数配置--tidb-password *password（或对应的配置文件参数*tidb.password*）*

可以兼容base64 格式的密码字符串



## 四、小结

1、TiDB Lightning导入建议设置严格模式，否则导入的数据可能出现截断或错误；

2、如果单个文件太大，会影响 Lightning 的 local 模式对文件的导入效率，建议提前进行拆分；或者如果导入的 CSV 文件内都不存在包含字符换行符的字段 (U+000A 及 U+000D)，则可以启用strict-format（strict-format=true），TiDB Lightning 会自动分割大文件;

3、往TiDB导入CSV数据，推荐使用 Lightning工具，不建议使用Load data，可能会出现OOM；