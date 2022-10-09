---
title: dbt-tidb 1.2.0 尝鲜 - TiDB 社区技术月刊
sidebar_label: dbt-tidb 1.2.0 尝鲜
hide_title: true
description: 恰逢 dbt-tidb v1.2.0 发布，除了支持 dbt-core v1.2.0 之外，它还带来了一些好用的新特性。本文将体验 dev tier 并测试 dbt-tidb v1.2.0 的新特性。
keywords: [TiDB, dbt-core, 新特性, dev tier]
---

# dbt-tidb 1.2.0 尝鲜

>作者：[shiyuhang0](https://tidb.net/u/shiyuhang0/answer)

> 本文假设你对 dbt 有一定了解。如果是第一次接触 dbt，建议先阅读 [官方文档](https://docs.getdbt.com/docs/introduction) 或 [当 TiDB 遇见 dbt](https://pingcap.com/zh/blog/when-tidb-meets-dbt) 
>
> 本文中的示例基于官方维护的 jaffle_shop 项目。关于此项目的细节介绍，可以参考[当 TiDB 遇见 dbt](https://pingcap.com/zh/blog/when-tidb-meets-dbt)  或 [github project page](https://github.com/dbt-labs/jaffle_shop)，本文不再赘述

TiDB Cloud 官方在5月份开始正式面向全球用户提供全托管的 DBaaS （Database-as-a-Service）服务，支持用户在全托管的数据库上运行关键业务交易和实时分析任务。

同时 TiDB Cloud 还提供了免费试用的 dev tier，可以方便开发者试用、调试。搭配 dev tier，dbt-tidb 易用性大大提高。

恰逢 dbt-tidb v1.2.0 发布，除了支持 dbt-core v1.2.0 之外，它还带来了一些好用的新特性。借此机会，本文将体验 dev tier 并测试 dbt-tidb v1.2.0 的新特性。

对于开发者们，本文还介绍了如何升级 dbt-tidb，可供参考。

## Setup

1. 安装 dbt-tidb v1.2.0

```bash
$ pip install dbt-tidb=1.2.0 
```

1. 在 [TiDB Cloud ](https://en.pingcap.com/tidb-cloud/)上创建免费的 dev tier，如遇问题可以参考 [官方文档](https://docs.pingcap.com/tidbcloud/tidb-cloud-quickstart)。
   1. 注册并登录账号，页面会跳转到 TiDB Cloud 控制台。
   2. 点击 Create Cluster，跳转到创建页面，创建参数一般默认即可。
   3. 点击右下角 Create，跳转到 Security Settings，配置 Root Password 与 IP Access List。（点选 Allow Access from Anywhere 可以允许任意 IP 地址的访问）
   4. 点击右下角 Apply，页面跳转回 TiDB Cloud 控制台，等待集群初始化完成。
      - ![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1661855495205.png)
   5. 初始化完毕后点击 Connect 按钮，即可查看相应 host 与 user 了。可以直接复制 MySQL 连接串以测试集群连通性。

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1661855495228.png)

2. 下载 [jaffle_shop](https://github.com/dbt-labs/jaffle_shop) 项目

```bash
git clone https://github.com/dbt-labs/jaffle_shop
```

3. 在`~/.dbt`路径下配置 `profiles.yml` 中的连接信息

```bash
jaffle_shop_tidb:                        # 工程名称
  target: dev                             
  outputs:
    dev:
      type: tidb                         # 适配器类型
      server: gateway01.ap-southeast-1.prod.aws.tidbcloud.com # 修改为你的 TiDB 地址
      port: 4000                         # 修改为你的 TiDB 端口号
      schema: test                       # 数据库名称
      username: 41y7Jq2g5sBr2ia.root     # 修改为你的 TiDB 用户名
      password: ${fake_password}         # 修改为你的 TiDB 密码
```

4. 修改 jaffle_shop 中的 dbt_project.yml，只需修改 profile 为 `profiles.yml` 中定义的工程名

```bash
profile: 'jaffle_shop_tidb'
```

5. 在 jaffle_shop 目录下执行dbt debug 即可验证配置是否正确

```bash
dbt debug
```

## Feature

### Connection Retry

在 dbt 中，运行/构建/测试可能会有数百个独立的数据库连接。由于网络等原因导致的单个超时有可能使整个项目运行失败。

因此 dbt-tidb 新增了重试功能来解决暂时性的连接超时问题。

Connection Retry 举例🌰

1. 在 profile.yml 添加重试次数的配置，同时使用无效用户模拟连接失败的场景

```bash
jaffle_shop_tidb:                        # 工程名称
  target: dev                             
  outputs:
    dev:
      type: tidb                         # 适配器类型
      server: gateway01.ap-southeast-1.prod.aws.tidbcloud.com # 修改为你的 TiDB 地址
      port: 4000                         # 修改为你的 TiDB 端口号
      schema: test                       # 数据库名称
      username: 41y7Jq2g5sBr2ia.invaild_user           
      password: ${fake_password}         # 修改为你的 TiDB 密码                
      retries: 3   # 重试次数
```

2. 执行 dbt debug，终端的确显示了相应错误。但想知道是否进行了重试，需要查看 debug 日志

```bash
$ dbt debug
Connection:
  server: gateway01.ap-southeast-1.prod.aws.tidbcloud.com
  port: 4000
  database: None
  schema: test
  user: 41y7Jq2g5sBr2ia.invaild_user
  Connection test: [ERROR]

1 check failed:
dbt was unable to connect to the specified database.
The database returned the following error:

  >Database Error
  1045 (28000): Access denied for user '41y7Jq2g5sBr2ia.invaild_user'@'10.0.123.88' (using password: YES)
```

3. 去 logs 目录下查看 dbt.log，可以发现重试了3次，每次间隔1秒。最后抛出错误

```bash
$ cat dbt.log
06:24:19.875482 [debug] [MainThread]: tidb adapter: Got a retryable error when attempting to open a tidb connection.
3 attempts remaining. Retrying in 1 seconds.
Error:
1045 (28000): Access denied for user '41y7Jq2g5sBr2ia.invaild_user'@'10.0.123.88' (using password: YES)
06:24:21.321733 [debug] [MainThread]: tidb adapter: Got a retryable error when attempting to open a tidb connection.
2 attempts remaining. Retrying in 1 seconds.
Error:
1045 (28000): Access denied for user '41y7Jq2g5sBr2ia.invaild_user'@'10.0.123.88' (using password: YES)
06:24:22.703960 [debug] [MainThread]: tidb adapter: Got a retryable error when attempting to open a tidb connection.
1 attempts remaining. Retrying in 1 seconds.
Error:
1045 (28000): Access denied for user '41y7Jq2g5sBr2ia.invaild_user'@'10.0.123.88' (using password: YES)
06:24:24.069883 [debug] [MainThread]: tidb adapter: Error running SQL: select 1 as id
```

### Grant

在 ELT 之后，我们往往需要对数据进行权限控制。基于此，dbt 从 1.2.0 开始支持 [Grant](https://docs.getdbt.com/reference/resource-configs/grants) 对 dbt 生成的数据集进行访问控制。相应的 dbt-tidb 也支持了授权机制，能够对 dbt 产生的视图与表进行授权管理。

Gant 目前支持 model, seed 和 snapshots。如果你在 dbt_project.yml 下配置，那么项目内所有资源（model/seed/snapshots 都是资源）都会生效。当然，你也可以像其他配置项一样针对特定资源配置相应的 SQL 或 YAML，它会覆盖 dbt_project.yml 中的配置。

有一点需要注意的是 Grant 不支持创建用户，我们需要在 TiDB 中先创建好所需用户。

Grant 举例🌰

1. 在 TiDB 中创建用户，注意在 dev tier 中用户名必须带前缀（和 root 用户的前缀保持一致）

```bash
CREATE USER '41y7Jq2g5sBr2ia.user1'@'%' IDENTIFIED BY '';
CREATE USER '41y7Jq2g5sBr2ia.user2'@'%' IDENTIFIED BY '';
CREATE USER '41y7Jq2g5sBr2ia.user3'@'%' IDENTIFIED BY '';
```

2. 在 jaffle_shop 项目中的 dbt_project.yml 增加 grant 配置

```bash
seeds:
  +grants:
     select: ['41y7Jq2g5sBr2ia.user1','41y7Jq2g5sBr2ia.user2']
     insert: ['41y7Jq2g5sBr2ia.user1','41y7Jq2g5sBr2ia.user3']
```

3. 在 jaffle_shop 项目下执行 dbt seed

```bash
$ dbt seed
06:38:49  Concurrency: 1 threads (target='dev')
06:38:49
06:38:49  1 of 3 START seed file test.raw_customers ...................................... [RUN]
06:38:50  1 of 3 OK loaded seed file test.raw_customers .................................. [INSERT 100 in 1.58s]
06:38:50  2 of 3 START seed file test.raw_orders ......................................... [RUN]
06:38:52  2 of 3 OK loaded seed file test.raw_orders ..................................... [INSERT 99 in 1.52s]
06:38:52  3 of 3 START seed file test.raw_payments ....................................... [RUN]
06:38:54  3 of 3 OK loaded seed file test.raw_payments ................................... [INSERT 113 in 1.66s]
06:38:55
06:38:55  Finished running 3 seeds in 0 hours 0 minutes and 9.09 seconds (9.09s).
06:38:55
06:38:55  Completed successfully
06:38:55
06:38:55  Done. PASS=3 WARN=0 ERROR=0 SKIP=0 TOTAL=3
```

4. 成功后查询 TiDB：

- 41y7Jq2g5sBr2ia.user1 被赋予了 Select + Insert 权限

- 41y7Jq2g5sBr2ia.user2 被赋予了Select 权限

- 41y7Jq2g5sBr2ia.user3 被赋予了 Insert 权限

```bash
mysql> select * from mysql.tables_priv where User in('41y7Jq2g5sBr2ia.user1','41y7Jq2g5sBr2ia.user2','41y7Jq2g5sBr2ia.user3');
+------+------+-----------------------+---------------+---------+---------------------+---------------+---------------+
| Host | DB   | User                  | Table_name    | Grantor | Timestamp           | Table_priv    | Column_priv   |
+------+------+-----------------------+---------------+---------+---------------------+---------------+---------------+
| %    | test | 41y7Jq2g5sBr2ia.user1 | raw_customers |         | 2022-08-19 06:46:08 | Select,Insert | Select,Insert |
| %    | test | 41y7Jq2g5sBr2ia.user2 | raw_customers |         | 2022-08-19 06:46:08 | Select        | Select        |
| %    | test | 41y7Jq2g5sBr2ia.user3 | raw_customers |         | 2022-08-19 06:46:08 | Insert        | Insert        |
| %    | test | 41y7Jq2g5sBr2ia.user1 | raw_orders    |         | 2022-08-19 06:46:10 | Select,Insert | Select,Insert |
| %    | test | 41y7Jq2g5sBr2ia.user2 | raw_orders    |         | 2022-08-19 06:46:10 | Select        | Select        |
| %    | test | 41y7Jq2g5sBr2ia.user3 | raw_orders    |         | 2022-08-19 06:46:10 | Insert        | Insert        |
| %    | test | 41y7Jq2g5sBr2ia.user1 | raw_payments  |         | 2022-08-19 06:46:12 | Select,Insert | Select,Insert |
| %    | test | 41y7Jq2g5sBr2ia.user2 | raw_payments  |         | 2022-08-19 06:46:12 | Select        | Select        |
| %    | test | 41y7Jq2g5sBr2ia.user3 | raw_payments  |         | 2022-08-19 06:46:12 | Insert        | Insert        |
+------+------+-----------------------+---------------+---------+---------------------+---------------+---------------+
```

### Cross-database macros

dbt 的一个强大之处就是它可以复用宏（可以理解为函数），[dbt-util](https://github.com/dbt-labs/dbt-utils/tree/main) 就是官方提供的一个工具仓库，我们可以通过引入 dbt-util 复用其封装好的宏。dbt 1.2.0 将其中的 Cross-database macros 从 util 迁移到了 core，这意味着你无需引入 dbt-util 就可以直接使用它们。

对此，dbt-tidb 也做了相应适配工作。现在，你可以直接在 dbt-tidb 中使用下列函数，使用方式可以参考 [dbt-tidb 官网](https://github.com/pingcap/dbt-tidb)。

- bool_or

- cast_bool_to_text

- dateadd

- datediff

- date_trunc

- hash

- safe_cast

- split_part

- last_day

- cast_bool_to_text

- concat

- escape_single_quotes

- except

- intersect

- length

- position

- replace

- right

以 datediff 举例🌰

1. 执行 dbt seed 生成 raw_orders 表

```bash
dbt seed
```

2. 在 models 目录下创建 datediff.sql，计算 raw_orders 表中订单时间和 2018-01-01 相差的天数

```bash
with orders as (

    select * from {{ ref('raw_orders') }}

)

select * , {{datediff( "'2018-01-01'", "order_date", 'day' )}} as datediff from orders
```

3. 执行 dbt run -s datediff 指定运行 datediff，执行成功后查询 TiDB 结果如下

```bash
mysql> select * from test.datediff;
+------+---------+------------+----------------+----------+
| id   | user_id | order_date | status         | datediff |
+------+---------+------------+----------------+----------+
|    1 |       1 | 2018-01-01 | returned       |        0 |
|    2 |       3 | 2018-01-02 | completed      |        1 |
|    3 |      94 | 2018-01-04 | completed      |        3 |
|    4 |      50 | 2018-01-05 | completed      |        4 |
|    5 |      64 | 2018-01-05 | completed      |        4 |
|    6 |      54 | 2018-01-07 | completed      |        6 |
|    7 |      88 | 2018-01-09 | completed      |        8 |
|    8 |       2 | 2018-01-11 | returned       |       10 |
|    9 |      53 | 2018-01-12 | completed      |       11 |
|   10 |       7 | 2018-01-14 | completed      |       13 |
|   11 |      99 | 2018-01-14 | completed      |       13 |
|   12 |      59 | 2018-01-15 | completed      |       14 |
|   13 |      84 | 2018-01-17 | completed      |       16 |
|   14 |      40 | 2018-01-17 | returned       |       16 |
|   15 |      25 | 2018-01-17 | completed      |       16 |
|   16 |      39 | 2018-01-18 | completed      |       17 |
|   17 |      71 | 2018-01-18 | completed      |       17 |
|   18 |      64 | 2018-01-20 | returned       |       19 |
|   19 |      54 | 2018-01-22 | completed      |       21 |
|   20 |      20 | 2018-01-23 | completed      |       22 |
```

## Upgrade dbt-tidb to support new dbt-core

上文介绍了 dbt-tidb v1.2.0 带来的诸多新特性。那么新特性是如何实现的，dbt-tidb 又是如何进行版本升级的呢？下文将会给你带来答案。

> 关于构建 dbt adapter 的细节可以参考 dbt[ 官方文档](https://docs.getdbt.com/docs/contributing/building-a-new-adapter) ，本节则会带来版本升级的相关经验。

### 版本规则

dbt-tidb 版本与 dbt-core（官方维护的内核）一样遵循 [Semantic Versioning](https://semver.org/)。

为了避免兼容性问题，dbt-tidb 选择与 dbt-core 保持一致版本，同版本间才能相互兼容工作。即 dbt-tidb 1.2.0 也仅支持 dbt-core 1.2.0。虽然官方升级时会尽量避免兼容性修改，但兼容性修改还是会发生的。如 dbt-core 1.2.0 为了支持 retry connection 特性新增了可覆盖的方法，如果 adapter 实现了该方法，那么也就无法运行在 dbt-core 1.1.0 之上了（除非代码进行版本判断，嵌入两种逻辑）

基于此，在 dbt-core 发布 1.1.0 与 1.2.0 之后，dbt-tidb 也需要分别发布 1.1.0 与 1.2.0 版本。

### 调研

当我们进行版本升级，第一步就是要调研需要支持哪些特性。

以下几种调研的途径，你可以结合使用多种方式

1. 查看 dbt-core 的 release note，重点关注针对 adapter 的新特性。最终梳理需要实现的新特性。

1. 有时候，dbt 官方会在 Github Discussion 中整理 adapter 升级需要支持的特性。这时候，你就可以放心大胆依据它来升级。

1. 官方的[版本升级文档](https://docs.getdbt.com/guides/migration/versions)

1. 参考其他 adapter 的实现，你可以在 [Available adapters](https://docs.getdbt.com/docs/available-adapters) 找到所有的 adapter

1. 不推荐的选择：不实现特性，而只修改打包时 dbt-core 的版本。此时无法享受任何版本升级带来的新特性。

dbt-tidb 主要依据第一、二种方式，整理出需要实现的特性如下表：

dbt-tidb 1.1.0

- 废弃Python 3.7，支持 Python 3.10

- 使用新的测试框架进行测试

- 在 incremental 中支持多 unique key

dbt-tidb 1.2.0

- 支持 Connection retry 特性

- 支持 grant 特性，进行权限配置

- 支持 Cross-database macros (dbt-util 包下的部分 macros 被迁移至 dbt-core)

- 新增 BaseDocsGenerate 与 BaseValidateConnection 测试

### 使用测试

在开发前，我想先介绍如何进行测试。因为我建议使用 Test Driven Development(TTD) 的方式进行开发 dbt adapter。即：先编写测试，然后进行对应功能实现，通过测试即认为支持该功能。

自 dbt-core 1.1.0 开始，dbt 就为 adapter 开发者提供了全新的一套测试框架。DBT 正在大力推广新测试框架，相比于旧的测试框架，该新框架的一个好处就是它随着 dbt-core 一起发版。这样就能及时对相应特性或 BUG 修复进行测试。

得益于该测试框架，adapter 基本无需自己编写测试就可以对相应功能进行测试。关于测试框架如何使用，可以参考 [Testing a new adapter](https://docs.getdbt.com/docs/contributing/testing-a-new-adapter)。

dbt-tidb 1.1.0 开始使用新的测试框架，引入 [basic](https://github.com/pingcap/dbt-tidb/tree/v1.1.0/tests/functional/adapter/tidb/basic) 包，以测试基础的 dbt 功能，另外 incremental 多 unique key 的支持暂时也放在了 basic 包下

dbt-tidb 1.2.0 又根据新增特性补充了以下测试

- [Basic](https://github.com/pingcap/dbt-tidb/blob/v1.2.0/tests/functional/adapter/tidb/basic/test_tidb.py) 包：新增 BaseValidateConnection 与 BaseDocsGenerate ，分别用于测试连接与文档生成相关功能

- [Grant](https://github.com/pingcap/dbt-tidb/tree/v1.2.0/tests/functional/adapter/tidb/grant)：新增 grant 包，用于测试 grant 特性

- [Util](https://github.com/pingcap/dbt-tidb/tree/v1.2.0/tests/functional/adapter/tidb/utils)：新增 util 包，用于测试从 dbt-util 迁移来的 Cross-database macros

### 如何开发

> 我们以 grant 特性为例介绍如何进行新特性支持。

**添加测试**

在上一步中我们已经介绍过如何测试。对于 grant，我们需要增加如下测试:

```sql
class TestModelGrantsTiDB(BaseModelGrants):
    pass


class TestIncrementalGrantsTiDB(BaseIncrementalGrants):
    pass


class TestSeedGrantsTiDB(BaseSeedGrants):
    pass


class TestSnapshotGrantsTiDB(BaseSnapshotGrants):
    pass


class TestInvalidGrantsTiDB(BaseInvalidGrants):
    pass
```

其中我们直接使用 pass 不进行任何实现修改，只继承测试框架的默认实现。

**实现特性**

接下来就是实现特性。一般可以通过覆盖默认宏或是覆盖默认方法来进行拓展，具体应该覆盖哪些，可以参考如下：

- dbt 官方人员可能会在 Github discussions 中介绍如何实现

- 参考 dbt-core 该特性相应 pr

- 参考其他 adapter

通过官方仓库 discussion 中整理的 [1.2.0 升级汇总](https://github.com/dbt-labs/dbt-core/discussions/5468)。我们发现 grant 主要通过覆盖 dbt-core 的宏实现，主要需要实现如下宏：

- get_show_grant_sql：返回授权信息（通过查看相关代码，可以发现返回格式需为 grantee (用户名) + privilege_type（权限类型））

- get_grant_sql：进行授权

- get_revoke_sql：收回授权

以下是相关实现：

**get_show_grant_sql**

我们首先查询 TiDB 的 mysql.tables_priv 表获取权限信息。然后筛选出对应的库表，接着轮询 Select、Insert、Update、Delete 四种权限，最后按用户+权限的格式输出。对应 SQL 如下

```plain
{% macro tidb__get_show_grant_sql(relation) %}

    select case(Table_priv) when null then null else 'select' end as privilege_type, `User` as grantee from mysql.tables_priv  where `DB` = '{{relation.schema}}' and `Table_name` = '{{relation.identifier}}' and Table_priv like '%Select%'
    union ALL
    select case(Table_priv) when null then null else 'insert' end as privilege_type, `User` as grantee from mysql.tables_priv  where `DB` = '{{relation.schema}}' and `Table_name` = '{{relation.identifier}}' and Table_priv like '%Insert%'
    union ALL
    select case(Table_priv) when null then null else 'update' end as privilege_type, `User` as grantee from mysql.tables_priv  where `DB` = '{{relation.schema}}' and `Table_name` = '{{relation.identifier}}' and Table_priv like '%Update%'
    union ALL
    select case(Table_priv) when null then null else 'delete' end as privilege_type, `User` as grantee from mysql.tables_priv  where `DB` = '{{relation.schema}}' and `Table_name` = '{{relation.identifier}}' and Table_priv like '%Delete%'

{% endmacro %}
```

**get_grant_sql**

使用标准 grant SQL 对多用户进行授权，注意用户需使用双引号。对应 SQL 如下：

```sql
{%- macro tidb__get_grant_sql(relation, privilege, grantees) -%}
    grant {{ privilege }} on {{ relation }} to {{ '\"' + grantees|join('\", \"') + '\"' }}
{%- endmacro -%}
```

**get_revoke_sql**

使用标准 revoke SQL 对多用户收回授权，用户同样需使用双引号。对应 SQL 如下：

```sql
 {%- macro tidb__get_revoke_sql(relation, privilege, grantees) -%}
    revoke {{ privilege }} on {{ relation }} from {{ '\"' + grantees|join('\", \"') + '\"' }}
{%- endmacro -%}
```

**修复错误**

实现完成之后，我们需要运行测试检查是否能够通过。当发现并没有通过时，我们一般有以下方式去修复错误：

1. 根据错误输出，判断错误原因进行修复，一般的 SQL 格式错误都可以用这种方式发现。

1. 查看 dbt-core 中该特性对应的 pr。
   1. 查看是否修改了一些已被 adapter 覆盖的宏/方法，如果是，那么 adapter 可能也需要相应修改。
   2. 查看是否还有新增的其他可被覆盖的宏/方法。

1. 参考其他 adapter 支持的代码。查看是否有任何遗漏

在支持 grant 的过程中，就基于第二种方法发现 dbt-tidb 之前已经覆盖了 incremental 与 snapshot 宏。而在 grant 特性支持 pr 中，dbt-core 修改了这两个宏的默认实现。dbt-tidb 也需要进行相应修改：

```sql
{% materialization incremental, adapter='tidb' %}

   -- other code
  {% set grant_config = config.get('grants') %}

   -- other code
  {% set should_revoke = should_revoke(existing_relation, full_refresh_mode) %}
  {% do apply_grants(target_relation, grant_config, should_revoke=should_revoke) %}
 
   -- other code
   
{%- endmaterialization %}
```

该代码首先获取 grant 配置，然后调用 apply_grants 应用上文实现的 get_grant_sql 方法。

同时，也发现需要覆盖新增的call_dcl_statements 宏，来将多条 SQL 变为单条 SQL 依次请求。因为 dbt-tidb 暂时还不支持多 SQL 请求，如下：

```sql
{% macro tidb__call_dcl_statements(dcl_statement_list) %}
    {% for dcl_statement in dcl_statement_list %}
        {% call statement('grant_or_revoke') %}
            {{ dcl_statement }}
        {% endcall %}
    {% endfor %}
{% endmacro %}
```

**修复测试**

测试中可能还会发现一些错误，这些错误并不是因为我们没有实现该特性，而是因为一些兼容性问题，测试本身需要一些修改。关于如何修改测试，[Testing a new adapter](https://docs.getdbt.com/docs/contributing/testing-a-new-adapter#modifying-test-cases) 中也有介绍

dbt-tidb 支持授权时就进行了测试修改。因为在授权失败时，不同的 adapter 可能会抛出不一样的错误，那么自然需要改写授权失败的信息，使其符合 TiDB 的报错:

```sql
class TestInvalidGrantsTiDB(BaseInvalidGrants):
    def grantee_does_not_exist_error(self):
        return "You are not allowed to create a user with GRANT"

    def privilege_does_not_exist_error(self):
        return "Illegal privilege level specified for"
```

## Conclusion

本文结合 dev tier 与 dbt-tidb 举例试用了 dbt-tidb v1.2.0 带来的主要特性。

同时以 dbt-tidb 为例，介绍了升级 dbt adapter 的流程与技巧。也欢迎大家对 [dbt-tidb](https://github.com/pingcap/dbt-tidb) 任何形式的贡献。
