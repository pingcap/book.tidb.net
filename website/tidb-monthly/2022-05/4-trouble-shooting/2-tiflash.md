---
title: TiFlash 批量删除场景可能出现数据不一致
hide_title: true
---

# TiFlash 批量删除场景可能出现数据不一致

> 作者：[Wan Wei](https://github.com/flowbehappy)，更新于 2022.05.25

## Issue

- 从 TiFlash 的查询结果数据量多于 TiKV 的结果
- 如果有多份 TiFlash 副本，从 TiFlash 查询结果不稳定

Triggering condition:

- 顺序写入的表，然后**批量删除大量数据**的场景有较大概率出现。这样的表需要是没有设置 auto random，且没有设置 SHARD_ROW_ID_BITS ，且无主键的表。
- 随机写入的表，极小概率触发这个问题

影响版本：

- v6.0.0
- [v5.4.0 ~ v5.4.1]
- [v5.3.0 ~ v5.3.1]
- [v5.2.0 ~ v5.2.4]
- [v5.1.0 ~ v5.1.4]
- [v5.0.0 ~ v5.0.6]
- [v4.0.0 ~ v4.0.16]

修复版本：

- v6.1.0
- v5.4.2
- v5.3.2
- v5.2.5
- v5.1.5
- v5.0.7
- v4.0.17

﻿

## Root Cause

TiFlash 存储引擎内部在做 Segment 的 Split、Merge 的过程中，没有落盘的 Delta 数据只有在查询过程中才会被 range 所限制，在数据整理阶段不会被 Segment 的 range 限制。在一个 Segment Split 完之后，中间没有 Flush 操作，然后 Merge，会导致 Merge 操作无法过滤掉一些已经删除的数据，从而出现多余数据。 

## Diagnostic Steps

对于一张表，对比 TiKV 和 TiFlash 副本的总行数。如果 TiFlash 总行数大于 TiKV，则可能是触发了这个问题。注意 TiFlash 需要查 2 次。

```markdown
begin;

set tidb_isolation_read_engines = 'tikv';
select count(*) from T;

set tidb_isolation_read_engines = 'tiflash';
# Run twice queries on TiFlash replicas
select count(*) from T;
select count(*) from T;

commit;
```

﻿

## Resolution

升级到对应的修复版本，然后重新同步出现问题的表的 TiFlash 副本。

## Workaround

- 如果数据删除业务是整个表删除，可以考虑用 drop table 或者 truncate table 代替 delete SQL；否则没有其他措施。
- 通过重新同步 TiFlash 副本可以暂时解决这个问题 即删除 TiFlash replica，等待 TiFlash 真正删除副本数据，然后再加回 TiFlash replica