---
title: TiCDC canal_json的实际应用
hide_title: true
---

# TiCDC canal_json的实际应用

**Jiawei** 发表于  **2022-06-02**

## 背景知识

在开始介绍之前先和大家简单介绍两个东西：

**1**.目前流行的`**缓存和DB一致性**`的实现架构： ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/%E6%88%AA%E5%B1%8F2022-06-02%20%E4%B8%8B%E5%8D%883.01.33-1654153312889.png) 

基本的流程如图所示：

MySQL 增删改 --> Canal(伪装slave)获取变更--> kafka 接收topic 写入 --> api消费kafka topic 获取变更 -->失效缓存

**2**.**Canal**

Canal是阿里早期为了解决异国双机房之间数据同步业务需求而开发出来的基于日志解析和变更进行同步的工具，由此衍生出了大量的数据库增量订阅和消费业务。

官方文档地址：[otter](https://github.com/alibaba/canal) 

架构图：

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/%E6%88%AA%E5%B1%8F2022-06-02%20%E4%B8%8B%E5%8D%883.11.11-1654153891834.png) 

简单讲canal就是伪装成MySQL的slave，然后像主从同步的样子，去获取变更。

canal的使用场景一般也有2个种类：

1.缓存DB一致性实现。

2.同步数据到数仓平台。

# TiCDC Canal-JSON

### Canal-JSON 是什么？

Canal-JSON 其实是阿里巴巴定义的一种数据交换格式协议，本身就是为MySQL设计的。

### 为什么要用到TiCDC Canal-JSON协议？

原因是因为我们之前数据库是在MySQL上面跑的，然后近期MySQL迁移到了TiDB上面，为了保证之前那一套缓存一致性业务逻辑实现，而canal又不支持TiDB，所以我们需要一个可以替换canal的组件来获取TiDB的变更并写入到后端的Message Queue。

经过我的调研，TiDB有两种方式可以实现我们的需求：

1.是用TiDB binlog工具可以将变更写到 MQ。

2.是用TiCDC创建一个同步任务，指定数据格式是Canal-JSON样式。

