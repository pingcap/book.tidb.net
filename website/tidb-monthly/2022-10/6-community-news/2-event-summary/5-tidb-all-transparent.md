---
title: 唐刘-透明一切，是我们在复杂环境下与客户建立信任的最佳途径-PingCAP 用户峰会回顾- TiDB 社区技术月刊
sidebar_label: 唐刘-透明一切，是我们在复杂环境下与客户建立信任的最佳途径-PingCAP 用户峰会回顾
hide_title: true
description: PingCAP 研发副总裁唐刘、PingCAP 中国区技术服务总经理李超群从 PingCAP 的自主开源、工程研发体系、产品未来技术演进方向等方面，分享了 PingCAP 如何通过产品研发和服务体系将产品价值“又快又稳”地交付给客户，获得客户的信任，并帮助客户实现成功。本文为分享实录。
keywords: [TiDB, PingCAP, 技术演进, 建立信任, 最佳途径, 透明]
---

# 唐刘：透明一切，是我们在复杂环境下与客户建立信任的最佳途径｜PingCAP 用户峰会回顾

在刚刚结束的「 PingCAP 用户峰会」中，PingCAP 研发副总裁唐刘、PingCAP 中国区技术服务总经理李超群从 PingCAP 的**自主开源、工程研发体系、产品未来技术演进方向等方面，分享了 PingCAP 如何通过产品研发和服务体系将产品价值“又快又稳”地交付给客户，获得客户的信任，并帮助客户实现成功**。以下为分享实录。

