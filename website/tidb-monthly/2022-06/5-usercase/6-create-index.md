---
title: 你踩过这些坑吗？谨慎在时间类型列上创建索引
hide_title: true
---

# 你踩过这些坑吗？谨慎在时间类型列上创建索引

**Zeratulll** 发表于  **2022-06-10**

MySQL中，一般情况下我们不需要关注有序数据的写入在Innodb的Btree上是否存在热点，因为它能承担的吞吐量是比较大的，在单机的范畴内不太容易达到瓶颈。

但是在TiDB中，写入有序数据很容易导致热点，这个热点与单机数据库不同。如果一个节点成为了热点（只有它在工作，或者所有请求都需要访问它），那整个集群无论增加多少台机器，都对提升数据库的性能容量毫无帮助，纯纯的浪费钱了。这是分布式相对单机额外产生的问题。

一个表包含时间字段（例如订单表、日志表、用户表等等），并且在时间字段上创建一个索引是我们使用MySQL时一种很常见的做法。这些时间字段很多会使用插入或者修改的时间（例如DEFAULT值设为CURRENT_TIMESTAMP或者SQL中使用NOW函数来作为值）。

时间是一种典型的有序数据，那么在使用TiDB时，我们是否可以保持像在MySQL中一样的做法来使用时间字段呢？时间字段是否会产生热点，又该如何避免？

本文将从TiDB的原理来解答上述问题。如果你是内核开发者，也有助于帮助读者进一步理解分布式数据库中数据的编码与分布。

# 问题

一个有趣的问题，考虑下面四张表（结构上的主要差异在于主键是AUTO_INCREMENT或者AUTO_RANDOM，gmt_create列是date类型或者datetime类型）：

```markdown
CREATE TABLE orders1 (
id bigint(11) NOT NULL AUTO_INCREMENT,
gmt_create datetime,
PRIMARY KEY (id) ,
KEY idx_gmt_create (gmt_create)
);
CREATE TABLE orders2 (
id bigint(11) NOT NULL AUTO_INCREMENT,
gmt_create date,
PRIMARY KEY (id) ,
KEY idx_gmt_create (gmt_create)
);
CREATE TABLE orders3 (
id bigint(11)  NOT NULL  AUTO_RANDOM,
gmt_create datetime,
PRIMARY KEY (id) ,
KEY idx_gmt_create (gmt_create)
);
CREATE TABLE orders4 (
id bigint(11) NOT NULL AUTO_RANDOM,
gmt_create date,
PRIMARY KEY (id) ,
KEY idx_gmt_create (gmt_create)
);
```

并使用`insert into orders (id,gmt_create) values (null,now())`进行进行连续的写入操作。

问题是：这四张表存在哪几个热点？

.

.

.

.

.

.

.

.

.

.

.

.

.

.

.

.

.

.

.

.

答案是：一共存在5个热点（你答对了吗？）

orders1中存在的热点：gmt_create索引、主键； orders2中存在的热点：gmt_create索引、主键； orders3中存在的热点：gmt_create索引； orders4不存在热点。

如图所示：

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/%E7%83%AD%E7%82%B9-1654844983422.jpg) 

# 解读

## AUTO_INCREMENT的热点

orders1和orders2的主键上存在热点。这个的原因大家都知道的，因为TiDB的数据是按照有序的range进行划分的，主键自增，会导致写入都发生在做最后的range上，因此最后的range会是热点。这个在TiDB的文档中也有描述，这里就不再赘述了：

> 从 TiDB 编码规则可知，同一个表的数据会在以表 ID 开头为前缀的一个 range 中，数据的顺序按照 RowID 的值顺序排列。在表 insert 的过程中如果 RowID 的值是递增的，则插入的行只能在末端追加。当 Region 达到一定的大小之后会进行分裂，分裂之后还是只能在 range 范围的末端追加，永远只能在一个 Region 上进行 insert 操作，形成热点。
>
> 常见的 increment 类型自增主键就是顺序递增的，默认情况下，在主键为整数型时，会用主键值当做 RowID ，此时 RowID 为顺序递增，在大量 insert 时形成表的写入热点。
>
> 同时，TiDB 中 RowID 默认也按照自增的方式顺序递增，主键不为整数类型时，同样会遇到写入热点的问题。

