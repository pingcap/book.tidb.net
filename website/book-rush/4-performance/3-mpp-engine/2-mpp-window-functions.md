---
title: TiDB 6.1 新特性解读 | TiDB 6.1 MPP 实现窗口函数框架
hide_title: true
---

# TiDB 6.1 新特性解读 | TiDB 6.1 MPP 实现窗口函数框架

> 作者：[ShawnYan](https://tidb.net/u/ShawnYan/post/all), DBA, TiDB Fans.


[TiDB v6.1.0 LTS](https://docs.pingcap.com/zh/tidb/stable/release-6.1.0) 已于6月13日发版，其中有一项关键特性为“MPP 实现窗口函数框架”。TiDB 中的窗口函数是在 TiDB 3.0 GA 版本引入，基本兼容 MySQL 8.0 所支持的窗口函数。

下面将演示本次发版引入 MPP 所支持的三个窗口函数，并扩展对比其他窗口函数在 TiDB 和 MariaDB 中的执行情况，最后以表格的形式展示几种常见数据库对窗口函数的支持情况。

## 窗口函数

先来回忆下窗口函数的定义：

窗口函数是在 SQL:2003 引入的，并在之后的 SQL 标准中不断增强。Wiki 中对窗口函数的表述为：

> 在SQL中，窗口函数或分析函数是使用一个或多个行的值为每一行返回一个值的函数。（这与聚合函数不同，聚合函数为多行返回一个值。）窗口函数有一个OVER子句；任何没有OVER子句的函数都不是窗口函数，而是聚合函数或单行(标量)函数。

注：在 Oracle 数据库中，窗口函数被称为分析函数（Analytic Functions）。

窗口函数可以分为非聚合窗口函数、聚合窗口函数两大类，本文主要介绍**非聚合窗口函数**。

### MySQL 8.0 支持的窗口函数

MySQL 8.0 支持 11 种窗口函数，即 `RANK() / ROW_NUMBER() / DENSE_RANK() / CUME_DIST() / FIRST_VALUE() / LAST_VALUE() / NTH_VALUE() / LAG() / LEAD() / NTILE() / PERCENT_RANK()`。

这 11 种窗口函数 TiDB 也均支持。

这里解释一下文章开头提到的“基本兼容 MySQL 8.0 所支持的窗口函数”，是因为 MySQL 8.0.14 支持 JSON 函数 `JSON_ARRAYAGG()` 作为窗口函数，而该函数目前 TiDB 尚未支持，具体可参考 [#7546](https://github.com/pingcap/tidb/issues/7546)。

### MPP 新增支持的三个窗口函数

书归正题，在 TiDB 6.1 版本中，TiFlash 新增支持 `RANK() / ROW_NUMBER() / DENSE_RANK()` 三个窗口函数，且仅可用于 MPP 模式。

```
dbms/src/Flash/Coprocessor/collectOutputFieldTypes.cpp
    case tipb::ExecType::TypeWindow:
        // Window will only be pushed down in mpp mode.
        // In mpp mode, ExchangeSender or Sender will return output_field_types directly.
        // If not in mpp mode, window executor type is invalid.
        throw TiFlashException("Window executor type is invalid in non-mpp mode, should not reach here.", Errors::Coprocessor::Internal);
```

下面对窗口函数进行实际演示。

#### 测试数据

创建测试表，并写入测试数据。

```
DROP TABLE if EXISTS student;
CREATE TABLE if NOT EXISTS student (course VARCHAR(10), mark INT, name VARCHAR(10));

INSERT INTO student VALUES
('Maths', 60, 'Thulile'),
('Maths', 60, 'Pritha'),
('Maths', 70, 'Voitto'),
('Maths', 55, 'Chun'),
('Biology', 60, 'Bilal'),
('Biology', 70, 'Roger');
```

#### RANK() / ROW\_NUMBER() / DENSE\_RANK()

1. 功能描述

- RANK()：返回分区中当前行的排名，排名可能不连续。
- ROW\_NUMBER()：返回分区中当前行的编号。相同结果顺序排名，编号不相同。
- DENSE\_RANK()：返回分区中当前行的排名。相同结果相同排名。

2. 演示结果

```
TiDB [test] 21:38:44> SELECT RANK() OVER w AS `rank`, ROW_NUMBER() OVER w AS `row_num`, DENSE_RANK() OVER w AS `dense_rank`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+------+---------+------------+---------+------+---------+
| rank | row_num | dense_rank | course  | mark | name    |
+------+---------+------------+---------+------+---------+
|    1 |       1 |          1 | Biology |   70 | Roger   |
|    2 |       2 |          2 | Biology |   60 | Bilal   |
|    1 |       1 |          1 | Maths   |   70 | Voitto  |
|    2 |       2 |          2 | Maths   |   60 | Thulile |
|    2 |       3 |          2 | Maths   |   60 | Pritha  |
|    4 |       4 |          3 | Maths   |   55 | Chun    |
+------+---------+------------+---------+------+---------+
6 rows in set (0.005 sec)
```

3. 一般执行计划

```
TiDB [test] 21:38:46> explain SELECT RANK() OVER w AS `rank`, ROW_NUMBER() OVER w AS `row_num`, DENSE_RANK() OVER w AS `dense_rank`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+--------------------------------+----------+-----------+---------------+----------------------------------------------------------------------------------------------------------------------------------------+
| id                             | estRows  | task      | access object | operator info                                                                                                                          |
+--------------------------------+----------+-----------+---------------+----------------------------------------------------------------------------------------------------------------------------------------+
| Projection_8                   | 10000.00 | root      |               | Column#9, Column#8, Column#10, test.student.course, test.student.mark, test.student.name                                               |
| └─Window_9                     | 10000.00 | root      |               | rank()->Column#9, dense_rank()->Column#10 over(partition by test.student.course order by test.student.mark desc)                       |
|   └─Window_10                  | 10000.00 | root      |               | row_number()->Column#8 over(partition by test.student.course order by test.student.mark desc rows between current row and current row) |
|     └─Sort_14                  | 10000.00 | root      |               | test.student.course, test.student.mark:desc                                                                                            |
|       └─TableReader_13         | 10000.00 | root      |               | data:TableFullScan_12                                                                                                                  |
|         └─TableFullScan_12     | 10000.00 | cop[tikv] | table:student | keep order:false, stats:pseudo                                                                                                         |
+--------------------------------+----------+-----------+---------------+----------------------------------------------------------------------------------------------------------------------------------------+
6 rows in set (0.002 sec)
```

4. 创建 TiFlash 副本后走 MPP 框架的执行计划

```
TiDB [test] 21:44:13> explain SELECT RANK() OVER w AS `rank`, ROW_NUMBER() OVER w AS `row_num`, DENSE_RANK() OVER w AS `dense_rank`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+--------------------------------------+---------+--------------+---------------+----------------------------------------------------------------------------------------------------------------------------------------+
| id                                   | estRows | task         | access object | operator info                                                                                                                          |
+--------------------------------------+---------+--------------+---------------+----------------------------------------------------------------------------------------------------------------------------------------+
| Projection_8                         | 6.00    | root         |               | Column#9, Column#8, Column#10, test.student.course, test.student.mark, test.student.name                                               |
| └─TableReader_19                     | 6.00    | root         |               | data:ExchangeSender_18                                                                                                                 |
|   └─ExchangeSender_18                | 6.00    | mpp[tiflash] |               | ExchangeType: PassThrough                                                                                                              |
|     └─Window_9                       | 6.00    | mpp[tiflash] |               | rank()->Column#9, dense_rank()->Column#10 over(partition by test.student.course order by test.student.mark desc)                       |
|       └─Window_11                    | 6.00    | mpp[tiflash] |               | row_number()->Column#8 over(partition by test.student.course order by test.student.mark desc rows between current row and current row) |
|         └─Sort_16                    | 6.00    | mpp[tiflash] |               | test.student.course, test.student.mark:desc                                                                                            |
|           └─ExchangeReceiver_15      | 6.00    | mpp[tiflash] |               |                                                                                                                                        |
|             └─ExchangeSender_14      | 6.00    | mpp[tiflash] |               | ExchangeType: HashPartition, Hash Cols: [name: test.student.course, collate: utf8mb4_bin]                                              |
|               └─TableFullScan_13     | 6.00    | mpp[tiflash] | table:student | keep order:false, stats:pseudo                                                                                                         |
+--------------------------------------+---------+--------------+---------------+----------------------------------------------------------------------------------------------------------------------------------------+
9 rows in set (0.002 sec)
```

**从此用例可以看出，正常执行窗口函数时，TiKV 只做表扫，计算压力集中在 TiDB Server，而开启 MPP 后，计算压力可以分摊到 TiFlash 节点，计算完成后，再将结果集返回到 TiDB Server。**

5. MariaDB 10.6 中的执行计划

```
mysql> select version()\G
*************************** 1. row ***************************
version(): 10.6.7-MariaDB-log
1 row in set (0.00 sec)

mysql> explain SELECT RANK() OVER w AS `rank`, ROW_NUMBER() OVER w AS `row_num`, DENSE_RANK() OVER w AS `dense_rank`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+------+-------------+---------+------+---------------+------+---------+------+------+-----------------+
| id   | select_type | table   | type | possible_keys | key  | key_len | ref  | rows | Extra           |
+------+-------------+---------+------+---------------+------+---------+------+------+-----------------+
|    1 | SIMPLE      | student | ALL  | NULL          | NULL | NULL    | NULL | 6    | Using temporary |
+------+-------------+---------+------+---------------+------+---------+------+------+-----------------+
1 row in set (0.00 sec)
```

MariaDB 对于窗口函数的实现方式是全表扫描并产生临时表（`Using temporary`）进行计算，对于分析型业务，这种处理方式会使临时数据落盘，通过临时文件的形式处理数据排序，存在的问题也是明显的，会增加磁盘IO的压力，而且是单点计算，不具备横向扩展性。

#### CUME\_DIST() / PERCENT\_RANK()

1. 功能描述

- CUME\_DIST()：返回一行数据的累积分布值（Cumulative distribution）。
- PERCENT\_RANK()：返回排行百分比值。

2. 执行结果

```
TiDB [test] 22:08:29> SELECT CUME_DIST() OVER w AS `cume_dist`, PERCENT_RANK() OVER w AS `pct_rank`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+-----------+--------------------+---------+------+---------+
| cume_dist | pct_rank           | course  | mark | name    |
+-----------+--------------------+---------+------+---------+
|       0.5 |                  0 | Biology |   70 | Roger   |
|         1 |                  1 | Biology |   60 | Bilal   |
|      0.25 |                  0 | Maths   |   70 | Voitto  |
|      0.75 | 0.3333333333333333 | Maths   |   60 | Thulile |
|      0.75 | 0.3333333333333333 | Maths   |   60 | Pritha  |
|         1 |                  1 | Maths   |   55 | Chun    |
+-----------+--------------------+---------+------+---------+
6 rows in set (0.016 sec)
```

3. 执行计划

```
TiDB [test] 21:57:56> explain SELECT CUME_DIST() OVER w AS `cume_dist`, PERCENT_RANK() OVER w AS `pct_rank`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+--------------------------------+---------+--------------+---------------+------------------------------------------------------------------------------------------------------------------------+
| id                             | estRows | task         | access object | operator info                                                                                                          |
+--------------------------------+---------+--------------+---------------+------------------------------------------------------------------------------------------------------------------------+
| Projection_6                   | 6.00    | root         |               | Column#7, Column#8, test.student.course, test.student.mark, test.student.name                                          |
| └─Shuffle_13                   | 6.00    | root         |               | execution info: concurrency:4, data sources:[TableReader_11]                                                           |
|   └─Window_7                   | 6.00    | root         |               | cume_dist()->Column#7, percent_rank()->Column#8 over(partition by test.student.course order by test.student.mark desc) |
|     └─Sort_12                  | 6.00    | root         |               | test.student.course, test.student.mark:desc                                                                            |
|       └─TableReader_11         | 6.00    | root         |               | data:TableFullScan_10                                                                                                  |
|         └─TableFullScan_10     | 6.00    | cop[tiflash] | table:student | keep order:false, stats:pseudo                                                                                         |
+--------------------------------+---------+--------------+---------------+------------------------------------------------------------------------------------------------------------------------+
6 rows in set (0.002 sec)
```

#### FIRST\_VALUE() / LAST\_VALUE() / NTH\_VALUE() / NTILE()

1. 功能描述

- FIRST\_VALUE()：返回窗口框架第一行的参数值。
- LAST\_VALUE()：返回窗口框架最后一行的参数值。
- NTH\_VALUE()：返回窗口框架第N行的参数值。
- NTILE()：将有序数据分为N个桶，返回当前行所在分区中的桶数。

2. 执行结果

```
TiDB [test] 22:13:04> SELECT FIRST_VALUE(mark) OVER w AS `first`, LAST_VALUE(mark) OVER w AS `last`, NTH_VALUE(mark, 2) OVER w AS `second`, NTILE(2) over w as 'ntile', course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+-------+------+--------+-------+---------+------+---------+
| first | last | second | ntile | course  | mark | name    |
+-------+------+--------+-------+---------+------+---------+
|    70 |   70 |   NULL |     1 | Biology |   70 | Roger   |
|    70 |   60 |     60 |     2 | Biology |   60 | Bilal   |
|    70 |   70 |   NULL |     1 | Maths   |   70 | Voitto  |
|    70 |   60 |     60 |     1 | Maths   |   60 | Thulile |
|    70 |   60 |     60 |     2 | Maths   |   60 | Pritha  |
|    70 |   55 |     60 |     2 | Maths   |   55 | Chun    |
+-------+------+--------+-------+---------+------+---------+
6 rows in set (0.021 sec)
```

3. 执行计划

```
TiDB [test] 22:12:14> explain SELECT FIRST_VALUE(mark) OVER w AS `first`, LAST_VALUE(mark) OVER w AS `last`, NTH_VALUE(mark, 2) OVER w AS `second`, NTILE(2) over w as 'ntile', course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+--------------------------------+---------+--------------+---------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| id                             | estRows | task         | access object | operator info                                                                                                                                                                                                                                            |
+--------------------------------+---------+--------------+---------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Projection_8                   | 6.00    | root         |               | Column#10, Column#11, Column#12, Column#9, test.student.course, test.student.mark, test.student.name                                                                                                                                                     |
| └─Window_9                     | 6.00    | root         |               | first_value(test.student.mark)->Column#10, last_value(test.student.mark)->Column#11, nth_value(test.student.mark, 2)->Column#12 over(partition by test.student.course order by test.student.mark desc range between unbounded preceding and current row) |
|   └─Window_10                  | 6.00    | root         |               | ntile(2)->Column#9 over(partition by test.student.course order by test.student.mark desc)                                                                                                                                                                |
|     └─Sort_16                  | 6.00    | root         |               | test.student.course, test.student.mark:desc                                                                                                                                                                                                              |
|       └─TableReader_15         | 6.00    | root         |               | data:TableFullScan_14                                                                                                                                                                                                                                    |
|         └─TableFullScan_14     | 6.00    | cop[tiflash] | table:student | keep order:false, stats:pseudo                                                                                                                                                                                                                           |
+--------------------------------+---------+--------------+---------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
6 rows in set (0.001 sec)
```

#### LAG() / LEAD()

1. 功能描述

- LAG()：返回分区中滞后于当前行的参数的值。
- LEAD()：返回分区中领先于当前行的参数的值。

2. 执行结果

```
TiDB [test] 22:16:14> SELECT LAG(mark) OVER w AS `lag`, LEAD(mark) OVER w AS `lead`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+------+------+---------+------+---------+
| lag  | lead | course  | mark | name    |
+------+------+---------+------+---------+
| NULL |   60 | Biology |   70 | Roger   |
|   70 | NULL | Biology |   60 | Bilal   |
| NULL |   60 | Maths   |   70 | Voitto  |
|   70 |   60 | Maths   |   60 | Thulile |
|   60 |   55 | Maths   |   60 | Pritha  |
|   60 | NULL | Maths   |   55 | Chun    |
+------+------+---------+------+---------+
6 rows in set (0.020 sec)
```

3. 执行计划

```
TiDB [test] 22:13:25> explain SELECT LAG(mark) OVER w AS `lag`, LEAD(mark) OVER w AS `lead`, course, mark, name FROM student window w AS (PARTITION BY course ORDER BY mark DESC);
+--------------------------------+---------+--------------+---------------+--------------------------------------------------------------------------------------------------------------------------------------------+
| id                             | estRows | task         | access object | operator info                                                                                                                              |
+--------------------------------+---------+--------------+---------------+--------------------------------------------------------------------------------------------------------------------------------------------+
| Projection_6                   | 6.00    | root         |               | Column#7, Column#8, test.student.course, test.student.mark, test.student.name                                                              |
| └─Shuffle_13                   | 6.00    | root         |               | execution info: concurrency:4, data sources:[TableReader_11]                                                                               |
|   └─Window_7                   | 6.00    | root         |               | lag(test.student.mark)->Column#7, lead(test.student.mark)->Column#8 over(partition by test.student.course order by test.student.mark desc) |
|     └─Sort_12                  | 6.00    | root         |               | test.student.course, test.student.mark:desc                                                                                                |
|       └─TableReader_11         | 6.00    | root         |               | data:TableFullScan_10                                                                                                                      |
|         └─TableFullScan_10     | 6.00    | cop[tiflash] | table:student | keep order:false, stats:pseudo                                                                                                             |
+--------------------------------+---------+--------------+---------------+--------------------------------------------------------------------------------------------------------------------------------------------+
6 rows in set (0.003 sec)
```

## 常见数据库对窗口函数的支持情况

通过对几款常用数据库的调研比对，均支持常见的 11 种窗口函数。其中，在 openGauss 中，列存表目前只支持 `rank()` 和 `row_number()` 两个函数。另外，MariaDB 额外支持三种窗口函数，分别是 `MEDIAN() / PERCENTILE_CONT() / PERCENTILE_DISC()`。

| #  | 窗口函数             | TiDB(>3.0) | TiDB MPP(>6.1) | MySQL(>8.0) | MariaDB(>10.2) | openGauss | OceanBase |
| -- | ---------------- | ---------- | -------------- | ----------- | -------------- | --------- | --------- |
| 1  | RANK()           | Y          | Y              | Y           | Y              | Y(列存表)    | Y         |
| 2  | ROW\_NUMBER()    | Y          | Y              | Y           | Y              | Y(列存表)    | Y         |
| 3  | DENSE\_RANK()    | Y          | Y              | Y           | Y              | Y         | Y         |
| 4  | CUME\_DIST()     | Y          | cannot         | Y           | Y              | Y         | Y         |
| 5  | PERCENT\_RANK()  | Y          | cannot         | Y           | Y              | Y         | Y         |
| 6  | FIRST\_VALUE()   | Y          | cannot         | Y           | Y              | Y         | Y         |
| 7  | LAST\_VALUE()    | Y          | cannot         | Y           | Y              | Y         | Y         |
| 8  | NTH\_VALUE()     | Y          | cannot         | Y           | Y              | Y         | Y         |
| 9  | NTILE()          | Y          | cannot         | Y           | Y              | Y         | Y         |
| 10 | LAG()            | Y          | cannot         | Y           | Y              | Y         | Y         |
| 11 | LEAD()           | Y          | cannot         | Y           | Y              | Y         | Y         |
| 12 | MEDIAN           | cannot     | cannot         | cannot      | Y(10.3.3)      | cannot    | cannot    |
| 13 | PERCENTILE\_CONT | cannot     | cannot         | cannot      | Y(10.3.3)      | cannot    | cannot    |
| 14 | PERCENTILE\_DISC | cannot     | cannot         | cannot      | Y(10.3.3)      | cannot    | cannot    |

## 总结

1. 通过将窗口函数下推到 MPP 计算框架，减轻 TiDB Server 的单点计算压力，将计算压力分摊到各个 TiFlash 节点，从而支持并行计算，提升查询性能。
2. 对于 OLAP 业务，建议考虑将普通查询改写为窗口函数，以提升查询效率。
3. 对于 TiDB v4.0 之前的老版本升级到新版本的场景，`tidb_enable_window_function` 参数会默认设为0，需要手动开启。[#13866](https://github.com/pingcap/tidb/issues/13866)
4. 最后，希望在之后的版本中，MPP 架构可以支持更多的窗口函数。

## References

- [窗口函数](https://docs.pingcap.com/zh/tidb/stable/window-functions)
- [【TiDB 社区版主推荐阅读】SQL 窗口函数速查表](https://tidb.net/blog/411fb363)
- [TiDB 3.0：窗口函数初体验](https://tidb.net/blog/a523b8ec)
- [窗口函数的 TiSpark 实现](https://tidb.net/blog/5e697bac)
