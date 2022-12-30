---
title: 12 月精彩活动回顾 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 12 月精彩活动回顾
description: 12 月精彩活动回顾
keywords: [TiDB, workshop, 12月, 源码解读]
---

# 12 月精彩活动回顾

## TiCDC 源码解读系列

![源码解读.png](https://img2.pingcap.com/forms/8/3/83f809a54cdcfb74e24a51770da357c930658f72.png)

TiCDC（TiDB Change Data Capture）是用来捕捉和输出 TiDB/TiKV 集群上数据变更的一个工具。它既可以作为 TiDB 增量数据同步工具，将 TiDB 集群的增量数据同步至下游数据库，也提供开放数据协议，支持把数据发布到第三方系统。TiCDC 源码阅读系列分享，将着重从源码层面介绍 TiCDC 的内部实现。

### #2 **TiKV CDC 模块介绍**

本期分享从以下四个方面展开：

- TiKV 中的 CDC 模块有什么作用？
- TiKV 如何输出的变更事件流？
- 数据变更事件有哪些？
- 如何确保完整地捕捉分布式事务的变更？

希望能够让大家对 TiKV 的 CDC 模块有所了解，点击可查看“[直播回顾](https://asktug.com/t/topic/997315)”

### #3 **TiCDC 集群工作过程解析** 本期分享将从以下三个方面展开：

- TiCDC 集群启动过程
- TiCDC Owner 选举过程
- Changefeed 生命周期

点击可查看“[直播回顾](https://asktug.com/t/topic/998683)”

### #4 **TiCDC Scheduler 工作原理解析**

本期分享将从以下三个方面展开：

- Changefeed 和 Processor 的关系
- Scheduler 模块的工作机制
- TiCDC 滚动升级

点击可查看“[直播回顾](https://www.bilibili.com/video/BV1hY411U7Z2/)”

## TiDBWorkshop Day@上海

![workshop.jpeg](https://img2.pingcap.com/forms/b/6/b6c9ea959af372f0e52fd21db36a8a637115b270.jpeg)

本期上海站来自 PingCAP 开发者生态团队的工程师们向大家介绍了 TiDB 的场景设计，以及通过 Demo 演示让你“沉浸式体验”如何部署一个“All in Cloud的书店网站”。另外从生态兼容性上，工程师们也将演示如何结合 gitpod 来快速启动 mini ossinsight（开源项目洞察工具），带你体验基于 TiDB Cloud 之上的实时分析。
点击 [视频回放](https://www.bilibili.com/video/BV1RV4y1P7TL/?vd_source=a169c698408d52b2e8600fed93a0bda6) 查看。
