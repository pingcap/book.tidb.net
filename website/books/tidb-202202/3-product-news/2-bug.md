---
title: 严重 Bug 及兼容性问题
hide_title: true
---

# 严重 Bug 及兼容性问题

## **副本读无法保证事务一致性**

**问题描述**

使用了 async commit 或 1PC，且开启了 follower read 特性或是启用了 TiFlash 的情况下，读取可能无法保证事务一致性。

可能出现：

1. 已提交的事务写入无法被立刻读取到。
2. 事务内读取不满足可重复读。

**问题原因**

进行副本读时，需要将读取范围和时间戳携带在 read index 请求中发送给 leader，以使其与 async commit 和 1PC 兼容。

如果原 leader 在收到检查请求时已变成 follower，它会将 read index 转发给新 leader，但其中缺少了读取范围和时间戳，导致相关检查没有能够生效，使副本读有可能读到稍旧的数据。

**诊断步骤**

1. 业务上可能发现事务一致性问题。
2. 索引读或 admin check table 可能出现临时性的报错。

**相关 issue**

https://github.com/pingcap/tidb/issues/32800

Bug fix PR: https://github.com/tikv/tikv/pull/12115

**修复版本**

v5.0.7, v5.1.5, v5.2.4, v5.3.2, v5.4.1, v6.0.0

**规避方法**

以下两者均可：

1. 不使用 follower read 和 TiFlash.
2. 不使用 async commit 和 1PC.

## **GC worker 误报 busy 导致 drop/truncate table 空间不回收**

**问题描述：**

在 TiKV GC worker CPU 使用率 100% 期间内，执行 drop table 或 truncate table 命令，可能遇到删除表后 TiKV 空间不回收的问题。且 GC worker CPU 下降后，后续执行 drop table 或 truncate table 依然不会回收空间。

GitHub issue: https://github.com/tikv/tikv/issues/11903

**影响版本：**

v5.0.6，v5.1.3，v5.2.3，v5.3.0,

**排查步骤：**

1. TiDB 监控的 GC - Delete Range Failure OPM 中有持续的 send 失败，如图：

![img](https://asktug.com/uploads/default/original/4X/d/d/2/dd242365e269f79e83a5abfc166e1aa24d710183.png)

1. TiDB 日志中确认 Delete Range 错误原因是 "gc worker is too busy"
2. 从原理上再次确认，检查 TiKV 曾经出现过 GC worker 持续 CPU 100% 的状况。

**问题原因：**

TiDB 的 drop table 和 truncate table 命令会发送 unsafe destroy range 请求给 TiKV 删除一个范围的数据。

在 TiKV GC worker 繁忙时，GC worker 的 pending task 数量可能达到上限。此时如果继续向其中添加 unsafe destroy range 任务时，会错误地增加任务数量的计数器但最终没有减小。

多次这样的操作后，该计数器的值会永久性地高于 GC worker 繁忙的阈值。之后所有的 unsafe destroy range 请求都会被 TiKV 拒绝，造成 drop/truncate table 后删除数据不成功。

**规避手段：**

1. 如果当前 TiKV GC worker CPU 使用率不高，可以重启 TiKV 实例重置错误的计数器，暂时规避问题。
2. 避免在 TiKV GC worker CPU 使用率高的时候执行 drop table/truncate table 操作。

**修复版本：**

v5.0.7, v5.1.4, v5.3.1, v5.4.0

Bugfix PR: https://github.com/tikv/tikv/pull/11904

## **对同一个列进行并发列类型更改导致表结构和数据不一致**

**问题描述**

对于列类型变更，如果是有损变更，会改掉 column ID。

如果有两个 session **同时**执行有损的列类型变更（例如：modify column col char -> int）：

1. connection1 执行 DDL1 , DDL1 认为自己是有损变更，更改 column ID（id:1->id:2）
2. connection2 执行 DDL2
   1. 当 DDL1 刚进 DDL job 队列且并未完成执行时，DDL2 进入 DDL job 队列
   2. 当 DDL1 执行成功后，执行 DDL job 队列中的 DDL2。此时的 DDL2 认为它不是有损变更（char -> char），所以用了老的（DDL1 执行成功前的）column ID，即此时 column ID 是 1。所以最后导致 id:1 覆盖 id:2

这样导致 DDL2 完成后，column ID 还是 DD1 执行前的 ID（id:1），而不是正确的 id:2。即导致列的 schema 信息与列数据不匹配，也可能导致数据索引不一致。

**注意**

其中 DDL1 和 DDL2 可能是不一样的语句，比如

- DDL1: alter table t modify column col int;
- DDL2: alter table t modify column col int comment "new xxx";

**问题现象**

- 触发该问题之后，由于 schema 信息与列数据不匹配，可能导致如下的现象，具体现象取决于列变更的类型以及后续的写入操作类型：
  - 对数据访问报 “insufficient bytes to decode” 错误。
  - 对数据更新报 “Out of range value for column” 错误。
  - 对数据访问不报错，但数据不正确，例如出现乱码字符或是非预期的数值。
  - `ADMIN CHECK TABLE` 校验数据/索引一致性报错。
  - TiFlash 挂掉且报错 “Storage engine DeltaMerge doesn't support lossy data type modification”

**触发条件**

- TiDB 版本为 v5.1.0 及以上版本（具体参考影响版本）

- 对一个表的同一列，同时执行类似 “alter table tblName modify/change colName...” 语句，且执行的都是有损变更（即需要 reorg data 的类型）

**相关 issue**

https://github.com/pingcap/tidb/issues/31048

修复 PR：[ddl: fix concurrent column type changes(with changing data) that cause schema and data inconsistenci](https://github.com/pingcap/tidb/pull/31051)

**影响版本**

- v5.1.0 - v5.1.4

- v5.2.0 - v5.2.3

- v5.3.0

**修复版本**

v5.1.5，v5.2.4，v5.3.1

**规避方法**

- 禁止对一个表的同一列并行执行 "alter table ... modify/change column" 语句