order3和orders4的主键不存在热点，因为使用AUTO_RANDOM来生成主键，将主键做了随机化。这样的代价也是有的，主键失去了宏观上的有序性（因为TiDB的AUTO_INCREMENT是按TiDB Server分段的，所以不能说是“有序”）。

## DATE与DATETIME

再来看idx_gmt_create。

回顾TiDB中索引的编码方式：

```markdown
Key: tablePrefix{tableID}_indexPrefixSep{indexID}_indexedColumnsValue_rowID
Value: null
```

对于上述表结构，简化下就是：

```markdown
Key: {gmt_create}_{id}
```

这种编码格式，在比较大小的时候，简单说就是gmt_create不同则按gmt_create进行比较，gmt_create相同则按照id来比较。

对于orders1与orders3，gmt_create是DATETIME类型，包含了日期与时分秒（微秒）信息。按时间不停写入的数据，其gmt_create就是不停的在增长的有序数据，与AUTO_INCREMENT的主键类似，它也会不停的往最后一个range进行写入，因此最后一个range会成为热点。这里orders1与orders3的行为是一致的，因为gmt_create作为前缀已经是有序的了，编码出来的key基本就是有序的。后面的id作为后缀，无论是有序的还是随机的，都无法影响这个结果。

对于orders2与orders4，gmt_create是DATE类型，只包含了日期。对于一天内写入的数据，其gmt_create的值实际上都是同一个。也就是说，在决定这个数据写到哪个range的时候，起到比较作用的是id。

由于orders2的id是AUTO_INCREMENT的，因此编码出来的key也是有序的，所以产生了热点。

而orders4的id是随机的，是乱序的，因此编码出来的key也不具备有序性，写入就会分散到很多range中，因此没有热点。

**注意：实际上，当日期发生切换的时候（例如每天的0点0分0秒），orders4会在短时间内出现热点（这个时间长短取决于你的流量多久能写满几百兆，将这一天数据分裂到多个range内），这个热点将表现成系统在0点的剧烈抖动，想象下双十一零点出现这种抖动吧！**

## 优化的可能性

TiDB可以考虑修改DATETIME/TIMESTAMP类型的编码方式（或者提供一些额外的选项）。例如对于Key的部分，截断到小时，后面使用随机数进行补齐（充当了上文中随机主键的作用），将未截断的数据保存在value中或者key的结尾。

这样能很好的将连续写入的时间数据进行打散，相应的代价是，查询代价会变大（无论查询条件多么精确，都需要查出至少一小时的数据），需要过滤一些无用的数据。

# 结论

兼容性其实包含功能兼容性与性能兼容性，TiDB虽然功能上与MySQL的兼容性做的不错，但性能上的差异点还是比较多的。

就本例而言，我们可以得出的结论是，使用TiDB时，在时间类型上创建索引需要慎重，如果按照使用单机MySQL的习惯进行创建，很容易出现热点，导致虽然使用了分布式，但毫无扩展性可言。

如需创建，有以下几个方法（每种方法都不完美，只能做取舍）：

1. 使用DATE类型，并且主键使用AUTO_RANDOM。缺点是无法存储时分秒，主键也失去了宏观上的自增性；
2. 使用DATE类型，并且和另一个不自增的离散列创建组合索引。例如idx_gmt_create；
3. 使用DATE类型，并且主键使用SHARD_ROW_ID_BITS。缺点是无法存储时分秒，主键失去了宏观上的自增性，并且SHARD_ROW_ID_BITS与主键使用聚簇相冲突，这会造成写入的放大以及主键查询需要做回表；
4. 注意DATE类型即使在平时没有热点，在0点时刻也可能带来剧烈抖动
5. 使用分区表，这样时间索引成为了分区内的Local索引，等于按分区做了打散。这是目前能想到的DATETIME类型上使用索引又避免热点的唯一方法，但代价也很大，TiDB目前不支持在分区表上创建全局索引，不带分区键的查询性能上也容易有问题，这对业务代码有很强的侵入性。

