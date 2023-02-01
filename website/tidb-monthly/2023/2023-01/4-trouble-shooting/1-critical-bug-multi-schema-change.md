---
title:  v6.3.0-v6.5.0 使用 Multi-schema change 添加唯一索引导致数据索引不一致 - TiDB 社区技术月刊
sidebar_label:  v6.3.0-v6.5.0 使用 Multi-schema change 添加唯一索引导致数据索引不一致
hide_title: true
description: 使用 multi-schema change 添加唯一索引后，唯一索引的状态未能正确设置，导致后续执行 INSERT IGNORE 语句时会不正确地插入了重复的行，破坏了索引的唯一性约束。本文将分享如何解决该问题。
keywords: [TiDB, BR, 恢复分区表, 数据污染, Critical bug]
---

# v6.3.0-v6.5.0 使用 Multi-schema change 添加唯一索引导致数据索引不一致

> 作者：Tengjin Xie

## Issue

使用 multi-schema change 添加唯一索引后，唯一索引的状态未能正确设置，导致后续执行 INSERT IGNORE 语句时会不正确地插入了重复的行，破坏了索引的唯一性约束。例如：

```sql
create table t (a int, b int);
insert into t values (1, 1);
insert into t values (2, 2);
alter table t add unique index idx(b), ...[any other schema changes];
insert ignore into t values (2, 2);
admin check table t;

ERROR 8223 (HY000): data inconsistency in table: t, index: idx, handle: 2, index-values:"handle: 3, values: [KindInt64 2]" != record-values:"handle: 2, values: [KindInt64 2]"
```

目前仅在 INSERT IGNORE 语句上发现此类违反唯一性约束的 bug。使用 INSERT、UPDATE 和 REPLACE 语句来插入唯一索引重复值，都会按照预期报 "duplicate entry" 的错误。

GitHub issue: https://github.com/pingcap/tidb/issues/40217

## Root Cause

TiDB 从 6.3.0 起，支持使用 ingest 模式 (`@@tidb_ddl_enable_fast_reorg`) 添加索引。在增量数据合并回原索引的步骤完成后，multi-schema change 对目标索引的状态的更改未持久化到 TiKV，而执行下一个 schema 变更时丢弃了这个更改。在整个 multi-schema change 的 DDL 完成后，目标索引始终处于不正确的状态。

假如应用后续执行 INSERT IGNORE 语句，TiDB 在判断索引值是否重复时，该索引的状态影响了判断逻辑，导致检查被忽略，插入了重复的值（正常情况是不插入重复值并报 warning）。

## Diagnostic Steps

出现数据索引不一致后，如果同时符合以下几种条件就可以确认是同一问题：

- TiDB 版本为 6.3.0、6.4.0 或 6.5.0。
- 检查该表的 DDL 历史记录，使用过 multi-schema change 添加唯一索引。
- 数据索引不一致涉及到的索引和 multi-schema change 添加的索引是同一个索引。
- 搜索 TiDB 添加唯一索引时间段的日志，包含 "[ddl-ingest]" 关键字。



## Resolution

我们将在 `v6.5.1 LTS` 中修复这个问题。

## Workaround

- 避免使用 multi-schema change 添加唯一索引。
- 将 `@@tidb_ddl_enable_fast_reorg`设置为 false 后再使用 multi-schema change 添加唯一索引。
