---
title: 依据TiDB执行计划的sql调优案例分享 - TiDB 社区技术月刊
sidebar_label:  依据TiDB执行计划的sql调优案例分享
hide_title: true
description: 这篇文章主要分享作者做过的一些比较有意思的sql调优的方式方法。
keywords: [TiDB, SQL, 调优, 金融场景]
---

# 依据TiDB执行计划的sql调优案例分享

> 作者： [俺也一样](https://tidb.net/u/%E4%BF%BA%E4%B9%9F%E4%B8%80%E6%A0%B7/answer)

## 序言

上周支持了一个金融场景的tidb项目，集群版本是5.1.2，因为某些原因，未使用tiflash组件,而在生产中又确实有许多复杂的sql需要执行,且存在部分高并发的sql，基于现状，就做了很多sql调优的工作。

这篇文章，主要是**分享作者做过的一些比较有意思的sql调优的方式方法。**

## 1、内连接中的类似笛卡尔积现象导致oom

### 场景简述

应用反馈有个功能有时候能跑出来，有时候跑不出来(内存占用超过10G）。在dashboard慢查询中定位到了对应的sql，对sql和执行计划进行分析发现这个sql是对三张表的一个inner join的关联查询，执行计划显示，三张表经过过滤出来结果集分别约为3千条、20万条、1000万条数据，进行连接后最终的结果集超过11亿行数据。经过对比分析，功能跑不出来的原因是每次计算到11亿行数据时容易触发oom,导致查询失败报错。

### 分析与现象还原

当时第一眼很困惑在左连接中没有一个超过11亿行的表，为什么最终join的结果集这么大，后来分析定位发现是两表中的中关联条件存在大量重复的数据，导致产生了一个类似笛卡尔积的现象，导致结果集过大。

举例与演示：

```markdown
CREATE TABLE a(id INT(10) ,NAME CHAR(20), gra INT(20),PRIMARY KEY (id));
CREATE TABLE b(id INT(10) ,NAME CHAR(20), class CHAR(20));
INSERT INTO a VALUES(1,'李四',10);
INSERT INTO a VALUES(2,'李四',11);
INSERT INTO a VALUES(3,'王五',12);

INSERT INTO b VALUES(2,'李四',11);
INSERT INTO b VALUES(2,'李四',11);
INSERT INTO b VALUES(2,'李四',11);
INSERT INTO b VALUES(3,'王五',12);
INSERT INTO b VALUES(3,'王五',13);
INSERT INTO b VALUES(3,'王五',12);
INSERT INTO b VALUES(3,'王五',13);

#原始的sql
EXPLAIN ANALYZE 
SELECT a.id,a.name,a.gra 
FROM a INNER JOIN b ON a.name=b.name
GROUP BY a.id

#改造后的sql
EXPLAIN ANALYZE 
SELECT a.id,a.name,a.gra 
FROM a INNER JOIN (SELECT DISTINCT NAME  FROM b) b ON a.name=b.name
GROUP BY a.id
```

原始sql在join后会产生10行记录，原因是b表中多行记录其实能和a表中多行记录匹配到，结果集数量类似于笛卡尔积的那种产生方式，在关联的表数据量大的时很容易oom（#这里是2*3+1*4=10）

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662890096291.png)

由于在这个sql中，b表的作用其实只是相当于取name列的数据到a表name列中进行过滤，且中间的多行结果集并不影响最终结果，这里可以加一个临时表，先将b表数据进行去重，**在真实的场景中数据量特别大时，去重后，连接计算量会明显变小**，内存消耗变小，结果集变小，sql不会oom了，sql也更快了。（#有时候sql消耗的很大一部分内存是连接时候的一个内存放大）

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662890942209.png)

## 2、单表有多种查询时索引的建立

### 场景简述

通常我们通过dashboard抓取到慢sql时，通过执行计划分析时，**如果发现多次查询，且查询的数据量很少，且对表的查询没有走索引，在执行计划中是全表查询的**，然后在到内存中进行过滤，这个时候我们就会考虑对过滤条件的字段建立索引。

执行计划大致如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662969240051.png)

但是当你准备给这个张表的部分字段添加索引时，你已经发现这张表有5~6个索引时，你就不能直接继续添加新索引，因为维护索引是有成本的，而且为了维护一致性读，在高并发的场景中不适合添加太多的索引，这个时候你就需要综合考虑所有对表的操作来添加有限的索引

### 权衡添加索引

**1、不是所有的过滤条件都需要添加索引**

当表A已经有索引A(a,b,c)时，这时候有个查询的过滤条件字段分别是(b,a,d),这个时候如果当表A中字段a和字段b的过滤性不错的时候，就不再单独需要对(b,a,d)再添加索引了。在sql实际执行时，会先利用索引A对条件字段(a,b)进行过滤（最左匹配原则），再到内存中对条件字段d进行过滤。

