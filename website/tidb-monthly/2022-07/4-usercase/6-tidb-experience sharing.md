---
title: TiDB 在长银五八消费金融核心系统适配经验分享 - TiDB 社区技术月刊
sidebar_label: TiDB 在长银五八消费金融核心系统适配经验分享
hide_title: true
description: 本文介绍了一些实践经验，包括功能测试总结、兼容性问题、参数调试三个模块。
keywords: TiDB, 功能测试, 兼容性, 参数调试, mem quota query,txn total size limit
---

# TiDB 在长银五八消费金融核心系统适配经验分享

> **作者**：cs58_dba

在独自查文档，逛论坛的过程中，积累了一些微末的实践经验，包括功能测试总结、兼容性问题、参数调试三个模块和大家分享，希望能让TiDB初学者少绕一些弯，TiDB大神和资深使用者可以忽略。

## 一、Tidb产品功能测试总结

下列所有项都在TiDB 5.4上测试过，亲测有效，我为我的结论负责。总体来说TiDB 与 MySQL 功能上兼容性还是不错的。

| 测试维度       | 具体测试维度                 | TIDB                                                         |
| -------------- | ---------------------------- | ------------------------------------------------------------ |
| 基本功能测试   | 标准SQL语句测试              | 1、支持标准 SQL，DDL 、DML 、DCL、DQL(包括分析函数,各种查询)。 2、部分支持完整性约束，不支持check约束和外键约束功能， 但支持语法兼容。 3、支持表管理、视图管理。 4、部分支持分区表，不支持 list 分区和复合分区； 支持全局索引，不支持本地索引。 5、不支持临时表、存储过程， 自定义函数，表空间，触发器等创建和使用。 6、支持 sequence 创建和使用。 7、不支持添加列的auto_increment属性。 疑问： load 加载数据的时候必须加 local 参数； （load data local infile '/tmp/ccs_acct.sql' into table ccs_acct;） |
| 基本功能测试   | 分布式事务读写强一致         | tidb 目前只支持 snapshot isolation（等同于repeatable-read） 事务隔离级别，可以手动修改 而MySQL是属于read committed（RC）级别 |
| 基本功能测试   | 死锁检测与死锁解除           | 能检测到死锁并解除死锁，默认是悲观锁                         |
| 扩展性         | 数据、计算、控制节点在线扩容 | tikv、tidb、pd都支持在线扩容、缩容，集群工作正常，业务不受影响 |
| 数据库高可用性 | 节点故障                     | 计算、管理、控制节点，任意挂一个都对集群整体无影响           |
| 数据库运维能力 | 快速删除数据能力             | 在亿级数据及索引存在的情况下，秒级对一段时间范围内的流水数据 进行删除，同时对记录和表不造成任何影响。 备注：自主测试drop和truncate 200万级别的表， tidb上耗时不到1s，mysql上要3-4s |
| 数据库运维能力 | 动态增加字段能力             | 针对包含亿级数据的表增加字段。在DDL进行的过程中对业务无影响。 备注：自主测试200万级别的表加列和减列， tidb上耗时不到1s，mysql上要6-9s |

## 二、Tidb使用兼容性问题

在应用在TiDB进行兼容性测试过程中，暂时发现了如下几个问题，都已人工解决

| 问题描述                                        | 跟进情况                                                     |
| ----------------------------------------------- | ------------------------------------------------------------ |
| sql_mode中ONLY_FULL_GROUP_BY是开启的            | set global sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE, NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO, NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'; |
| 1067 - Invalid default value for 'LST_UPD_TIME' | timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' 设置报错， 需要修改为timestamp NOT NULL |
| gbk字符集不支持                                 | 需修改为utf8字符集                                           |
| Transaction is too large                        | 导入大批量数据，比如上百万行，默认不支持 （1）以编辑模式打开该集群的配置文件： tiup cluster edit-config tidb-test （2）添加下列配置： server_configs: tidb: performance.txn-total-size-limit: 1073741824 （3）滚动重启集群： tiup cluster reload tidb-test -R tidb |
| Unsupported multi schema change                 | 单条 ALTER TABLE 语句中无法完成多个操作。 例如：不能用一条语句来添加多个列或多个索引 |



## 三、Tidb参数调整实操

### 1、mem-quota-query

**单条 SQL 语句可以占用的最大内存阈值，单位为字节。**

官网文档：https://docs.pingcap.com/zh/tidb/stable/tidb-configuration-file#mem-quota-query

这个配置值默认为1GB，当一条查询语句超过这个值就会触发OOM，导致查询失败。我们在日常使用过程中可能不会遇到这个限制。但是当数据量达到亿级以上，sql语句中嵌套join等复杂情况时，就可能发生OOM。

与其对应的**系统变量是 tidb_mem_quota_query**

官网文档：https://docs.pingcap.com/zh/tidb/stable/system-variables#tidb_mem_quota_query

**这是一个 SESSION 级别的变量，只对当前会话有效**。对于因为默认 mem-quota-query 阈值太小而发生OOM的情况。可以先设置会话级别的变量 tidb_mem_quota_query

- **参数文件修改**

```
## 编辑配置文件
tiup cluster edit-config tidb-test

## 在tidb模块添加配置
server_configs:
   tidb:
      mem-quota-query: 10737418240
 
## 滚动重启tidb
tiup cluster reload tidb-test -R tidb

## 查看变量值
show session variables like 'tidb_mem_quota_query';

## 检查配置是否生效，连接tidb集群并执行命令检查确认是否生效：
show config where type= 'tidb' and name like '%mem-quota-query%';
```

