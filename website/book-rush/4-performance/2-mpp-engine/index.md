---
title: 2. MPP 引擎计算性能提升
hide_title: true
---

# 2. MPP 引擎计算性能提升

在 TiDB 6.0 中，通过支持更多函数和算子下推至 MPP 引擎，持续提升 MPP 引擎计算性能：

- 逻辑函数： `IS`，`IS NOT`

- 字符串函数：`REGEXP()`，`NOT REGEXP()`

- 数学函数：`GREATEST(int/real)`，`LEAST(int/real)`

- 日期函数：`DAYOFNAME()`，`DAYOFMONTH()`，`DAYOFWEEK()`，`DAYOFYEAR()`，`LAST_DAY()`，`MONTHNAME()`

- 算子：Anti Left Outer Semi Join, Left Outer Semi Join

  [用户文档](https://docs.pingcap.com/zh/tidb/v6.0/use-tiflash#tiflash-支持的计算下推)



在此目录下，你可以撰写针对这些特性的体验和实践文章。
