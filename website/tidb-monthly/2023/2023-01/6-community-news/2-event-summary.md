---
title: 1 月精彩活动回顾 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 1 月精彩活动回顾
description: 1 月精彩活动回顾
keywords: [TiDB, 活动回顾, 1月, 源码解读]
---

# 12 月精彩活动回顾

## TiCDC 源码解读系列

![源码解读.png](https://img2.pingcap.com/forms/8/3/83f809a54cdcfb74e24a51770da357c930658f72.png)

TiCDC（TiDB Change Data Capture）是用来捕捉和输出 TiDB/TiKV 集群上数据变更的一个工具。它既可以作为 TiDB 增量数据同步工具，将 TiDB 集群的增量数据同步至下游数据库，也提供开放数据协议，支持把数据发布到第三方系统。TiCDC 源码阅读系列分享，将着重从源码层面介绍 TiCDC 的内部实现。

**#5 TiCDC DDL 事件处理逻辑 与 Filter 实现介绍**

本期将介绍 TiCDC 对 DDL 事件的处理细节和 filter 功能，主要会回答以下几个问题：

1. 为什么 TiCDC 选择只用 owner 节点来同步 DDL？
2. DDL 事件会对同步任务的进度有什么影响？
3. TiCDC 是怎么在内部维护同步表的 schem 信息的？
4. TiCDC 的 filter 功能是怎么实现的？

你将获益：了解 TiCDC 的 DDL 同步机制；了解 TiCDC 对 DDL 和 DML 事件的过滤功能的实现机制。

点击可查看本期“[直播回顾](https://www.bilibili.com/video/BV15K411C7r3/)”，更多**[往期回顾](https://asktug.com/t/topic/995759)**可点击查看

