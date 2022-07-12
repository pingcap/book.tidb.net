---
title: clustered_index 的表，删除列之后 TiFlash Crash 问题
hide_title: true
---

# clustered_index 的表，删除列之后 TiFlash Crash 问题

> Junshen Huang

## Issue

若 clustered index 的表中，组成 clustered index 的列由于其他列的 `DROP COLUMN` 操作而发生位置变化，tiflash 会持续崩溃。

注意由 `ADD COLUMN` 操作而导致组成 clustered index 的列发生位置变化，不会引发该问题。

一个简化的例子如下：

```sql
mysql> create table test (A int, B varchar(20), C int, D int, PRIMARY KEY(A,C) CLUSTERED);
mysql> alter table test set tiflash replica 1;
-- drop column before the column composing clustered index
mysql> insert into test values (1,'1',1,1),(2,'2',2,2);
mysql> alter table test drop column B;
-- insert some rows
mysql> insert into test values (3,3,3),(4,4,4);
mysql> insert into test values (5,5,5),(6,6,6);
mysql> insert into test values (7,7,7),(8,8,8);
-- tiflash crashes
```



## Root Cause

在 TiDB 的 schema 信息中，`IndexInfo` 中存储索引列在所有列中的位置索引 (offset)。

TiFlash 会利用 primary key 的 `index_column.offset` 来定位列并在后续用于进行数据的行转列解码操作中。但是 TiFlash 在 DDL 过程中，不会去维护列在 schema 中的位置索引信息。因此发生了如上面步骤所述的 DDL 操作，导致组成 clustered_index 的列的 offset 发生改变。在后续 TiFlash 进行数据行转列解码结果中，数据块中组成 clustered_index 的部分列会无法正确解码出数据，并且导致写入过程中抛出异常。

GitHub issue: https://github.com/pingcap/tiflash/issues/5154

## Diagnostic Steps

1. TiFlash 进程持续 crash 并且 tiflash.log 日志中有类似如下的错误堆栈
2. 通过 TiDB 的 `admin show ddl jobs` 以及 `admin show ddl job queries <job-id>` 语句，确认执行 drop column 的表以及列

3. 通过 `show create table <table-name>` 语句，确认表使用了 clustered_index，并且被 drop 的 column 位置在组成 cluster_index 的列之前

```markdown
[2022/06/15 17:42:56.574 +08:00] [ERROR] [Exception.cpp:85] ["DB::EngineStoreApplyRes DB::HandleWriteRaftCmd(const DB::EngineStoreServerWrap *, DB::WriteCmdsView, DB::RaftCmdHeader):Code: 12, e.displayText() = DB::Exception: Parameters start = 0, length = 1 are out of bound in ColumnVector<T>::insertRangeFrom method (data.size() = 0)., e.what() = DB::Exception, Stack trace:
```



## Resolution

Bugfix PR: https://github.com/pingcap/tiflash/pull/5166

修复版本：5.4.2, 6.1.1

## Workaround

1. 将触发该问题的表 set tiflash replica 0，并且需要执行 truncate table 操作来清理 tiflash 中残留的错误 table schema 副本

2. 将反复 crash 的 tiflash 节点 scale-in