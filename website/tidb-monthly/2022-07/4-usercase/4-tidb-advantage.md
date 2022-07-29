---
title: 黄东旭：TiDB的优势是什么？ - TiDB 社区技术月刊
sidebar_label: 黄东旭：TiDB的优势是什么？
hide_title: true
description: 分布式实验室特约记者 Marico 采访了 PingCAP 联合创始人兼 CTO 黄东旭，从 PingCAP 明星级产品优势、如何保障开源产品的活力等方面进行了交流。
keywords: TiDB, PingCAP, 黄东旭, Marico, TiKV, ChaosMesh, CNCF
---

# 黄东旭：TiDB的优势是什么？

> **作者**：分布式实验室公众号

“云原生”、“分布式”，近几年云原生概念热度不减，成为了许多开发人员关注的焦点。在 CNCF 云原生基金会数据库领域，PingCAP 已毕业的项目 TiKV 与 TiDB 帮助了很多企业解决了传统数据库遇到的瓶颈性问题。未来数据库领域还有哪些想象空间？分布式实验室特约记者 Marico 采访了 PingCAP 联合创始人兼 CTO 黄东旭，从 PingCAP 明星级产品优势、如何保障开源产品的活力等方面进行了交流。

**Marico：TiDB 行式数据引擎 TiKV，目前也是在 CNCF 中也是一个极其优秀的项目。相较于 Redis 一类的 KV 存储，TiKV 具有哪些独特的优势？更加适用于哪些业务场景？**

黄东旭：

![cf3d97c02bf36bd23d9b00bc3fbeaf80.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/cf3d97c02bf36bd23d9b00bc3fbeaf80-1657853551533.png)

（当时 TiKV 刚加入 CNCF 的时候我发的一条 Tweet）

其实我们一开始受到 Google Spanner 和 F1 的影响，目标是构建 TiDB，一个分布式/支持 ACID 事务能力以及超强的高可用的能力的 SQL 数据库（关系型数据库）。

Google 的存储系统有个特点：模块之间的边界划分是很清晰的，例如 F1 是无状态的 SQL 层，Spanner 是分布式存储层，我很喜欢这种设计思想，所以 TiDB 也沿袭了这个思路，根据 Spanner 的论文描述， Spanner 在早期是一个和 BigTable 类似的表格系统（类似 KV 的接口，虽然在后来 Spanner 本身也加入 SQL 的支持），TiKV 其实就是类似 Spanner/F1 的组合中的 Spanner 部分，TiKV 最大的特点和 Spanner 一样，支持透明的分布式事务，传统的 NoSQL 几乎都没有支持跨行事务的能力，但是对于构建一个关系型数据库（TiDB）来说，事务能力是至关重要的。

另外 TiKV 的一个特点是使用了 Raft 共识算法来做为内部数据分片的多副本复制，比起传统的主从复制，我认为基于 Raft 或者 Paxos 这样分布式共识算法能给数据库带来更好可用性。

题目中提到了 Redis，Redis 是一个内存数据库，对于数据的持久化和高可用其实并不太关注，所以通常作为缓存的场景（因为能接受数据的丢失），但是 TiKV 是支持持久化和强一致的，同时默认多副本（Redis 通常为了追求低延迟不会配置副本策略）。

我认为大多数分布式系统，如果有一个支持 ACID 事务的分布式存储，能够节省很多的工作量，例如你想要做一个分布式文件系统，那么你肯定需要一个元信息的存储（用于存放目录文件结构，inode 等元信息），这个元信息系统通常是整个项目对数据一致性和安全性最高的模块，而且通常也有水平扩展的需求，这时候如果使用 TiKV 这样的支持事务和高可用的分布式 KV 数据库就能极大的降低构建大型系统的复杂性。

**Marico：相较于云厂商提供的数据库解决方案，TiDB 更具哪些优势？**

黄东旭：从产品层面来说：

1. TiDB 是采用和 Spanner 类似的 Shared-nothing 的设计，这意味着对于读写来说都能很好的水平拓展，从小数据规模（<1TB）到超过 500TB 的超大规模集群我们都有生产环境的案例，能够证明 TiDB 的扩展能力。
2. TiDB 提供标准的 SQL，兼容 MySQL 协议，会让应用开发变得很简单，应用开发者不需要关心分布式系统复杂的细节，不需要关心数据分片，也不需要关心高可用，这些能力都是 TiDB 内置的
3. TiDB 内部提供一个名为 TiFlash 的存储引擎，TiFlash 的特点是：它是列式存储，开启这个存储引擎后，一些复杂的 SQL 查询会通过列存加速，所以 TiDB 能提供实时分析能力，另外和第二点类似，用户也不需要关心行-列之间的数据同步问题。
4. TiDB 对于部署环境是中立的，TiDB 也不同公有云，包括阿里云/AWS/GCP 上有托管服务，另外，对于用户来说，也可以自己部署。所以跨云，甚至跨云上云下的统一体验是重要的优势。

