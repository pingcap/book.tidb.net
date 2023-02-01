---
title: TiDB上云之TiDB Operator - TiDB 社区技术月刊
sidebar_label: TiDB上云之TiDB Operator
hide_title: true
description: 如何在自家私有云或者共有云上部署TiDB集群？大家要知道，对于“云原生分布式数据库TiDB”这个PingCAP推广词来讲，TiDB在设计之初就考虑了Kubernetes的结合，怎么能让TiDB跑在云上呢？本文就介绍下TiDB上云的工具TiDB Operator。
keywords: [TiDB Cloud, Kubernetes, TiDB Operator, 架构]
---

# TiDB上云之TiDB Operator

> 作者：[代晓磊_Mars](https://tidb.net/u/%E4%BB%A3%E6%99%93%E7%A3%8A_Mars/answer)

如何在自家私有云或者共有云上部署TiDB集群？大家要知道，对于“云原生分布式数据库TiDB”这个PingCAP推广词来讲，TiDB在设计之初就考虑了Kubernetes的结合，怎么能让TiDB跑在云上呢？本文就介绍下TiDB上云的工具TiDB Operator。

## Kubernetes简介

在聊TiDB Operator之前先聊聊Kubernetes，下面的解释来自维基百科。

```none
Kubernetes（常简称为K8s）是用于自动部署、扩展和管理“容器化（containerized）应用程序”的开源系统。该系统由Google设计并捐赠给Cloud Native Computing Foundation（CNCF）来使用。
它旨在提供“跨主机集群的自动部署、扩展以及运行应用程序容器的平台”。它支持一系列容器工具，包括Docker等。
```

### Kubernetes 架构

![Kubernetes.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/Kubernetes-1667210570161.png)

Kubernetes 从角色来讲分为k8s master节点和node节点。 先看上图中绿色的master部分，master节点一般要求3个以上(保障高可用)，主要由以下几个核心组件组成：

- kube-apiserver：提供了资源操作的唯一入口，并提供认证、授权、访问控制、API 注册和发现等机制；
- kube-controller-manager：负责维护集群的状态，比如故障检测、自动扩展、滚动更新等；
- kube-scheduler：负责资源的调度，按照预定的调度策略将 Pod 调度到相应的机器上；
- etcd：保存了整个集群状态等元信息；

另外看下各个k8s集群的node节点（上图中蓝色部分）

- kubelet： 负责维持容器的生命周期，同时也负责 Volume（CVI）和网络（CNI）的管理；
- cAdvisor： 负责单节点内部的容器和节点资源使用统计，内置在 Kubelet 内部，并通过 Kubelet /metrics/cadvisor 对外提供 API；
- kube-proxy： 负责为 Service 提供 cluster 内部的服务发现和负载均衡；
- Pod：Kubernetes 使用 Pod 来管理容器，每个 Pod 可以包含一个或多个紧密关联的容器(sidecar)。

### K8s网络

在Kubernetes网络中存在两种IP（Pod IP和Service Cluster IP），Pod IP 地址是实际存在于某个网卡(可以是虚拟设备)上的，Service Cluster IP它是一个虚拟IP，是由kube-proxy使用Iptables规则重新定向到其本地端口，再均衡到后端Pod的。

### K8s Operator简介

Kubernetes Operator 是一种封装、部署和管理 Kubernetes 应用的方法。大家都知道，在k8s中管理 mysql/redis 等“有状态的服务”比较复杂，比如我们可以自己组合各种编排对象（Deplayment、StatefulSet、DaemonSet、Job等）来管理这些服务。Operator 的出现就是为了解决这种“复杂性”问题，使得我们更加灵活的管理 mysql/redis 等服务，Operator的底层还是使用 Kubernetes API 和 kubectl 工具在 Kubernetes 上部署并管理 Kubernetes 应用。

使用 Operator 可以自动化的事情包括：

- 按需部署应用/数据库服务
- 获取/还原应用状态的备份
- 处理升级以及配置改动
- 发布一个 service，要求不支持 Kubernetes API 的应用也能发现它
- 模拟整个或部分集群中的故障以测试其稳定性
- 在没有内部成员选举程序的情况下，为分布式应用选择Leader

## TiDB Operator特性

TiDB Operator 是 Kubernetes 上的 TiDB 集群自动运维系统，提供包括部署、升级、扩缩容、备份恢复、配置变更的 TiDB 全生命周期管理。借助 TiDB Operator，TiDB 可以无缝运行在公有云或私有部署的 Kubernetes 集群上，它具有以下特性：

- 安全地扩展TiDB集群

- TiDB Operator赋予了TiDB在云上的横向扩展能力。

- TiDB集群的滚动更新

- 对TiDB集群按顺序优雅地执行滚动更新，实现TiDB集群的零停机。

- 多租户支持

- 用户可以在一个Kubernetes集群上轻松部署和管理多个TiDB集群。

- 自动故障转移

- 当节点发生故障时，TiDB Operator会自动为您的TiDB集群进行故障切换。

- 支持 Kubernetes 包管理器

- 通过拥抱 Kubernetes 软件包管理器 Helm，用户只需一个命令就可以轻松部署 TiDB 集群。

- 创建时自动监控TiDB集群

  自动部署Prometheus，Grafana用于TiDB集群监控，支持以下功能。

  - 跨越多个namespace监控多个集群。
  - 多重复制。
  - 目标分片。
  - 动态更新配置和规则。
  - 集成Thanos监控框架。

- 异构集群

比如我想配置不同的tidb server分别给 OLTP 和 OLAP 使用，比如我想给不同的 tikv 配置不同的硬盘，在这些情况下，用户可以部署一个异构集群加入现有的集群。

PS:说的直白点，可以把 TiDB Operator 看做是 k8s 集群中的 “TiUP” 工具。

## TiDB Operator架构

![tidb-operator-overview.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tidb-operator-overview-1667210602023.png)

我们来聊下该架构：

- 左上角：CR（用户自定义资源）
- 可以看到 TidbCluster 就是用户自定义的资源，对于tidb集群的资源，我们可以通过定义一个CRD(CustomResourceDefinition)来将 TiDB 各个组件定义为统一的 TidbCluster 资源，大家有空可以去github查看下 [TiDB 集群 CRD 描述](https://raw.githubusercontent.com/pingcap/tidb-operator/master/manifests/crd.yaml)。
- 右上角：TiDB Pods
- 就是 TiDB 集群的 TiDB Server/PD/TiKV/TiFlash/Ticdc 等集群组件 Pods，每一个 TiDB 集群会对应存在一个 discovery Pod，用于该集群中组件发现其他已经创建的组件。
- 中间部分：TiDB Operator
  - tidb-controller-manager 
  - 包括 TiDB/PD/TiKV 等 Controller，这些控制器会不断对比 TidbCluster 对象中记录的期望状态与 TiDB 集群的实际状态，比如我们调整扩容了 tikv 的 replicas（ tikv 节点数增加），通过对比发现需要扩容 TiKV， TiKV Controller 调整 Kubernetes 中的资源以驱动 TiDB 集群满足期望状态，并根据其他 CR 完成相应的控制逻辑。
  - tidb-scheduler
  - 基于 Kubernetes 调度器扩展，它为 Kubernetes 调度器注入 TiDB 集群特有的调度逻辑，比如 TidbCluster 里面配置了 Pods 的亲和性，PD 和 TiKV 不能调度到同一个 nodes (宿主机)，这时 tidb-scheduler 就会根据调度逻辑来选择合适的 nodes。
- 底层模块
- 我想说的是 TiDB Operator 的各种功能和特性，都是基于 K8S 提供的基础能力( kube-scheduler、kube-apiserver、kube-controller-manager )来实现， 基于 CRD + Controller 模式开发自动化的应用程序管理程序，减少运维负担以及出错的可能性

[更多细节](https://docs.pingcap.com/zh/tidb-in-kubernetes/dev/architecture)

## 总结&彩蛋

可能有人对K8s还不了解，后面我会专门写一些云原生的文章。

彩蛋就是，后面我还会花2-3篇文章讲如何在自建的K8s集群部署TiDB Operator并且初始化一套新的TiDB集群，另外就是使用TiDB Operator 实现对集群的各种运维操作。