类似的执行计划：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662969998041.png)

**2、字段过滤性越好，优先级越高**

```markdown
##从直方图中查询A表的过滤性
show stats_histograms where table_name = 'A';
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662970445018.png)

举例：加入需要对org_no,table_name,up_org_no三个条件添加索引，根据直方图中distinct_count列的过滤性显示，索引字段的顺序应该是org_no,up_org_no,table_name。

\#有时候也考虑字段内容，例如长文本等就不建议添加索引

**3、字段复用率越高，查询频次越高越应该添加索引**

- 当对表的多个查询的过滤条件都涉及的字段，我们越应该将它添加到索引中，且应该放在索引左边更容易复用。
- 和应用开发人员确认，执行频率越高的sql的过滤条件，我们越应该添加索引。

**4、依据最左匹配原则减少索引数量**

例如有4组查询条件

```markdown
(a,b)
(a,b,c)
(a)
(a,b,c,d)
```

(a,b,c)过滤性良好的情况下，只需要用（a,b,c)字段创建一个索引就行，**且越被复用的字段就应该越放在左边**。

**5、综合考虑拆表**

当查询的种类变多，索引的简历就要考虑到整体影响，一般而言，一张表的索引数量不应该超过6个，对表的需求再多的时候建议拆分表，宽表变多个窄表

## 3、绑定执行计划纠正错误的索引选择

### 场景简述

在一次排查慢sql的过程中，发现有一条sql会偶发性的执行时间特别长，对比执行计划，发现耗时长的sql在走一个子查询算子查询时，特别耗时，查看算子的执行信息，**发现这个算子索引的选择与其他的索引选择不一致（索引走错了）**，查看表索引，发现这个表的索引较多，且部分索引会部分重复。

（V5.1.4)多次发现，有当表的索引很多时，执行器会偶尔错误的选择索引，不选最佳的索引。

分析执行计划展示：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662973870224.png)![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662973907016.png)

### sql绑定执行计划

举例：这里强行表b走索引x_y_z，去绑定执行计划

```markdown
create global binding for
select * 
from a
inner join b use index(x_y_z)
on a.id=b.id
where b.x='chen' and b.y='zhuo'
using
select * 
from a
inner join b use index(x_y_z)
on a.id=b.id
where b.x='chen' and b.y='zhuo'
```

## 4、index join的Probe 端加上索引加快join

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662974974563.png)

[用 EXPLAIN 查看 JOIN 查询的执行计划 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/explain-joins#index-join)

## 5、其他情况](#5、其他情况)

还有一些其他情况

### 1、sql中有查询视图

有一次有一个慢sql,查看执行计划发现是有多个表关联，但是sql很简单，后面意识到是有视图，在这个sql中视图其实就可以看成子查询，一个提前定义好的子查询，所以针对这个sql的优化也需要考虑到视图（子查询）的优化，添加索引等。

### 2、强行定义子查询让某些表先连接

有时侯多表连接时，某些表先连接计算会效率比较高，这样我们可以定义子查询指定某些表先连接

举例：

```markdown
#改造前：
select a.id ,b.name,c.gra
from a,b,c
where a.id=b.id 
and b.name=c.name 
and c.gra=a.gra
#强行指定a和b表先做连接，
#改造后：
select t.id ,t.name,c.gra
from 
(
select a.id ,b.name ,a.gra
from a 
inner join b 
on a.id=b.id
) t
inner join c
on t.gra= c.gra
and t.name=c.name
```

### 3、原始sql变动改造

有时候开发人员在编写sql时，由于考虑拼接复用，或者某些工具生成的sql,并未考虑sql执行性能等，也未考虑实际需要，这里就需要多和应用人员一起去核对部分慢sql,考虑：是否就是需要全表查询、全表关联、一次性取太多数据等等问题

1. 作者就碰到过，sql每次向应用服务器返回几十万条数据，然后到应用端再去过滤，某次并发高了，应用服务器oom,这种就需要在sql上，限值查询返回的数据量

2. 作者还碰到过关联的表未加任何过滤条件，全表关联，和应用确认后业务上可以先添加过滤条件过滤，再关联，该造后sql耗时大大变小

### 4、将exsit改造成join去实现

这里不是去讲exsit和in的相互替换与区别

根据tidb官方学习视频，exsit和in在执行时都会转化为连接去实现，但是根据多次实测，建议尽量主动去将sql中exsit改写成inner join去实现。

## 作者想说

1. 文章是作者主观所写，如果有错误或者笔误欢迎指正。

2. sql调优还有许多大量的典型案例，估计大家都知道，我这里就都没讲，只是重点讲了部分比较有意思的、偏门的。

3. sql调优是一个持续优化，不断优化更进的事情。
