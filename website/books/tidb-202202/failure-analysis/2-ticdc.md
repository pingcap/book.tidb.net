---
title: v5.1.2 - TiCDC 不同步，checkpointTs 不推进
hide_title: true
---

# 【故障解读】v5.1.2 - TiCDC 不同步，checkpointTs 不推进

## 作者介绍

唐万民,10 多年的数据库运维经验，曾任德邦物流数据库组负责人，长虹数据库架构师，目前担任多点 RDBMS 数据库组负责人，从 TiDB 2.1.6 版本接触至目前 5.1.4 的生产版本，与 TiDB 的发展共同前行，针对踩过的坑提出过很多相关建议。

## 问题现象

### 环境

集群版本：v5.1.2

Tidb server：16c 32g 7 台

Ticdc 机器：16c 64g 2 台高可用

问题发生版本：v4.0.9 v4.0.13 v5.1.2

Tidb server 发生 oom 后，ticdc checkpointTs 不向前推进，尝试 pause changefeed 后未恢复，尝试使用 tiup 重启 cdc 组件后未恢复。

检查 ticdc 日志出现大量 warning 日志：

[2022/01/30 11:17:55.761 +08:00] [WARN] [region_worker.go:377] ["region not receiving resolved event from tikv or resolved ts is not pushing for too long time, try to resolve lock"] [regionID=40982339] [span="[7480000000000016ffa05f72f000000019ff3a9b7b0000000000fa, 7480000000000016ffa05f72f000000019ff7319ad0000000000fa)"] [duration=17m21.65s] [lastEvent=93.273628ms] [resolvedTs=430836713476849684]

[2022/01/30 11:17:55.771 +08:00] [WARN] [region_worker.go:743] ["The resolvedTs is fallen back in kvclient"] ["Event Type"=RESOLVED] [resolvedTs=430836713699672811] [lastResolvedTs=430836984350245604] [regionID=31134532]

TiDB server oom 监控

![img](https://pingcap.feishu.cn/space/api/box/stream/download/asynccode/?code=NjQ4OTJiYWM2NjdiYzg1Y2M2ZDdlMjk3ZDIyMGVmYzBfcUJ0YlJvRFExUEJwRnE2MzN3TUdIZW5uUlM3eDFLRzdfVG9rZW46Ym94Y25LajFxUFhiNXBBSGdXVHQ2NTJqbW9iXzE2NTAxNjM4NjU6MTY1MDE2NzQ2NV9WNA)

Tidb cdc 监控

![img](https://pingcap.feishu.cn/space/api/box/stream/download/asynccode/?code=NGM1NTk5NzJhMGY5YmE1ZWU5OGRlYzIyM2M2ODkwNWVfOTdieDg2UTZQdjEzUURNbkQwd1hsZnBKSE1WY0hJaUZfVG9rZW46Ym94Y252OENzelRJZlJZWGx0TjJTcWlKTXJiXzE2NTAxNjM4NjU6MTY1MDE2NzQ2NV9WNA)

## 问题排查

### TiDB server oom 原因排查

从相关慢查询中

初步排查结果是研发当时查询 dashboard 慢查询页面导致 tidb server 发生 oom

dashboard 的慢查询页面导致 oom，从 4.0 版本到 5.1.2 版本，曾经多次发生，目前版本还存在该问题，在未来的版本中会得到修复。

目前的缓解方案：

- 尽可能减少 slow-log 文件的数量比如定期做 slow log 的归档删除或设置 log.file.max-days，调大 slow query 的阈值 log.slow-threshold。
- 在查询时选择时间范围选小一点，比如一小时以内，并尽量避免多人并发查询 slow query 。
- 查询时尽量不要使用 order by 排序功能。

![img](https://pingcap.feishu.cn/space/api/box/stream/download/asynccode/?code=MTgxYjczMmNkZGYxOWZmMDYzY2Y4YWMwNmI5NjAxMTNfUkNuTlVaWk84RmVGeEVIeVBHV0VaNGlHQnlBQkJWQUpfVG9rZW46Ym94Y25Mdjd2NmdVQ3I4M284aHN3TFBxb1RjXzE2NTAxNjM4NjU6MTY1MDE2NzQ2NV9WNA)

目前 tidb 在分析 oom 问题上提供了一个 oom tracker 工具，能将当时的 top memory sql 以及 heap 统计到 tidb server 的 tmp 目录下以供分析，较以前版本来说，排查问题相对简单容易很多。

### TiCDC 问题排查

从监控中可以看到，在 tidb server oom 后，部分 tikv 节点中 resolved-lag 增大

![img](https://pingcap.feishu.cn/space/api/box/stream/download/asynccode/?code=NjcyMWM3NGUzNjA5MTA2NmM0ZjQ4NDMyODc0MDVlZTJfTkVVbkZpcXVIWnN1TXBVNW1HUUdtaTFQZWhaSFFVYnZfVG9rZW46Ym94Y25ZOVpPb0E5c0pYWDJWcjZENERXbGlnXzE2NTAxNjM4NjU6MTY1MDE2NzQ2NV9WNA)

通过 cdc 研发人员确认，tidb 在事务中对相关表加乐观或悲观锁，当 tidb server oom 后，相关锁未正常释放，且 region merge 会阻塞 resolveLock 功能，导致 lock 无法释放

在最新的 5.1.4 版本中，已经修复了该问题

![img](https://pingcap.feishu.cn/space/api/box/stream/download/asynccode/?code=NzI5Yjk0ZDJlZWVhNzYzY2JjNmYyNDU1ZTE5ZThjOGJfUXJWd1dEUHh5Tm45M1BWMTFqQm1kVEdNSDlZdlhIMGJfVG9rZW46Ym94Y25pRUtUc2NPQjN5Vmh2NlVhcEJBUFdiXzE2NTAxNjM4NjU6MTY1MDE2NzQ2NV9WNA)

## 问题处理

### 5.1.4 版本及之后版本

tidb server oom 后 cdc 进程 checkpointTs 不向前推进问题可以得到解决，不需要特别进行处理。

### 5.1.4 之前的版本需要手动处理

##### Workaround：

上一次出现类似问题，使用 select count(\*) from tb_name，通过对表做 count 操作来释放相关锁。

也有可能会遇到 count 表后没有恢复的情况。

如果是悲观锁的话，select count 无法解锁，也有可能锁存在于 index 上，select 需要使用 use index，即每一个 index 都 count 一次。

##### 如何判断 count 后锁是否被释放

当 count(\*)后启动 changefeed 进程且 cdc log 中出现大量"The resolvedTs is fallen back in kvclient"日志时，说明锁未被释放。释放锁之前建议暂停问题链路，问题链路会导致正常链路 checkpointTs 也不向前推进的情况。

问题修复：kv client 触发 resolved lock 的逻辑有问题，不能及时触发，详见：

https://github.com/pingcap/tiflow/issues/2867

## 相关信息

[fallback resolvedTs event skips the lock resolving unexpectly · Issue #3061 · pingcap/tiflow · GitHub](https://github.com/pingcap/tiflow/issues/3061)

https://github.com/tikv/tikv/pull/11991
