---
title: Critical bug - 切换 PD Leader 或重启 PD 可能导致 SQL 执行持续报错 - TiDB 社区技术月刊
sidebar_label: Critical bug - 切换 PD Leader 或重启 PD 可能导致 SQL 执行持续报错
hide_title: true
description: 本文介绍如何解决切换 PD Leader 或重启 PD 可能导致 SQL 执行持续报错。
keywords: [TiDB, PD Leader, 持续报错]
---

# [Critical bug] 切换 PD Leader 或重启 PD 可能导致 SQL 执行持续报错

> 作者：[Xiangsheng Zheng](https://github.com/HunDunDM)

## Issue

在对 PD 进行 Transfer Leader 或重启操作后，集群出现 SQL 执行持续报错的现象。

6.2.0 测试中发现了该问题：https://github.com/tikv/tikv/issues/12934

受到该 bug 影响的版本：v5.3.2, v5.4.2

## Root Cause

TiKV 中的问题代码导致在发送 Region Heartbeat 时，如果碰到 Error（如 not leader）就会直接退出，不重新建立 Heartbeat Stream。导致 TiKV 无法向 PD 继续发送 Region Heartbeat，PD 亦无法向 TiKV 发送调度。PD 中相关 Region 的信息会逐步过旧，TiDB 无法获取最新的 Region 信息导致 SQL 执行出错。

## Diagnostic Steps

1. TiDB 监控观察到 SQL 执行持续报错，报错为 Region Unavailable / Region Epoch not match 等

2. TiKV 监控中 **TiKV Details - PD - PD heartbeats** 中观察到持续快速上涨的 pending

![1280X1280.PNG](https://pingcap-knowledge-base.oss-cn-beijing.aliyuncs.com/u/391/f/1280X12801661790521095.PNG)

## Resolution

升级 TiKV 至修复了该 Bug 的版本。

Bug Fix PR: https://github.com/tikv/tikv/pull/13094

预期修复版本：v5.3.3, v5.4.3

针对 v5.4.2 已有 Hotfix，可直接使用。v5.3 则会尽快发布 v5.3.3 修复此问题。

## Workaround

重启出现 Region Heartbeat Pending 的 TiKV 直至不再有 Pending 的 Region Heartbeat 为止。