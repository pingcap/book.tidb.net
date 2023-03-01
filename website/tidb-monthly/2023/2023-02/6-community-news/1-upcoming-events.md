---
title: 社区活动预告 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 社区活动预告
description: 3月超多活动进行中，一起来玩呀
keywords: [TiDB, 社区活动, 源码解读, TiCDC]
---

# 社区活动预告

## 3.16（周四）TiCDC 源码解读系列

TiCDC 是什么？
TiCDC（TiDB Change Data Capture）是用来捕捉和输出 TiDB/TiKV 集群上数据变更的一个工具。它既可以作为 TiDB 增量数据同步工具，将 TiDB 集群的增量数据同步至下游数据库，也提供开放数据协议，支持把数据发布到第三方系统。

**TiCDC** **源码解读系列#8 ｜TiCDC MySQL Sink 实现原理和性能优化**

- 时间：2023 年 3 月 16 日（周四）20:00-21:00
- 分享要点：TiCDC 中 Sink 模块拉取 sorter 已排序的行变更，按照特定协议将数据同步到下游。本期主要介绍 Sink 模块中 MySQL sink 的实现原理，会重点关注以下几个问题：
  - MySQL sink 对事务的处理和冲突检测机制
  - MySQL sink 如何提高写下游的性能
  - 在跨 region 复制、高延迟网络场景下，MySQL sink 如何解决性能瓶颈
  - 未来 MySQL sink 的一些优化方向

- 报名方式：点击[链接](https://asktug.com/t/topic/1002361)了解详情 or 扫码即可预约直播啦：

![](https://asktug.com/uploads/default/original/4X/d/1/e/d1eede20549e6f01362cf252d74e20488e3dbc7a.jpeg)
