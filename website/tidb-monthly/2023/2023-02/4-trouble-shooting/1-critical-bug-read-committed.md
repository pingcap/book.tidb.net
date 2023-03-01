---
title: 如果使用了 read committed 隔离，则可能无法读取最新数据 - TiDB 社区技术月刊
sidebar_label:  如果使用了 read committed 隔离，则可能无法读取最新数据
hide_title: true
description: 如果使用了 read committed 隔离，则可能无法读取最新数据本文将分享如何解决该问题。
keywords: [TiDB, read committed, 无法读取数据, Critical bug]
---

# 如果使用了 read committed 隔离，则可能无法读取最新数据

> 作者：Rui Xu

## 问题

<https://github.com/pingcap/tidb/issues/41581>

## 根本原因
TiDB使用RC隔离时,point get executor读取的时间戳没有按预期刷新,取不到最新的值。使用RC隔离级别时,执行者不会获取不存在的key的悲观锁,更新可能不会对新插入的行生效。

## 诊断步骤

如果更新结果出乎意料,例如不会更新最新值。尝试确认:

- TiDB版本为v6.0、v6.1.1、v6.1.4
- 使用RC隔离级别
- 使用并发的 insert 和 update 事务，update/delete 事务期望看到最新的 insert 结果 using to read 'pointGetExecutor'

## 解决

- 避免使用版本
  - v6.0
  - v6.1.1 -v6.1.4
- v6.1.x 版本,升级到 v6.1. 5版本

## 解决方法

- 在 update/delete 语句之前使用 select for update 锁定 row key
- 禁用 RC 隔离级别，改用默认的 RR
