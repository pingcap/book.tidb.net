---
title: 1. 内核层面增加数据索引一致性检查
hide_title: true
---

# 1. 内核层面增加数据索引一致性检查

在事务执行过中增加数据索引一致性检查，通过极低的资源开销提升系统稳定性和健壮性。你可以通过 `tidb_enable_mutation_checker` 和 `tidb_txn_assertion_level` 参数控制检查行为。默认配置下，大多数场景下 QPS 下降控制在 2% 以内。关于数据索引一致性检查的报错说明，请参考[用户文档](https://docs.pingcap.com/zh/tidb/v6.0/troubleshoot-data-inconsistency-errors)。



在此目录下，你可以撰写针对这个特性的体验和实践文章。
