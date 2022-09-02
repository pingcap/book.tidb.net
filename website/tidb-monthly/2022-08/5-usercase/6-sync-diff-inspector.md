---
title: sync-diff-inspector 使用实践 - TiDB 社区技术月刊
sidebar_label: sync-diff-inspector 使用实践
hide_title: true
description: 在数据同步的场景下，上下游数据的一致性校验是非常重要的一个环节，缺少数据校验，在某种程度上甚至可以说名整个数据同步是无效的。sync-diff-inspector 是一个用于校验 MySQL／TiDB 中两份数据是否一致的工具。该工具提供了修复数据的功能（适用于修复少量不一致的数据）。
keywords: [TiDB, sync-diff-inspector, 数据校验, MySQL]
---

# sync-diff-inspector 使用实践

> 作者：banana_jian

## 简介

在数据同步的场景下，上下游数据的一致性校验是非常重要的一个环节，缺少数据校验，在某种程度上甚至可以说名整个数据同步是无效的。sync-diff-inspector 是一个用于校验 MySQL／TiDB 中两份数据是否一致的工具。该工具提供了修复数据的功能（适用于修复少量不一致的数据）。首先我们看下 Sync-diff-inspector 的架构图，了解一下 Sync-diff-inspector 的作用和实现原。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1659059949644.png)

## 主要功能

- 对比表结构和数据
- 如果数据不一致，则生成用于修复数据的 SQL 语句
- 支持不同库名或表名的数据校验
- 支持分库分表场景下的数据校验
- 支持 TiDB 主从集群的数据校验
- 支持从 TiDB DM 拉取配置的数据校验

## 工具下载

https://download.pingcap.org/tidb-community-toolkit-v6.1.0-linux-amd64.tar.gz

[tidb@jian tidb-community-toolkit-v6.1.0-linux-amd64]$ pwd

/home/tidb/tidb-community-toolkit-v6.1.0-linux-amd64

[tidb@jian tidb-community-toolkit-v6.1.0-linux-amd64]$ ls sync_diff_inspector

sync_diff_inspector


## 数据库用户创建

sync-diff-inspector 需要获取表结构信息、查询数据，需要的数据库权限如下：

源端的目标端的权限需求是一样的

```
(root@127.0.01) [jian] 16:44:25> create user data_check@'%' identified by '123456';

Query OK, 0 rows affected (0.04 sec)

(root@127.0.01) [jian] 16:44:41>  grant show databases,reload,select on *.* to data_check@'%';

Query OK, 0 rows affected (0.40 sec)
```
## 实践

### 1 对比源端和目标端的同一张表

#### 数据状态

源端：                                                     目标端：

(root@localhost) [jian] 16:55:48> select * from jian.jiantb;          (root@127.0.01) [jian] 16:53:32> select * from jian.jiantb;

+------+------+                                                  +------+------+

| id  | name |                                                     | id  | name |

+------+------+                                                  +------+------+

|  1 | a  |                                                        |  1 | a  |

|  2 | a  |                                                        |  2 | a  |

|  3 | a  |                                                       +------+------+

+------+------+         

对于以上的数据情况我们期望看到的结果是检查数据一致性失败，并且提供sql可以插入目标端不存在的数据（3，‘a’）

### 配置文件

```
export-fix-sql = true
check-struct-only = false

[data-sources]
[data-sources.mysql1]

    host = "192.168.135.149"
    port = 3306
    user = "root"
    password = "123456"
[data-sources.tidb0]

    host = "127.0.0.1"
    port = 4000
    user = "root"
    password = "123456"
[task]

    output-dir = "./output"
    source-instances = ["mysql1"]
    target-instance = "tidb0"
    target-check-tables = ["jian.jiantb"]
```

#### 执行校验

[tidb@jian ~]$ sync_diff_inspector --config=sync_check

A total of 1 tables need to be compared

Comparing the table structure of ``jian`.`jiantb`` ... equivalent

Comparing the table data of ``jian`.`jiantb`` ... failure

_____________________________________________________________________________

Progress [============================================================>] 100% 0/0

The data of `jian`.`jiantb` is not equal

The rest of tables are all equal.

The patch file has been generated in

'output/fix-on-tidb0/'

You can view the comparision details through './output/sync_diff.log'


#### 修复sql查看

[tidb@jian ~]$ cat output/fix-on-tidb0/jian\:jiantb\:0\:0-0\:0.sql

-- table: jian.jiantb

-- range in sequence: Full

REPLACE INTO `jian`.`jiantb`(`id`,`name`) VALUES (3,'a');


### 2 源端和目标端的表名不同

#### 数据状态

源端：                                                     目标端：

