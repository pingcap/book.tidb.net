---
title: TiDB Operator配置TiDB集群故障自动转移 - TiDB 社区技术月刊
sidebar_label: TiDB Operator配置TiDB集群故障自动转移
hide_title: true
description: TiDB Operator 基于 statefulset 管理 pod 的部署和扩缩容,但 statefulset 在某些 Pod 或者节点发生故障时，不会自动创建新 Pod 来替换旧 Pod。为此，TiDB Operator 支持通过自动扩容 Pod 实现故障自动转移功能。本文将具体分享该原理。
keywords: [TiDB, TiDB Operator, 集群故障转移, 故障排查与诊断]
---

# TiDB Operator配置TiDB集群故障自动转移

> 作者：[lqbyz](https://tidb.net/u/lqbyz/answer)

TiDB Operator基于statefulset管理pod 的部署和扩缩容,但statefulset在某些Pod或者节点发生故障时**不会自动创建新Pod来替换旧Pod**。为此，TiDB Operator支持通过自动扩容Pod实现故障自动转移功能。

## 实现原理

TiDB 集群包括 PD、TiKV、TiDB、TiFlash、TiCDC 和 Pump 六个组件。目前 TiCDC 和 Pump 并不支持故障自动转移，PD、TiKV、TiDB 和 TiFlash 的故障转移策略会有所不同。

### PD故障转移

TiDB Operator 通过 `pd/health` PD API 获取 PD members 健康状况，并记录到 TidbCluster CR 的 `.status.pd.members` 字段中。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708578.png)

以一个有 3 个 Pod 的 PD 集群为例，如果其中一个 Pod 不健康超过 5 分钟（`pdFailoverPeriod` 可配置），TiDB Operator 将自动进行以下操作：

1. TiDB Operator 将此 Pod 信息记录到 TidbCluster CR 的 `.status.pd.failureMembers` 字段中。通过describe进行查询，如下图一
2. TiDB Operator 将此 Pod 下线：TiDB Operator 调用 PD API 将此 Pod 从 member 列表中删除，然后删掉 Pod 及其 PVC，如下图二。
3. StatefulSet controller 会重新创建此 Pod 并以新的 member 身份加入集群,如图三。
4. 在计算 PD StatefulSet 的 Replicas 时，TiDB Operator 会将已经被删除过的 `.status.pd.failureMembers` 考虑在内，因此会扩容一个新的 Pod。此时将有 4 个 Pod 同时存在，如图四。
5. 当原来集群中所有不健康的 Pod 都恢复正常时，TiDB Operator 会将新扩容的 Pod 自动缩容掉，恢复成原来的 Pod 数量，图五。

注意

- TiDB Operator 会为每个 PD 集群最多扩容 `spec.pd.maxFailoverCount` (默认 `3`) 个 Pod，超过这个阈值后不会再进行故障转移。
- 如果 PD 集群多数 member 已经不健康，导致 PD 集群不可用，TiDB Operator 不会为这个 PD 集群进行故障自动转移。

图一

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708595.png)

图二

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708508.png)

图三

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440707960.png)

图四

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708022.png)

图五

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708537.png)

### TiDB故障转移

TiDB Operator 通过访问每个 TiDB Pod 的 `/status` 接口确认 Pod 健康状况，并记录到 TidbCluster CR 的 `.status.tidb.members` 字段中。

用一个有 2 个 Pod 的 TiDB 集群为例，如果一个 Pod 不健康超过 5 分钟（`tidbFailoverPeriod` 可配置），TiDB Operator 将自动进行以下操作：

1. TiDB Operator 将此 Pod 信息记录到 TidbCluster CR 的 `.status.tidb.failureMembers` 字段中。
2. 在计算 TiDB StatefulSet 的 Replicas 时，TiDB Operator 会将 `.status.tidb.failureMembers` 考虑在内，因此会扩容一个新的 Pod。此时会有 3 个 Pod 同时存在。
3. 当原来集群中不健康的 Pod 恢复正常时，TiDB Operator 会将新扩容的 Pod 缩容掉，恢复成原来的 2个 Pod。

注意

TiDB Operator 会为每个 TiDB 集群最多扩容 `spec.tidb.maxFailoverCount` (默认 `3`) 个 Pod，超过这个阈值后不会再进行故障转移。

### TiKV故障转移

TiDB Operator 通过访问 PD API 获取 TiKV store 健康状况，并记录到 TidbCluster CR 的 `.status.tikv.stores` 字段中。

以一个有 3 个 Pod 的 TiKV 集群为例，当一个 TiKV Pod 无法正常工作时，该 Pod 对应的 Store 状态会变为 `Disconnected`。默认 30 分钟（可以通过 `pd.config` 中 `[schedule]` 部分的 `max-store-down-time = "30m"` 来修改）后会变成 `Down` 状态，然后 TiDB Operator 将自动进行以下操作：

