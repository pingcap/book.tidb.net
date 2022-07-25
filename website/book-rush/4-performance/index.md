---
title: 第四章：TiDB 6.x 内核优化与性能提升
hide_title: true
---

# 第四章：TiDB 6.x 内核优化与性能提升

除去可管理性，TiDB 6.0 在内核优化和性能提升方面也有了较多的改进，比如在内核层面增加数据索引一致性检查，热点小表缓存和内存悲观锁优化等。

### [4.1 TiDB 6.0 热点场景优化体验](1-hotspot/index.md)

- [TiDB v6.0.0(DMR) 缓存表初试](1-hotspot/1-cached-tables.md) By [陈超](https://tidb.net/u/%E5%95%A6%E5%95%A6%E5%95%A6%E5%95%A6%E5%95%A6/post/all)，[姬永飞](https://tidb.net/u/jiyf/post/all)
- [内存悲观锁原理浅析与实践](1-hotspot/2-in-memory-pessimistic-locks.md) By [姬永飞](https://tidb.net/u/jiyf/post/all)
- [TiDB 6.0：让 TSO 更高效](1-hotspot/3-make-tso-effectively.md) By [闫彬彬](https://tidb.net/u/h5n1/post/all)

### [4.2 MPP 引擎计算性能提升](2-mpp-engine/index.md)

- [TiDB 6.0 新特性解读 | TiFlash 新增算子和函数下推](2-mpp-engine/1-tiflash-pushing-down.md) By [严少安](https://tidb.net/u/ShawnYan/post/all) 
- [TiDB 6.1 新特性解读 | TiDB 6.1 MPP 实现窗口函数框架](2-mpp-engine/2-mpp-window-functions.md) By [严少安](https://tidb.net/u/ShawnYan/post/all)

### [4.3 TiDB 6.0 容灾能力体验](3-disaster-recovery/index.md)

- [TiCDC 架构和数据同步链路解析](3-disaster-recovery/1-ticdc-arch-and-data-replicating.md) By [刘东坡](https://github.com/hi-rustin)
- [TiCDC 6.0 原理之 Sorter 演进](3-disaster-recovery/2-ticdc-sorter.md) By [eastfisher](https://tidb.net/u/eastfisher/answer)

### [4.4 TiKV 节点重启后 leader 平衡加速](4-tikv-restart/index.md)

- [TiDB 6.0 体验：TiKV 重启后 leader 均衡加速](4-tikv-restart/1-leader-transfer-speedup.md) By [闫彬彬](https://tidb.net/u/h5n1/post/all)