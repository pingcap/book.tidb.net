---
sidebar_position: 0.5
---

# TiDB 6.0 电子书 目录

## [第一章：TiDB 6.0 原理和特性](1-features/index.md)

- ### [1.1 TiFlash 源码解读](1-features/1-tiflash-code/index.md)
  - [TiFlash 存储层概览](1-features/1-tiflash-code/1-tiflash-storage-overview.md)
  - [TiFlash 计算层概览](1-features/1-tiflash-code/2-tiflash-compute-overview.md)
  - [TiFlash DeltaTree 存储引擎设计及实现分析 - Part 1](1-features/1-tiflash-code/3-tiflash-deltatree.md)
  - [TiFlash DDL 模块设计及实现分析](1-features/1-tiflash-code/5-tiflash-ddl-module.md)
  - [TiFlash 面向编译器的自动向量化加速](1-features/1-tiflash-code/6-tiflash-compiler-aided-vectorization.md)

- ### [1.2 TiDB 6.0 新特性解读](1-features/2-new-features/index.md)
  - [TiDB 6.0 新特性解读 | Collation 规则](1-features/2-new-features/1-new-collation.md)
  - [TiDB v6.0.0 DMR 源码阅读——缓存表](1-features/2-new-features/2-new-cache-tables.md)

## [第二章：TiDB Developer 体验指南](2-developer-guide/index.md)

- ### [2.1 TiDB Cloud DevTier 搭建](2-developer-guide/1-cloud-devtier/index.md)
  - [使用 TiDB Cloud (DevTier) 构建 TiDB 集群](2-developer-guide/1-cloud-devtier/1-build-cluster-in-cloud.md)

- ### [2.2 TiDB Demo Application](2-developer-guide/2-demo-app/index.md)
  - [使用 Spring Boot 构建 TiDB 应用程序](2-developer-guide/2-demo-app/1-sample-application-spring-boot.md)
  
