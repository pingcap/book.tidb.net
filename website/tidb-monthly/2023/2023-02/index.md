---
title: 2023 年 2 月刊
hide_title: true
sidebar_position: 11
---

# TiDB 社区技术月刊 - 2023 年 2 月

## 推荐语

本期 TiDB 社区技术月刊分为【产品更新】、【开发适配】、【原理 & 特性解读】、【故障排查 & 诊断】、【用户实践】、【社区动态】、【TiDB 能力认证】七大模板。其中包括 TiDB 6.6.0、TiDB 6.1.4、TiDB Operator 1.4.3 等发布，TiDB Serverless 技术解读，数据加载性能调优方案分享，网易游戏、微众银行、安信证券实践案例解读等精彩内容，MOA、地区组织者荣誉成员公示、还有 TiCDC 源码分享等活动火热报名中！

## 目录

> 手机端查看，点击左上角即可展开目录结构。

- 产品更新
  - [TiDB 6.6.0 Release Notes](1-update/1-tidb-6-6-0.md)
  - [TiDB 6.1.5 Release Notes](1-update/2-tidb-6-1-5.md)
  - [TiDB 6.1.4 Release Notes](1-update/3-tidb-6-1-4.md)
  - [TiDB Operator 1.4.3 Release Notes](1-update/4-tidb-operator-1-4-3.md)
  - [TiDB Operator 1.4.2 Release Notes](1-update/5-tidb-operator-1-4-2.md)
  - [TiDB Operator 1.3.10 Release Notes](1-update/6-tidb-operator-1-3-10.md)
  - [TiUP 1.11.3 Release Notes](1-update/7-tiup-1-11-3.md)

- 原理 & 特性解读
  - [TiKV RocksDB 读写原理整理](3-feature-indepth/1-tikv-rocksdb.md)
  - [Cloud + TiDB 技术解读](3-feature-indepth/2-cloud-tidb.md)
  - [坚如磐石： TiDB 基于时间点的恢复特性优化之路](3-feature-indepth/3-optimization-of-tidb-based-on-the-pitr.md)
  - [天下武功唯快不破：在线 DDL 性能提升 10 倍](3-feature-indepth/4-10-times-online-ddl-performance-improvement.md)
  - [TiDB 6.6 版本发布](3-feature-indepth/5-tidb-6-6.md)
  - [TiDB Serverless 和技术生态全景](3-feature-indepth/6-tidb-serverless-and-technology-ecology-overview.md)
  - [drainer binlog 清理机制 源码详解](3-feature-indepth/7-drainer-binlog.md)
  
- 故障排查 & 调优 
  - [如果使用了 read committed 隔离，则可能无法读取最新数据](4-trouble-shooting/1-critical-bug-read-committed.md)
  - [TiDB 的数据加载性能调优方案](4-trouble-shooting/2-tidb-data-loading-performance-tuning-scheme.md)

- 用户实践
  - [TiDB在转转公司的发展历程](5-usercase/1-tidb-in-zhuanzhuan.md)
  - [br 备份时排除某个库](5-usercase/2-excluded-a-storeroom-during-br-backup.md)
  - [TiDB Operator--K8S集群基础环境配置](5-usercase/3-tidb-operator-k8s.md)
  - [新扩容节点与集群版本不一致处理](5-usercase/4-newly-node-inconsistent-with- cluster.md)
  - [通过 Jmeter 批量向 TiDB 数据库插入数据](5-usercase/5-jmeter-tidb-import-data.md)
  - [浅谈 HTAP 混合技术和金融业应用场景](5-usercase/6-a-brief-discussion-on-htap-and-finance-application-scenarios.md)
  - [网易游戏实时 HTAP 计费风控平台建设](5-usercase/7-construction-of-real-time-htap-platform-for-netease-games.md)
  - [TiDB 在安信证券资产中心与极速交易场景的实践](5-usercase/8-tidb-in-essence-securities.md)
  - [微众银行 TiDB HTAP 和自动化运维实践](5-usercase/9-tidb-htap-in-webank.md)

- 社区动态
  - [社区活动预告](6-community-news/1-upcoming-events.md)
  - [1 月精彩活动回顾](6-community-news/2-event-summary.md)
  - [1 月社区荣誉成员](6-community-news/3-mva-202301.md)
  - [Contributor 动态](6-community-news/4-contributors.md)

- TiDB 能力认证
  - [TiDB 能力认证 & 考试安排](7-tidb-certification/1-pcta-pctp.md)
  - [TiDB 标准课程推荐](7-tidb-certification/2-tidb-course.md)

## 感谢

感谢所有贡献内容的作者（按文章收录顺序排列）：：[苏州刘三枪](https://tidb.net/u/苏州刘三枪/answer)、[高斌](https://github.com/allengaoo)、[黄潇](https://github.com/benmaoer)、Bear. C、[谢腾进](https://github.com/tangenta)、[庄培培](https://github.com/pepezzzz)、[胡海峰](https://github.com/knull-cn)、[马晓宇](https://github.com/ilovesoup)、[张翔](https://github.com/zhangyangyu)、[Hacker_loCdZ5zu](https://tidb.net/u/Hacker_loCdZ5zu/answer)、Rui Xu、[heiheipp](https://asktug.com/u/heiheipp/answer) 、[Gin](https://tidb.net/u/Gin/answer)、[sustyle](https://tidb.net/u/sustyle/answer)、[qhd2004](https://tidb.net/u/qhd2004/answer)、[lqbyz](https://tidb.net/u/lqbyz/answer)、[Jellybean](https://tidb.net/u/Jellybean/answer)、中国银行软件中心、林佳、李轲、蔡茂捷、徐凯、黄蔚

感谢本期月刊的内容编辑：[CandicePan](https://github.com/Candicepan)，[Xiaolu Zhou](https://github.com/luzizhuo)，[ShawnYan](https://tidb.net/u/ShawnYan/post/all)，[Yan Yan](https://tidb.net/u/YY-ha/answer)，[Linlin Wang](https://github.com/Soline324)、[张慧颖](https://tidb.net/u/hazelll/answer)