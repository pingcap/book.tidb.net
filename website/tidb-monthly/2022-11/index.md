---
title: 2022 年 11 月刊
hide_title: true
sidebar_position: 3
---

# TiDB 社区技术月刊 - 2022 年 11 月

## 推荐语

本期 TiDB 社区技术月刊分为【产品更新】、【开发适配】、【原理 & 特性解读】、【故障排查 & 诊断】、【用户实践】、【社区动态】、【TiDB 能力认证】七大模板。其中包括 TiDB 5.3.4、TiDB 6.4.0、TiUP 1.11.1 等发布，TiFlash、TiKV 源码解读等精彩内容，还有 TiCDC 源码分享，PingCAP DevCon、Workshop 上海站等活动火热报名中！

## 目录

> 手机端查看，点击左上角即可展开目录结构。

- 产品更新
  - [TiDB 5.3.4 Release Notes](1-update/1-tidb-5-3-4.md)
  - [TiDB 6.4.0 Release Notes](1-update/2-tidb-6-4-0.md)
  - [TiUP 1.11.1 Release Note](1-update/3-tiup-1-11-1.md)

- 开发适配
  - [文盘Rust -- 把程序作为守护进程启动](2-development/1-rust-program-daemon-start.md)
  - [文盘Rust -- 起手式，CLI程序](2-development/2-rust-cli.md)

- 原理 & 特性解读
  - [TiFlash 源码阅读（六） DeltaTree Index 的设计和实现分析](3-feature-indepth/1-tiflash-3-deltatree-index.md)
  - [TiFlash 源码阅读（七）TiFlash Proxy 模块](3-feature-indepth/2-tiflash-4-proxy.md)
  - [TiKV 源码阅读三部曲（三）写流程](3-feature-indepth/3-tikv-code-three.md)
  - [TiDB上云之TiDB Operator](3-feature-indepth/4-tidb-cloud-operator.md)

- 故障排查 & 调优 
  - [记一次TiDB数据库报错的处理过程](4-trouble-shooting/1-tidb-db-report-an-error-treat.md)
  - [Etcd API 未授权访问漏洞修复](4-trouble-shooting/2-etcd-api-bug-fixed.md)
  - [ 一次TiDB GC阻塞引发的性能问题分析](4-trouble-shooting/3-tidb-gc-block.md)
  - [TiDB 的 graceful shutdown](4-trouble-shooting/4-tidb-graceful-shutdown.md)

- 用户实践
  - [记录一次TiDB v5.2.3迁移到v6.1.0的过程](5-usercase/1-tidb-5-3-2-6-1-0.md)
  - [教你一招，安全的从 MySQL 切换到 TiDB](5-usercase/2-mysql-to-tidb.md)
  - [MySQL or TiDB？HTAP 数据库在中国 SaaS 行业头部服务商的应用实践](5-usercase/3-tidb-or-mysql-htap-saas- practice.md)
  - [将业务从mysql迁移至TIDB，有哪些需要注意的？](5-usercase/4-mysql-to-tidb-matters.md)
  - [使用Online unsafe recovery恢复v6.2同城应急集群](5-usercase/5-online-unsafe-recovery-6-2.md)
  - [TiDB常用SQL](5-usercase/6-tidb-comment-sql.md)

- 社区动态
  - [社区活动预告](6-community-news/1-upcoming-events.md)
  - [11 月精彩活动回顾](6-community-news/2-event-summary.md)
  - [11 月社区荣誉成员](6-community-news/3-mva-202211.md)
  - [Contributor 动态](6-community-news/4-contributors.md)
  - hackathon 背后的故事
    - [让迁移不再开盲盒，让云也能省钱丨Hackathon 项目背后的故事第一期回顾](6-community-news/5-hackathon-2022-story/1-hackathon-2022-story-1-cloud.md)
    - [什么叫无限创意！产品组哪些项目最具战斗力？| TiDB Hackathon 2022 非正式会谈产品组圆桌讨论回顾](6-community-news/5-hackathon-2022-story/2-hackathon-2022-story-2.md)
    - [用 TiDB 可以实现哪些有趣的数据洞察应用？ | TiDB Hackathon 2022 赛后非正式会谈](6-community-news/5-hackathon-2022-story/3-hackathon-2022-story-3.md)
  - 我和 TiDB 的故事
    - [我和 TiDB 的故事|这里集齐了 34 位社区小伙伴和 TiDB 的故事](6-community-news/6-tidb-story/1-tidb-community-story.md)
    - [地区组织者页面上新啦！地区技术交流活动等你来启动哟~ ](6-community-news/6-tidb-story/2-tidb-regional-meetup.md)

- TiDB 能力认证
  - [认证介绍 & 考试安排](7-tidb-certification/1-pcta-pctp.md)
  - [TiDB 标准课程推荐](7-tidb-certification/2-tidb-course.md)

## 感谢

感谢所有贡献内容的作者（按文章收录顺序排列）：[jiashiwen](https://tidb.net/u/jiashiwen/answer)、[李德竹](https://github.com/lidezhu)、[骆融臻](https://github.com/CalvinNeo)、[谭新宇]((https://github.com/OneSizeFitsQuorum)、[代晓磊_Mars](https://tidb.net/u/%E4%BB%A3%E6%99%93%E7%A3%8A_Mars/answer)、[tracy0984](https://tidb.net/u/tracy0984/answer)、[gary](https://tidb.net/u/gary/answer)、[hey-hoho](https://tidb.net/u/hey-hoho/answer)、[yiduoyunQ](https://tidb.net/u/yiduoyunQ/answer)、[CuteRay](https://tidb.net/u/CuteRay/answer)、[BraveChen](https://tidb.net/u/BraveChen/answer)、[cchouqiang](https://tidb.net/u/cchouqiang/answer)、[我是咖啡哥](https://tidb.net/u/%E6%88%91%E6%98%AF%E5%92%96%E5%95%A1%E5%93%A5/answer)、

感谢本期月刊的内容编辑：[CandicePan](https://github.com/Candicepan)，[Xiaolu Zhou](https://github.com/luzizhuo)，[ShawnYan](https://tidb.net/u/ShawnYan/post/all)，[Yan Yan](https://tidb.net/u/YY-ha/answer)，[Linlin Wang](https://github.com/Soline324)、[张慧颖](https://tidb.net/u/hazelll/answer)
