---
title: TiSpark 2.5.1
hide_title: true
---

# TiSpark 2.5.1

**TiSpark v2.5.1版本**于 2022 年 05 月 16日 正式发布。

## 主要变更

### 修复问题

- 修复 limit 没有正确下推的 bug [#2335](https://github.com/pingcap/tispark/pull/2335)

- 修复当聚簇索引为 Timestamp 或 Date 类型时抛出 ClassCastException 的 bug[#2323](https://github.com/pingcap/tispark/pull/2323)

- 修复错误显示 _tidb_rowid 的 bug [#2278](https://github.com/pingcap/tispark/pull/2278)

- 修复 set catalog 时 抛出 NoSuchElementException 的 bug[#2254](https://github.com/pingcap/tispark/pull/2254)

### 优化提升

- 文档中增加限制：不支持 TLS [#2281](https://github.com/pingcap/tispark/pull/2281)

- 文档中增加限制：不支持打开 collations [#2251](https://github.com/pingcap/tispark/pull/2251)

- 文档中增加沟通方式 [#2244](https://github.com/pingcap/tispark/pull/2244)

- 升级 jackson-databind 从 2.9.10.8 到 2.12.6.1 [#2288](https://github.com/pingcap/tispark/pull/2288)