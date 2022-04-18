# TiDB的HATP对我们来说意味着什么？

**作者：xuexiaogang**



传统数据库一般说的是关系型数据库。关系型数据库是以行的形式存在的，被称为OLTP类型，这种数据库对事务比较友好。因为事务对数据的处理是以行为单位的。另外一种数据库类型叫做OLAP类型数据库。这种数据库做分析的，所以列的形式存储的话，是对分析比较友好的。不过一般的OLTP中也不是一点都不能做OLAP的场景，是不过是并非很擅长。所以有了在大约将近20年前大数据这个名词出来了，大数据系统就是OLAP的代名词。

​     那么数据从数据库到大数据系统有没有坑？**答案是有，而且很大。**

​     这些坑可以克服吗？**很难，在某些场景下是不可能。**下文我带大家看看数据同步都有哪些问题

​    有没有其他解决方案？**答案是有，用TiDB等具有HATP的数据库产品就可以。**（以下各类问题其实都不是工具的问题，而是下游大数据组件自身的问题）

​     如果一个OLTP系统使用了MySQL数据库，那么为了把MySQL的数据送到大数据有哪些方法？

1、 把数据送到一个中间环节如Kafka。MySQL到Kafka有好几种工具Canel，Databus，Puma，Flume等等。这就要求DBA掌握其中一种甚至集中技术栈（安装、维护、故障处理等）不过这种只等于把事情做了一半，因为在Kafka中的数据不能直接用来分析。

2、 把数据送到hadoop的一个组件如Hbase。请看下图：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934285946.png)



在到kafka的基础上继续往下走，可以经过Flink到Hbase(这里又多了Flink的一个技术栈，又要求DBA掌握)，也可以通过第三方接口到Hbase.（这里不仅仅是要求DBA了，还要求开发介入协助完成）

   即使上面的困难都解决了，那么原始的Hbase不支持多表join，需要spark支持。又多了一种技术栈。这里还要提醒一定，支持和支持的好是两回事。这条路走到这里已经发现困难重重。小结一下：是Hbase不够友好（设计之处就没打算这样干），而且**中间环节众多，全部串行，一个点问题，全链路查问题。**



3、 有没有从数据库直接到Hbase的方案？有，比如OGG。让我们看看包罗万象的OGG怎么处理。可以直接一步到位。**（但是这不是问题重点，重点是即使一步到位的也无法解决）**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934346097.png)



​     虽然目前TiCDC不支持一步到位这么多下游数据库和中间件，但是即使支持了，其实问题还是没有彻底解决，和OGG一样要面对的问题还有很多。（而这些问题不是TiCDC和OGG造成的也不是它们能解决的）。

​    请看下面，当XXG2表有ID、name，wh，hao 4个字段。而且我们假设都理想化用各种CDC工具（TiCDC或者OGG等）讲数据已经送到了Kafka和Hbase。这里我们仅仅用了一个技术栈。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934416283.png)

​     这个时候由于业务需要，在这个表上加一个列。我这里用JZD来表示。上游数据库表发生DDL很正常。那么我们看看下游的Kafka和Hbase会是什么表现？

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934440863.png)

​     答案是kafka中记录了变更前和变更后的数据。就放在这里，不好意思，请你拿的时候自己分别一下，应该怎么拿？别拿错了。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934480425.png)

​     Hbase中体现出来列簇的优势，没有问题，随便加列。而且支持多版本控制。但是不支持join，还是没法直接使用。

4、为了解决表关联的问题，只能使用Hive和impala。Impala是将hive映射到内存，以内存作为介质，简单粗暴的进行查询。而Hive的动作基本都是在磁盘进行MapReduce，会比较慢。但是数据必须先到hive以后才能映射。Hive的基础是HDFS，所以数据要以文件的形式送到HDFS，而Hive以外部表的形式加载这些文件，例如下图，在Hive中实现。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934553038.png)

​     执行的效果如下：请注意最前面有I和U。I代表insert，U代表更新。如果是D，则代表删除。这是因为Hive不支持修改。如果执行update，就要送过来一条完整的数据，然后就不是CDC要做的事情了。需要使用Hive的人自己去处理。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934578401.png)

​      请注意送过来的原数数据第一列就带有D的字样，说明这个数据是被删除了。需要Hive的处理中加以逻辑处理，然后才能使用。如下图：![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934603696.png)

​      以上所有不方便以及出现的问题原因只有一个是Hive不支持修改。不能像OLTP的数据库一样进行Update和Delete。这个问题在Hive3.1.1进行了改进。可以支持修改。看到这里估计小伙伴们觉得问题解决有希望了。不，我再泼一碰冷水吧。我们先不说升级组件能不能做。

​     我们退一万步讲，假设升级好了，再假设新版本也支持了。（支持和支持的好是两回事）。在如此理想的情况下，那么如果回到我们刚才说的场景。上游数据库增加了一个字段。Alter table xxg2 add  newcolumn int default 1 not null。在Hive的系统中是无法解决给历史数据补数据的问题的。通常做法是全量删除，全量同步。可见即使在理论理想情况下，数据库变更带来的代价之大。所有的一切是不是CDC工具的问题（**如果大家将来用到TiCDC或者其他工具最后发现都没有完美解决，那么请注意都不是工具的问题，也不是使用的问题。而是hadoop的天生缺陷）**，源于大数据本身组件的缺陷和当年出生的环境。Apache改变世界。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934721112.png)

5、 最后的结论是大数据依然存在，hadoop可能不是最好的选择。这就是为什么现如今HATP是一个热门的方向，信通院在2021年的白皮书上提出HATP是未来数据库的一个方向。比如选择了TiDB，那么以上所有到消息队列和到hadoop组件的工作全都不需要做了。在一个TiDB集群中都可以完成。以5-8个人的小规模大数据团队而已，一个人按照30-50万的公司实际成本而言。每年可以节约200万到400万的人力成本支出。**这对企业来说就是价值。**

6、 数据库同步方案没有万无一失的，或多或少都有问题。能不拆就不拆，避免数据同步甚至异构同步。当我们使用TiDB等HATP的数据库来说。下面的大多数都不需要了。避免了以上所有的问题。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647934769195.png)

补充一点，TiDB兼容了MySQL协议，MySQL也有HATP的解决方案。这个解决方案有两个要求，1使用MySQL企业版；2使用Oracle的云。在中国现阶段，短期用不上。所以还是用TiDB吧。