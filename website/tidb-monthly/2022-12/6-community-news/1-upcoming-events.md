---
title: 社区活动预告 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 社区活动预告
description: 1月超多活动进行中，一起来玩呀
keywords: [TiDB, 社区活动, 源码解读, TiCDC]
---

# 社区活动预告

## TiCDC 源码解读系列

TiCDC 是什么？
TiCDC（TiDB Change Data Capture）是用来捕捉和输出 TiDB/TiKV 集群上数据变更的一个工具。它既可以作为 TiDB 增量数据同步工具，将 TiDB 集群的增量数据同步至下游数据库，也提供开放数据协议，支持把数据发布到第三方系统。

**TiCDC 源码解读系列#4 ｜TiCDC DDL 事件处理逻辑 与 Filter 实现介绍**

本期将介绍 TiCDC 对 DDL 事件的处理细节和 filter 功能，主要会回答以下几个问题：

- 为什么 TiCDC 选择只用 owner 节点来同步 DDL？
- DDL 事件会对同步任务的进度有什么影响？
- TiCDC 是怎么在内部维护同步表的 schem 信息的？
- TiCDC 的 filter 功能是怎么实现的？

你将获益：

- 了解 TiCDC 的 DDL 同步机制
- 了解 TiCDC 对 DDL 和 DML 事件的过滤功能的实现机制

**时间**：2023 年 1 月 12 日（周四）20:00-21:00

扫码即可预约直播啦：

![TiCDC-第五期.jpeg](https://img2.pingcap.com/forms/5/6/56404a69178ecdd97afac2f5ca05f35f742e6eb9.jpeg)

