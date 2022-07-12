---
title: TiSpark 3.0.0
hide_title: true
---

# TiSpark 3.0.0 主要更新

**TiSpark v3.0.0 版本**于 2022 年 06 月 15日 正式发布。**主要变更如下：**

## 兼容性修改

- 不再支持不使用 catalog 的方式。现在你必须配置 catalog 并使用 tidb_catalog  [#2252](https://github.com/pingcap/tispark/pull/2252)

- TiSpark 的 Jar 包有了新的明白规则： `tispark-assembly-{$spark_version}_{$scala_version}-{$tispark_verison}` [#2370](https://github.com/pingcap/tispark/pull/2370)

## 新特性

- 支持删除语句 [#2276](https://github.com/pingcap/tispark/pull/2276)

- 支持 Spark 3.2 [#2287](https://github.com/pingcap/tispark/pull/2287)

- 支持遥测以收集相关信息 [#2316](https://github.com/pingcap/tispark/pull/2316)

- 支持 stale read 以读取历史版本的数据 [#2322](https://github.com/pingcap/tispark/pull/2322)

- 支持 TLS 并具备动态更新证书的能力 [#2306](https://github.com/pingcap/tispark/pull/2306) [#2349](https://github.com/pingcap/tispark/pull/2349) [#2365](https://github.com/pingcap/tispark/pull/2349) [#2377](https://github.com/pingcap/tispark/pull/2377)

## 问题修复

- 当配置了`spark.tispark.show_rowid=true` 时，修复错误的  _tidb_rowid 结果 [#2270](https://github.com/pingcap/tispark/pull/2270)

- 修复 sum 未下推的 bug [#2314](https://github.com/pingcap/tispark/pull/2314)

- 修复 limit 未下推的 bug [#2329](https://github.com/pingcap/tispark/pull/2329)

- 当使用 catalog 时，避免抛出 NoSuchElementException [#2220](https://github.com/pingcap/tispark/pull/2220)

- 当使用 Timestamp 和 Date 类型的聚簇索引时，避免抛出 ClassCastException [#2319](https://github.com/pingcap/tispark/pull/2319)

- 优化重试逻辑，在请求 TiKV 时，返回的某些错误类型不再重试 [#2279](https://github.com/pingcap/tispark/pull/2279)

- 删除无用配置 `spark.tispark.statistics.auto_load` [#2300](https://github.com/pingcap/tispark/pull/2300)

- 升级 jackson-databind 从 2.9.10.8 到 2.12.6.1 [#2285](https://github.com/pingcap/tispark/pull/2285)

- 升级 guava 从 26.0-android 到 29.0-android [#2340](https://github.com/pingcap/tispark/pull/2340)

- 升级 mysql-connector-java 从 5.1.44 到 5.1.49 [#2367](https://github.com/pingcap/tispark/pull/2367)

## 文档优化

- 增加 communication channels 章节 [#2228](https://github.com/pingcap/tispark/pull/2228)

- 增加限制：new collations 还未支持  [#2238](https://github.com/pingcap/tispark/pull/2238)


## 更多信息

更多发布信息，请查看 [TiSpark release notes](https://github.com/pingcap/tispark/releases/tag/v3.0.0)

相关文档地址：https://github.com/pingcap/tispark#readme

如有任何问题，可以联系发版团队 [release@pingcap.com](mailto:release@pingcap.com) 或 [yuhang.shi@pingcap.com](mailto:yuhang.shi@pingcap.com) 获得帮助。