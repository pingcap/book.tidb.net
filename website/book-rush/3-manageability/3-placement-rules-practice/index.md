---
title: 3. Placement Rules 体验
hide_title: true
---

# 3. Placement Rules 体验

## 基于 SQL 的数据放置规则

TiDB 是具有优秀扩展能力的分布式数据库，通常数据横跨多个服务器甚至多数据中心部署，数据调度管理是 TiDB 最重要的基础能力之一。大多数情况下用户无需关心数据如何调度管理，但是随着业务复杂度的提升，因隔离性和访问延迟导致的数据部署变更是 TiDB 面对的新的挑战。TiDB 从 6.0.0 版本开始正式提供基于 SQL 接口的数据调度管理能力，支持针对任意数据提供副本数、角色类型、放置位置等维度的灵活调度管理能力，在多业务共享集群、跨 AZ 部署下提供更灵活的数据放置管理能力。

Placement Rules in SQL 特性用于通过 SQL 接口配置数据在 TiKV 集群中的放置位置。通过该功能，用户可以将表和分区指定部署至不同的地域、机房、机柜、主机。适用场景包括低成本优化数据高可用策略、保证本地的数据副本可用于本地 Stale Read 读取、遵守数据本地要求等。



> 注意
>
> Placement Rules in SQL 底层的实现依赖 PD 提供的放置规则 (placement rules) 功能，参考 [Placement Rules 使用文档](https://docs.pingcap.com/zh/tidb/v6.0/configure-placement-rules)。在 Placement Rules in SQL 语境下，放置规则既可以代指绑定对象的放置策略 (placement policy)，也可以代指 TiDB 发给 PD 的放置规则。



## 应用场景

该功能可以实现以下业务场景：

- 合并多个不同业务的数据库，大幅减少数据库常规运维管理的成本
- 增加重要数据的副本数，提高业务可用性和数据可靠性
- 将最新数据存入 SSD，历史数据存入 HDD，降低归档数据存储成本
- 把热点数据的 leader 放到高性能的 TiKV 实例上
- 将冷数据分离到不同的存储中以提高可用性

## 章节目录

- [TiDB 6.0 的元功能：Placement Rules in SQL 是什么？](1-pr-in-sql.md) By [Eason](https://github.com/easonn7)
- [TiDB 6.0 Placement Rules In SQL 使用实践](2-placement-rules.md) By [吴永健](https://tidb.net/u/banana_jian)
- [TiDB 冷热存储分离解决方案](3-hot-cold-storage.md) By [李文杰](https://tidb.net/u/Jellybean/answer)