(root@localhost) [jian] 16:55:48> select * from jian.yao;          (root@127.0.01) [jian] 16:53:32> select * from jian.jiantb;

+------+------+                                                  +------+------+

| id  | name |                                                     | id  | name |

+------+------+                                                  +------+------+

|  1 | a  |                                                        |  1 | a  |

+------+------+                                                    |  2 | a  |

​                                                               +------+------+

对于以上的数据情况我们期望看到的结果是，检查出jian.yao和jian.jiantb两张不同表名的表检查数据一致性失败，并且提供sql可以删除源端不存在的数据（2，‘a’）

#### 配置文件

```
export-fix-sql = true

check-struct-only = false

[data-sources]

[data-sources.mysql1]

    host = "192.168.135.149"
    port = 3306
    user = "root"
    password = "123456"
    route-rules = ["rule1"]
[data-sources.tidb0]

    host = "127.0.0.1"
    port = 4000
    user = "root"
    password = "123456"

[routes]
[routes.rule1]

schema-pattern = "jian"
table-pattern = "yao"
target-schema = "jian"
target-table = "jiantb"
[task]

    output-dir = "./output"
    source-instances = ["mysql1"]
    target-instance = "tidb0"
    target-check-tables = ["jian.jiantb"]
```

#### 执行校验

[tidb@jian ~]$ sync_diff_inspector --config=sync_check2

A total of 1 tables need to be compared

Comparing the table structure of ``jian`.`jiantb`` ... equivalent

Comparing the table data of ``jian`.`jiantb`` ... failure

_____________________________________________________________________________

Progress [============================================================>] 100% 0/0

The data of `jian`.`jiantb` is not equal

The rest of tables are all equal.

The patch file has been generated in

    'output/fix-on-tidb0/'

You can view the comparision details through './output/sync_diff.log'



#### 修复sql查看

[tidb@jian ~]$ cat output/fix-on-tidb0/jian\:jiantb\:0\:0-0\:0.sql

-- table: jian.jiantb

-- range in sequence: Full

DELETE FROM `jian`.`jiantb` WHERE `id` = 2 AND `name` = 'a' LIMIT 1;


### 3 对比时指定条件范围

#### 数据状态

源端：                                                     目标端：

(root@localhost) [jian] 18:10:51> select * from jiantb;              (root@localhost) [jian] 18:10:51> select * from jiantb;

+------+                                                            +------+

| id  |                                                                | id  |

+------+                                                             +------+

|  10 |                                                                |  10 |

|  20 |                                                                |  11 |

|  30 |                                                                |  20 |

|  26 |                                                                |  30 |


对于以上的数据情况我们期望看到的结果是，检查数据一致性失败，并且提供sql可以插入目标端不存在的数据（26）,但是对于目标端比源端多出的11不希望生成删除的sql，因为我们在配置文件中指定了只检查id>20的部分数据。

#### 配置文件

```
export-fix-sql = true
check-struct-only = false
[data-sources]
[data-sources.mysql1]
    host = "192.168.135.149"
    port = 3306
    user = "root"
    password = "123456"
[data-sources.tidb0]

    host = "127.0.0.1"
    port = 4000
    user = "root"
    password = "123456"
[task]

    output-dir = "./output"
    source-instances = ["mysql1"]
    target-instance = "tidb0"
    target-check-tables = ["jian.\*"]
    target-configs = ["config1"]
[table-configs.config1]
target-tables=["jian.jiantb"]
range = "id > 20"
```

#### 执行校验

[tidb@jian ~]$ ./tidb-community-toolkit-v6.1.0-linux-amd64/sync_diff_inspector --config=sync_check3

A total of 1 tables need to be compared

Comparing the table structure of ``jian`.`jiantb`` ... equivalent

Comparing the table data of ``jian`.`jiantb`` ... failure

_____________________________________________________________________________

Progress [============================================================>] 100%

The data of `jian`.`jiantb` is not equal

The rest of tables are all equal.

The patch file has been generated in

    'output/fix-on-tidb0/'

You can view the comparision details through './output/sync_diff.log'



#### 修复sql查看

[tidb@jian ~]$ cat output/fix-on-tidb0/

jian:jiantb:0:0-0:0.sql      .trash-2022-07-28T18:11:39+08:00/

[tidb@jian ~]$ cat output/fix-on-tidb0/jian\:jiantb\:0\:0-0\:0.sql

-- table: jian.jiantb

-- range in sequence: Full

REPLACE INTO `jian`.`jiantb`(`id`) VALUES (26);

 

### 4 对比时数据存在部分不一致

#### 数据状态

  源端：                                                     目标端：

(root@localhost) [jian] 16:55:48> select * from jian.yao;           (root@127.0.01) [jian] 16:53:32> select * from jian.jiantb;

