---
title: 2 月精彩活动回顾 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 2 月精彩活动回顾
description: 2 月精彩活动回顾
keywords: [TiDB, 活动回顾, 2月, 源码解读]
---

# 2 月精彩活动回顾

## TiDB Meetup@上海

![image.png](https://img2.pingcap.com/forms/f/f/ff18da2b1ff936c95b8de73c4c9dea1959d27272.png)

2月25日，TiDB 上海地区交流会在 PingCAP 上海 office 拉开帷幕，这也是上海社友们的第一次自组织交流会，由上海地区组织者 薛晓刚老师 [@xuexiaogang](https://asktug.com/u/xuexiaogang) 、中欧财富 DBA 张政俊老师 [@HHHHHHULK](https://asktug.com/u/hhhhhhulk) 、以及社区的老朋友，来自 SelectDB 的解决方案架构师 王天宜老师 [@懂的都懂](https://asktug.com/u/懂的都懂) 还有 PingCAP Outbound PM 张粲宇 [@Yves](https://asktug.com/u/yves) 一起带来了有关数据库发展进程中的一些经验和建议给大家，内容涵盖数据库方案选型，行业场景介绍，运维实操，还有对 DBA 们职业发展的思考。

资料下载请点击：https://asktug.com/t/topic/1002346

## TiCDC 源码解读系列

![源码解读.png](https://img2.pingcap.com/forms/8/3/83f809a54cdcfb74e24a51770da357c930658f72.png)

TiCDC（TiDB Change Data Capture）是用来捕捉和输出 TiDB/TiKV 集群上数据变更的一个工具。它既可以作为 TiDB 增量数据同步工具，将 TiDB 集群的增量数据同步至下游数据库，也提供开放数据协议，支持把数据发布到第三方系统。TiCDC 源码阅读系列分享，将着重从源码层面介绍 TiCDC 的内部实现。

### #5 TiCDC DDL 事件处理逻辑 与 Filter 实现介绍

本期将介绍 TiCDC 对 DDL 事件的处理细节和 filter 功能，主要会回答以下几个问题：

1. 为什么 TiCDC 选择只用 owner 节点来同步 DDL？
2. DDL 事件会对同步任务的进度有什么影响？
3. TiCDC 是怎么在内部维护同步表的 schem 信息的？
4. TiCDC 的 filter 功能是怎么实现的？

获益：

- 了解 TiCDC 的 DDL 同步机制
- 了解 TiCDC 对 DDL 和 DML 事件的过滤功能的实现机制

点击可查看“[直播回顾](https://asktug.com/t/topic/1000509)”

### #6 TiCDC Puller 模块介绍

TiCDC 中的 Puller 通过创建 KV-Client 向 TiKV 发送 ChangeDataRequest 请求， 在 TiCDC 中实现从TiKV 接收变更数据功能。本期将详细分享 Puller 模块的功能实现原理：

1. Puller 初始化过程
2. Puller 如何处理 KV 事件
3. Puller 如何推进 ResolvedTs
4. Puller 如何做错误处理

点击可查看“[直播回顾](https://asktug.com/t/topic/1001777)”

### #7 TiCDC Sorter 模块揭秘

TiCDC 中的 Sorter 组件用来接收各个 TiKV 实例推送过来的变更流，并将其排序以便下游组件消费。本期分享会深入 Sorter 组件内部，解答一下几个问题：

1. Sorter 模块作为其上下游的链接的主要价值
2. 为什么选择 pebble 作为默认的排序引擎？
3. 针对读、写放大的现象，有哪些优化手段？
4. 大家可以如何参与 Sorter 的优化与演进？

点击可查看“[直播回顾](https://asktug.com/t/topic/1002349)”