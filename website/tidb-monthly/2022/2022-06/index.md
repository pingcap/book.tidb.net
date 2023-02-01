---
title: 2022 年 6 月刊
hide_title: true
sidebar_position: 8
---

# TiDB 社区技术月刊 - 2022 年 6 月

## 推荐语

本期 TiDB 社区技术月刊分为【产品动态】、【开发适配】、【原理 & 特性解读】、【故障排查 & 诊断】、【用户实践】、【社区动态】、【TiDB 能力认证】七大模板。其中包括近期 TiDB 和 TiSpark 的 2 个版本更新，社区用户的 6.0 尝鲜应用，TiFlash 源码解读、TiDB 查询优化及调优、应用开发适配等精彩内容！

## 目录

> 手机端查看，点击左上角即可展开目录结构。

- [产品更新](1-update/index.md)
  - [TiDB v6.1.0 Release Notes](1-update/1-release-notes.md)
  - [TiSpark v3.0.0 主要更新](1-update/2-tispark-3-0-0.md)
  - [TiSpark v3.0.1 主要更新](1-update/3-tispark-3-0-1.md)
  - [TiDB v5.4.2 Release Notes](1-update/4-5-4-2-release.md)

- [开发适配](2-development/index.md)
  - [应用开发者专属的 TiDB 使用指南发布啦！丨TiDB Community](2-development/1-user-guide.md)
  - [【十分钟成为 TiFlash Contributor】TiFlash 函数下推必知必会](2-development/2-tiflash-contributor.md)


- [原理 & 特性解读](3-feature-indepth/index.md)
  - [TiFlash 面向编译器的自动向量化加速](3-feature-indepth/1-vectorization-acceleration.md)
  - [TiFlash 源码解读（四） | TiFlash DDL 模块设计及实现分析](3-feature-indepth/2-tiflash-ddl.md)
  - [TiDB v6.0.0 DMR 源码阅读——缓存表](3-feature-indepth/3-tidb-dmr.md)


- [故障排查 & 调优](4-trouble-shooting/index.md)
  - [clustered_index 的表，删除列之后 tiflash crash 问题](4-trouble-shooting/1-clustered-index.md)
  - [TiCDC 从某些旧版本升级至某些新版本时，可能会出现 panic](4-trouble-shooting/2-ticdc-panic.md)
  - [避坑指南：生产环境 TiKV 的 IO-Util 趋近 100% 问题定位](4-trouble-shooting/3-tikv-io-util.md)
  - [TiDB 性能优化概述](4-trouble-shooting/4-tifb-optimize.md)
  - [OLTP 负载性能优化实践](4-trouble-shooting/5-oltp-optimize.md)
  - [Performance Overview 面板重要监控指标详解](4-trouble-shooting/6-performance-overview.md)
  - [TiDB 性能分析和优化](4-trouble-shooting/7-tidb-analyse-optimize.md)
  - [TIDB监控升级解决panic的漫漫探索之路](4-trouble-shooting/8-tidb-panic.md)


- [用户实践](5-usercase/index.md)
  - [TIDB 6.0新特性漫谈之Clinic](5-usercase/1-tidb-clinic.md)
  - [TiCDC canal_json的实际应用](5-usercase/2-ticdc-canal-json.md)
  - [生产环境TiDB集群缩容TiKV操作步骤](5-usercase/3-tidb-tikv.md)
  - [文盘Rust -- 子命令提示，提高用户体验](5-usercase/4-rust-sub-command.md)
  - [TiSpark v2.5 开发入门实践及 TiSpark v3.0.0 新功能解读](5-usercase/5-tispark-v2-5-v3-0-0.md)
  - [你踩过这些坑吗？谨慎在时间类型列上创建索引](5-usercase/6-create-index.md)
  - [TiDB 6.1 新特性解读 | TiDB 6.1 MPP 实现窗口函数框架](5-usercase/7-tidb-6-1-mpp.md)
  - [TiSpark 3.0.0 新特性实践](5-usercase/8-tispark-3-0-0-practice.md)
  - [TiDB 之 TiCDC6.0 初体验](5-usercase/9-ticdc6-0-experience.md)
  - [带你全面了解compaction 的13个问题](5-usercase/10-compaction-question.md)
  - [文盘Rust -- 给程序加个日志](5-usercase/11-rust-daily-record.md)

- [社区动态](6-community-news/index.md)
  - [社区活动预告](6-community-news/1-upcoming-events.md)
  - [6 月精彩活动回顾](6-community-news/2-event-summary.md)
  - [6 月社区荣誉成员](6-community-news/3-mva-202206.md)
  - [Contributor 动态](6-community-news/4-Contributors.md)

- [TiDB 能力认证](7-tidb-certification/index.md)
  - [考试安排](7-tidb-certification/1-pcta-pctp.md)
  - [课程介绍与推荐](7-tidb-certification/2-tidb-course.md)

## 感谢

感谢所有贡献内容的作者（按文章收录顺序排列）：[黄海升](https://github.com/SeaRise)，[朱一帆](https://github.com/SchrodingerZhu)，[洪韫妍](https://github.com/hongyunyan)，[CuteRay](https://tidb.net/u/CuteRay/answer)，[Junshen Huang](https://github.com/JaySon-Huang)，[Dongpo Liu](https://github.com/hi-rustin)，[Ann_ann](https://tidb.net/u/Ann_ann/answer)，[俺也一样](https://tidb.net/u/%E4%BF%BA%E4%B9%9F%E4%B8%80%E6%A0%B7/answer)，[代晓磊_Mars](https://tidb.net/u/%E4%BB%A3%E6%99%93%E7%A3%8A_Mars/answer)，[Liuhaoao](https://tidb.net/u/Liuhaoao/answer)，[Jiawei](https://tidb.net/u/Jiawei/answer)，[jiashiwen](https://tidb.net/u/jiashiwen/answer)，[ShawnYan](https://tidb.net/u/ShawnYan/answer)，[Zeratulll](https://tidb.net/u/Zeratulll/answer)，[数据小黑](https://tidb.net/u/%E6%95%B0%E6%8D%AE%E5%B0%8F%E9%BB%91/answer)，[JiekeXu](https://tidb.net/u/JiekeXu/answer)，[h5n1](https://tidb.net/u/h5n1/answer)

感谢本期月刊的内容编辑：[Xiaolu Zhou](https://github.com/luzizhuo)，[ShawnYan](https://tidb.net/u/ShawnYan/post/all)，[Zaiyun Zhao](https://tidb.net/u/Zavier/answer)