另外从社区层面来说，TiDB 拥有庞大的开源社区生态，使用一个数据库，我认为最重要是这个数据库的生态有没有生命力，例如：如果遇到了问题，是否在网上有足够多的资料？是否有活跃的用户社区？如果使用商业服务，背后是否有商业公司支持？这点我认为是 TiDB 很独特的优势。

**Marico：计算与存储分离、内置化的分表分库，行式存储与列示存储，随着数据库承担着越来越繁重的任务，未来数据库还能给我们提供哪些想象呢？**

黄东旭：我认为对于数据库，甚至所有基础软件来说，一个最重要的趋势是：对于应用开发者来说越来越自然。

题目中提到的，分库分表/行-列存储，我认为这些都是很不自然的概念，仔细想想，我作为一个应用开发者在开发应用逻辑，为什么需要我把明明就应该在一起的数据拆散（分库分表）？其实是因为过去的数据库技术已经不能适应现代应用的需求，这些问题应该由数据库层面解决，而不是将复杂度转嫁给应用开发者。用一个类比：在自动挡的汽车发明出来后，会开手动挡的司机就越来越少了。

所以根据这个方向去想，我认为高学习门槛的技术（尤其是和底层实现细节相关的），例如：数据库性能调优，故障诊断，索引优化……这些技术可能都会在未来的数据库中变得很简单。这方面我很看好数据库技术与 AI 的结合（AI4DB）。

**Marico：PingCAP 现在着力在发展的是 ChaosMatrix，Chaos 混沌工程与 TiDB 的工程领域并不相同，为什么 PingCAP 会选择参与混沌工程赛道？**

黄东旭：ChaosMesh 并不是主业，它其实本来就是我们构建 TiDB 的过程中开发的一个内部工具。我认为构建一个数据库，最难的地方不是在于如何做出来，而是在于如何证明做对了，所以质量保证体系对于任何数据库厂商都是一个非常重要课题，其中混沌工程是测试分布式系统常用的一个手段，所以我们为了测试 TiDB，就做了 ChaosMesh，后来发现这个东西好像也可以测测其他系统，而且市面上也缺乏一个云原生的，好用的混沌测试系统，看来看去好像还真没有 ChaosMesh 那么好用的，于是就开源出来了，也许能帮到别人，后来没想到那么受欢迎，还挺欣慰的。

**Marico：Docs 文档对于贵司的产品进行了详细的概述，且列举了很多实际应用场景。我想知道 PingCAP 是如何进行产品文档的维护的？是否存在一定的准则规范？**

黄东旭：是的，我觉得对于一个数据库来说，文档也是产品质量的一部分，所以要像对待代码一样对待文档，例如一个简单的例子，我们的文档都是和版本对应的，每个不同的版本都有对应的文档。而且作为一个开源软件，文档本身也应该是开源的，我们的文档的源码也都是完全托管在 GitHub 上，也有着自己的自动构建系统，另外有详细的贡献指南和规范：https://github.com/pingcap/docs-cn/blob/master/CONTRIBUTING.md

另外，由于 TiDB 本身是个国际化项目，英文和中文文档都是1:1对应的，而且多数时候都是先有英文文档，然后才有中文，这个也是一个比较特别的。

**Marico：CNCF 一直以来也孵化了很多优秀的开源项目，PingCAP 作为常年活跃于 CNCF 的中国企业，对于云原生市场的发展较为关注，为什么云原生市场拥有这么大的魅力？**

黄东旭：就像上面我提到的，云是一个极大降低开发者构建应用门槛的东西，它基本改变了开发者开发软件的模式，所以我认为是不亚于个人计算机普及的重要里程碑，而且对于数据库厂商来说，在云上提供服务是一个更加可以规模化的商业模式，以为：

1. 云上的环境相比云下是更标准的，在服务过程中，能自动化的东西都会被自动化
2. 云提供 Pay-as-you-go 的基础设施，让软件提供商真正变成轻资产的公司，加速服务交付的效率
3. 云的定价和付费，相对云下是透明的，这也会提升商业化的效率

**Marico：个人作为一个开发者，也使用了 GitHub 上贵司开源的很多优秀类库。但是我也发现，大多数类库都选用了 Apache 开源协议，为什么采用自由度较高的开源协议？对产品商业化会造成一定的阻碍么？**

黄东旭：我认为对于数据库软件来说不会，我认为数据库软件商业化的终点会是云服务（DBaaS），开源用户其实是很好的潜在客户群体，另外用一个比喻：假设你是开饭店的，你应该不会认为所有自己买菜在家做菜的人都是你的障碍吧？