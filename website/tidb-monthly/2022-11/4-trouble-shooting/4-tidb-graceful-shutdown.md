---
title: TiDB 的 graceful shutdown - TiDB 社区技术月刊
sidebar_label: TiDB 的 graceful shutdown
hide_title: true
description: 应用通过负载均衡链接 TiDB，使用 tiup cluster upgrade 滚动升级集群时，应用报 connection refused。本文将基于 TiDB v6.1.2 分析该现象原因。
keywords: [TiDB, graceful shutdown, 负载均衡, ]
---

# TiDB 的 graceful shutdown

> 作者：[yiduoyunQ](https://tidb.net/u/yiduoyunQ/answer)

## 现象

应用通过负载均衡链接 TiDB，使用 [tiup cluster upgrade](https://docs.pingcap.com/zh/tidb/stable/tiup-component-cluster-upgrade) 滚动升级集群时，应用报 connection refused。以下基于 TiDB v6.1.2 分析该现象原因。

## 只看结论

- 当前（v6.1.2 及以下）TiDB 采用带 timeout 的 graceful shutdown 机制。
- 无论是否配置 [graceful-wait-before-shutdown](https://docs.pingcap.com/zh/tidb/stable/tidb-configuration-file#graceful-wait-before-shutdown-%E4%BB%8E-v50-%E7%89%88%E6%9C%AC%E5%BC%80%E5%A7%8B%E5%BC%95%E5%85%A5)，滚动升级期间应用均会感知报错。
- PR [#37441](https://github.com/pingcap/tidb/pull/37441) 和 Issues [#32110](https://github.com/pingcap/tidb/issues/32110) 会有优化，但彻底解决问题需要等 [session manager](https://github.com/pingcap/tidb/blob/master/docs/design/2022-07-20-session-manager.md) 实现。
- 建议滚动升级操作在运维窗口期或业务低峰期实施，应用端增加错误重试机制。

## TiDB graceful shutdown 流程

[tiup cluster upgrade](https://docs.pingcap.com/zh/tidb/stable/tiup-component-cluster-upgrade) 通过发送 SIGTERM 信号给 TiDB 实现滚动升级重启，TiDB 接收 SIGTERM 信号后触发 graceful shutdown。

```
 [2022/11/03 14:11:19.674 +08:00] [INFO] [signal_posix.go:54] ["got signal to exit"] [signal=terminated]
 [2022/11/03 14:11:19.674 +08:00] [INFO] [server.go:460] ["setting tidb-server to report unhealthy (shutting-down)"]
 [2022/11/03 14:11:19.674 +08:00] [ERROR] [http_status.go:476] ["start status/rpc server error"] [error="accept tcp [::]:10080: use of closed network connection"]
 [2022/11/03 14:11:19.674 +08:00] [ERROR] [http_status.go:471] ["http server error"] [error="http: Server closed"]
 [2022/11/03 14:11:19.674 +08:00] [ERROR] [http_status.go:466] ["grpc server error"] [error="mux: server closed"]
 [2022/11/03 14:11:19.675 +08:00] [INFO] [server.go:767] ["[server] graceful shutdown."]
```

当前（v6.1.2 及以下） TiDB 处理 SIGTERM 信号时，[判断 graceful 的结果会是 false](https://github.com/pingcap/tidb/blob/v6.1.2/util/signal/signal_posix.go#L55)，因此最终调用 cleanup 时会走到 [TryGracefulDown](https://github.com/pingcap/tidb/blob/v6.1.2/tidb-server/main.go#L779)，使用带 timeout（[固定 15s](https://github.com/pingcap/tidb/blob/v6.1.2/server/server.go#L746)）的 graceful shutdown 机制。

具体 graceful shutdown 流程如下：

- TiDB 收到 SIGTERM 信号后，[先切换为下线状态并关闭所有服务](https://github.com/pingcap/tidb/blob/v6.1.2/tidb-server/main.go#L212)。

  - 切换为 [inShutdownMode](https://github.com/pingcap/tidb/blob/v6.1.2/server/server.go#L462) 状态，此时当接收到新的链接请求时[直接返回 500 报错](https://github.com/pingcap/tidb/blob/v6.1.2/server/http_status.go#L510-L516)。
  - 等待 [graceful-wait-before-shutdown](https://docs.pingcap.com/zh/tidb/stable/tidb-configuration-file#graceful-wait-before-shutdown-%E4%BB%8E-v50-%E7%89%88%E6%9C%AC%E5%BC%80%E5%A7%8B%E5%BC%95%E5%85%A5) 后，[关闭所有服务](https://github.com/pingcap/tidb/blob/v6.1.2/server/server.go#L479-L497)，拒绝新的链接请求。

- 接着执行 [cleanup](https://github.com/pingcap/tidb/blob/v6.1.2/tidb-server/main.go#L213) 处理已建链请求

  - 对未在事务中处于 idle 状态的链接，从 server 端尝试关闭链接。
  - 其他情况的链接，每秒重新探测一次状态。

- 若超过 15s timeout 时间，最终 [kill 所有链接](https://github.com/pingcap/tidb/blob/v6.1.2/server/server.go#L758)。

## graceful-wait-before-shutdown的问题

- 默认 0s 的情况下，TiDB 收到 SIGTERM 信号后会立刻关闭所有服务，此时应用端通过负载均衡尝试建立新链接会报 **connection refused**。
- 通过配置 graceful-wait-before-shutdown 可以推迟关闭所有服务，让负载均衡的健康探测有窗口机会主动将 TiDB 节点摘除，但在时间窗口内应用端通过负载均衡尝试建立新链接仍会报 **Internal Server Error 500** 的错误。

因此 graceful-wait-before-shutdown 没有解决根本问题，无论配置与否应用端都会报错，直到负载均衡的健康探测将 TiDB 节点摘除或 TiDB 重新启动恢复服务。

## 当前正在做的优化

PR [#37441](https://github.com/pingcap/tidb/pull/37441) 将 graceful shutdown 机制更改为无限等待（最新的 v6.3.0 DMR 已带上了该 PR），Issues [#32110](https://github.com/pingcap/tidb/issues/32110) 中解决 ongoing txn 的问题。

优化后可以解决：

- graceful shutdown 超过 15s 直接 kill，不够优雅。
- 目前每秒重新探测一次链接状态，当链接上持续不断执行事务时，几乎不可能探测到链接处于不在事务的 idle 状态。

无法解决：

- 长时间执行的批量大事务。
- graceful-wait-before-shutdown 的问题。

中长期规划：

通过增加一层 [session manager](https://github.com/pingcap/tidb/blob/master/docs/design/2022-07-20-session-manager.md) 彻底解决问题。

## 建议

tidb 滚动升级操作建议放在运维窗口或业务低峰期实施，应用端增加错误重试机制。