+------+------+                                                  +------+------+

| id  | name |                                                     | id  | name |

+------+------+                                                  +------+------+

|  1 | a  |                                                        |  1 | a  |

 |  2 | a  |                                                        |  2 | b  |

+------+------+                                                   +------+------+

对于以上的数据情况我们期望看到的结果是，检查数据一致性失败，并且提供sql可以将目标端的错误数据（2，b）修正为（2,a）

#### 配置文件

```
export-fix-sql = true
check-struct-only = false
[data-sources]
[data-sources.mysql1]

    host = "192.168.135.149"
    port = 3306
    user = "root"
    password = "123456"
[data-sources.tidb0]
    host = "127.0.0.1"
    port = 4000
    user = "root"
    password = "123456"
[task]
    output-dir = "./output"
    source-instances = ["mysql1"]
    target-instance = "tidb0"
    target-check-tables = ["jian.jiantb"]
```


#### 执行校验

[tidb@jian ~]$ ./tidb-community-toolkit-v6.1.0-linux-amd64/sync_diff_inspector --config=sync_check_1

A total of 1 tables need to be compared

Comparing the table structure of ``jian`.`jiantb`` ... equivalent

Comparing the table data of ``jian`.`jiantb`` ... failure

_____________________________________________________________________________

Progress [============================================================>] 100

The data of `jian`.`jiantb` is not equal

The rest of tables are all equal.

The patch file has been generated in

    'output/fix-on-tidb0/'

You can view the comparision details through './output/sync_diff.log'


#### 修复sql查看

[tidb@jian ~]$ cat output/fix-on-tidb0/jian\:jiantb\:0\:0-0\:0.sql

-- table: jian.jiantb

-- range in sequence: Full

/*

 DIFF COLUMNS ╏ `NAME`

╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍

 source data ╏ 'a'

╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍

 target data ╏ 'b'

╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍

*/

REPLACE INTO `jian`.`jiantb`(`id`,`name`) VALUES (2,'a');


### 5 目标端的数据来自多个数据库

#### 数据状态

   源端：                                                     目标端：

(root@localhost) [jian] 16:55:48> select * from jian.yao;           (root@127.0.01) [jian] 16:53:32> select * from jian.jiantb;

+------+------+                                                  +------+------+

| id  | name |                                                     | id  | name |

+------+------+                                                  +------+------+

|  1 | a  |                                                        |  1 | a  |       

+------+------+                                                   +------+------+

(root@localhost) [jian] 10:37:57> select * from yao.yaotb;         (root@127.0.01) [jian] 10:37:57> select * from yao.yaotb;

Empty set (0.01 sec)                                               +----+------+

​                                                                 | id | name |

​                                                                +----+------+

​                                                                 | 1 | a  |

​                                                                 +----+------+

对于以上的数据情况我们期望看到的结果是，yao.yaotb检查数据一致性失败，jian.jiantb检查一致性通过，并且生成sql可以将目标端多余的数据（1，a）删除。

#### 配置文件

```
export-fix-sql = true
check-struct-only = false
[data-sources]
[data-sources.mysql1]
    host = "192.168.135.149"
    port = 3306
    user = "jian"
    password = "123456"
[data-sources.mysql2]
    host = "127.0.0.1"
    port = 3306
    user = "yao"
    password = "123456"
[data-sources.tidb0]
    host = "127.0.0.1"
    port = 4000
    user = "root"
    password = "123456"

[task]
    output-dir = "./output"
    source-instances = ["mysql1","mysql2"]
    target-instance = "tidb0"
    target-check-tables = ["jian.jiantb","yao.yaotb"]
```


#### 执行校验

[tidb@jian ~]$ ./tidb-community-toolkit-v6.1.0-linux-amd64/sync_diff_inspector --config=sync_check

A total of 2 tables need to be compared

Comparing the table structure of ``jian`.`jiantb`` ... equivalent

Comparing the table data of ``jian`.`jiantb`` ... equivalent

Comparing the table structure of ``yao`.`yaotb`` ... equivalent

Comparing the table data of ``yao`.`yaotb`` ... failure

_____________________________________________________________________________

Progress [============================================================>] 100% 0/0

The data of `yao`.`yaotb` is not equal

The rest of tables are all equal.

The patch file has been generated in

​    'output/fix-on-tidb0/'

You can view the comparision details through './output/sync_diff.log'



#### 修复sql查看

[tidb@jian ~]$ cat output/fix-on-tidb0/yao\:yaotb\:0\:0-0\:0.sql

-- table: yao.yaotb

-- range in sequence: Full

DELETE FROM `yao`.`yaotb` WHERE `id` = 1 LIMIT 1;


### 校验信息

