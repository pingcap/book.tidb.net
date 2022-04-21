---
title: TiDB 可观测性体验
hide_title: true
---

# TiDB 可观测性体验

## 可观测性

- Top SQL：面向非专家的 SQL 性能诊断功能

  Top SQL 是一个面向运维人员及应用开发者的一体化、自助的数据库性能观测和诊断功能，集成于 TiDB Dashboard 图形化界面，在 TiDB v6.0.0 正式发布。

  与现有 TiDB Dashboard 中各个面向数据库专家的诊断功能不同的是，Top SQL 完全面向非专家：你不需要观察几千张监控图表寻找相关性，也不需要理解诸如 Raft Snapsnot、RocksDB、MVCC、TSO 等 TiDB 内部机制，仅需要知道常见的数据库概念，如索引、锁冲突、执行计划等，就可以通过 Top SQL 快速分析数据库负载情况，并提升应用程序的性能。

  Top SQL 功能功能默认关闭。启用后，通过 Top SQL 提供的各个 TiDB 或 TiKV 节点实时 CPU 负载情况，你可以直观了解各节点的高 CPU 负载来自哪些 SQL 语句，从而快速分析诸如数据库热点和负载陡升等问题。例如，你可以通过 Top SQL 分析某个 TiKV 节点上正在消耗 90% CPU 负载的 SQL 查询语句的具体内容及执行情况。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/top-sql)

  

- 持续性能分析

  持续性能分析 (Continuous Profiling) 功能集成于 TiDB Dashboard，在 TiDB v6.0.0 中正式发布。该功能默认关闭，启用该功能后，集群将以极低的开销自动收集各 TiDB、TiKV 及 PD 实例每时每刻的性能数据。通过这些历史性能数据，技术专家可以在事后回溯、分析该集群任意时刻（如曾经出现过高内存占用）的问题根因，无需等待问题复现，从而有助于缩短故障诊断时间。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/continuous-profiling)



在此目录下，你可以撰写 针对 TiDB 可观测性的体验和实践相关的文章。