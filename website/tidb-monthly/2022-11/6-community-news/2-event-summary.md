---
title: 10 月精彩活动回顾 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 10 月精彩活动回顾
description: 10 月精彩活动回顾
keywords: [TiDB, Infra Meetup, 10月, 源码解读]
---

# 10 月精彩活动回顾

## Infra Meetup No.154 TiDB DDL - 分布式数据库中的在线 schema 变更解析

在 154 期 Infra Meetup 直播间，我们邀请了 PingCAP 高级数据库工程师王聪老师，分享了 TiDB DDL 的执行，TiDB DDL 对 MySQL 的兼容性，简要介绍了 TiDB DDL 路线图。主要包括以下内容：

- TiDB DDL 的基本原理概述
- TiDB 中在线 schema 变更的基本原理
- TiDB DDL 实现的算法，包括分别在 MySQL 和 TiDB 中实现的算法
- 在与MySQL 兼容性方面，TiDB 支持哪些 DDL
- TiDB DDL 的路线图分享

点击可查看“[直播回顾](https://www.bilibili.com/video/BV1vR4y1o7mS)”

## TiCDC 源码解读首期 ｜TiCDC 整体架构概览

TiCDC（TiDB Change Data Capture）是用来捕捉和输出 TiDB/TiKV 集群上数据变更的一个工具。它既可以作为 TiDB 增量数据同步工具，将 TiDB 集群的增量数据同步至下游数据库，也提供开放数据协议，支持把数据发布到第三方系统。

TiCDC 源码阅读系列分享，将着重从源码层面介绍 TiCDC 的内部实现。本次分享作为该系列的第一场分析，从以下三个方面进行介绍：

- TiCDC 与 TiDB 的关系与主要的适用场景
- TiCDC 整体的工作机制
- TiCDC 重要构成组件

希望能够让大家对 TiCDC 有一个整体的认识，点击可查看“[直播回顾](https://asktug.com/t/topic/996614)”