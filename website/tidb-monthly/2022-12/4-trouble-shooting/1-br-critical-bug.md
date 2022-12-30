---
title:  BR 恢复分区表可能导致数据污染 - TiDB 社区技术月刊
sidebar_label:  BR 恢复分区表可能导致数据污染
hide_title: true
description: BR v6.4.0 的一个优化意外地引入了一个 BUG，这个 BUG 可能导致某些分区表在恢复之后使用有问题的 Partition ID。本文将分享如何避免这个情况的发生。
keywords: [TiDB, BR, 恢复分区表, 数据污染, Critical bug]
---

#  BR 恢复分区表可能导致数据污染

> 作者：Yu Juncen

## Issue

BR `v6.4.0` 的一个优化意外地引入了一个 BUG，这个 BUG 可能导致某些分区表在恢复之后使用有问题的 Partition ID。

“有问题”体现在：那些 Partition ID 在日后还可能会被其他 Table 用作 Table ID。

## Root Cause

BR `v6.4.0` 引入了在恢复的时候尝试保持旧集群的 Table ID 不变的优化，这个优化的基本流程如下：

1. 在备份档案使用的所有 Table ID 中找到最大的 ID。

2. 将 TiDB 的 Global ID（可以理解成 Table ID 所使用的的自增 ID）给 rebase 到这个最大的 ID。

在执行了 (2) 之后，理论上我们就可以安全地使用旧集群的 Table ID 了（因为这些 ID 并不会被再度使用）。

但是现有的实现在步骤 (1) 中，意外地忽略了分区表中的 Partition：Partition ID 也来自 Global ID，并且可能大于 Table ID。我们只把 Global ID rebase 到了 `Max(TableID)` 的话，无法保障这些 Partition ID 也能被安全地使用。

当任意一个 Partition ID 大于最大的 Table ID 的时候，问题就会出现了。

## Diagnostic Steps

取决于这些“有问题”的 Partition 日后被如何使用，这个 bug 具体的的表现形式非常多，绝大多数表现形式都是毁灭性的，例如：

- 分区表的数据被意外 GC。

- 分区表的数据被意外覆盖。

- 某些新表出现不该存在的记录。

另一种方法能更精确地判断这个 bug 有没有触发：

首先，在 BR 日志中查询 "`registering the table IDs`"，你会得到这样的日志：

```markdown
[INFO] [client.go:244] ["registering the table IDs"] [ids="ID:[79,153)"]
```

这里，\`ids\` 表示了 BR 已经认为可以“安全使用”的 Global ID 区间，接下来，使用这个 SQL 查询。

```sql
SELECT T.`TIDB_TABLE_ID`, P.`TIDB_PARTITION_ID`, T.table_schema, T.`table_name`, partition_name FROM 
  INFORMATION_SCHEMA.`PARTITIONS` P INNER JOIN 
    INFORMATION_SCHEMA.`TABLES` T 
      ON (T.TABLE_NAME = P.TABLE_NAME and T.`TABLE_SCHEMA` = P.TABLE_SCHEMA) 
  WHERE T.`TIDB_TABLE_ID` BETWEEN @lower AND @higher;
```

将上面的 `@lower` 和 `@higher` 替换成上面日志中 `ids` 表示的区间即可。

如果出现了某个 `TIDB_PARTITION_ID` 不在 `ids` 的区间内，那么这个 bug 大概率已经被触发，请参考下文 “Workaround”。&#x20;

## Resolution

我们在 `v6.5.0 LTS` 中发现并修复了这个问题。现在 BR 会将 Global ID 给 rebase 到 `Max(TableID ∪ PartitionID)`以避免该问题的发生。

## Workaround

建议不要使用 `v6.4.0` 的 BR 进行分区表的恢复，可以使用 `v6.5.0 LTS` 。

如果一定要使用 `v6.4.0` 进行恢复，那么在该 bug 触发之后，可以通过 `DROP` 掉所有已经恢复的库表，并重新执行恢复来 workaround。

