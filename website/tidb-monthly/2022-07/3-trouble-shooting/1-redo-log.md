---
title: [Critical bug] Redo log 功能在某些场景下存在正确性问题 - TiDB 社区技术月刊
sidebar_label: [Critical bug] Redo log 功能在某些场景下存在正确性问题
hide_title: true
description: 本文介绍如何解决 Redo log 功能在某些场景下存在正确性问题。
keywords: TiDB, Redo log, meta, TiCDC
---

# [Critical bug] Redo log 功能在某些场景下存在正确性问题

> **作者**：宇博

## Issue

https://github.com/pingcap/tiflow/issues/6189

## Root Cause

Redo log 采用异步的方式保存数据和 meta，在某些场景下，meta 信息和 redo log 数据会不一致。在灾备场景下，利用 Redo log 进行恢复的时候，这种情况会导致恢复的集群数据处于不一致性状态。 

## Diagnostic Steps

1. 部署 TiDB(上游） + TiCDC + TiDB/mysql（下游）
2. 创建 Changefeed ，打开设置 Changefeed 配置

​        [consistent] 

​        level = "eventual"

1. 上游 TiDB 在有写负载的过程中，断开和 ticdc 的网络链接。
2. 用 cdc redo apply 命令对下游做灾备恢复。

（以上步骤可参见https://docs.pingcap.com/zh/tidb/v5.3/manage-ticdc#灾难场景的最终一致性复制）

5.业务判断。



## Resolution

TiCDC 升级到 6.1.1

## Workaround

在灾备场景下，如果对数据有一致性要求，建议不开启 redo log 。