### 2、txn-total-size-limit

TiDB 单个事务大小限制，默认大小 100M。

https://docs.pingcap.com/zh/tidb/stable/tidb-configuration-file#txn-total-size-limit

笔者在进行亿级大表更新时，发生了事务超出最大限制错误。原因是集群还部署了 binlog，当发生大表更新时，binlog 组件 pump 将抓取这个时间段的 binlog，并保证事务性。但是事务默认最大值是 100M，更新亿级大表的事务远大于 100M，遂发生报错。

可以根据实际业务情况，修改该配置值。但是最大不能超过10GB。

- **参数文件修改**

```
## 编辑配置文件
tiup cluster edit-config tidb-test

## 在tidb模块添加配置
server_configs:
   tidb:
      performance.txn-total-size-limit: 10737418240
 
## 滚动重启tidb
tiup cluster reload tidb-test -R tidb

## 检查配置是否生效，连接tidb集群并执行命令检查确认是否生效：
show config where type= 'tidb' and name = 'performance.txn-total-size-limit';
```

### 3、加快统计更新速度

统计更新用于更新 TiDB 在表和索引上留下的统计信息。执行大批量更新或导入记录后，或查询执行计划不是最佳时就需要执行统计更新操作。

默认的统计更新速度比较慢，可以通过调整参数的方式大大加快统计更新的速度。

- **tidb_build_stats_concurrency**
  - **作用域：SESSION | GLOBAL**
  - 是否持久化到集群：是
  - 默认值：**4**
  - 这个变量用来设置 ANALYZE 语句执行时并发度。
  - 当这个变量被设置得更大时，会对其它的查询语句执行性能产生一定影响
- **tidb_distsql_scan_concurrency**
  - **作用域：SESSION | GLOBAL**
  - 是否持久化到集群：是
  - 默认值：**15**
  - 范围：[1, 256]
  - 这个变量用来设置 scan 操作的并发度。
  - AP 类应用适合较大的值，TP 类应用适合较小的值。对于 AP 类应用，最大值建议不要超过所有 TiKV 节点的 CPU 核数。
  - 若表的分区较多可以适当调小该参数（取决于扫描数据量的大小以及扫描频率），避免 TiKV 内存溢出 (OOM)。
- **tidb_index_serial_scan_concurrency**
  - **作用域：SESSION | GLOBAL**
  - 是否持久化到集群：是
  - 默认值：**1**
  - 范围：[1, 256]
  - 这个变量用来设置顺序 scan 操作的并发度，AP 类应用适合较大的值，TP 类应用适合较小的值

```
set session tidb_build_stats_concurrency=30;
set session tidb_distsql_scan_concurrency=30;
set session tidb_index_serial_scan_concurrency=2;
```

### 4、加快建立索引速度

在 TiDB 数据迁移操作过程中经常会采取先迁移数据到目标库，然后在目标库上还原原本的索引。建立索引的速度可以通过调整两个参数来加快。

**通过 set global 的命令方式会持久化到集群，集群reload或者restart仍会有效。**

- **tidb_ddl_reorg_worker_cnt**
  - **作用域：GLOBAL**
  - 是否持久化到集群：是
  - **默认值：4**
  - 范围：[1, 256]
  - 这个变量用来设置 DDL 操作 re-organize 阶段的并发度
- **tidb_ddl_reorg_batch_size**
  - **作用域：GLOBAL**
  - 是否持久化到集群：是
  - **默认值：256**
  - 范围：[32, 10240]
  - 这个变量用来设置 DDL 操作 re-organize 阶段的 batch size。比如 ADD INDEX 操作，需要回填索引数据，通过并发 tidb_ddl_reorg_worker_cnt 个 worker 一起回填数据，每个 worker 以 batch 为单位进行回填。
    - 如果 ADD INDEX 操作时有较多 UPDATE 操作或者 REPLACE 等更新操作，batch size 越大，事务冲突的概率也会越大，此时建议调小 batch size 的值，最小值是 32。
    - 在没有事务冲突的情况下，batch size 可设为较大值（需要参考 worker 数量，见线上负载与 ADD INDEX 相互影响测试），最大值是 10240，这样回填数据的速度更快，但是 TiKV 的写入压力也会变大。
- 为了减少对在线业务的影响，添加索引的默认速度会比较保守。当添加索引的目标列仅涉及查询负载，或者与线上负载不直接相关时，可以适当调大上述变量来加速添加索引：

```
SET @@global.tidb_ddl_reorg_worker_cnt = 16;
SET @@global.tidb_ddl_reorg_batch_size = 4096;
```

- 当添加索引操作的目标列被频繁更新（包含 UPDATE、INSERT 和 DELETE）时，调大上述配置会造成较为频繁的写冲突，使得在线负载较大；同时添加索引操作也可能由于不断地重试，需要很长的时间才能完成。此时建议调小上述配置来避免和在线业务的写冲突：

```
SET @@global.tidb_ddl_reorg_worker_cnt = 4;
SET @@global.tidb_ddl_reorg_batch_size = 128;
```

建立索引将占用大量的系统 I/O 资源，需要按经验适当调整参数来加快但不至于影响系统正常运行。