---
title: 第三章：TiDB 6.x 可管理性
hide_title: true
---

# 第三章：TiDB 6.x 可管理性

可管理性是数据库的一个重要能力维度：在满足业务需求的前提下，是否灵活易用，将决定了用户技术选择背后的隐性成本。这种成本可大可小，可以是一句抱怨，也可能会结合人因带来灾难性后果。在最新版本研发过程中，我们结合了客户和市场反馈，总结了当前的可管理性的问题仍存在的缺失，这包含了**「复杂且不直观的集群的日常管理」，「无法控制数据的存储位置」，「数据生态套件难于使用」，「面对热点缺少解决方案」**等多个维度，而 TiDB 6.0 从内核，数据生态套件，增强组件多个方面针对这些问题进行了加强。

### [3.1 TiUniManager（原 TiEM） 体验](1-tiunimanager-practice/index.md)

- [如何让 TiDB 集群管理“更省心”？TiUniManager（原 TiEM）使用教程来了](1-tiunimanager-practice/1-tiunimanager-course.md) By [周鹏](https://github.com/zhoubasten)
- [TiDB 生态工具 -- TiUniManager（原 TiEM）v1.0.0 体验](1-tiunimanager-practice/2-tiunimanager.md) By [尹裕皓](https://tidb.net/u/G7尹裕皓/answer)
- [TiUniManager（原 TiEM）初体验](1-tiunimanager-practice/3-experience-tiunimanager.md) By [江坤](https://tidb.net/u/pupillord/answer)

### [3.2 Clinic 体验](2-clinic-practice/index.md)

- [PingCAP Clinic 服务：贯穿云上云下的 TiDB 集群诊断服务](2-clinic-practice/1-clinic-tidb-cloud.md) By [乔丹](https://github.com/qqqdan)
- [体验 TiDB v6.0.0 之 Clinic](2-clinic-practice/2-clinic.md) By [张朋](https://tidb.net/u/边城元元/post/all)
- [TiDB 6.0 新特性漫谈之 Clinic](2-clinic-practice/3-experience-clinic.md) By [代晓磊](https://tidb.net/u/%E4%BB%A3%E6%99%93%E7%A3%8A_Mars/answer)

### [3.3 Placement Rules 体验](3-placement-rules-practice/index.md)

- [TiDB 6.0 的元功能：Placement Rules in SQL 是什么？](3-placement-rules-practice/1-pr-in-sql.md) By [Eason](https://github.com/easonn7)
- [TiDB 6.0 Placement Rules In SQL 使用实践](3-placement-rules-practice/2-placement-rules.md) By [吴永健](https://tidb.net/u/banana_jian)
- [TiDB 冷热存储分离解决方案](3-placement-rules-practice/3-hot-cold-storage.md) By [李文杰](https://tidb.net/u/Jellybean/answer)

### [3.4 TiDB 可观测性 & 性能优化实践](4-observability-performance-tuning/index.md)

- [TiDB 性能优化概述](4-observability-performance-tuning/1-performance-tuning-overview.md) By [陈焕生](https://github.com/dbsid)，[邵希茜](https://github.com/shaoxiqian)，[宋昱颖](https://github.com/Yui-Song)
- [TiDB 性能分析和优化方法](4-observability-performance-tuning/2-performance-tuning-methods.md) By [陈焕生](https://github.com/dbsid)，[邵希茜](https://github.com/shaoxiqian)，[宋昱颖](https://github.com/Yui-Song)
- [OLTP 负载性能优化实践](4-observability-performance-tuning/3-performance-tuning-practices.md) By [陈焕生](https://github.com/dbsid)，[邵希茜](https://github.com/shaoxiqian)，[宋昱颖](https://github.com/Yui-Song)
- [多并发下线程创建、释放的阻塞问题](4-observability-performance-tuning/4-high-concurrency-thread.md) By [Woody](https://github.com/bestwoody)

### [3.5 DM WebUI 体验](5-dm-webui/index.md)

- [体验 TiDB v6.0.0 之 TiDB 的数据迁移工具 DM-WebUI](5-dm-webui/1-dm-webui.md) By [张朋](https://tidb.net/u/边城元元/post/all)

### [3.6 其他新特性体验](6-other-features/index.md)

- [TiDB 6.0 离线包变更](6-other-features/1-offline-package.md) By [严少安](https://tidb.net/u/ShawnYan/post/all)