---
title: 应用开发者专属的 TiDB 使用指南发布啦！丨TiDB Community
hide_title: true
---

# 应用开发者专属的 TiDB 使用指南发布啦！丨TiDB Community

随着 TiDB 的使用群体进一步扩大，TiDB 的文档也面临着更加多样性的挑战。之前的文档主题主要集中于 TiDB 的部署和运维，但对于使用 TiDB 的应用开发者来说，更需要一份能像使用 MySQL 一样使用 TiDB 的操作手册，同时还能够把乐观事务、Sequence、HTAP 等 TiDB 的独有特性用起来。

因此，我们编写了全新的 [Developer Guide ](https://docs.pingcap.com/zh/tidb/stable/dev-guide-overview)，这份文档可以帮助应用开发者，在最短时间内上手 TiDB。在文档中，我们也阐述了应用开发者最常见的一些问题，例如：savepoint 特性的不兼容，TiDB 乐观事务使用时需要如何进行错误处理等。

另外，我们也为应用开发者进行了特殊优化和场景定制。例如，为不便自行运维的开发者，提供了 TiDB Cloud 集群使用方式；为本地不便部署 TiDB 或开发 SDK 环境的开发者，提供了 Gitpod 云原生开发环境的使用帮助。

在我们的设想中，Developer Guide 非常适合但不限于以下这些场景的使用：

- 你是一个应用开发者，有编程语言基础，但对数据库一无所知，准备选择一个 NewSQL 数据库进行学习或使用；
- 你是一个应用开发者，有编程语言和传统关系型数据库（如 MySQL、PostgreSQL）的基础，准备选择一个 NewSQL 数据库进行学习或使用；
- 你是一个应用开发者，你的公司或组织已经部署了 TiDB，需要你基于 TiDB 来编写一个可靠的应用程序；
- 你是一个应用开发者，你已经基于 TiDB 来编写了一个应用程序，但出现了故障，你需要排查故障；
- 你是一个语言学习者，你希望使用编程语言配合 NewSQL 数据库进行大数据量的读写尝试。

对于数据库零基础的应用开发者，Developer Guide 中包含了应用开发者需要了解的 TiDB 细节，如数据库设计、事务、数据读写的最佳实践，同时还附上了丰富的应用源码示例，帮助你零基础入门 TiDB；对于有 MySQL 基础的应用开发者，Developer Guide 中详细描述了 TiDB 与 MySQL 之间的差别，帮助你快速过渡到新一代 NewSQL 数据库的使用；对于已经在工作中使用 TiDB 的开发者，Developer Guide 中丰富的应用源码示例和故障诊断案例，也能帮助你提高 TiDB 的开发效率。

除了 TiDB 本身相关的内容，我们也编写了一些你在写应用程序时需要注意的细节，比如在 Java 中使用 JDBC Connector 的细节等。同时，Developer Guide 中还屏蔽了应用开发者无需关心的 TiDB 细节，如 TiDB 的 GC、调度、集群部件的配置等。

以下是 Developer Guide 的主要内容：

- 概览：通篇介绍整体开发文档；
- 快速开始：如何使用 Java 或者 Golang 语言构建应用程序；
- 示例程序：如何使用 Spring Boot 和 TiDB 集群，构建一个 HTTP 服务；
- 连接到 TiDB：连接到 TiDB 数据库时需要注意什么，连接池的最大连接数大小怎么配置；
- 数据库模式设计：如何在使用 TiDB 设计数据库时避免大多数的错误。TiDB 中有什么在特定场景可以大幅提升性能的特性；
- 数据写入、数据读取：读密集和写密集的表，如何设置才能性能最大化。批量操作，如何才能不踩坑；
- 事务： TiDB 的事务有什么特点，和 MySQL 何不同；
- 优化 SQL 性能：在 TiDB 中，如何让你的 SQL 跑得更快；
- 故障诊断：在发生故障时，如何快速定位并修复；
- 云原生开发环境：如何免费使用云原生的开发环境（Gitpod）编写程序，免于本地部署开发环境；

可以看到，整个文档是以示例驱动的。 [Java 示例 ](https://github.com/pingcap-inc/tidb-example-java)，和 [Golang 示例 ](https://github.com/pingcap-inc/tidb-example-golang)是整个文档的创作核心，文档中的所有的代码片段都是经过测试的。基于这些示例，应用开发者可以在最短的时间内上手 TiDB，无需漫长的学习周期和过高的上手门槛，就能简单快捷地在自己的程序中使用 TiDB。通过这些示例，应用开发者还可以快速了解 TiDB 的能力，比如 TiDB 可以完成的工作、最佳场景、不支持的特性等。

因为 TiDB 兼容 MySQL，所以在成功部署 TiDB 集群之后，开发者可以使用 MySQL 客户端连接 TiDB，并且 [大多数情况下 ](https://docs.pingcap.com/zh/tidb/stable/mysql-compatibility)可以直接执行 MySQL 语句。在 Developer Guide 中，对于基础的 CURD SQL 也进行了简要的介绍，比如在 [使用 TiDB 的增删改查 SQL ](https://docs.pingcap.com/zh/tidb/stable/dev-guide-tidb-crud-sql)一文中，我们着重介绍了 SQL 中，和应用开发者关系最紧密的 DML（Data Manipulation Language，数据操作语言） 和 DQL（Data Query Language，数据查询语言） 部分。

对于不便部署本地开发环境的开发者，我们也提供了 Gitpod 云原生开发环境的使用帮助。Gitpod 是 Github 推出的云原生开发环境，基于它可以直接在浏览器上编辑代码并运行。甚至直接部署你的服务到 Gitpod 的机器上，开放端口并远程访问它。

![2.png](https://img1.www.pingcap.com/prod/2_1fe84bc7b0.png)

我们基于 Gitpod，为没有条件部署 TiDB 或开发 SDK 环境的开发者，提供了一个 TiDB [Golang 示例 ](https://gitpod.io/#targetMode=gorm/https://github.com/pingcap-inc/tidb-example-golang)，打开这个链接，你就可以直接从你的浏览器或桌面 IDE 启动一个远程的 TiDB 开发环境，快速体验 TiDB 的能力。

未来我们计划编写更多的语言 / 驱动 / ORM 的示例，帮助更多的应用开发者把 TiDB 用起来。如果你对 Developer Guide 有任何改进建议，也欢迎反馈给我们。可以通过 Github issue 来提交反馈：

- 中文文档： https://github.com/pingcap/docs-cn/issues
- 英文文档： https://github.com/pingcap/docs/issues