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


## 章节目录

- [TiDB 6.0 新特性解读 | TiFlash 新增算子和函数下推](1-tiflash-pushing-down.md) By [严少安](https://tidb.net/u/ShawnYan/post/all) 
- [TiDB 6.1 新特性解读 | TiDB 6.1 MPP 实现窗口函数框架](2-mpp-window-functions.md) By [严少安](https://tidb.net/u/ShawnYan/post/all)