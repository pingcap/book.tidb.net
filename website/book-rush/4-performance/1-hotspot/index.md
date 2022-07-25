---
title: 1. TiDB 6.0 热点场景优化体验
hide_title: true
---

# 1. TiDB 6.0 热点场景优化体验

- 热点小表缓存

  用户业务遇到热点小表访问场景下，支持显式将热点表缓存于内存中，大幅提高访问性能，提升吞吐，降低访问延迟。该方案可以有效避免引入三方缓存中间件，降低架构复杂性，减少运维管理成本，适用于高频访问低频更新的小表场景，例如配置表，汇率表等。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/cached-tables)，[#25293](https://github.com/pingcap/tidb/issues/25293)

  
- 内存悲观锁优化

  TiDB 从 v6.0.0 开始默认开启内存悲观锁功能。开启后，悲观事务锁管理将在内存中完成，避免悲观锁持久化，也避免了锁信息的 Raft 复制，大大降低悲观事务锁管理的开销。在悲观锁性能瓶颈下，通过悲观锁内存优化，可以有效降低 10% 延迟，提升 10% QPS。

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/pessimistic-transaction#内存悲观锁)，[#11452](https://github.com/tikv/tikv/issues/11452)


## 章节目录

- [TiDB v6.0.0(DMR) 缓存表初试](1-cached-tables.md) By [陈超](https://tidb.net/u/%E5%95%A6%E5%95%A6%E5%95%A6%E5%95%A6%E5%95%A6/post/all)，[姬永飞](https://tidb.net/u/jiyf/post/all)
- [内存悲观锁原理浅析与实践](2-in-memory-pessimistic-locks.md) By [姬永飞](https://tidb.net/u/jiyf/post/all)
- [TiDB 6.0：让 TSO 更高效](3-make-tso-effectively.md) By [闫彬彬](https://tidb.net/u/h5n1/post/all)
