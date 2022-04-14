---
title: TiDB的HATP对我们来说意味着什么？
hide_title: true
---

# TiDB 的 HATP 对我们来说意味着什么？

**作者：xuexiaogang**

传统数据库一般说的是关系型数据库。关系型数据库是以行的形式存在的，被称为 OLTP 类型，这种数据库对事务比较友好。因为事务对数据的处理是以行为单位的。另外一种数据库类型叫做 OLAP 类型数据库。这种数据库做分析的，所以列的形式存储的话，是对分析比较友好的。不过一般的 OLTP 中也不是一点都不能做 OLAP 的场景，是不过是并非很擅长。所以有了在大约将近 20 年前大数据这个名词出来了，大数据系统就是 OLAP 的代名词。

​ 那么数据从数据库到大数据系统有没有坑？**答案是有，而且很大。**

​ 这些坑可以克服吗？**很难，在某些场景下是不可能。**下文我带大家看看数据同步都有哪些问题

​ 有没有其他解决方案？**答案是有，用 TiDB 等具有 HATP 的数据库产品就可以。**（以下各类问题其实都不是工具的问题，而是下游大数据组件自身的问题）

​ 如果一个 OLTP 系统使用了 MySQL 数据库，那么为了把 MySQL 的数据送到大数据有哪些方法？

1、 把数据送到一个中间环节如 Kafka。MySQL 到 Kafka 有好几种工具 Canel，Databus，Puma，Flume 等等。这就要求 DBA 掌握其中一种甚至集中技术栈（安装、维护、故障处理等）不过这种只等于把事情做了一半，因为在 Kafka 中的数据不能直接用来分析。

2、 把数据送到 hadoop 的一个组件如 Hbase。请看下图：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934285946.png)

在到 kafka 的基础上继续往下走，可以经过 Flink 到 Hbase(这里又多了 Flink 的一个技术栈，又要求 DBA 掌握)，也可以通过第三方接口到 Hbase.（这里不仅仅是要求 DBA 了，还要求开发介入协助完成）

即使上面的困难都解决了，那么原始的 Hbase 不支持多表 join，需要 spark 支持。又多了一种技术栈。这里还要提醒一定，支持和支持的好是两回事。这条路走到这里已经发现困难重重。小结一下：是 Hbase 不够友好（设计之处就没打算这样干），而且**中间环节众多，全部串行，一个点问题，全链路查问题。**

3、 有没有从数据库直接到 Hbase 的方案？有，比如 OGG。让我们看看包罗万象的 OGG 怎么处理。可以直接一步到位。**（但是这不是问题重点，重点是即使一步到位的也无法解决）**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934346097.png)

​ 虽然目前 TiCDC 不支持一步到位这么多下游数据库和中间件，但是即使支持了，其实问题还是没有彻底解决，和 OGG 一样要面对的问题还有很多。（而这些问题不是 TiCDC 和 OGG 造成的也不是它们能解决的）。

​ 请看下面，当 XXG2 表有 ID、name，wh，hao 4 个字段。而且我们假设都理想化用各种 CDC 工具（TiCDC 或者 OGG 等）讲数据已经送到了 Kafka 和 Hbase。这里我们仅仅用了一个技术栈。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934416283.png)

​ 这个时候由于业务需要，在这个表上加一个列。我这里用 JZD 来表示。上游数据库表发生 DDL 很正常。那么我们看看下游的 Kafka 和 Hbase 会是什么表现？

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934440863.png)

​ 答案是 kafka 中记录了变更前和变更后的数据。就放在这里，不好意思，请你拿的时候自己分别一下，应该怎么拿？别拿错了。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934480425.png)

​ Hbase 中体现出来列簇的优势，没有问题，随便加列。而且支持多版本控制。但是不支持 join，还是没法直接使用。

4、为了解决表关联的问题，只能使用 Hive 和 impala。Impala 是将 hive 映射到内存，以内存作为介质，简单粗暴的进行查询。而 Hive 的动作基本都是在磁盘进行 MapReduce，会比较慢。但是数据必须先到 hive 以后才能映射。Hive 的基础是 HDFS，所以数据要以文件的形式送到 HDFS，而 Hive 以外部表的形式加载这些文件，例如下图，在 Hive 中实现。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934553038.png)

​ 执行的效果如下：请注意最前面有 I 和 U。I 代表 insert，U 代表更新。如果是 D，则代表删除。这是因为 Hive 不支持修改。如果执行 update，就要送过来一条完整的数据，然后就不是 CDC 要做的事情了。需要使用 Hive 的人自己去处理。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934578401.png)

​ 请注意送过来的原数数据第一列就带有 D 的字样，说明这个数据是被删除了。需要 Hive 的处理中加以逻辑处理，然后才能使用。如下图：![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934603696.png)

​ 以上所有不方便以及出现的问题原因只有一个是 Hive 不支持修改。不能像 OLTP 的数据库一样进行 Update 和 Delete。这个问题在 Hive3.1.1 进行了改进。可以支持修改。看到这里估计小伙伴们觉得问题解决有希望了。不，我再泼一碰冷水吧。我们先不说升级组件能不能做。

​ 我们退一万步讲，假设升级好了，再假设新版本也支持了。（支持和支持的好是两回事）。在如此理想的情况下，那么如果回到我们刚才说的场景。上游数据库增加了一个字段。Alter table xxg2 add newcolumn int default 1 not null。在 Hive 的系统中是无法解决给历史数据补数据的问题的。通常做法是全量删除，全量同步。可见即使在理论理想情况下，数据库变更带来的代价之大。所有的一切是不是 CDC 工具的问题（**如果大家将来用到 TiCDC 或者其他工具最后发现都没有完美解决，那么请注意都不是工具的问题，也不是使用的问题。而是 hadoop 的天生缺陷）**，源于大数据本身组件的缺陷和当年出生的环境。Apache 改变世界。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934721112.png)

5、 最后的结论是大数据依然存在，hadoop 可能不是最好的选择。这就是为什么现如今 HATP 是一个热门的方向，信通院在 2021 年的白皮书上提出 HATP 是未来数据库的一个方向。比如选择了 TiDB，那么以上所有到消息队列和到 hadoop 组件的工作全都不需要做了。在一个 TiDB 集群中都可以完成。以 5-8 个人的小规模大数据团队而已，一个人按照 30-50 万的公司实际成本而言。每年可以节约 200 万到 400 万的人力成本支出。**这对企业来说就是价值。**

6、 数据库同步方案没有万无一失的，或多或少都有问题。能不拆就不拆，避免数据同步甚至异构同步。当我们使用 TiDB 等 HATP 的数据库来说。下面的大多数都不需要了。避免了以上所有的问题。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934769195.png)

补充一点，TiDB 兼容了 MySQL 协议，MySQL 也有 HATP 的解决方案。这个解决方案有两个要求，1 使用 MySQL 企业版；2 使用 Oracle 的云。在中国现阶段，短期用不上。所以还是用 TiDB 吧。
