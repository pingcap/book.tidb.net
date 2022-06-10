---
title: TiCDC 遇到上游事务冲突，可能会导致数据丢失
hide_title: true
---

# TiCDC 遇到上游事务冲突，可能会导致数据丢失

> 作者：[Taining Shen](https://github.com/overvenus)，更新于 2022.05.25

## Issue

在上游遇到事务冲突时，TiCDC 可能（极小概率）误将`UPDATE` SQL 语句识别为`DELETE` SQL 语句写入到下游，导致下游数据丢失。

## Root Cause

要触发该错误，必须同时满足三个条件。

1. 一个事务包含`UPDATE` ，且与其他事务冲突。
2. 更新的行大于 255 字节。
3. 包含该 `UPDATE` 行的 Region 正好处于增量扫阶段，这是通常是由 Region Leader 转移或 Region Split / Merge 引起的。

包含 UPDATE 的事务被冲突时，TiDB 可能会重复写入 Prewrite。导致 TiKV 可能以下图的顺序输出 UPDATE  事件：

```markdown
 TiDB: [Prwrite1]    [Prewrite2]      [Commit]
       v             v                v                                   Time
 ---------------------------------------------------------------------------->
         ^            ^    ^           ^     ^       ^     ^          ^     ^
 TiKV:   [Scan Start] [Send Prewrite2] [Send Commit] [Send Prewrite1] [Send Init]
 TiCDC:                    [Recv Prewrite2]  [Recv Commit] [Recv Prewrite1] [Recv Init]
```

TiCDC 错误地输出仅包含**部分的**内容的 *Prewrite2* 。对于此类事件，TiCDC 将它们翻译成`DELETE` SQL 语句。

## Diagnostic Steps

1. 下游缺少一行。
2. tikv 日志中出现 `trying to commit with smaller commit_ts than min_commit_ts` 。

﻿

## Resolution

### 解决版本

| release  | release-4.0 | release-5.0 | release-5.1 | release-5.2 | release-5.3 | release-5.4 | release-6.0 | release-6.1 |
| -------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| 固定版本 | >=v4.0.17   | >=v5.0.7    | >=v5.1.5    | >=v5.2.5    | >=v5.3.2    | >=v5.4.2    | N/A         | >= v6.1.0   |

﻿

## Workaround