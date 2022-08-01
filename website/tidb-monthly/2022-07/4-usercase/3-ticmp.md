---
title: Ticmp - 更快的让应用从 MySQL 迁移到 TiDB - TiDB 社区技术月刊
sidebar_label: Ticmp - 更快的让应用从 MySQL 迁移到 TiDB
hide_title: true
description: 本文主要介绍如何能更快的让客户知道他们自己的业务在哪些功能上面会有 MySQL 和 TiDB 不一致的地方，我们就能更快的去调整 TiDB 的行为或者去更改客户业务。
keywords: [TiDB, MySQL, Corteza, ticmp]
---

# Ticmp - 更快的让应用从 MySQL 迁移到 TiDB

> **作者**：唐刘

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/v2-d006e2e6fe1d3fba3e2515692c7762e4_720w-1657861042774.jpg)

当前，越来越多客户尝试将他们自己的业务从 MySQL 数据库迁移到 TiDB 中，但在迁移之前，客户都会进行兼容性的评估。虽然 TiDB 是一个 MySQL 协议兼容的数据库，但仍然有一些行为是跟 MySQL 不一样的。所以如何能更快的让客户知道他们自己的业务在哪些功能上面会有 MySQL 和 TiDB 不一致的地方，我们就能更快的去调整 TiDB 的行为或者去更改客户业务。

## Corteza

最近尝试了一次让 [Corteza](https://link.zhihu.com/?target=https%3A//cortezaproject.org/) 支持 TiDB，Corteza 是一个开源的低代码平台，它也提供了一个 CRM 的支持，

因为 Corteza 有比较好的 database 抽象，所以我只需要能让 TiDB 通过 Corteza 的 MySQL 相关的测试集，那么我就有充分的信心能让 TiDB 跑在 Corteza 上面。

跑测试还是挺简单的，clone 了 Corteza 的源码:

```bash
git clone https://github.com/cortezaproject/corteza-server.git
cd corteza-server
```

在源码目录下面建立一个 .env 文件，里面填上如下信息就行，下面的 4000 端口就是 TiDB 的端口号：

```bash
RDBMS_MYSQL_DSN=mysql://corteza:corteza@tcp(127.0.0.1:4000)/corteza?collation=utf8mb4_general_ci&charset=utf8mb4
```

使用 [TiUP](https://link.zhihu.com/?target=https%3A//tiup.io/) 启动一个 TiDB 集群，也顺带启动一个 mysql：

```text
tiup --tag 6.0 playground 6.0
```

在 TiDB 和 MySQL 里面都创建好 Corteza 的数据库以及账号

```mysql
CREATE DATABASE corteza;
CREATE USER 'corteza' IDENTIFIED BY 'corteza';
GRANT ALL PRIVILEGES ON corteza.* TO 'corteza';
FLUSH PRIVILEGES;
```

然后运行测试：

```bash
make test.store
```

很不幸，测试报错了，虽然有出错 case，但因为 Corteza 或者其他 ORM 都会将 SQL 的操作封装，所以我其实很难知道到底是哪一条 SQL 是因为 TiDB 不兼容 MySQL 导致。

## TiCmp

为了快速的定位到到底是哪一条 SQL 在 TiDB 和 MySQL 里面行为不一致，Henry Lonng 快速的构建了一个 [ticmp](https://link.zhihu.com/?target=https%3A//github.com/lonng/ticomp) 工具来进行验证，启动 原理非常的简单：

- ticmp 会将自己模拟成一个 MySQL server
- 应用程序，譬如 Corteza 将 SQL 发给 ticmp 之后
- ticmp 将 SQL 同时发给 MySQL 和 TiDB，并将两边的结果进行对比，并输出到一个控制台或者 csv 文件中
- ticmp 将 MySQL 的结果返回给应用，因为通常这些应用都是 MySQL 兼容的，所以能继续执行
- 我们直接看对比结果，就能知道哪一条 SQL 在 TiDB 和 MySQL 是不兼容的了

启动 ticmp

```text
./tiomp --mysql.user corteza --mysql.pass corteza --tidb.user corteza --tidb.pass corteza --user corteza --pass corteza --csv corteza_test.csv
```

将 Corteza 的 port 从 4000 改成 5001 重新执行，然后我们就能在 csv 文件里面看到不一致的地方。

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/v2-ee28b60404d78d98629a99e872625910_720w-1657861012466.jpg)

譬如上图，我们明显看到有一条 select 语句 MySQL 和 TiDB 的返回结果是不一样的，对应的问题在 [Run Corteza server test with different results between TiDB 6.0 and MySQL 8.0](https://link.zhihu.com/?target=https%3A//github.com/pingcap/tidb/issues/35054) ，当然，我们还发现了一些问题，譬如：[ddl: the ‘max-index-length’ check does not respect non-restricted sql_mode](https://link.zhihu.com/?target=https%3A//github.com/pingcap/tidb/issues/34931)。

## 小结

可以看到，使用 ticmp，能让我们更有信心将更多的应用从 MySQL 迁移到 TiDB，但 ticmp 也并不是银弹，不能解决所有的迁移问题，通常我们定位于应用的 unit tests 的兼容测试，以及简单的应用功能测试。如果涉及到性能测试，还有稳定性测试等，还需要另外的手段来保证。

最后，来看看 TiDB 在 Corteza 上面的效果，可以看到，TiDB 对于 Corteza 这类 CRM 的应用是有明显的提速的。

![动图](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/v2-9f896f26ab159d79a3cfc3644520a0b3_b-1657861076957.webp)