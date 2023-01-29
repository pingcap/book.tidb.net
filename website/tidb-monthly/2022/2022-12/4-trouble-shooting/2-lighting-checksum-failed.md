---
title: Lightning checksum failed 报错实践案例 - TiDB 社区技术月刊
sidebar_label: Lightning checksum failed 报错实践案例
hide_title: true
description: 将大小写敏感的表数据导出后，使用 lightning local/physical 模式导入大小写不敏感的表中，若原表中存在大小写不敏感的重复数据时会有 checksum-failed 报错，并且导入表的索引信息和数据信息将产生不一致现象。本文将分享如何解决该报错。
keywords: [TiDB, Lightning checksum failed, 报错, ]
---

# Lightning checksum failed 报错实践案例

> 作者：[yiduoyunQ](https://tidb.net/u/yiduoyunQ/answer)

## 问题现象

将**大小写敏感**的表数据导出后，使用 lightning local/physical 模式导入**大小写不敏感**的表中，若原表中存在大小写不敏感的重复数据时会有 [checksum-failed](https://docs.pingcap.com/zh/tidb/stable/troubleshoot-tidb-lightning#checksum-failed-checksum-mismatched-remote-vs-local)  报错，并且导入表的索引信息和数据信息将产生不一致现象。

## 问题复现

启动 v5.4.3 集群，[new\_collations\_enabled\_on\_first\_bootstrap](https://docs.pingcap.com/zh/tidb/v5.4/tidb-configuration-file#new_collations_enabled_on_first_bootstrap)  默认为 false

```bash
tiup playground v5.4.3  --tiflash 0
```

创建一张表，这里虽然尝试创建**大小写不敏感**的 utf8mb4\_unicode\_ci，实际上会忽略（若希望真正创建该排序规则的表，需要手动开启 [new\_collations\_enabled\_on\_first\_bootstrap](https://docs.pingcap.com/zh/tidb/v5.4/tidb-configuration-file#new_collations_enabled_on_first_bootstrap)）

```sql
USE test;
CREATE TABLE t (
  name varchar(20) PRIMARY KEY /*T![clustered_index] NONCLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

在表定义中显示排序规则为 utf8mb4\_unicode\_ci

```sql
mysql> show create table t\G;
*************************** 1. row ***************************
       Table: t
Create Table: CREATE TABLE `t` (
  `name` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`name`) /*T![clustered_index] NONCLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
1 row in set (0.00 sec)

ERROR:
No query specified
```

实际并不生效，主键中仍可以插入**大小写不敏感**的重复数据

```sql
mysql> insert into t values('a'),('A'),('b'), ('B'), ('c'), ('C');
Query OK, 6 rows affected (0.01 sec)
Records: 6  Duplicates: 0  Warnings: 0

mysql> select * from t;
+------+
| name |
+------+
| A    |
| B    |
| C    |
| a    |
| b    |
| c    |
+------+
6 rows in set (0.01 sec)
```

使用 dumpling 导出数据

```bash
tiup dumpling:v5.4.3 -h 127.0.0.1 -P 4000 -u root -p '' -o /tmp/test
```

重新启动 v6.1.3 集群，[new\_collations\_enabled\_on\_first\_bootstrap](https://docs.pingcap.com/zh/tidb/stable/tidb-configuration-file#new_collations_enabled_on_first_bootstrap)   默认为 true

```bash
tiup playground v6.1.3  --tiflash 0
```

使用 lightning local/physical 模式将数据导入新库

```bash
tiup tidb-lightning:v6.1.3 --config tidb-lightning.toml
```

此时会报 checksum mismatched

```bash
Error: [Lighting:Restore:ErrChecksumMismatch]checksum mismatched remote vs local => (checksum: 18055227285823155031 vs 16161729031548613720) (total_kvs: 9 vs 12) (total_bytes:318 vs 462)
tidb lightning encountered error: [Lighting:Restore:ErrChecksumMismatch]checksum mismatched remote vs local => (checksum: 18055227285823155031 vs 16161729031548613720) (total_kvs: 9 vs 12) (total_bytes:318 vs 462)
```

在新表中看到由于**大小写不敏感**的关系，新表中只会显示一半的数据

```sql
mysql> select name from t;
+------+
| name |
+------+
| a    |
| b    |
| c    |
+------+
3 rows in set (0.00 sec)
```

使用默认查询会走主键索引，我们重新使用全表查询来确认表中数据

```sql
mysql> select name from t use index();
+------+
| name |
+------+
| a    |
| A    |
| b    |
| B    |
| c    |
| C    |
+------+
6 rows in set (0.00 sec)
```

此时新表存在索引信息和数据信息不一致的现象

## 问题解决

问题的根本原因在于原表和新表的排序规则不同，而原表中存在表定义上会在新表重复的数据，在 lightning local/physical 导入时会绕过表定义的逻辑检查，直接生成新表数据，因此造成了新表中违反主键或唯一索引的重复数据。

### 方法一

参考官网文档，在上游或 dumpling 导出文件中去除问题数据，重新导入

### 方法二

在新表中查出索引信息匹配的数据信息，以及不在索引信息中的数据信息，由业务侧决定保留和删除哪部分数据，数据处理完毕后，删除当前主键或唯一索引，然后重新生成索引来创建和数据信息的关联信息。
