---
title: TiDB 6.0 新特性解读 | TiFlash 新增算子和函数下推
hide_title: true
---

# TiDB 6.0 新特性解读 | TiFlash 新增算子和函数下推

> 作者：[ShawnYan](https://tidb.net/u/ShawnYan/post/all), DBA, TiDB Fans.

TiDB 6.0 对 TiFlash 的功能做了进一步增强，其中新增支持了 12 个函数和 2 个算子下推到 TiFlash 层的 MPP 引擎进行计算。

本文将对其逐一进行演示，以期快速、直观的展示这些新特性。

## TiFlash 和 MPP 引擎

先来简要回顾一下相关概念。

- TiFlash 是 TiDB HTAP 形态的关键组件，它是 TiKV 的列存扩展。
- TiFlash 于2022年4月1日正式开源，主要功能包括列式存储提高分析查询效率，支持强一致性和实时性等，并提供了良好的隔离性。
- TiFlash 的引入，为 MPP 架构提供了技术基础，MPP 架构解决了多表 JOIN 场景下的计算节点的扩展性与并行计算的问题。
- TiFlash 通过在存储层分担计算下推，从而实现对 TiDB 的计算加速。

## 新增支持下推函数汇总

从 TiDB 6.0 的[发版说明](https://docs.pingcap.com/zh/tidb/v6.0/release-6.0.0-dmr#%E6%8F%90%E5%8D%87%E6%94%B9%E8%BF%9B)中可以清晰的看到，这次大版本迭代给 TiFlash 支持计算下推带来了进一步扩展，共计新增支持了 12 个函数，以及 2 个算子，原文如下。

> 支持下推 DAYNAME()和 MONTHNAME() 函数到 TiFlash #32594
>
> 支持下推 REGEXP 函数到 TiFlash #32637
>
> 支持下推 DAYOFMONTH()，LAST\_DAY() 函数到 TiFlash #33012
>
> 支持下推 DAYOFWEEK() 和 DAYOFYEAR() 函数到 TiFlash #33130
>
> 支持下推 IS\_TRUE、IS\_FALSE、IS\_TRUE\_WITH\_NULL 函数到 TiFlash #33047
>
> 支持下推 GREATEST 和 LEAST 函数到 TiFlash #32787
>
> 算子：Anti Left Outer Semi Join, Left Outer Semi Join

从文档中提供的线索，我们可以反向推演，经寻找代码变更，汇总可知，主要对文件 `expression.go` 进行了修改，主要修改的代码如下。

已对代码进行了标注，增加了行数和相关 RP 号，以供参考。

```
// L1051
case
   ast.LogicOr, ast.LogicAnd, ast.UnaryNot, ast.BitNeg, ast.Xor, ast.And, ast.Or,
   ast.GE, ast.LE, ast.EQ, ast.NE, ast.LT, ast.GT, ast.In, ast.IsNull, ast.Like, ast.Strcmp,
   ast.Plus, ast.Minus, ast.Div, ast.Mul, ast.Abs, ast.Mod,
   ast.If, ast.Ifnull, ast.Case,
   ast.Concat, ast.ConcatWS,
   ast.Date, ast.Year, ast.Month, ast.Day, ast.Quarter, ast.DayName, ast.MonthName, -- #32594
   ast.DateDiff, ast.TimestampDiff, ast.DateFormat, ast.FromUnixTime,
   ast.DayOfMonth, ast.LastDay, -- #33012
   ast.DayOfWeek, ast.DayOfYear, -- #33130

   ast.Sqrt, ast.Log, ast.Log2, ast.Log10, ast.Ln, ast.Exp, ast.Pow, ast.Sign,
   ast.Radians, ast.Degrees, ast.Conv, ast.CRC32,
   ast.JSONLength,
   ast.InetNtoa, ast.InetAton, ast.Inet6Ntoa, ast.Inet6Aton,
   ast.Coalesce, ast.ASCII, ast.Length, ast.Trim, ast.Position, ast.Format,
   ast.LTrim, ast.RTrim, ast.Lpad, ast.Rpad, ast.Regexp, -- #32637
   ast.Hour, ast.Minute, ast.Second, ast.MicroSecond:

// L1155
case ast.Least, ast.Greatest: -- #32787
   switch function.Function.PbCode() {
   case tipb.ScalarFuncSig_GreatestInt, tipb.ScalarFuncSig_GreatestReal,
      tipb.ScalarFuncSig_LeastInt, tipb.ScalarFuncSig_LeastReal:
      return true
   }

// L1161
case ast.IsTruthWithNull, ast.IsTruthWithoutNull, ast.IsFalsity: -- #33047
   return true
}
```

将 TiFlash 6.0 新增算子对应的函数名、SQL的函数名，按函数类型归类，总结成下表，更便于查阅和分析。

| Issue  | 代码中的函数名                                                    | SQL中的函数名                            | 函数类型  | 功能描述                                                  |
| ------ | ---------------------------------------------------------- | ----------------------------------- | ----- | ----------------------------------------------------- |
| [#32594](https://github.com/pingcap/tidb/issues/32594) | ast.DayName, ast.MonthName                                 | DAYNAME(), MONTHNAME()              | 日期函数  | 返回星期名称；返回参数的月份名称                                      |
| [#33012](https://github.com/pingcap/tidb/issues/33012) | ast.DayOfMonth, ast.LastDay                                | DAYOFMONTH(), LAST\_DAY()           | 日期函数  | 返回参数对应的天数部分(1-31)；返回参数中月份的最后一天                        |
| [#33130](https://github.com/pingcap/tidb/issues/33130) | ast.DayOfWeek, ast.DayOfYear                               | DAYOFWEEK(), DAYOFYEAR()            | 日期函数  | 返回参数对应的星期下标；返回参数代表一年的哪一天 (1-366)                      |
| [#32637](https://github.com/pingcap/tidb/issues/32637) | ast.Regexp                                                 | REGEXP                              | 字符串函数 | 使用正则表达式匹配模式                                           |
| [#32787](https://github.com/pingcap/tidb/issues/32787) | ast.Least, ast.Greatest                                    | LEAST(), GREATEST()                 | 操作符   | 返回最小值；返回最大值                                           |
| [#33047](https://github.com/pingcap/tidb/issues/33047) | ast.IsTruthWithNull, ast.IsTruthWithoutNull, ast.IsFalsity | istrue\_with\_null, istrue, isfalse | 操作符   | 判断是否为真，如果结果为null，则返回null；判断是否为真，如果结果为null，则返回0；判断是否为假 |

## 新增支持算子下推汇总

本次版本迭代新增支持了两个算子可以下推至 MPP 引擎，分别是 `Left Outer Semi Join` 和 `Anti Left Outer Semi Join`。

中文表述为左外半连接（`Left Outer Semi Join`）和反左外半连接（`Anti Left Outer Semi Join`），半连接意为仅需要匹配第一行后就可以停止查询，而“反”则表示有不存在匹配值（即 `NOT IN`）的情况。

查阅历史发版说明可知，在 TiDB 3.0 发版时，针对 `NOT EXISTS` 子查询进行优化，将其转化为 `Anti Semi Join` [#7842](https://github.com/pingcap/tidb/pull/7842)。而在 TiFlash 中的这两种 Join 都是基于 Hash Join 实现，对于大、宽表关联查询的场景，会比使用索引关联的效率更高。

## 新特性演示

- TiDB 版本

```
TiDB-v6> select tidb_version()\G
*************************** 1. row ***************************
tidb_version(): Release Version: v6.0.0
Edition: Community
Git Commit Hash: 36a9810441ca0e496cbd22064af274b3be771081
Git Branch: heads/refs/tags/v6.0.0
UTC Build Time: 2022-03-31 10:33:28
GoVersion: go1.18
Race Enabled: false
TiKV Min Version: v3.0.0-60965b006877ca7234adaced7890d7b029ed1306
Check Table Before Drop: false
1 row in set (0.001 sec)
```

- 准备测试表、数据

```
USE test;
DROP TABLE IF EXISTS t;
CREATE TABLE t (id int, dc datetime, cc1 char(20), cc2 char(20));
INSERT INTO t VALUES (1, '2022-04-30 15:33:10', 'UUtJeaV', 'snRXXCZHBPW'), (2, '2022-05-01 15:33:20', 'snRXXCZHBPW', 'UUtJeaV');
ANALYZE TABLE t;
```

- 创建 TiFlash 数据副本，并强制开启 MPP 模式

```
ALTER TABLE t SET TIFLASH REPLICA 1;
SELECT * FROM information_schema.tiflash_replica;

// TiDB 无视代价估算，选择 MPP 模式。
set @@session.tidb_allow_mpp=1;
set @@session.tidb_enforce_mpp=1;
```

- 日期函数

由上表可知本次迭代共涉及6个日期函数，下面将用 SQL 来做演示，从执行计划中可以看到已经支持函数下推到 TiFlash。后面演示过程以此类推。

```
explain 
select DAYNAME(dc), MONTHNAME(dc), DAYOFMONTH(dc), LAST_DAY(dc), DAYOFWEEK(dc), DAYOFYEAR(dc) from t;
```

![1.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1651834562513.jpg)

- 字符串函数 `REGEXP`

在过滤条件中增加正则判定，过滤以 `U` 开头的数据。但是，这里收到了一条警告信息，当前不支持下推到 TiKV。

```
explain 
select * from t where t.cc1 regexp '^U';
```

![2.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/2-1651834571251.jpg)

- 操作符 `LEAST()`, `GREATEST()`

在过滤条件中增加最小值、最大值判断。

```
explain 
select * from t where least(id, 2) < 2;

explain
select * from t where GREATEST(id, 1) > 1;
```

![3.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3-1651834580601.jpg)

- 操作符 `istrue_with_null`, `istrue`, `isfalse`

判断结果真假。这三个操作符的官方文档内容较少，在准备文章的时候已提交了 [Issue](https://github.com/pingcap/docs-cn/issues/9295)，相信官方会进行补充完善。

```
explain 
select istrue_with_null(id > 1), istrue(id = 1), isfalse(id = 1) from t;
```

![4.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/4-1651834666255.jpg)

- 算子 `Left Outer Semi Join`、`Anti Left Outer Semi Join`

新增支持下推的 2 个算子，上文新特性描述已做出阐释，下面这两条 SQL 的区别在于第二条语句使用了 `NOT IN`。

```
explain 
select 1 from (select t.id in (select t.id from t) from t) x;

explain 
select 1 from (select t.id not in (select t.id from t) from t) x;
```

![5.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/5-1651834672485.jpg)

## 使用建议

对于本文提及的支持计算下推的新特性已经正式发布，可以放心使用。

但是这里提示一个使用建议，即 GBK 字符集的表是不能同步到 TiFlash 的，会报下面这个错误。

```
ERROR 8200 (HY000): Unsupported ALTER table replica for table contain gbk charset
```

也就是说，如果数据表使用了 GBK 字符集，就无法使用本文解读的这些新特性。

引申一步，从源码文件 `charset.go` 的 `TiFlashSupportedCharsets` 变量可知，目前 TiFlash 所支持的字符集有 `UTF8, UTF8MB4, ASCII, Latin1, Binary` 这5种。

所以，一般情况下，在创建数据表时，不建议使用 GBK 字符集。如果是迁移或重构项目，建议将数据转换为 UTF8mb4。

## 总结

本文对 TiFlash 新支持下推的函数和算子进行了汇总，并进行逐一演示。

从 TiDB v4 正式发布 TiFlash 组件，到 v5 引入 MPP 引擎，再到伴随 v6 的发布而正式宣布开源，TiFlash 已经逐步成熟，成为 TiDB 走向 HTAP 的关键组件。

期待 TiFlash 可以支持更多下推函数和算子。期望 TiFlash 可以运行得更快、更稳。
