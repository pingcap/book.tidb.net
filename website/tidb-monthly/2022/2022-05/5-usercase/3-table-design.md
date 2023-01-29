---
title: TiDB库表设计和使用规范
hide_title: true
---

# TiDB库表设计和使用规范

> 作者：**[代晓磊_Mars](https://tidb.net/u/%E4%BB%A3%E6%99%93%E7%A3%8A_Mars/post/all)** 发表于  **2022-05-19**

## 库表命名规范

1. 表名规范

   ```
    表名小写，禁止驼峰，比如 ad_Audit,jobSeq 等等，过长的可以用下划线（_）分割
   ```

2. 字段名规范 禁止使用 mysql 的关键字，比如 order，group、show、slave 等

   ```
     详见mysql官网：https://dev.mysql.com/doc/refman/8.0/en/keywords.html
   ```

3. 索引命名规范

   ```
    普通索引：idx_开头，唯一索引：uniq_开头，简写/缩写，简明扼要。
   
    举例说明：给corp_id,corp_name这2个字段加联合索引，普通索引为：idx_corpid_name，唯一索引：uniq_corpid_name
   
    不建议：idx_corp_id_corp_name
   ```

**注：库名、表名、字段名、索引名都小写，长度都限制在64字符以内（TiDB限制）**

## 表结构设计规范

1、TiDB 表主键

每张表一定要有一个主键，跟 MySQL 建表不同，主键不一定是 int/bigint 自增，如果有写入性能问题更不见建议使用自增主键（写热点），可以使用 UUID、字符串、联合字段来做主键时需要在建表语句后面添加下面2个参数来打散 region：

```
SHARD_ROW_ID_BITS = 4 PRE_SPLIT_REGIONS=3
```

另外对于写入量大的可以使用 auto random 主键来提升写入性能，如下

```
id bigint PRIMARY KEY AUTO_RANDOM。
```

2、必须标注表和字段的 comment

```
       比如：`mobile` varchar(20) DEFAULT NULL COMMENT '联系手机’
```

3、建表时提供表示创建时间和更新时间的 created*at updated*at 字段，并使用 mysql 内建的 CURRENT_TIMESTAMP 作为默认值，数仓的增量数据抽取依赖这2个字段。

4、字段能定义为非空的就定义为非空

```
  比如：user_name varchar(20) not null default ‘’ comment ‘用户名’

       uid int(10) not null default ‘0’ comment ‘用户id’

      注意：text类型必须default null
```

5、字段设置了 NOT NULL 的，一定要指定默认值，否则字段写入时肯定报错。

6、对于内容类字段优先考虑使用 utf8mb4 编码以支持 emoji 表情文字，如果预期数据量较大，尽量将内容较长且不用于查询的 BLOB、TEXT 列单独建表。

7、关于分区表使用，一般日志类、报表类业务都喜欢用基于时间的 range 分区表(可以用)，Hash 分区（用的少）可以用于大量写入场景下的数据打散，List 分区（5.X版本才有，实验特性，慎用！）

```
    为啥用分区表？drop/truncate partition这种快速清理数据不比delete from 大事务报错香？？

    分区表的限制：4.0版本最多支持1024个分区，5.X版本支持8192个分区。
```

8、字段类型选择，目的：合适的类型，合适的大小

```
   (1)能用 tinyint 不用 int，why？

     tinyint 能存-128~127，对于一些 status\type\gender等 业务字段完全够用

   (2)能用数值类型不用 varchar

     比如存手机号 bigint 就够了，存 ip 使用 int 类型来存。

   (3)字符串类型选择，char 还是 varchar ？

      定长用 char，比如像固定的 open_id char(32)，jid char(36)，cid char(36)，md5值

      变长用 varchar，比如 name varchar(40)

   (4)对于字符串类型长度够用即可。

      比如存 major，有的人用表结构生成器，表字段一水的 varchar(255)，其实varchar(50)足够

   (5)尽量不用 TEXT 类型（能用varchar(10000)也不要用text）
      需要强调：mediumtext 在 mysql 能支持最大 16M 的单行数据，tidb 因为 KV size 的限制，只能支持到 6M，超过这个 size 写入报错。如果必须要用，那就将涉及 text 的字段独立成表。
```

## SQL 使用规范

### 1、TIDB 索引使用

- 联合索引使用：如果线上存在复合条件查询，务必通过复合索引，如果 SQL 查询的字段以及 where 条件覆盖到查询中的所有条件字段形成覆盖索引的话，性能更佳。

  ```
  关于联合索引使用的问题：（A，B，C）的联合索引建立的情况，下面的SQL都可以使用到
  （1）where A=xxx
  （2）where A=XXX and B=xxx
  （3）where A=XXX and B=xxx and C=xxx
  PS：经常遇到有了（A，B，C）还单独创建A或者A+B联合索引的，这样就属于重复索引
  ```

- 务必将 ORDER BY 中的列覆盖在索引中，不然很容易出现对性能影响sort。

- 不推荐建立过多的索引，禁止冗余的索引、不使用的索引需要及时删除。推荐扩展现有索引，而不是建立新的索引。过多的索引容易影响优化器决策而形成严重性能问题。1)单张表中索引数量不超过5个；

  ```
  2)单个索引中的字段数不超过5个；
  
  3)对长字符串使用前缀索引，如：char(100)；
  
  4) 对区分度较低（重复值很多）的字段一般不建立单独索引，如：type字段(取值只有几个)
  ```