当校验结束时，sync-diff-inspector 会输出一份校验报告，位于 `${output}/summary.txt` 中，其中 `${output}` 是配置文件中 `output-dir` 的值。报告中会详细写出本次数据校验的参与对象，以及数据差异的详细信息，对比执行所消耗的时间以及速度。

[tidb@jian ~]$ cat output/summary.txt

```
Summary

Source Database

host = "192.168.135.149"

port = 3306

user = "root"

Target Databases

host = "127.0.0.1"

port = 4000

user = "root"

Comparison Result

The table structure and data in following tables are equivalent

The following tables contains inconsistent data

+-----------------+--------------------+----------------+---------+-----------+

|      TABLE      | STRUCTURE EQUALITY | DATA DIFF ROWS | UPCOUNT | DOWNCOUNT |

+-----------------+--------------------+----------------+---------+-----------+

| `jian`.`jiantb` | true               | +1/-1          |       2 |         2 |

+-----------------+--------------------+----------------+---------+-----------+

Time Cost: 39.521197ms

Average Speed: 0.000000MB/s
```



## 几点解释

1.  sync-diff-inspector 也可以只做表结构的检查相关参数是`check-struct-only`，默认情况下是false
2.  配置文件中datasource的定义的是无序的，只需要在task模块中指定对应的`source-instances`和`target-instance`
3.  下游数据库缺失行，则是 REPLACE 语句, 可见上边的样例3 下游数据库冗余行，则是 DELETE 语句, 可见上边的样例2 下游数据库行部分数据不一致，则是 REPLACE 语句，但会在 SQL 文件中通过注释的方法标明不同的列, 可见上边的样例4
4.  对于匹配规则，sync-diff-inspector支持通配符 "*" 和 "?"                                                 

## 使用限制

1. 对于 MySQL 和 TiDB 之间的数据同步不支持在线校验，需要保证上下游校验的表中没有数据写入，或者保证某个范围内的数据不再变更，通过配置 range 来校验这个范围内的数据。

1. 不支持 JSON 类型的数据，在校验时需要设置 ignore-columns 忽略检查这些类型的数据。

1. FLOAT、DOUBLE 等浮点数类型在 TiDB 和 MySQL 中的实现方式不同，在计算 checksum 时会分别取 6 位和 15 位有效数字。如果不使用该特性，需要设置 ignore-columns 忽略这些列的检查。

1. 支持对不包含主键或者唯一索引的表进行校验，但是如果数据不一致，生成的用于修复的 SQL 可能无法正确修复数据。

## 注意事项

1. sync-diff-inspector 在校验数据时会消耗一定的服务器资源，需要避免在业务高峰期间校验。

1. 在数据对比前，需要注意表中的 collation 设置。如果表的主键或唯一键为 varchar 类型，且上下游数据库中 collation 设置不同，可能会因为排序问题导致最终校验结果不正确，需要在 sync-diff-inspector 的配置文件中增加 collation 设置。

1. sync-diff-inspector 会优先使用 TiDB 的统计信息来划分 chunk，需要尽量保证统计信息精确，可以在**业务空闲期**手动执行 `analyze table {table_name}`。

1. table-rule 的规则需要特殊注意，例如设置了 `schema-pattern="test1"`，`table-pattern = "t_1"`，`target-schema="test2"`，`target-table = "t_2"`，会对比 source 中的表 `test1`.`t_1` 和 target 中的表 `test2`.`t_2`。sync-diff-inspector 默认开启 sharding，如果 source 中还有表 `test2`.`t_2`，则会把 source 端的表 `test1`.`t_1` 和表 `test2`.`t_2` 作为 sharding 与 target 中的表 `test2`.`t_2` 进行一致性校验。
2. 生成的 SQL 文件仅作为修复数据的参考，需要确认后再执行这些 SQL 修复数据。

## 总结

sync_diff_inspector是TiDB团队为了方便用户在MySQL数据迁移到TiDB后对数据一致性进行检查的开源工具，他不要求被检查的两个数据库之间存在任何的复制关系，并且对于表中是否存在索引也不会强制性要求，只要建立起对应的mapping关系即可以对两个数据库进行数据的一致性检验。如果sync_diff_inspector发现某个 chunk 的上下游的 checksum 不一致，可以通过二分法将原来的 chunk 划分成大小接近的两个子 chunk，对子 chunk 进行 checksum 对比，进一步缩小不一致行的可能范围。

虽然sync_diff_inspector目前还不能做到实时的数据一致性检验，但也提供类似range和snapshot等一些变相的方式来检查某一个特定“区域”的数据的一致性。

## 参考

> ﻿https://docs.pingcap.com/zh/tidb/stable/sync-diff-inspector-overview