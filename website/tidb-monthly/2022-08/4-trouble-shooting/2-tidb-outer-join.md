---
title:  Critical bug - Outer join 的结果可能执行不正确 - TiDB 社区技术月刊
sidebar_label: Critical bug - Outer join 的结果可能执行不正确
hide_title: true
description: 本文介绍如何解决 Outer join 的结果可能执行不正确的问题。
keywords: [TiDB, Outer join]
---

# [Critical bug] Outer join 的结果可能执行不正确

> 作者：Yiding Cui 

## Issue

https://github.com/pingcap/tidb/issues/37238

## Root Cause

当 tidb_enable_outer_join_reorder 设置为 true 时，

join reorder 处理过程中对 join 的 ON condition 处理有误

## Diagnostic Steps

当存在多个 outer join，各自的 ON condition 中的条件比较简单，只涉及不多于两个表，而且涉及了多个 outer join 的公共外表时，其结果有可能出错。

- A left join B_1 on F_1 left join B_2 on F_2 left join B_3 on F_3 left join B_i on F_i
- 所有的连接条件 F_i 都各自只涉及两个表。其中有两个 join 的连接条件 F_i, F_j，F_i 涉及的表是 A 和 B_i，F_j 涉及的表示 A 和 B_j。而且此时有在 F_i 和 F_j 中有一个连接条件只涉及表 A。
- 这时可能因为 join reorder 的一些处理不当导致结果可能出错


## Resolution

修复 pr https://github.com/pingcap/tidb/pull/37245 

在 6.1.1 中修复了该问题

在 6.1.1 和 6.2 中默认关闭了开关

## Workaround

可以将 @@tidb_enable_outer_join_reorder 设置为 false。