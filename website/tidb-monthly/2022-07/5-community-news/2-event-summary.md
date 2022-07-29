---
title: 7 月精彩活动回顾 - TiDB 社区技术月刊
hide_title: true
sidebar_label: 7 月精彩活动回顾
description: 7月 精彩活动回顾
keywords: [TiDB, Meetup, 7月, 回顾, 特性, Book Rush, 天津, 石家庄, 济南, 武汉]
---

# 7 月精彩活动回顾

## **[《TiDB 6.x in Action》回顾](https://asktug.com/t/topic/812920)**

详情：《TiDB 6.x in Action》分为 TiDB 6.x 原理和特性、TiDB Developer 体验指南、TiDB 6.x 可管理性、TiDB 6.x 内核优化与性能提升、TiDB 6.x 测评、TiDB 6.x 最佳实践 6 大内容模块，汇聚了 TiDB 6.x 新特性的原理、测评、试用心得等等干货。不管你是 DBA 运维还是应用开发者，如果你正在或有意向使用 TiDB 6.x，这本书都可以给你提供参考和实践指南。

## **[【地区交流活动回顾 & 资料下载】来看看天津、石家庄、济南、武汉的小伙伴在聊啥~](https://asktug.com/t/topic/694604)**

详情：4月下旬社区开启了地区组织者计划，依靠社区小伙伴的力量，我们走进了天津、石家庄、济南、武汉，有分享 MySQL 与 TiDB 原理的，还有来教大家如何做好一场 TiDB POC 测试，也有小伙伴分享了对 TiDB 开发的一些展望和期待，除了 TiDB，地区技术交流也吸纳了如 Clickhouse、Databend、Greenplum、Oracle 等相关分享。

![TiDB 地区 Meetup 回顾](https://img2.pingcap.com/forms/e/e/eea7c420d99b9b382b6f4010bd7c9efa31af9718.jpeg)

## [TiKV 6.1 新特性预览 | Meetup No.150](https://mp.weixin.qq.com/s/1a9x67SfWgtTaTugFzlLzA)

[视频回顾](介绍 TiKV 6.1 新特性预览，深度为大家解析 新一代日志引擎 Raft Engine 和集群在线恢复功能两大新特性。)

在 150 期 Infra Meetup 直播间，我们邀请了两位来自 PingCAP 的研发工程师，从技术层面深入解析 TiKV 6.1 新特性。

## **Infra Meetup 151**

[视频回顾](https://www.bilibili.com/video/BV14d4y1D7wz)

TiDB 作为一个兼容 MySQL 的分布式数据库，从最开始就支持完整的分布式事务。根据 TiDB 架构的特点，最初选择了使用 Percolator 事务模型。但是随着 TiDB 被应用到核心场景之中，TiDB 对 Percolator 进行各种优化和改造以满足需求。

在提交模型上，TiDB 在 v4.0 支持了大事务，v5.0 支持了 Async Commit 和 1PC 来降低分布式事务的延迟；另一方面，TiDB 在 v3.0.8 支持了悲观事务来优化冲突场景的性能和稳定性，在 v4.0 上对悲观锁做了 pipelined 优化降低悲观锁的延迟，在 v6.0 发布了内存悲观锁又进一步降低了悲观锁的写入开销。本次 meetup 将分享 TiDB 在这两条路线做的演进、原理以及他们所解决的问题。

## TiFlash 源码阅读：DeltaTree Index 的设计和实现

[视频回顾](https://www.bilibili.com/video/BV1dV4y1L74v)

本次分享对 TiFlash 存储层核心数据结构 DeltaTree Index 的作用以及相关的实现原理进行详细解读。