![唐刘.jpeg](https://img1.www.pingcap.com/prod/_21a492c193.jpeg)

服务对于数据库公司来说是一个沉甸甸的词汇。对于产研团队来说，只有做出产品，并把产品交付客户，才会有后面的服务。但 PingCAP 作为一家非常年轻的公司，所做的是一个非常有挑战性的数据库产品，如何让客户选择相信 PingCAP？如何让客户放心地将他们的数据存放到 TiDB 数据库？ 图片

## “透明”建立信任

开源是 PingCAP 的基因，PingCAP 从一开始就将源代码开放出来，让所有人都能看到 TiDB 到底是什么样子。但仅仅只有代码的开源是远远不够的，经过 7 年多的发展，**我们深知开源有着不同的阶段**。当把源代码开放后，客户和用户就能够自行下载 TiDB 源代码进行编译，发布到自己的生产环境中，服务于自己的客户；当他们遇到问题时，可以选择自己修复 bug，或与 PingCAP 一起探索，共同完善 TiDB 功能；有一些用户、企业甚至将 TiDB 作为自己的上游版本，通过 TiDB 构建自己的发行版，服务于客户。我们也希望能有越来越多的用户构建自己的 TiDB 发行版创造更多价值。

面对不确定的经济环境，我们如何从当前的复杂环境中生存下来？**开源是建立信任的最佳途径，但只有开源也是远远不够的，PingCAP 认为唯有透明才能解决问题，透明一切能透明的事情**。为什么透明对 PingCAP 和用户都如此重要？一方面，PingCAP 到目前为止有 3000 家用户、 1800 多位开发者分布在全球 45 个国家和地区，同时 PingCAP 内部有 300 多位研发工程师。PingCAP 和开发者、用户之间形成了一个非常多元的网状结构。所以我们开源了源代码、设计文档。

为了更加透明，我们还将 TiDB 未来 1-3 个月的产品路线图开放，让大家了解 TiDB 即将发布的功能。有一些朋友可能会问：你们把所有东西都开源，都透明了，友商看到会有什么动作？其实比起担心这个问题，**我们更希望让客户清楚地了解 PingCAP 到底在做什么以及 TiDB 未来的方向，并因此更加相信 PingCAP，共同走向未来**。

## 让客户“又快又稳”感知到产品的价值

作为一家做数据库产品的公司，仅仅只有开源与透明也是不够的，如果 TiDB 不能给客户带来价值，如果客户不能使用 TiDB，其实就建立不了任何信任，我们需要让客户又快又稳地感受到 TiDB 的价值。PingCAP 是一家非常年轻的公司，一方面产品需要快速地迭代，不断将产品价值快速交付客户；另一方面，面对许多核心场景，我们需要打磨一个更加稳定的产品，让客户非常高效非常放心地使用。所以， **PingCAP 采用了一个“稳态+敏态”双轨并行的研发机制，保证产品更新对用户触手可及，同时在核心场景也能稳定放心的使用**。

![又快又稳感知产品的价值.png](https://img1.www.pingcap.com/prod/_134ef9fa8b.png)

那么，PingCAP 是如何实现“稳态+敏态”双轨并行的研发机制呢？

- 一是开放式架构，分离一切能分离的，从物理上保证隔离性；
- 二是 TiDB 有着非常丰富的应用场景，用户在 TiDB 社区持续参与产品共创。

下面通过几个小例子讲讲 PingCAP 如何与客户进行共创：

第一个例子是中通快递。快递物流行业在双十一或者 618 时面临的挑战是非常巨大的，中通快递实时数据业务需要将全国 3 万多网点产生的实时物流信息写入到数据库中，然后动态分析业务状况。双十一等物流高峰期间，日写入 / 更新流量超 30 亿条，分析库总量在百亿级。中通快递很早就拥抱了 HTAP ，通过实际业务场景的打磨，**TiDB 帮助中通快递抗住了双十一的流量高峰，HTAP 分析引擎配合分区表动态裁剪的高效数据过滤，支持了中通快递双十一 20 多个报表系统秒级查询**。通过业务场景的深入应用，中通快递将 HTAP 读写混合的极限负载能力提升了 100% 以上。

![中通快递案例.png](https://img1.www.pingcap.com/prod/_46d41fcb8e.png)

第二个例子是 [OSS Insight ](https://ossinsight.io/)。这是一个非常有代表性的业务场景，首先它是一个从 0 到 1 快速打造的产品，适合当前很多公司的敏态业务。这个产品的主要产品经理就是我们的 CEO 刘奇，需求天天变，今天提的需求明天就要交付，对于研发工程师来说是非常大的压力和挑战。但 OSS Insight 有将近 50 亿条数据，很多查询条件非常复杂，面对这样高度复杂的情况，一方面要实现快速迭代，另一方面还要保证查询稳定高效运行。之前我们通过加很多 HINT 的方式来保证查询计划的稳定，但当业务不断变化时会增加很多索引，调整 DDL ，导致之前的 HINT 失效，为了解决这样的问题我们和 OSS Insight 研发工程师一起，不停打磨重构 TiDB 的优化器，现在不光研发工程师不再需要写 HINT ，我们发现 TiDB 的智能优化水平比人工写 HINT 提速了 20-30%。

![OSS Insight 案例.png](https://img1.www.pingcap.com/prod/OSS_Insight_2b438696c0.png)

第三个例子是某头部股份制银行。该行一直坚信 TiDB 能应用到银行核心系统上，与 PingCAP 协力持续打磨 TiDB 的内核能力，在 7×24 小时性能测试过程中，将整个延迟抖动控制在 2% 以内。在互联网交易系统上，更将整个延迟缩短了 4 倍，满足了互联网业务线上交易的核心述求。

![银行案例.png](https://img1.www.pingcap.com/prod/_10de7b9511.png)

## 平滑升级，让客户又快又稳地感知到产品价值

由于 TiDB 不断打磨，快速发布新版本，许多用户会面临一个非常大的选择问题：新产品是非常好，但我的数据库跑得好好的，为什么要升级？数据库在企业数字化系统中是非常核心的组件，版本升级往往面临着着很大的风险，能不能不升级？

我们的答案是，要升级：**一方面客户通过升级到最新版本，在延迟和性能方面都得到了大幅提升，同时也更有信心将注意力聚焦于自己的业务逻辑开发上**，另一方面，PingCAP 研发工程师与服务团队一起打造了一套完善的数据库升级体系，支持客户的平滑升级。

在技术、产品之外，PingCAP 还在产研内部专门成立了保障企业级客户成功的组织，比如金融架构师团队。它由 PingCAP 的资深架构师组成，致力于重要金融客户的共创、功能研发和项目支持。

## 未来，与客户持续户共创，携手成长

**很多企业级客户选择 TiDB 的理由，就在于它的可生长性**。未来， TiDB 仍然会在这方面不断地努力。首先，我们会聚焦于 TiDB 的内核，不断打磨。我们相信，无论怎么生长，如果没有坚固的底座是不可能向外更好生长的。在这个基础之上，TiDB 会在 DB 微服务化、云原生、智能化上不断拓展产品的边界和能力，与各种各样的生态结合，为客户提供更多价值。

这些年来，TiDB 一直持续不断地专注于 OLTP 核心能力提升，以银行交易核心为抓手，在优化系统、细粒度资源控制以及长尾延迟等各方面实现了突破，让 TiDB 变得更快更好用，在大表快速添加索引方面性能提升 10 倍， 在 Real-time HTAP 提速 1-2 倍。

![Serverless.png](https://img1.www.pingcap.com/prod/Serverless_8b1a211b76.png)

**当前，无论国内还是在海外，云都是技术演化的未来**。而恰恰云能够将整个 PB 级别的数据库服务平台价值无限放大，未来 PingCAP 会提供一种全新的数据处理和访问形式—— Serverless。PingCAP 提供非常方便易用的 Data API，让企业级用户只需关注自己的业务，不用在意数据在哪里，底层长什么样。

**我们有一个梦想，当 TiDB 具备 Serverless 能力的时候，每个开发者都可以拥有自己的数据服务**。这个数据服务能做到秒级别的创建速度，亚秒级别的唤醒启动，毫秒级别的访问延迟。当一个数据库具备这样能力时，对于用户的价值其实是非常大的。一方面，所有开发者都拥有数据库，关于 TiDB 人才培养再也不需要担心；另一方面，用户只需要关注于自己的业务逻辑开发，以及如何更快将业务推向市场。

![TiDB 技术方向战略清单.png](https://img1.www.pingcap.com/prod/Ti_DB_d3e1c1bca5.png)

上图是 TiDB 整个产品的技术演进方向，包含 TiDB 内核、DB 微服务化、云原生、智能化以及生态。在智能化方面，TiDB 在不断打磨自动诊断服务 Clinic ，通过自动诊断服务可以让每个用户都拥有一个 TiDB 性能调优专家，让每个用户都可以更好地使用 TiDB 。

## PingCAP 服务体系

客户成功这件事，不仅仅是产品研发团队的事情，也是整个 PingCAP 公司一起努力的结果。PingCAP 中国区技术服务总经理李超群在用户峰会上分享了 PingCAP 服务体系。

目前为止， PingCAP 技术服务人员的总人数已经占到了公司总人数的 25% ，成为继产研之后的第二大团队。可以说，**PingCAP 既是一家产品型公司，也是一家服务型公司**。

![李超群.jpeg](https://img1.www.pingcap.com/prod/_7b7bb3b034.jpeg)

PingCAP 服务体系包含三个方面——**订阅服务、专家服务和培训认证**：

**订阅服务**：过去一年，PingCAP 实现了用工单系统做客户技术服务，可以非常容易地跟踪工单进展；我们开通了产研直通渠道，客户如有紧急问题可以第一时间拉通产研；第三，基于庞大的社区，我们把社区以及工单里的所有问题都整理出来，建立了 TiDB 知识库，在今年 12 月份会向所有企业客户开放。

![订阅服务.png](https://img1.www.pingcap.com/prod/_1245be8752.png)

**专家服务**：PingCAP 按照应用构建的全生命周期构建了一张服务体系大图。TiDB 所面对的场景和遇到的挑战与其他数据库有所不同，有数据库替换场景，有大数据替换场景，如何帮助客户在这些场景里用好 TiDB ，是 PingCAP 首要解决的问题。所以 PingCAP 推出了架构咨询服务，我们希望帮助客户做真正的场景调研，做可行性分析与架构设计。专家服务除了要有体系，还依赖于真正的经验积累。我们通过一套服务标准化的流程，把所有的实践，所有的经验汇聚起来变成一套可以复用的资产和工具体系。

![专家服务.png](https://img1.www.pingcap.com/prod/_4889c13d83.png)

**培训认证**：TiDB 的培训认证体系进行了全新升级。我们把初级课程的门槛降低，让更多人可以接触到 TiDB ，同时把高级课程变得多路并行，除了以前的数据库管理方向，还添加了性能调优、数据迁移、故障排查和运营管理方向。

![DBA 培训.png](https://img1.www.pingcap.com/prod/DBA_98c68686fb.png)

此外，今年 PingCAP 还推出了**专门针对应用开发者的培训认证**，帮助应用开发者用好其实能让 TiDB 跑得更快也更稳定，这门课程已经正式向所有商业客户和合作伙伴开放。

![开发者培训.png](https://img1.www.pingcap.com/prod/_90a1e21c71.png)

最后，回到本文的主题，**PingCAP 为什么能够服务好企业级用户**？答案并不复杂：PingCAP 以开源为基础，与客户建立了牢固的信任体系；与此同时，PingCAP 持续引领技术趋势，打造面向未来的数据库产品；最关键的一点，PingCAP 从开始到现在，始终保持以客户成功为核心的企业文化，从产品研发到技术服务，与用户共同面对不确定性的挑战。