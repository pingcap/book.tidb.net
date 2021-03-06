---
title: PingCAP Clinic 服务：贯穿云上云下的 TiDB 集群诊断服务
hide_title: true
---

# PingCAP Clinic 服务：贯穿云上云下的 TiDB 集群诊断服务

**作者：乔丹，PingCAP 产品经理**

> 伴随着 TiDB 6.0 的发布，PingCAP Clinic 服务也揭开了她的面纱，提供 Tech Preview 版本给广大用户试用。 Clinic 服务源于 TiDB Cloud， 以智能诊断提升 TiDB Cloud SLA ，以 AIOPS 方式降低 TiDB Cloud 成本；同时 Clinic 也会将 Cloud 中积累的诊断经验、运维最佳实践以诊断服务方式提供给本地部署的集群，使所有的云下用户也从中受益。
>
> 本次发布的 Tech Preview 版本，对本地部署的用户提供了诊断数据的快速采集和诊断环境的线上复现，当 TiDB 集群遇到问题，邀请 PingCAP 技术支持人员协助远程定位时，或者在 AskTUG 社区提问时，通过 Clinic 服务采集并上传诊断数据，将大大加快问题定位的速度。

## Clinic 在 TiDB Cloud 中的应用

小吴是 TiDB Cloud 的技术工程师，在协助 TiDB Cloud 用户进行 POC 时，需要实时关注客户集群的健康状态和各种监控指标，根据客户的业务压力指标，推荐最优的集群拓扑配置和数据库参数配置；当用户集群出现异常时，及时分析并解决问题，保证集群 SLA。

### Clinic 诊断场景

小吴登录到 Clinic 诊断服务，可以快速查询到用户所在集群的各个时间段的诊断数据。Clinic 将 TiDB Cloud 平台上的日志、监控指标等诊断数据实时导出、安全存储，并提供可视化的展示。

除了基础查看以外，Clinic 还提供智能分析。

### 智能分析延迟问题

某个用户抱怨这段时间的延迟突然变大了，小吴同学会很直觉地去找在系统哪个环节哪个实例中耗时更大，这似乎不是一件很难的事情，但是他需要在各个 Grafana 面板之间反复横跳地查找瓶颈，并从中众多节点中找出一个问题节点，这是一件费时费力并且考验耐心的工作。 Clinic 诊断服务的智能分析很贴心地直接为小吴准备好了结果如下： 