1. 在此基础上再等待 5 分钟（可以通过 `tikvFailoverPeriod` 配置），如果此 TiKV Pod 仍未恢复，TiDB Operator 会将此 Pod 信息记录到 TidbCluster CR 的 `.status.tikv.failureStores` 字段中。
2. 在计算 TiKV StatefulSet 的 Replicas 时，TiDB Operator 会将 `.status.tikv.failureStores` 考虑在内，因此会扩容一个新的 Pod。此时会有 4 个 Pod 同时存在。

当原来集群中不健康的 Pod 恢复正常时，考虑到缩容 Pod 需要迁移数据，可能会对集群性能有一定影响**，TiDB Operator 并不会将新扩容的 Pod 缩容掉，而是继续保持 4 个 Pod**。

注意

TiDB Operator 会为每个 TiKV 集群最多扩容 `spec.tikv.maxFailoverCount` (默认 `3`) 个 Pod，超过这个阈值后不会再进行故障转移。

### TiFlash故障转移

TiDB Operator 通过访问 PD API 获取 TiFlash store 健康状况，并记录到 TidbCluster CR 的 `.status.tiflash.stores` 字段中。

以一个有 3 个 Pod 的 TiFlash 集群为例，当一个 TiFlash Pod 无法正常工作时，该 Pod 对应的 Store 状态会变为 `Disconnected`。默认 30 分钟（可以通过 `pd.config` 中 `[schedule]` 部分的 `max-store-down-time = "30m"` 来修改）后会变成 `Down` 状态，然后 TiDB Operator 将自动进行以下操作：

1. 在此基础上再等待 5 分钟（`tiflashFailoverPeriod` 可配置），如果此 TiFlash Pod 仍未恢复，TiDB Operator 会将此 Pod 信息记录到 TidbCluster CR 的 `.status.tiflash.failureStores` 字段中。
2. 在计算 TiFlash StatefulSet 的 Replicas 时，TiDB Operator 会将 `.status.tiflash.failureStores` 考虑在内，因此会扩容一个新的 Pod。此时会有 4 个 Pod 同时存在。

当原来集群中不健康的 Pod 恢复正常时，考虑到缩容 Pod 需要迁移数据，可能会对集群性能有一定影响，TiDB Operator 并不会将新扩容的 Pod 缩容掉，而是继续保持 4 个 Pod。

注意

TiDB Operator 会为每个 TiFlash 集群最多扩容 `spec.tiflash.maxFailoverCount` (默认 `3`) 个 Pod，超过这个阈值后不会再进行故障转移。

## 配置故障转移

故障自动转移功能在TiDB Operator中**默认开启。**

### TiDB Operator关于故障转移的配置

部署TiDB Operator时，可以在`charts/tidb-operator/values.yaml`文件中配置，TiDB 集群中 PD、TiKV、TiDB 和 TiFlash 组件故障转移的等待超时时间。示例如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708157.png)

其中，`pdFailoverPeriod`、`tikvFailoverPeriod`、`tiflashFailoverPeriod` 和 `tidbFailoverPeriod` 代表在确认实例故障后的等待超时时间，默认均为 5 分钟。超过这个时间后，TiDB Operator 就开始做故障自动转移。

### TiDB集群关于故障转移的配置

在配置 TiDB 集群时，可以通过 `spec.${component}.maxFailoverCount` 指定 TiDB Operator 在各组件故障自动转移时能扩容的 Pod 数量阈值。当 PD、TiDB、TiKV、TiFlash 这些组件的 Pod 或者其所在节点发生故障时，TiDB Operator 会触发故障自动转移，通过扩容相应组件补齐 Pod 副本数。

为避免故障自动转移功能创建太多 Pod，可以为每个组件配置故障自动转移时能扩容的 Pod 数量阈值，默认为 `3`。如果配置为 `0`，代表关闭这个组件的故障自动转移功能。配置示例如下：

```Go
  pd:
    maxFailoverCount: 3
  tidb:
    maxFailoverCount: 3
  tikv:
    maxFailoverCount: 3
  tiflash:
    maxFailoverCount: 3
```

具体集群实例如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1671440708105.png)

注意

对于以下情况，请显式设置 `maxFailoverCount: 0`：

- **集群中没有足够的资源以供 TiDB Operator 扩容新 Pod。该情况下，扩容出的 Pod 会处于 Pending 状态。**
- **不希望开启故障自动转移功能。**

## 关闭故障转移

### 集群级别关闭故障自动转移功能

在部署 TiDB Operator 时，请将 `charts/tidb-operator/values.yaml` 文件的 `controllerManager.autoFailover` 字段值配置为 `false`

```Bash
controllerManager:
...
# autoFailover is whether tidb-operator should auto failover when failure occurs
autoFailover: false
```

### 组件级别关闭故障自动转移功能

组件级别关闭故障自动转移功能，在创建 TiDB 集群时，可以将 TidbCluster CR 中对应组件的 `spec.${component}.maxFailoverCount` 字段值配置为 `0`。

```Bash
sped:
  ...
   pd:
    maxFailoverCount: 0
  tidb:
    maxFailoverCount: 0
  tikv:
    maxFailoverCount: 0
  tiflash:
    maxFailoverCount: 0
```