---
title: 记一次TiDB数据库报错的处理过程 - TiDB 社区技术月刊
sidebar_label: 记一次TiDB数据库报错的处理过程
hide_title: true
description: 本文记录了一次TiDB数据库报错的处理过程。其中也列举了查看TiDB数据库慢SQL,创建索引以及查看SQL执行计划等操作的具体步骤。
keywords: [TiDB, 数据库, 报错, SQL]
---

# 记一次TiDB数据库报错的处理过程

> 作者：[tracy0984](https://tidb.net/u/tracy0984/answer)

## 概述

本文记录了一次TiDB数据库报错的处理过程。其中也列举了查看TiDB数据库慢SQL,创建索引以及查看SQL执行计划等操作的具体步骤。

## 问题描述

TiDB版本：v5.3.0

测试使用kettle脚本向TiDB数据库更新/插入数据时,数据库返回错误信息,事务回滚。

### 报错信息

```
-- kettle日志中找到如下报错信息
Caused by: java.sql.SQLException: TTL manager has timed out, pessimistic locks may expire, please commit or rollback this transaction
```

## 问题分析

### TiDB官方文档找到报错原因:

[TiDB 锁冲突问题处理 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/troubleshoot-lock-conflicts#ttl-manager-has-timed-out)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667288584990.png)

### 查看TiDB数据库中事务相关参数的设置

```
show config where name = 'performance.max-txn-ttl';
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667291181740.png)

```
show variables like 'tidb_txn_mode';
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667288613990.png)

tidb\_txn\_mode = pessimistic ，表示数据库中的事务默认使用悲观锁。

performance.max-txn-ttl=3600000 ，表示悲观锁的TTL上限时间为1小时。

**也就是说，当前数据库中的事务执行时间超过1小时，可能就会报错：TTL manager has timed out, pessimistic locks may expire, please commit or rollback this transaction。**

### 查找慢SQL

尝试重新运行kettle脚本。程序运行过程中,通过TiDB Dashboard监控工具，查看到一条等值查询的SQL,每次查询耗时1.4s左右，并且这条SQL语句在近50分钟内已经被执行了2300多次。

TiDB Dashboard ->SQL Statements

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667288631996.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667291235517.png)

这条SQL执行慢的原因为:表的数据量较大并且查询条件列缺少索引,执行计划走了全表扫描.

**经分析,kettle脚本执行过程报错原因就是由于这条需要反复执行的SQL语句执行时间比较长，导致一小时内事务没有执行完成。**

## 解决方法

**对执行较慢的查询语句进行了优化,优化后,报错不再出现,问题顺利解决.**

查询条件列的选择性:

select count（\*), count(distinct(col1)) from database.table\_name;

从查询结果看，查询条件列的选择性很好,无重复值。

这样，可在查询的条件列上添加了唯一索引来提高查询效率。

### 创建索引

查看创建索引过程相关参数设置：

```
show variables like 'tidb_ddl_reorg%';
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667288763989.png)

tidb\_ddl\_reorg\_batch\_size：设置创建索引过程中的数据回填阶段的batch size大小.batch size 越大，回填数据的速度越快，但是 TiKV 的写入压力会变大，事务冲突的概率也会越大。

tidb\_ddl\_reorg\_priority：设置创建索引过程中的数据回填阶段的执行优先级。设置为PRIORITY\_LOW，表示DDL操作优先级低于DML。

tidb\_ddl\_reorg\_worker\_cnt：设置 创建索引过程中的数据回填阶段的并发度。

创建唯一索引命令:

```
CREATE UNIQUE INDEX idx_uniq_XXX ON database.table_name(col1);
```

查看索引创建任务执行情况:

```
admin show ddl jobs;
```

查看索引完成情况:

```
SELECT D.JOB_ID,D.ROW_COUNT,TIMESTAMPDIFF(MINUTE,D.START_TIME,D.END_TIME) EXCUTE_MINUTES FROM INFORMATION_SCHEMA.DDL_JOBS D WHERE D.JOB_ID=14094;
```



索引创建完成后，再次执行Kettle脚本，并且通过TiDB Dashboard ->SQL Statements界面，确认SQL语句执行情况,之前的查询语句执行计划走唯一索引后,执行时间大幅缩短,由1.4s变为767us.

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667288799726.png)

### 查看SQL执行计划

查看SQL语句的执行计划有下面两种方法：

方法一：EXPLAIN SQL语句；

方法二：EXPLAIN ANALYZE SQL语句；

EXPLAIN 语句仅用于显示查询的执行计划，而不执行查询。EXPLAIN ANALYZE 可执行查询，补充 EXPLAIN 语句。

创建索引后，查看待优化的SQL语句的执行计划改全表扫为点查：

EXPLAIN SELECT XX, col1, XX,XX, XX,XX,... FROM database.table\_name WHERE ((col = XXXXX));

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1667288825913.png)

## 总结

在数据库运维过程中，当我们遇到未处理过的数据库问题时，可以考虑先到TiDB官方文档中搜索一下问题，官方文档中可能已经记录了解决问题的思路或方法。[TiDB 产品文档 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable)

