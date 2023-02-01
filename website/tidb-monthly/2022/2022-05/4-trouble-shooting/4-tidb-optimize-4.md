---
title: TiDB 查询优化及调优系列（四）查询执行计划的调整及优化原理
hide_title: true
---

# TiDB 查询优化及调优系列（四）查询执行计划的调整及优化原理

> 作者：[Yu Dong](https://github.com/yudongusa)

本章节会介绍在优化器产生的查询执行计划和预期不符时，如何通过 TiDB 提供的调优手段来调整及稳定查询计划。**本篇文章为查询执行计划的调整及优化原理解析**，主要会介绍如何通过使用 HINT 来调整查询的执行计划，以及如何利用 TiDB SPM 来绑定查询语句的查询执行计划；最后将介绍一些规划中的功能。

**相关阅读：**

[TiDB 查询优化及调优系列（一）TiDB 优化器简介](https://pingcap.com/zh/blog/tidb-query-optimization-and-tuning-1)

[TiDB 查询优化及调优系列（二）TiDB 查询计划简介](https://pingcap.com/zh/blog/tidb-query-optimization-and-tuning-2)

[TiDB 查询优化及调优系列（三）慢查询诊断监控及排查](https://pingcap.com/zh/blog/tidb-query-optimization-and-tuning-3)

## 使用 HINT 调整查询执行计划

当优化器选择了非预期或不优的执行计划，用户需要使用 Hint 进行执行计划的调整。TiDB 兼容了 MySQL 的 USE INDEX，FORCE INDEX，IGNORE INDEX 语法，同时开发了 TiDB 自身的 Optimizer Hints 语法，它基于 MySQL 5.7 中介绍的类似 comment 的语法，例如 /+ TIDB_XX(t1, t2) / 。下面是 TiDB 目前支持的 Hint 语法列表：

![img](https://tva1.sinaimg.cn/large/e6c9d24egy1h2bjezk6rsj20vo0jcdh5.jpg)

### 使用 USE INDEX, FORCE INDEX, IGNORE INDEX

与 MySQL 类似, 没有使用预期索引的查询计划是慢查询的常见原因，这时就要用 USE INDEX 指定查询用的索引，例如下面例子 USE/FORCE INDEX 使得原本全表扫描的 SQL 变成了通过索引扫描。

```sql
mysql> explain select * from t;  
+-----------------------+---------+-----------+---------------+----------------------+
| id                    | estRows | task      | access object | operator info        |
+-----------------------+---------+-----------+---------------+----------------------+
| TableReader_5         | 8193.00 | root      |               | data:TableFullScan_4 |
| └─TableFullScan_4     | 8193.00 | cop[tikv] | table:t       | keep order:false     |
+-----------------------+---------+-----------+---------------+----------------------+
2 rows in set (0.00 sec)   

mysql> explain select * from t use index(idx_1);  
+-------------------------------+---------+-----------+-------------------------+------------------+
| id                            | estRows | task      | access object           | operator info    |
+-------------------------------+---------+-----------+-------------------------+------------------+
| IndexLookUp_6                 | 8193.00 | root      |                         |                  |
| ├─IndexFullScan_4(Build)      | 8193.00 | cop[tikv] | table:t, index:idx_1(a) | keep order:false |
| └─TableRowIDScan_5(Probe)     | 8193.00 | cop[tikv] | table:t                 | keep order:false |
+-------------------------------+---------+-----------+-------------------------+------------------+
3 rows in set (0.00 sec)    
mysql> explain select * from t force index(idx_1);  
+-------------------------------+---------+-----------+-------------------------+------------------+
| id                            | estRows | task      | access object           | operator info    |
+-------------------------------+---------+-----------+-------------------------+------------------+
| IndexLookUp_6                 | 8193.00 | root      |                         |                  |
| ├─IndexFullScan_4(Build)      | 8193.00 | cop[tikv] | table:t, index:idx_1(a) | keep order:false |
| └─TableRowIDScan_5(Probe)     | 8193.00 | cop[tikv] | table:t                 | keep order:false |
+-------------------------------+---------+-----------+-------------------------+------------------+
3 rows in set (0.00 sec)
```

下面的例子 IGNORE INDEX 使得原本走索引的 SQL 变成了全表扫描

```sql
mysql> explain select a from t where a=2;  
+------------------------+---------+-----------+-------------------------+-------------------------------+
| id                     | estRows | task      | access object           | operator info                 |
+------------------------+---------+-----------+-------------------------+-------------------------------+
| IndexReader_6          | 1.00    | root      |                         | index:IndexRangeScan_5        |
| └─IndexRangeScan_5     | 1.00    | cop[tikv] | table:t, index:idx_1(a) | range:[2,2], keep order:false |
+------------------------+---------+-----------+-------------------------+-------------------------------+
2 rows in set (0.00 sec)   

mysql> explain select a from t ignore index(idx_1) where a=2 ;
+-------------------------+---------+-----------+-----------------+------------------+
| id                      | estRows | task      | access object   | operator info    |
+-------------------------+---------+-----------+-----------------+------------------+
| TableReader_7           | 1.00    | root      |                 | data:Selection_6 |
| └─Selection_6           | 1.00    | cop[tikv] | eq(test.t.a, 2) |                  |
|   └─TableFullScan_5     | 8193.00 | cop[tikv] | table:t         | keep order:false |
+-------------------------+---------+-----------+-----------------+------------------+
3 rows in set (0.00 sec)
```

和 MySQL 不同的是, 目前 TiDB 并没有对 USE INDEX 和 FORCE INDEX 做区分。当表上有多个索引时，建议使用 USE INDEX 。TiDB 的表都比较大，`analyze table`会对集群性能造成较大影响，因此无法频繁更新统计信息。这时就要用 USE INDEX 保证查询计划的正确性

### 使用 JOIN HINT

TiDB 目前表 Join 的方式有 Sort Merge Join，Index Nested Loop Join，Hash Join，具体的每个 join 方式的实现细节可以参考 [TiDB源码阅读系列 ](https://pingcap.com/zh/blog/?tag=TiDB 源码阅读)语法：

#### TIDB_SMJ(t1, t2)

```sql
SELECT /*+ TIDB_SMJ(t1, t2) */ * from t1，t2 where t1.id = t2.id;
```

提示优化器使用 Sort Merge Join 算法，简单来说，就是将 Join 的两个表，首先根据连接属性进行排序，然后进行一次扫描归并, 进而就可以得出最后的结果，这个算法通常会占用更少的内存，但执行时间会更久。 当数据量太大，或系统内存不足时，建议尝试使用。

#### TIDB_INLJ(t1, t2)

```sql
SELECT /*+ TIDB_INLJ(t1, t2) */ * from t1，t2 where t1.id = t2.id;
```

提示优化器使用 Index Nested Loop Join 算法，Index Look Up Join 会读取外表的数据，并对内表进行主键或索引键查询，这个算法可能会在某些场景更快，消耗更少系统资源，有的场景会更慢，消耗更多系统资源。对于外表经过 WHERE 条件过滤后结果集较小（小于 1 万行）的场景，可以尝试使用。TIDB_INLJ() 中的参数是建立查询计划时，内表的候选表。即 TIDB_INLJ(t1) 只会考虑使用 t1 作为内表构建查询计划

#### TIDB_HJ(t1, t2)

```sql
SELECT /*+ TIDB_HJ(t1, t2) */ * from t1，t2 where t1.id = t2.id;
```

提示优化器使用 Hash Join 算法，简单来说，t1 表和 t2 表的 Hash Join 需要我们选择一个 Inner 表来构造哈希表，然后对 Outer 表的每一行数据都去这个哈希表中查找是否有匹配的数据这个算法多线程并发执行，执行速度较快，但会消耗较多内存。

另外其他的 hint 语法也在开发中如 /+ TIDB_STREAMAGG() / ，/+ TIDB_HASHAGG() / 等。

使用 Hint 通常是在执行计划发生变化的时候，通过修改 SQL 语句调整执行计划行为，但有的时候需要在不修改 SQL 语句的情况下干预执行计划的选择。 [执行计划绑定 ](https://docs.pingcap.com/zh/tidb/v4.0/sql-plan-management)提供了一系列功能使得可以在不修改 SQL 语句的情况下选择指定的执行计划。

### 使用 MAX_EXECUTION_TIME(N)

在 SELECT 等语句中可以使用 MAX_EXECUTION_TIME(N)，它会限制语句的执行时间不能超过 N 毫秒，否则服务器会终止这条语句的执行。 例如，下面例子设置了 1 秒超时

```sql
SELECT /*+ MAX_EXECUTION_TIME(1000) */  *  FROM t1
```

此外，环境变量 `MAX_EXECUTION_TIME`也会对语句执行时间进行限制。 对于高可用和时间敏感的业务， 建议使用 `MAX_EXECUTION_TIME`，免错误的查询计划或 bug 影响整个 TiDB 集群的性能甚至稳定性。 OLTP 业务查询超时一般不超过 5 秒。 需要注意的是，MySQL jdbc 的查询超时设置对 TiDB 不起作用。现实客户端感知超时时，向数据库发送一个 KILL 命令， 但是由于 tidb-server 是负载均衡的， 为防止在错误的 tidb-server 上终止连接， tidb-server 不会执行这个 KILL。这时就要用 `MAX_EXECUTION_TIME`保证查询超时的效果。

## 使用 SPM 绑定查询执行计划

**执行计划是影响 SQL 执行性能的一个非常关键的因素，SQL 执行计划的稳定性也对整个集群的效率有着非常大的影响**。然而，当出现类似统计信息过时、添加或者删除了索引等情况时，优化器并不能确保一定生成一个很好的执行计划。此时执行计划可能发生预期外的改变，导致执行时间过长。因此 TiDB 提供了 SQL Plan Management 功能，用于为某些类型的 SQL 绑定执行计划（SQL Bind），并且被绑定的执行计划会根据数据的变化而不断地演进（注：演进功能尚未 GA）。

SQL Bind 是 SQL Plan Management 的第一步。使用它，用户可以为某一类型的 SQL 绑定执行计划。当出现执行计划不优时，可以使用 SQL Bind 在不更改业务的情况下快速地对执行计划进行修复。 创建绑定可以使用如下的 SQL：

```sql
CREATE [GLOBAL | SESSION] BINDING FOR SelectStmt USING SelectStmt;
```

该语句可以在 GLOBAL 或者 SESSION 作用域内为 SQL 绑定执行计划。在不指定作用域时，默认作用域为 SESSION。被绑定的 SQL 会被参数化，然后存储到系统表中。在处理 SQL 查询时，只要参数化后的 SQL 和系统表中某个被绑定的 SQL 匹配即可使用相应的优化器 Hint。

“参数化” 指的是把 SQL 中的常量用 "?" 替代，统一语句中的大小写，清理掉多余的空格、换行符等操作。 创建一个绑定的例子：

```sql
TiDB(root@127.0.0.1:test) > create binding for select * from t where a = 1 using select * from t use index(idx_a) where a = 1;
Query OK, 0 rows affected (0.00 sec)
```

查看刚才创建的 binding，下面输出结果中 Original_sql 即为参数化后的 SQL：

```sql
TiDB(root@127.0.0.1:test) > show bindings;
+-----------------------------+----------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------------+
| Original_sql                | Bind_sql                                     | Default_db | Status | Create_time             | Update_time             | Charset | Collation       |
+-----------------------------+----------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------------+
| select * from t where a = ? | select * from t use index(idx_a) where a = 1 | test       | using  | 2020-03-08 14:00:28.819 | 2020-03-08 14:00:28.819 | utf8    | utf8_general_ci |
+-----------------------------+----------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------------+
1 row in set (0.00 sec)
```

如果要删除创建的 binding 可通过如下语句：

```sql
TiDB(root@127.0.0.1:test) > drop binding for select * from t where a = 1;
Query OK, 0 rows affected (0.00 sec)

TiDB(root@127.0.0.1:test) > show bindings;
Empty set (0.00 sec)
```

为了解决只能手动创建 Binding 的问题，4.0 版本中 TiDB 提供了自动创建 Binding 功能，通过将 tidb_capture_plan_baselines 变量的值设置为 on，就可以自动为某一段时间内出现多次的 SQL 去创建绑定。TiDB 会为那些出现了至少两次的 SQL 创建绑定，统计 SQL 的出现次数依赖 TiDB 4.0 版本中提供的 Statements Summary 功能。可通过如下方法打开自动为出现了两次以上的 SQL 创建绑定的开关：

```sql
set tidb_enable_stmt_summary = 1;       -- 开启 statement summary
set tidb_capture_plan_baselines = 1;    -- 开启自动绑定功能
```

接着连续跑两遍如下查询即可自动为其创建一条绑定：

```sql
TiDB(root@127.0.0.1:test) > select * from t;
Empty set (0.01 sec)

TiDB(root@127.0.0.1:test) > select * from t;
Empty set (0.00 sec)
```

再查看 global bindings 即可发现自动创建的 binding：

```sql
TiDB(root@127.0.0.1:test) > show global bindings;
+-----------------+---------------------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------+
| Original_sql    | Bind_sql                                                | Default_db | Status | Create_time             | Update_time             | Charset | Collation |
+-----------------+---------------------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------+
| select * from t | SELECT /*+ USE_INDEX(@`sel_1` `test`.`t` )*/ * FROM `t` | test       | using  | 2020-03-08 14:09:30.129 | 2020-03-08 14:09:30.129 |         |           |
+-----------------+---------------------------------------------------------+------------+--------+-------------------------+-------------------------+---------+-----------+
1 row in set (0.00 sec)
```

## 其它优化器开发或规划中的诊断调优功能

针对查询执行计划的监控，诊断，排查，和调优，**除了上述章节介绍的方法和功能外，TiDB 优化器开发了一些内部使用功能，同时目前还在开发或规划开发更多的相关功能**，将在后续版本中发布。这些功能包括但不限于：

**Plan Change Capture:** 用于验证在升级中是否会引起查询执行计划回归/变更；

**Plan Replayer:** 用于一键收集用户问题查询的相关信息，并一键导入 TiDB 用于问题复现以及查询计划的回归看护；

**Optimizer Trace:** 用于收集和监控优化器内部优化逻辑流程，提升用户现场的问题诊断能力和效率，并为后续的基于诊断监控的反馈优化提供数据输入；

**Visual Explain:** 图形化展示查询计划，特别是对于复杂查询的执行计划查看可以提升效率，并可在后续集成更多诊断信息；

**Optimizer Diagnosis and Advisor:** 优化器自诊断和优化建议功能；并与 TiDB Dashboard, Auto Pilot 等集成；

**SPM 扩展**：增加多基线计划版本绑定，改进完善绑定计划演进；

**Plan Hint**：完善并提供更丰富的 Plan Hint；

本文为「TiDB 查询优化及调优」系列文章的第四篇，详细介绍了如何通过 TiDB HINT 和 SPM 对查询执行计划进行调整和优化，简要列举了其他优化器开发或规划中的诊断调优功能等。**下篇文章为系列文章的最后一篇，将通过几个具体的案例介绍 TiDB 查询优化的实践**。

如果您对 TiDB 的产品有任何建议，欢迎来到 [internals.tidb.io ](https://internals.tidb.io/)与我们交流。

> 点击查看更多 [TiDB 查询优化及调优 ](https://pingcap.com/zh/blog/?tag=TiDB 性能调优)文章