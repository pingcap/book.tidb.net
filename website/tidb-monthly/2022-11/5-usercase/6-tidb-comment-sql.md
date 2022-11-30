---
title: TiDB常用SQL - TiDB 社区技术月刊
sidebar_label: TiDB常用SQL
hide_title: true
description: 本文梳理了 TiDB 常用的 sQL。
keywords: [TiDB , SQL, 常用 SQL, TiKV]
---

# TiDB常用SQL

> 作者：[我是咖啡哥](https://tidb.net/u/%E6%88%91%E6%98%AF%E5%92%96%E5%95%A1%E5%93%A5/answer)

## 查询表大小

SELECT
t.TABLE\_NAME,
t.TABLE\_ROWS,
t.TABLE\_TYPE,
round(t.DATA\_LENGTH/1024/1024/1024,2) data\_GB,
round(t.INDEX\_LENGTH/1024/1024/1024,2) index\_GB,
t.CREATE\_OPTIONS,
t.TABLE\_COMMENT
FROM
INFORMATION\_SCHEMA.`TABLES` t
WHERE
table\_schema = 'test'
and t.table\_type='BASE TABLE'
order by t.TABLE\_ROWS desc;

SELECT CONCAT(table\_schema,'.',table\_name) AS 'Table Name', table\_rows AS 'Number of Rows', CONCAT(ROUND(data\_length/(1024*1024*1024),4),'G') AS 'Data Size', CONCAT(ROUND(index\_length/(1024*1024*1024),4),'G') AS 'Index Size', CONCAT(ROUND((data\_length+index\_length)/(1024*1024*1024),4),'G') AS'Total' FROM information\_schema.TABLES WHERE table\_schema LIKE 'test';

## 统计信息

### 查看表的元数据

show stats\_meta where db\_name like '%sbtest%';

### 查看表的健康状态

show stats\_healthy;
Healthy 字段，一般小于等于 60 的表需要做 analyze

show stats\_healthy where table\_name ='xxx';
show stats\_healthy where db\_name='' and table\_name='orders';

### 查看列的元数据

show stats\_histograms where db\_name like 'sbtest' and table\_name like 'sbtest1' ;

### 查看直方图信息

show stats\_buckets where db\_name='' and table\_name='';

### 查看analyze状态

show analyze status;

### 分析表、分区

analyze table sbtest1;
ANALYZE TABLE xxx PARTITION P202204;

## 执行计划

### 绑定执行计划

\-- 默认是session级别

create binding for  select \* from t  using select \* from t use index()

create binding for SELECT  \* FROM t1 INNER JOIN t2 ON t1.id = t2.t1\_id WHERE t1.int\_col = ? using SELECT /\*+ INL\_JOIN(t1, t2) \*/  \* FROM t1 INNER JOIN t2 ON t1.id = t2.t1\_id WHERE t1.int\_col = ?;

explain SELECT  \* FROM t1 INNER JOIN t2 ON t1.id = t2.t1\_id WHERE t1.int\_col = 1;

show bindings for SELECT  \* FROM t1 INNER JOIN t2 ON t1.id = t2.t1\_id WHERE t1.int\_col = 1;

show global bindings;
show session bindings;
SELECT @@SESSION.last\_plan\_from\_binding;

\-- 使用 explain format = 'verbose' 语句查看 SQL 的执行计划

explain format = 'verbose';

drop binding for sql;

## 查看regions

SHOW TABLE t\_its\_unload\_priority\_intermediate\_info regions;
SHOW TABLE t\_its\_unload\_priority\_intermediate\_info INDEX IDX\_UPII\_GROUP\_BY\_COMPOSITE regions;

## 热点表问题

PRE\_SPLIT\_REGIONS 的值必须小于或等于 SHARD\_ROW\_ID\_BITS。

SHARD\_ROW\_ID\_BITS = 4,PRE\_SPLIT\_REGIONS = 4

\--tidb\_scatter\_region：该变量用于控制建表完成后是否等待预切分和打散 Region 完成后再返回结果。如果建表后有大批量写入，需要设置该变量值为 1，
\--表示等待所有 Region 都切分和打散完成后再返回结果给客户端。否则未打散完成就进行写入会对写入性能影响有较大的影响。

SHOW VARIABLES LIKE '%tidb\_scatter\_region%';

## 慢查询

SELECT \* FROM INFORMATION\_SCHEMA.CLUSTER\_SLOW\_QUERY WHERE time > '2022-08-09 00:00:00' ;

select query\_time, query from information\_schema.slow\_query
where is\_internal = false and user = ”user1” order by query\_time desc limit 2;

select query\_time, query, digest from information\_schema.slow\_query
where is\_internal = false and time between ’2021−09−21’ and ’2021−09−02’ order by query\_time desc limit 1;

select query, query\_time from information\_schema.slow\_query where digest = "4751cb6008fda383e22dacb . . . bafb46a6fa";

### 统计读写热点表

use INFORMATION\_SCHEMA;

SELECT
db\_name,
table\_name,
index\_name,
type,
sum( flow\_bytes ),
count( 1 ),
group\_concat( h.region\_id ),
count( DISTINCT p.store\_id ),
group\_concat( p.store\_id )
FROM
INFORMATION\_SCHEMA.tidb\_hot\_regions h
JOIN INFORMATION\_SCHEMA.tikv\_region\_peers p ON h.region\_id = p.region\_id
AND p.is\_leader = 1
GROUP BY
db\_name,
table\_name,
index\_name,
type;

SELECT
p.store\_id,
sum(flow\_bytes ),
count(1)
FROM
INFORMATION\_SCHEMA.tidb\_hot\_regions h
JOIN INFORMATION\_SCHEMA.tikv\_region\_peers p ON h.region\_id = p.region\_id
AND p.is\_leader = 1
GROUP BY
p.store\_id
ORDER BY
2 DESC;

select tidb\_decode\_plan();

## TiFlash

ALTER TABLE t\_test\_time\_type SET TIFLASH REPLICA 1;
SELECT \* FROM information\_schema.tiflash\_replica;

select \* from information\_schema.CLUSTER\_HARDWARE where type='tiflash' and DEVICE\_TYPE='disk' and name='path';

## admin命令

```
admin show ddl jobs;
ADMIN CHECK TABLE t_test;
admin show slow 
ADMIN SHOW TELEMETRY;
```

## 修改隔离参数

### session级别修改

Engine 隔离：默认：\["tikv", "tidb", "tiflash"]
由于 TiDB Dashboard 等组件需要读取一些存储于 TiDB 内存表区的系统表，因此建议实例级别 engine 配置中始终加入 "tidb" engine。

set session tidb\_isolation\_read\_engines = 'tiflash,tidb';
或
set @@session.tidb\_isolation\_read\_engines = "tiflash,tidb";

### 手工 Hint

select /\*+ read\_from\_storage(tiflash\[table\_name]) */ ... from table\_name;
select /*+ read\_from\_storage(tiflash\[alias\_a,alias\_b]) \*/ ... from table\_name\_1 as alias\_a, table\_name\_2 as alias\_b where alias\_a.column\_1 = alias\_b.column\_2;

set @@tidb\_allow\_mpp=1;

show  config where name like '%oom%' and type='tidb';

admin show ddl;

## 排错

### 查看日志

SELECT \* FROM INFORMATION\_SCHEMA.CLUSTER\_LOG t
WHERE time > '2022-08-09 00:00:00' AND time < '2022-08-10 00:00:00'
AND TYPE in ('tikv')
AND `LEVEL` = 'ERROR'
ORDER BY time desc;

欢迎大家补充。