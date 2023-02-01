---
title: TiDB Operator 高可用配置 - TiDB 社区技术月刊
sidebar_label: TiDB Operator 高可用配置
hide_title: true
description: 本文重点介绍如何配置 TiDB 集群以容忍其他级别的故障，例如机架、可用区或 region。
keywords: [TiDB, Operator, 高可用, 调度器]
---

# TiDB Operator 高可用配置

> 作者：[lqbyz](https://tidb.net/u/lqbyz/answer)

TiDB Operator 提供了自定义的调度器，该调度器通过指定的调度算法能在 host 层面保证 TiDB 服务的高可用。目前，TiDB 集群使用该调度器作为默认调度器，可通过 spec.schedulerName 配置项进行设置。本节重点介绍如何配置 TiDB 集群以容忍其他级别的故障，例如机架、可用区或 region。

TiDB 是分布式数据库，它的高可用需要做到在任一个物理拓扑节点发生故障时，不仅服务不受影响，还要保证数据也是完整和可用。因此TiDB的高可用需要从Tidb服务高可用和数据的高可用进行说明。

## TiDB服务高可用

通过 nodeSelector 调度实例

通过各组件配置的 `nodeSelector` 字段，可以约束组件的实例只能调度到特定的节点上。关于 `nodeSelector` 的更多说明，请参阅K8S官方说明 [nodeSelector](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#nodeselector)。

```Bash
apiVersion: pingcap.com/v1alpha1
kind: TidbCluster
# ...
spec:
  pd:
    nodeSelector:
      node-role.kubernetes.io/pd: true
    # ...
  tikv:
    nodeSelector:
      node-role.kubernetes.io/tikv: true
    # ...
  tidb:
    nodeSelector:
      node-role.kubernetes.io/tidb: true
    # ...
```

### 通过 tolerations 调度实例

通过各组件配置的 `tolerations` 字段，可以允许组件的实例能够调度到带有与之匹配的[污点](https://kubernetes.io/docs/reference/glossary/?all=true#term-taint) (Taint) 的节点上。关于污点与容忍度的更多说明，请参阅 [Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)。

```YAML
apiVersion: pingcap.com/v1alpha1
kind: TidbCluster
# ...
spec:
  pd:
    tolerations:
      - effect: NoSchedule
        key: dedicated
        operator: Equal
        value: pd
    # ...
  tikv:
    tolerations:
      - effect: NoSchedule
        key: dedicated
        operator: Equal
        value: tikv
    # ...
  tidb:
    tolerations:
      - effect: NoSchedule
        key: dedicated
        operator: Equal
        value: tidb
    # ...
```

### 通过 affinity 调度实例

配置 `PodAntiAffinity` 能尽量避免同一组件的不同实例部署到同一个物理拓扑节点上，从而达到高可用的目的。关于 Affinity 的使用说明，请参阅 [Affinity & AntiAffinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#affinity-and-anti-affinity)。

下面是一个典型的高可用设置例子：

```Bash
affinity:
 podAntiAffinity:
   preferredDuringSchedulingIgnoredDuringExecution:
   # this term works when the nodes have the label named region
   - weight: 10
     podAffinityTerm:
       labelSelector:
         matchLabels:
           app.kubernetes.io/instance: ${cluster_name}
           app.kubernetes.io/component: "pd"
       topologyKey: "region"
       namespaces:
       - ${namespace}
   # this term works when the nodes have the label named zone
   - weight: 20
     podAffinityTerm:
       labelSelector:
         matchLabels:
           app.kubernetes.io/instance: ${cluster_name}
           app.kubernetes.io/component: "pd"
       topologyKey: "zone"
       namespaces:
       - ${namespace}
   # this term works when the nodes have the label named rack
   - weight: 40
     podAffinityTerm:
       labelSelector:
         matchLabels:
           app.kubernetes.io/instance: ${cluster_name}
           app.kubernetes.io/component: "pd"
       topologyKey: "rack"
       namespaces:
       - ${namespace}
   # this term works when the nodes have the label named kubernetes.io/hostname
   - weight: 80
     podAffinityTerm:
       labelSelector:
         matchLabels:
           app.kubernetes.io/instance: ${cluster_name}
           app.kubernetes.io/component: "pd"
       topologyKey: "kubernetes.io/hostname"
       namespaces:
       - ${namespace}
```

### 通过 topologySpreadConstraints 实现 Pod 均匀分布

配置 `topologySpreadConstraints` 可以实现同一组件的不同实例在拓扑上的均匀分布。具体配置方法请参阅 [Pod Topology Spread Constraints](https://kubernetes.io/docs/concepts/workloads/pods/pod-topology-spread-constraints/)。

如需使用 `topologySpreadConstraints`，需要满足以下条件：

- Kubernetes 集群使用 `default-scheduler`，而不是 `tidb-scheduler`。详情可以参考 [tidb-scheduler 与 default-scheduler](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/tidb-scheduler#tidb-scheduler-%E4%B8%8E-default-scheduler)。
- Kubernetes 集群开启 `EvenPodsSpread` feature gate。如果 Kubernetes 版本低于 v1.16 或集群未开启 `EvenPodsSpread` feature gate，`topologySpreadConstraints` 的配置将不会生效。

`topologySpreadConstraints` 可以设置在整个集群级别 (`spec.topologySpreadConstraints`) 来配置所有组件或者设置在组件级别 (例如 `spec.tidb.topologySpreadConstraints`) 来配置特定的组件。

```Bash
[root@k8s-master tidb]# cat tidb.yaml
apiVersion: pingcap.com/v1alpha1
kind: TidbCluster
metadata:
  name: lqb
  namespace: tidb

spec:
  version: "v6.1.0"
  timezone: Asia/Shanghai
  hostNetwork: false
  imagePullPolicy: IfNotPresent

  enableDynamicConfiguration: true
  configUpdateStrategy: RollingUpdate
###Pod 拓扑分布约束，以主机名或区域为准，该配置能让同一组件的不同实例均匀分布在不同 zone 和节点上。

  topologySpreadConstraints:
  - topologyKey: kubernetes.io/hostname
  - topologyKey: topology.kubernetes.io/zone

  
  pd:
  ....
  tidb
  ...
  tikv
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673258585970.png)

当前 `topologySpreadConstraints` 仅支持 `topologyKey` 配置。在 Pod spec 中，上述示例配置会自动展开成如下配置：

```YAML
topologySpreadConstraints:
- topologyKey: kubernetes.io/hostname
  maxSkew: 1
  whenUnsatisfiable: DoNotSchedule
  labelSelector: <object>
- topologyKey: topology.kubernetes.io/zone
  maxSkew: 1
  whenUnsatisfiable: DoNotSchedule
  labelSelector: <object>
```

## 数据的高可用

在 Kubernetes 上支持数据高可用的功能，需要如下操作：

### 为 PD 设置拓扑位置 Label 集合

用 Kubernetes 集群 Node 节点上描述拓扑位置的 Label 集合替换 `pd.config` 配置项中里的 `location-labels` 信息。

### 为 TiKV 节点设置所在的 Node 节点的拓扑信息

TiDB Operator 会自动为 TiKV 获取其所在 Node 节点的拓扑信息，并调用 PD 接口将这些信息设置为 TiKV 的 store labels 信息，这样 TiDB 集群就能基于这些信息来调度数据副本。

如果当前 Kubernetes 集群的 Node 节点没有表示拓扑位置的 Label，或者已有的拓扑 Label 名字中带有 `/`，可以通过下面的命令手动给 Node 增加标签：

```Bash
kubectl label node ${node_name} region=${region_name} zone=${zone_name} rack=${rack_name} kubernetes.io/hostname=${host_name}
```

其中 `region`、`zone`、`rack`、`kubernetes.io/hostname` 只是举例，要添加的 Label 名字和数量可以任意定义，只要符合规范且和 `pd.config` 里的 `location-labels` 设置的 Labels 保持一致即可。

### 为 TiDB 节点设置所在的 Node 节点的拓扑信息

从 TiDB Operator v1.4.0 开始，如果部署的 TiDB 集群版本 >= v6.3.0，TiDB Operator 会自动为 TiDB 获取其所在 Node 节点的拓扑信息，并调用 TiDB server 的对应接口将这些信息设置为 TiDB 的 Labels。这样 TiDB 可以根据这些 Labels 将 [Follower Read](https://docs.pingcap.com/zh/tidb/stable/follower-read) 的请求发送至正确的副本。

目前，TiDB Operator 会自动为 TiDB server 设置 `pd.config` 的配置中 `location-labels` 对应的 Labels 信息。同时，TiDB 依赖 `zone` Label 支持 Follower Read 的部分功能。TiDB Operator 会依次获取 Label `zone`、`failure-domain.beta.kubernetes.io/zone` 和 `topology.kubernetes.io/zone` 的值作为 `zone` 的值。TiDB Operator 仅设置 TiDB server 所在的节点上包含的 Labels 并忽略其他 Labels。

## 总结

从 TiDB Operator v1.4.0 开始，在为 TiKV 和 TiDB 节点设置 Labels 时，TiDB Operator 支持为部分 Kubernetes 默认提供的 Labels 设置较短的别名。使用较短的 Labels 别名在部分场景下有助于优化 PD 的调度性能。当使用 TiDB Operator 把 PD 的 `location-labels` 设置为这些别名时，如果对应的节点不包含对应的 Labels，TiDB Operator 自动使用原始 Labels 的值。

目前 TiDB Operator 支持如下短 Label 和原始 Label 的映射：

- `region：对应 topology.kubernetes.io/region 和 failure-domain.beta.kubernetes.io/region。`
- `zone：对应 topology.kubernetes.io/zone 和 failure-domain.beta.kubernetes.io/zone。`
- `host：对应 kubernetes.io/hostname。`

如果 Kubernetes 的各个节点上均没有设置 `region`、`zone` 和 `host` 这些 Labels，将 PD 的 `location-labels` 设置为 `["topology.kubernetes.io/region", "topology.kubernetes.io/zone", "kubernetes.io/hostname"]` 与 `["region", "zone", "host"]` 效果完全相同。