![4.jpg](https://img1.www.pingcap.com/prod/4_73c5fabfb0.jpg)

在诊断延迟变大问题时，识别当前的负载类型也是一个重要的步骤。如果只是单单看读写的比例可能还好，但是如果要看哪个实例间的读写不平衡度呢？现在有些用户集群的 TiKV 实例已经达到数十甚至上百，想要分析这些实例上的读写不平衡，几乎是一件不适宜人眼工作的事情。但对于机器来说，计算这些并不是一个难事，Clinic 会结合上述问题时间段(比如延迟升高时)，给出这段时间内不平衡度与平时（基线数据）的区别。下图是一个智能分析输出的例子： 

![5.jpg](https://img1.www.pingcap.com/prod/5_8ffeb6f230.jpg)

从上图的分析上可以看出，在问题时间段内，点读请求和 coprocessor 读请求比平时上升，小吴可以根据这个线索继续定位。

### 智能日志聚类分析

小吴同学除了分析 Metrics ，也要对集群日志进行分析查看。咱们 TiDB 集群的日志量是相当惊人的，组件再正交上实例，这个工作量也是非常大的。Clinic 提供智能日志聚类，帮助小吴同学在海量的日志中快速发现问题。

日志聚类将每个时间段内的不同日志的趋势以可视化的方式展示，哪类日志的数量发生了突变，哪个实例的日志数量发生了突变，小吴同学一目了然，抓大放小，迅速聚焦到主要矛盾上。从下图来看，当前时间段，TiDB 集群处理最多的是红框中的两件事，数量占比多的可以考虑优先排查。 ![6.jpg](https://img1.www.pingcap.com/prod/6_b9b6211f09.jpg)

### TiDB Cloud 场景小结

Clinic 的智能诊断还处于初级阶段，在近期还会有更多的分析模型上线并应用到 TiDB Cloud 的诊断中，在实战中不断的训练模型，输出高准确率的问题判断规则，提前发现集群风险点，提高问题修复速度，从而不断提升 TiDB Cloud 服务的 SLA。

## Clinic 助力云下本地部署集群的问题诊断

Clinic 诊断服务在 TiDB Cloud 上为小吴带来了巨大的帮助，我们把 Clinic 的功能也提供给本地部署的集群，让云下集群也能使用该功能进行问题诊断，这样可以大大加速用户问题的解决。

在 Tech Preview 阶段，Clinic 中数据导出、诊断环境重建的功能开放给了本地部署的集群。当本地部署的TiDB集群遇到问题，邀请 PingCAP 技术支持人员协助远程定位时，或者在 AskTUG 社区提问时，通过 Clinic 服务采集并上传诊断数据，将大大加快问题定位的速度。

> 注意： Clinic 的智能分析相关功能暂时未在 Tech Preview 阶段开放给本地部署的集群。我们需要在 TiDB Cloud 中做更多的数据训练，当分析模型的准确度和计算成本都达到一定标准后，即会对云下的集群开放。

### 数据采集和上传

小宇是 TiDB 集群的 DBA，近期集群接入了一个新的上层业务，集群出现性能问题， 小宇向 PingCAP 技术支持上报了问题，期望能尽快得到优化的建议。

在以往的类似场景中，上报问题以后，PingCAP 技术支持会要求小宇上传各种诊断信息，小宇需要去集群上手动执行多个复杂的命令，包括抓取各个节点的日志文件、使用 Metrics Tool 逐个 Dashboard 保存数据等，一套采集、沟通和传送数据，往往就花了大半天时间。如今 PingCAP 技术支持同学建议小宇使用 Clinic 的采集工具，只需要一条命令，快速完成数据采集，然后直接上传数据分享给技术支持。

小宇运行一条简单的命令，就能采集最近 2 小时的集群各节点日志、metrics、配置项、硬件参数信息：

```
tiup diag collect ${cluster-name}
```

采集完成后，直接上传至 Clinic 服务：

```
tiup diag upload ${filepath} 
```

### Clinic 的诊断环境复现

数据上传后，小宇登录 Clinic，就能可视化的查看自己的诊断数据。将数据链接分享给 PingCAP 技术支持以后，PingCAP 技术专家也能立即查看全面的诊断数据，加速问题定位。

**查看 Metrics**

支持在线查看 Metrics，提供多个 Grafana Dashboard 模板以方便查看。 

import useBaseUrl from '@docusaurus/useBaseUrl';

<img src={useBaseUrl('https://img1.www.pingcap.com/prod/1_df60c56cdc.gif')} />

**查看日志**

支持在线查看日志，可以通过各种过滤条件高效查看日志。 

<img src={useBaseUrl('https://img1.www.pingcap.com/prod/2_76db9cd024.gif')} />

**查看慢查询**

支持在线查看慢查询信息，与在集群内部的 TiDB Dashboard 上看到的信息一致。 

<img src={useBaseUrl('https://img1.www.pingcap.com/prod/3_6174eb7ee7.gif')} />

## Clinic 的未来

Clinic 服务的发布，代表 PingCAP 会在保证数据库的健康运行方面持续地投入，Clinic 的最终愿景是通过 TiDB Cloud 的技术积淀，整体提升云上云下 TiDB 集群的稳定性，降低运维成本，让数据库的运维更简单。

Clinic 服务后续发展的方向主要集中在这几点：

- 云上云下兼顾：Clinic 服务始终坚持在云上做技术沉淀，将云上积累的经验通过诊断服务、运维服务的方式提供给云下集群 ，让所有部署类型的集群都受益。
- AI for DB：Clinic 服务使用最新的 AI 技术，由数据库领域专家和 AI 领域专家深入合作进行模型建立和训练，最大限度地借助 AI 能力进行问题预判、问题诊断和根因排查。
- 数据库自治服务：Clinic 服务逐步实现数据库自预判、自优化、自修复，以自治的方式替代人工运维操作，帮助用户消除数据库管理的复杂性及人工操作引发的服务故障，及时分析并解决问题，保证集群稳定运行。