- ### [2.3 Simple CRUD 指南](2-developer-guide/3-simple-crud/index.md)
  - [TiDB 和 Java 的简单 CRUD 应用程序](2-developer-guide/3-simple-crud/1-sample-application-java.md)
  - [TiDB 和 Golang 的简单 CRUD 应用程序](2-developer-guide/3-simple-crud/2-sample-application-golang.md)
  - [TiDB 和 Python 的简单 CRUD 应用程序](2-developer-guide/3-simple-crud/3-sample-application-python.md)
  - [TiDB 和 C# 的简单 CRUD 应用程序](2-developer-guide/3-simple-crud/4-sample-application-csharp.md)

## [第三章：TiDB 6.0 可管理性](3-manageability/index.md)
- ### [3.1 TiUniManager（原 TiEM） 体验](3-manageability/1-tiunimanager-practice/index.md)
  - [如何让 TiDB 集群管理“更省心”？TiuniManager（原 TiEM）使用教程来了](3-manageability/1-tiunimanager-practice/1-tiunimanager-course.md)
  - [TiDB 生态工具 -- TiUniManager（原 TiEM）v1.0.0 体验](3-manageability/1-tiunimanager-practice/2-tiunimanager.md)
  - [TiUniManager（原 TiEM）初体验](3-manageability/1-tiunimanager-practice/3-experience-tiunimanager.md)

- ### [3.2 Clinic 体验](3-manageability/2-clinic-practice/index.md)
  - [PingCAP Clinic 服务：贯穿云上云下的 TiDB 集群诊断服务](3-manageability/2-clinic-practice/1-clinic-tidb-cloud.md)
  - [体验 TiDB v6.0.0 之 Clinic](3-manageability/2-clinic-practice/2-clinic.md)
  - [TiDB 6.0 新特性漫谈之 Clinic](3-manageability/2-clinic-practice/3-experience-clinic.md)

- ### [3.3 Placement Rules 体验](3-manageability/3-placement-rules-practice/index.md)
  - [TiDB 6.0 的元功能：Placement Rules in SQL 是什么？](3-manageability/3-placement-rules-practice/1-pr-in-sql.md)
  - [TiDB 6.0 Placement Rules In SQL 使用实践](3-manageability/3-placement-rules-practice/2-placement-rules.md)
  - [TiDB 冷热存储分离解决方案](3-manageability/3-placement-rules-practice/3-hot-cold-storage.md)

- ### [3.4 TiDB 可观测性 & 性能优化实践](3-manageability/4-observability-performance-tuning/index.md)
  - [TiDB 性能优化概述](3-manageability/4-observability-performance-tuning/1-performance-tuning-overview.md)
  - [TiDB 性能分析和优化方法](3-manageability/4-observability-performance-tuning/2-performance-tuning-methods.md)
  - [OLTP 负载性能优化实践](3-manageability/4-observability-performance-tuning/3-performance-tuning-practices.md)
  - [多并发下线程创建、释放的阻塞问题](3-manageability/4-observability-performance-tuning/4-high-concurrency-thread.md)

- ### [3.5 DM WebUI 体验](3-manageability/5-dm-webui/index.md)
  - [体验 TiDB v6.0.0 之 TiDB 的数据迁移工具 DM-WebUI](3-manageability/5-dm-webui/1-dm-webui.md)

- ### [3.6 其他新特性体验](3-manageability/6-other-features/index.md)
  - [TiDB 6.0 离线包变更](3-manageability/6-other-features/1-offline-package.md)


## [第四章：TiDB 6.0 内核优化与性能提升](4-performance/index.md)

- ### [4.1 内核层面的数据索引一致性检查](4-performance/1-data-consistency/index.md)

- ### [4.2 TiDB 6.0 热点场景优化体验](4-performance/2-hotspot/index.md)
  - [TiDB v6.0.0(DMR) 缓存表初试](4-performance/2-hotspot/1-cached-tables.md)
  - [内存悲观锁原理浅析与实践](4-performance/2-hotspot/2-in-memory-pessimistic-locks.md)
  - [TiDB 6.0：让 TSO 更高效](4-performance/2-hotspot/3-make-tso-effectively.md)

- ### [4.3 MPP 引擎计算性能提升](4-performance/3-mpp-engine/index.md)
  - [TiDB 6.0 新特性解读 | TiFlash 新增算子和函数下推](4-performance/3-mpp-engine/1-tiflash-pushing-down.md)
  - [TiDB 6.1 新特性解读 | TiDB 6.1 MPP 实现窗口函数框架](4-performance/3-mpp-engine/2-mpp-window-functions.md)

- ### [4.4 TiDB 6.0 容灾能力体验](4-performance/4-disaster-recovery/index.md)
  - [TiCDC 6.0 原理之 Sorter 演进](4-performance/4-disaster-recovery/1-ticdc-sorter.md)

- ### [4.5 TiKV 节点重启后 leader 平衡加速](4-performance/5-tikv-restart/index.md)
  - [TiDB 6.0 体验：TiKV 重启后 leader 均衡加速](4-performance/5-tikv-restart/1-leader-transfer-speedup.md)

- ### [4.6 TiDB 6.0 其他特性体验](4-performance/6-other-features/index.md)
  - [体验 TiSpark 基于 TiDB v6.0 (DMR) 最小实践](4-performance/6-other-features/1-tispark.md)
  - [TiSpark v2.5 开发入门实践及 TiSpark v3.0.0 新功能解读](4-performance/6-other-features/2-tispark-guide.md)
  - [TiSpark 3.0.0 新特性实践](4-performance/6-other-features/3-tispark-3-in-action.md)

## [第五章：TiDB 6.0 测评](5-benchmark/index.md)
- ### [5.1 TiDB 6.0 版本测评](5-benchmark/1-other-version/index.md)
  - [TiDB 6.0.0 与 5.1.4 对比测试](5-benchmark/1-other-version/1-tidb-sysbench-v6-0-0-v5-1-4.md)
  - [TiKV 节点重启后业务恢复速度（leader 平衡速度）v6.0 vs v5.1.2 对比测试](5-benchmark/1-other-version/2-tikv-business-recovery.md)

## [第六章：TiDB 6.0 最佳实践](6-best-practice/index.md)
- ### [6.1 HTAP 最佳实践](6-best-practice/1-htap-practice/index.md)
  - [TiFlash 6.0 on K8s 扩容与新特性实践](6-best-practice/1-htap-practice/1-tiflash-6.0-on-K8s.md)

- ### [6.2 其他最佳实践](6-best-practice/2-other-practice/index.md)
  - [TiDB Lightning 在数据迁移中的应用与错误处理实践](6-best-practice/2-other-practice/1-tidb-lightning.md)
  - [基于 TiDB v6.0 部署两地三中心](6-best-practice/2-other-practice/2-two-cities-three-datacenters.md)
  - [TiDB 6.1 单机环境 On openEular 2003 SP3](6-best-practice/2-other-practice/3-tidb61-on-openEular2003.md)

## 活动详情 & 参与指南

- 快速报名入口：https://tidb.net/book/book-rush/
- 活动详情：[TiDB 6.0 Book Rush！一起来分布式创作 6.0 的使用手册吧！](7-event-guide/1-event-detail.md)
- 文章构思指南：[TiDB 6.0 Book Rush 文章构思指南](7-event-guide/2-article-guide.md)
- 贡献指南：[TiDB 6.0 Book Rush 贡献指南](7-event-guide/3-contribute-guide.md)