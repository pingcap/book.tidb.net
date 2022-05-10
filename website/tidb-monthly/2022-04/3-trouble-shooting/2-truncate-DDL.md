---
title: 对一个分区同时 truncate 导致 DDL hang 住
hide_title: true
---

# 对一个分区同时 truncate 导致 DDL hang 住

**作者：Yilong Rong**



## Issue

在不同 TiDB 节点，同时执行 truncate 同一个 partition ddl 命令，导致 DDL  hang

```markdown
create table test.t (a int primary key) partition by range (a) (
  partition p0 values less than (10),
  partition p1 values less than (maxvalue)
);

在不同 tidb 节点同时执行 truncate 相同分区命令：
alter table test.t truncate partition p0;
```

多次 truncate 相同 partition 后，执行 admin show ddl 查看 DDL hang，并且有类似报错

Err:[table:1735]Unknown partition 'drop?' in table 't', ErrCount:175, SnapshotVersion:0

```markdown
MySQL [test]> admin show ddl;
+------------+--------------------------------------+-------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+--------------------------------------+------------------------------------------+
| SCHEMA_VER | OWNER_ID                             | OWNER_ADDRESS     | RUNNING_JOBS                                                                                                                                                                                                                                          | SELF_ID                              | QUERY                                    |
+------------+--------------------------------------+-------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+--------------------------------------+------------------------------------------+
|         32 | ae3bdde9-aa70-42f3-98b3-eccac8f43273 | 172.16.x.xxx:xxx | ID:63, Type:truncate partition, State:running, SchemaState:none, SchemaID:1, TableID:54, RowCount:0, ArgLen:0, start time: 2021-12-08 21:08:56.339 +0800 CST, Err:[table:1735]Unknown partition 'drop?' in table 't', ErrCount:175, SnapshotVersion:0 | 68fd549f-b384-424e-8cec-675f5e162155 | alter table test.t truncate partition p0 |
+------------+--------------------------------------+-------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+--------------------------------------+------------------------------------------+
1 row in set (0.00 sec)
```



## Root Cause

TiDB 目前处理 truncate partition 的过程大概如下：

1. 收到 truncate partition pname 的请求；
2. 根据 pname 从表的 schema 信息中找到对应的分区 ID，包裹成一个 DDL Job{TrunPart, PartID} 并放入 DDL 队列；
3. DDL Master 从队列中取出这个 Job，根据 PartID 删除这个分区，然后创建一个新的分区并生成新的分区 ID

上述过程中，第 1/2 步是在接受到请求的时候就处理，第 3 步是 DDL Master 串行执行的； 所以有可能同时接收到两个 truncate partition pname 的请求，之后根据 pname 找到对应的 PartID 并包装成 Job 放入队列； 此时就有两个相同 PartID 的 DDL truncate job 需要执行； 当 DDL Master 执行完第一个后，分区的名字虽然没变，但是其 PartID 已经变化，所以在执行第二个时会出现找不到分区的情况；

Github Issue：https://github.com/pingcap/tidb/issues/26229

**注意**：最终结果是这个 job 会重复多次后，自动退出，对结果正确性不会有影响；



## Diagnostic Steps

1. 查看 admin show ddl 存在信息  Err:[table:1735]Unknown partition 'drop?' in table
2. 查看 tidb.log 日志存在同样报错

```
[ERROR] [ddl_worker.go:670] ["[ddl] run DDL job error"] [worker="worker 1, tp general"] [error="[table:1735]Unknown partition 'drop?' in table 
```



## Resolution

预计升级到 v4.0.16，v5.0.4，v5.1.1 及以上版本修复

修复 PR  https://github.com/pingcap/tidb/pull/26232



## Workaround

- 执行 [admin cancel  ddl ](https://docs.pingcap.com/zh/tidb/stable/sql-statement-admin-cancel-ddl#admin-cancel-ddl)命令，取消队列中 truncate 同一个分区的 DDL job

```markdown
admin cancel ddl jobs <job_id>
```

- 等待 truncate DDL Job 重试超出 512 次自动退出