### 2、SQL 语句编写规范

- 避免使用select *，就算要用所有的表字段也建议都列出来，因为如果程序没有table字段对应关系的配置，表的字段增加删除都会导致业务取到的结果有问题，另外只查自己想要的字段也能降低SQL执行时间中的网络传输时间（可以拿带text类型的表对比测试）。
- 禁止执行没有where条件的表select/DML
- 避免在查询中使用 OR，OR两边的条件都需要有索引并且会产生会使用到性能较差的index merge
- 对于核心的OLTP业务，线上不建议使用 JOIN 操作，有可能引发集群抖动。
- 对于一些重要数据的“删除”，不推荐使用 DELETE，对于内容类数据优先考虑update软删除。
- 推荐Batch insert，根据表字段的情况，batch size控制在一定的数量，不建议太多(事务过大，引发性能问题或者报错)。
- DML SQL要避免TiDB的大事务限制(单KV：6M，默认事务100M可调)
- 业务RD喜欢begin；多个DML SQL；commit；在乐观事务的情况下，默认只支持5000条DML，可以通过stmt-count-limit调整。另外也不建议多DML SQL一次commit这种方式写入数据。
- TIDB的DDL不支持多列操作，所以：alter table不支持添加多个字段、多个索引。

**最后强调下：禁止RD直连线上DB进行SQL操作(如果是DBA，肯定在职业经历中碰到过RD误删除要恢复的事故)，公司需要提供自研 or 开源的SQL审核和执行平台来解决问题。**

### 3、不能用到索引的6种情况

```
  (1)字符串转义
      只在于表中是varchar、char字符串类型，执行时赋值为数值类型
  (2)函数包含
     各种函数比如常用的date函数，date_add,date_sub等等
     错误的方式：
     explain select  * from tb_dxl_test where date(update_date)='2016-10-06';
  (3)运算
    比如select * from t1 where start-end=10
  (4)Like ‘%dai’ / like ‘%dai%’ ,即最左的模糊匹配
      错误的方式：
       explain select  * from tb_dxl_test where name like '%好';
      正确的方式：
      explain select  * from tb_dxl_test where name like '代%';
  (5)对匹配度底的字段建立索引，也可能用不到
       比如一个type类型取值只有0、1
  (6)隐式转换
             表中字段是varchar/char字符串类型，业务将“数值”存入，然后基于数值查询
             explain select  * from tb_dxl_test where self_numb=110
```

## TIDB与MySQL兼容性区别

推进大容量 mysql 或者分库分表业务迁移 TiDB 本来是好事儿，但是还是需要将兼容性区别也列入到 TIDB 规范中，这样业务会提前了解并对自己业务进行修改。

1、TiDB 的自增 id 不连续，存在 id 为1/30001/60001的数据都是同一时刻写入的，所以业务基于id order by 的规则需要调整为基于时间排序。

2、不支持外键、存储过程、触发器、全文索引等

3、排序规则不同( collation 是在字符集中比较字符以及字符排序顺序的规则）。在默认的二进制排序规则( utf8mb4_bin )中，比较 A 和 a 的结果是不一样的，mysql的排序规则是：utf8mb4_general_ci，where str=‘A’跟‘a’都能查到相同的结果,**TiDB 在4.0的高版本和5.X支持了大小写不区分的排序规则，创建表时需要“显示”设定排序规则**。

4、再次强调：TiDB 不能在单条 ALTER TABLE 语句中完成多字段操作。例如，不能在单个语句中添加多个列或索引，否则，可能会输出 Unsupported multi schema change 的错误;这个在使用基于 mysql 的审核平台时会经常遇到，需要修改平台进行兼容。

5、4.0 的 TiDB 不支持添加/删除主键，除非开启了 alter-primary-key 配置项;

6、不支持将字段类型修改为其超集，例如不支持从 INTEGER 修改为 VARCHAR，或者从 TIMESTAMP 修改为 DATETIME

7、更改/修改数据类型时，不支持“有损更改”，比如bigint→int，varchar(200)→varchar(100)

8、TIDB的事务限制，单kv最大支持6M，也就是说mysql表中mediumtext类型(最大支持16M)迁移到tidb时可能会因为记录过大而写入失败。

9、TIDB默认支持 100M size 的事务，这个默认值可以通过配置文件中的配置项 txn-total-size-limit 进行修改，最大支持 10 GB 的事务。

更详细的兼容性区别，详见官网链接 https://docs.pingcap.com/zh/tidb/stable/tidb-limitations