而且经过查看TICDC canal_json 和canal实现对比如下，更多可以看官方文档：[TiCDC Canal-JSON Protocol](https://docs.pingcap.com/zh/tidb/stable/ticdc-canal-json) 

| 不同点            | TiCDC                                                        | Canal                       |
| ----------------- | ------------------------------------------------------------ | --------------------------- |
| update            | old块包含老的所有列的原数据                                  | old块只包含被更新的列的数据 |
| data type         | 没有类型参数，比如char(16) 只显示char                        | 而canal会显示char(16)       |
| commit_ts唯一标识 | sink_uri enable-tidb-extension 开启会显示 多一个_tidb字段显示commit_ts | 无                          |
| delete type       | v5.4之前，old和data内容相同 v5.4之后，old为null              | 无                          |

所以经过上面的调研，我们最终决定使用第二种TiCDC的方式，原因2点：

- canal和TiCDC canal_json 大部分实现相同，差异很小。
- 对于开发友好，我们的开发之前都是对canal比较熟悉，可以很方便快速上手，改动更少的代码。

## TiCDC canal_json 如何使用？

首先非常关键的一点，canal_json还是机遇TiCDC实现的，所以我们肯定得先有TiCDC集群。

以下操作基于TiDB 6.0版本。

**1.首先创建一个配置文件**

创建配置文件的原因是因为我们实际并不是需要某个业务库下的所有表，只有一些重要的热点的表。

因为canal可以在配置文件中配置白名单黑名单，如下

```bash
# 白名单，表示是dbname数据库的所有表
canal.instance.filter.regex=dbname\\..*
# 黑名单，避免同步无用的增量数据
canal.instance.filter.black.regex=
```

TiCDC没法直接指定我们需要同步那些库的哪些表，所以我们需要在配置文件指定

```bash
#比如这里我们只要同步这台TiDB集群的ticdc_canal_test数据库的表，其他都不同步
$ cat /root/ticdc_canal_test.toml
[filter]
rules = ['ticdc_canal_test.*']
```

这里只是简单演示下，更详细的过滤规则大家可以参考官方文档:[配置文件配置](https://docs.pingcap.com/zh/tidb/stable/manage-ticdc#同步任务配置文件描述) 

**2.创建一个同步任务**

配置好了之后我们可以开始配置同步任务，先了解一些常用参数：

```bash
--changefeed-id          任务ID
--sink-uri               同步任务下游的地址，目前支持mysql/tidb/kafka/pulsar
--start-ts               同步任务开始的位置，这里是ts，默认创建任务当前时间，类似于mysql搭建同步的开始文件位点
--target-ts              同步任务结束位置，默认为空，即一直同步
--config                 指定配置文件，过滤规则这些
```

知道这些含义之后我们可以开始创建一个任务：

```bash
#1.创建一个同步到kafka的同步任务
$ cdc cli changefeed create --pd=http://pd_ip:42379 --changefeed-id="ticdc-canal-json-test" --config="/root/ticdc_canal_test.toml" --sink-uri="kafka://kafka_ip:9092/ticdc_canal_test_topic?kafka-version=2.6.0&protocol=canal-json&enable-tidb-extension=true"
[2022/06/02 16:23:27.994 +08:00] [WARN] [kafka.go:451] ["broker's `message.max.bytes` less than the `max-message-bytes`,use broker's `message.max.bytes` to initialize the Kafka producer"] [message.max.bytes=1048588] [max-message-bytes=10485760]
[2022/06/02 16:23:27.994 +08:00] [WARN] [kafka.go:461] ["partition-num is not set, use the default partition count"] [topic=ticdc_canal_test_topic] [partitions=3]
Create changefeed successfully!
ID: ticdc-canal-json-test
Info: {"sink-uri":"kafka://kafka_ip:9092/ticdc_canal_test_topic?kafka-version=2.6.0\u0026protocol=canal-json\u0026enable-tidb-extension=true","opts":{},"create-time":"2022-06-02T16:23:27.974959914+08:00","start-ts":433627649254096897,"target-ts":0,"admin-job-type":0,"sort-engine":"unified","sort-dir":"","config":{"case-sensitive":true,"enable-old-value":true,"force-replicate":false,"check-gc-safe-point":true,"filter":{"rules":["ticdc_canal_test.*"],"ignore-txn-start-ts":null},"mounter":{"worker-num":16},"sink":{"dispatchers":null,"protocol":"canal-json","column-selectors":null},"cyclic-replication":{"enable":false,"replica-id":0,"filter-replica-ids":null,"id-buckets":0,"sync-ddl":false},"scheduler":{"type":"table-number","polling-time":-1},"consistent":{"level":"none","max-log-size":64,"flush-interval":1000,"storage":""}},"state":"normal","error":null,"sync-point-enabled":false,"sync-point-interval":600000000000,"creator-version":"v6.0.0"}

#2.查看刚才的任务状态,可以看到详细的信息
$ cdc cli changefeed query --pd=http://pd_ip:42379 --changefeed-id="ticdc-canal-json-test"
{
  "info": {
    "sink-uri": "kafka://kafka_ip:9092/ticdc_canal_test_topic?kafka-version=2.6.0\u0026protocol=canal-json\u0026enable-tidb-extension=true",
    "opts": {},
    "create-time": "2022-06-02T16:23:27.974959914+08:00",
    "start-ts": 433627649254096897,
    "target-ts": 0,
    "admin-job-type": 0,
    "sort-engine": "unified",
    "sort-dir": "",
    "config": {
      "case-sensitive": true,
      "enable-old-value": true,
      "force-replicate": false,
      "check-gc-safe-point": true,
      "filter": {
        "rules": [
          "ticdc_canal_test.*"
        ],
        "ignore-txn-start-ts": null
      },
      "mounter": {
        "worker-num": 16
      },
      "sink": {
        "dispatchers": null,
        "protocol": "canal-json",
        "column-selectors": null
      },
      "cyclic-replication": {
        "enable": false,
        "replica-id": 0,
        "filter-replica-ids": null,
        "id-buckets": 0,
        "sync-ddl": false
      },
      "scheduler": {
        "type": "table-number",
        "polling-time": -1
      },
      "consistent": {
        "level": "none",
        "max-log-size": 64,
        "flush-interval": 1000,
        "storage": ""
      }
    },
    "state": "normal",
    "error": null,
    "sync-point-enabled": false,
    "sync-point-interval": 600000000000,
    "creator-version": "v6.0.0"
  },
  "status": {
    "resolved-ts": 433627686504759297,
    "checkpoint-ts": 433627686504759297,
    "admin-job-type": 0
  },
  "count": 0,
  "task-status": [
    {
      "capture-id": "48f5f942-025d-48c3-a7c3-e06c70334ef2",
      "status": {
        "tables": null,
        "operation": null,
        "admin-job-type": 0
      }
    }
  ]
}
```

**3.数据库操作变更**

```sql
MySQL [(none)]> use ticdc_canal_test
Database changed
MySQL [ticdc_canal_test]> show tables;
Empty set (0.00 sec)

MySQL [ticdc_canal_test]>  CREATE TABLE `jiawei_test2` (
    ->   `id` int(11) NOT NULL,
    ->   `name` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
    ->   PRIMARY KEY (`id`));
Query OK, 0 rows affected (0.09 sec)

MySQL [ticdc_canal_test]> show create table jiawei_test2
    -> ;
+--------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Table        | Create Table                                                                                                                                                                                                                             |
+--------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| jiawei_test2 | CREATE TABLE `jiawei_test2` (
  `id` int(11) NOT NULL,
  `name` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin |
+--------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
1 row in set (0.00 sec)

MySQL [ticdc_canal_test]> insert into jiawei_test2(id,name) values(1,'numer1'),(2,'number2'),(3,'number3');
Query OK, 3 rows affected (0.01 sec)
Records: 3  Duplicates: 0  Warnings: 0

MySQL [ticdc_canal_test]> select * from jiawei_test2;
+----+---------+
| id | name    |
+----+---------+
|  1 | numer1  |
|  2 | number2 |
|  3 | number3 |
+----+---------+
3 rows in set (0.01 sec)

MySQL [ticdc_canal_test]> update jiawei_test2 set name='tidb';
Query OK, 3 rows affected (0.01 sec)
Rows matched: 3  Changed: 3  Warnings: 0

MySQL [ticdc_canal_test]> select * from jiawei_test2;
+----+------+
| id | name |
+----+------+
|  1 | tidb |
|  2 | tidb |
|  3 | tidb |
+----+------+
3 rows in set (0.01 sec)

MySQL [ticdc_canal_test]> delete from jiawei_test2 where id=1;
Query OK, 1 row affected (0.01 sec)

MySQL [ticdc_canal_test]> select * from jiawei_test2;
+----+------+
| id | name |
+----+------+
|  2 | tidb |
|  3 | tidb |
+----+------+
2 rows in set (0.00 sec)

MySQL [ticdc_canal_test]> alter table jiawei_test2 add column c1 int;
Query OK, 0 rows affected (0.27 sec)

MySQL [ticdc_canal_test]> select * from jiawei_test2;
+----+------+------+
| id | name | c1   |
+----+------+------+
|  2 | tidb | NULL |
|  3 | tidb | NULL |
+----+------+------+
2 rows in set (0.00 sec)

MySQL [ticdc_canal_test]> alter table jiawei_test2 add index idx_name(name);
Query OK, 0 rows affected (2.80 sec)

MySQL [ticdc_canal_test]> alter table jiawei_test2 drop column c1;
Query OK, 0 rows affected (0.28 sec)

MySQL [ticdc_canal_test]> select * from jiawei_test2;
+----+------+
| id | name |
+----+------+
|  2 | tidb |
|  3 | tidb |
+----+------+
2 rows in set (0.01 sec)
```

**4.查看topic内容**

```bash
#测试一下消费信息
$ ./bin/kafka-console-consumer.sh --bootstrap-server kafka_ip:9092 --topic test_ticdc_canal_json --from-beginning
#创建表消息
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":null,"isDdl":true,"type":"CREATE","es":1654163280810,"ts":1654163282102,"sql":"CREATE TABLE `jiawei_test2` (`id` INT(11) NOT NULL,`name` VARCHAR(10) COLLATE utf8mb4_general_ci DEFAULT NULL,PRIMARY KEY(`id`))","sqlType":null,"mysqlType":null,"data":null,"old":null}
#插入数据消息
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"INSERT","es":1654163303159,"ts":1654163305460,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"1","name":"numer1"}],"old":null}
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"INSERT","es":1654163303159,"ts":1654163305461,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"2","name":"number2"}],"old":null}
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"INSERT","es":1654163303159,"ts":1654163305461,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"3","name":"number3"}],"old":null}
#更新数据消息，可以看到old是包含了所有列原来的值
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"UPDATE","es":1654163312959,"ts":1654163314469,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"1","name":"tidb"}],"old":[{"id":"1","name":"numer1"}]}
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"UPDATE","es":1654163312959,"ts":1654163314469,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"2","name":"tidb"}],"old":[{"id":"2","name":"number2"}]}
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"UPDATE","es":1654163312959,"ts":1654163314470,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"3","name":"tidb"}],"old":[{"id":"3","name":"number3"}]}
#删除数据信息，可以看到确实6.0的版本old是null
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":["id"],"isDdl":false,"type":"DELETE","es":1654163329309,"ts":1654163330485,"sql":"","sqlType":{"id":4,"name":12},"mysqlType":{"id":"int","name":"varchar"},"data":[{"id":"1","name":"tidb"}],"old":null}
#DDL测试，增加索引，增删列
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":null,"isDdl":true,"type":"ALTER","es":1654163338309,"ts":1654163340302,"sql":"ALTER TABLE `jiawei_test2` ADD COLUMN `c1` INT","sqlType":null,"mysqlType":null,"data":null,"old":null}
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":null,"isDdl":true,"type":"CINDEX","es":1654163357509,"ts":1654163360101,"sql":"ALTER TABLE `jiawei_test2` ADD INDEX `idx_name`(`name`)","sqlType":null,"mysqlType":null,"data":null,"old":null}
{"id":0,"database":"ticdc_canal_json_test","table":"jiawei_test2","pkNames":null,"isDdl":true,"type":"ALTER","es":1654163366509,"ts":1654163369502,"sql":"ALTER TABLE `jiawei_test2` DROP COLUMN `c1`","sqlType":null,"mysqlType":null,"data":null,"old":null}
```

### 注意事项

建议在同步的时候不要打开**enable-tidb-extension** 这个选项，如果这个额外字段不是必须的话，因为这个开启之后会生成很多的**WATERMARK Event**，不方便我们观察和消费

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/%E6%88%AA%E5%B1%8F2022-06-02%20%E4%B8%8B%E5%8D%885.24.36-1654164050826.png) 

## 总结

目前我们已经在项目上跑了很久了，非常稳定，这里给大家简单介绍了一下基本用法，

想更多的分区等操作，canal支持的，TiCDC canal_json 基本都支持。

跟过的可以参考官方文档更详细参数设置:[参数设置](https://docs.pingcap.com/zh/tidb/stable/manage-ticdc#sink-uri-配置-kafka) 

